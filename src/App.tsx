import { useEffect, useState, useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { load } from '@tauri-apps/plugin-store';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTimerStore, HistoryItem, Stats, Settings, Sequence, CustomSound, DEFAULT_SETTINGS, initTimerListeners, StopwatchSession } from './store/timerStore';
import { getCircadianHour } from './utils/circadian';

import { TimerCard }        from './components/TimerCard';
import { PresetButtons }    from './components/PresetButtons';
import { CustomTimerForm }  from './components/CustomTimerForm';
import { HistoryList }      from './components/HistoryList';
import { StatsRibbon }      from './components/StatsRibbon';
import { RightNowBlock }   from './components/RightNowBlock';
import { SequencesSection } from './components/SequencesSection';
import { SettingsPanel }    from './components/SettingsPanel';
import { SequencerPanel }   from './components/SequencerPanel';
import StopwatchPanel       from './components/StopwatchPanel';
import { SessionLog }       from './components/SessionLog';

import './styles/globals.css';


const STORE_FILE = 'chronosphere.json';

type View = 'timer' | 'stopwatch' | 'activity';

const VIEW_TABS: Array<{ key: View; icon: string; label: string }> = [
  { key: 'timer',     icon: '⏳', label: 'Timers'    },
  { key: 'stopwatch', icon: '⏱', label: 'Stopwatch' },
  { key: 'activity',  icon: '📊', label: 'Activity'  },
];

function formatClock(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Keys written to the on-disk store, and the state changes that should trigger a save. */
const PERSISTED_KEYS = [
  'history', 'stats', 'settings', 'sequences',
  'customSounds', 'stopwatchSessions', 'stopwatch',
] as const;

function App() {
  // Subscribe only to what App itself renders. Pulling the whole store here made
  // every 200ms engine tick and 250ms stopwatch tick re-render the entire tree.
  const { activeTimer, toast, hydrate, clearToast, stop } = useTimerStore(
    useShallow((s) => ({
      activeTimer: s.activeTimer,
      toast: s.toast,
      hydrate: s.hydrate,
      clearToast: s.clearToast,
      stop: s.stop,
    })),
  );
  const [showSettings, setShowSettings] = useState(false);
  const [storeReady, setStoreReady] = useState(false);
  const [pendingLabelId, setPendingLabelId] = useState<string | null>(null);
  const [view, setView] = useState<View>('timer');
  const storeRef = useRef<Awaited<ReturnType<typeof load>> | null>(null);

  // ─── Live clock for header ────────────────────────────────────────────────
  const [headerTime, setHeaderTime] = useState('');
  useEffect(() => {
    const tick = () => setHeaderTime(
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => clearToast(), 3000);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  // ─── Persist to Tauri store ──────────────────────────────────────────
  const persist = useCallback(async () => {
    if (!storeRef.current) return;
    const s = useTimerStore.getState();
    try {
      for (const key of PERSISTED_KEYS) {
        await storeRef.current.set(key, s[key]);
      }
      await storeRef.current.save();
    } catch (e) {
      console.warn('Store save failed:', e);
    }
  }, []);

  // ─── Load persisted data on mount ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const s = await load(STORE_FILE, { defaults: {} });
        storeRef.current = s;
        const history           = (await s.get<HistoryItem[]>('history'))      ?? [];
        const stats             = (await s.get<Stats>('stats'))                ?? { lastActiveDate: null, streak: 0, pomodoroCount: 0 };
        const settings          = (await s.get<Settings>('settings'))          ?? undefined;
        const sequences         = (await s.get<Sequence[]>('sequences'))       ?? [];
        const customSounds      = (await s.get<CustomSound[]>('customSounds')) ?? [];
        const stopwatchSessions = (await s.get<StopwatchSession[]>('stopwatchSessions')) ?? [];
        const stopwatch         = await s.get<ReturnType<typeof useTimerStore.getState>['stopwatch']>('stopwatch');
        hydrate({
          history, stats, sequences, customSounds, stopwatchSessions,
          ...(stopwatch ? { stopwatch } : {}),
          ...(settings ? { settings: { ...DEFAULT_SETTINGS, ...settings } } : {}),
        });
      } catch (e) {
        console.warn('Store load failed:', e);
      } finally {
        setStoreReady(true);
      }
    })();
  }, [hydrate]);

  // ─── Wire up Rust timer event listeners ───────────────────────────────────
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    initTimerListeners(persist).then((fn) => {
      // Unmounting before setup resolved used to drop the cleanup fn on the
      // floor, leaking a listener set on every remount (and in StrictMode).
      if (cancelled) fn();
      else cleanup = fn;
    });
    return () => { cancelled = true; cleanup?.(); };
  }, [persist]);

  // ─── Persist whenever any persisted slice changes ─────────────────────────
  // Subscribed imperatively so App doesn't re-render on these, and debounced so
  // a burst of edits collapses into one disk write instead of six per keystroke.
  useEffect(() => {
    if (!storeReady) return;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useTimerStore.subscribe((state, prev) => {
      if (!PERSISTED_KEYS.some((k) => state[k] !== prev[k])) return;
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => { timeout = null; void persist(); }, 400);
    });
    return () => {
      unsubscribe();
      // Flush a pending write rather than losing the last edit on unmount.
      if (timeout) { clearTimeout(timeout); void persist(); }
    };
  }, [storeReady, persist]);

  // ─── Window title shows live countdown ────────────────────────────────────
  useEffect(() => {
    const title = activeTimer && activeTimer.phase !== 'Complete'
      ? `${activeTimer.phase === 'Paused' ? '⏸' : '⏳'} ${formatClock(activeTimer.remaining_seconds)} · ${activeTimer.name}`
      : 'Chrono Sphere';
    getCurrentWindow().setTitle(title).catch(() => {});
  }, [activeTimer?.remaining_seconds, activeTimer?.phase, activeTimer?.name]);

  // Leave the title clean if the view goes away while a timer is still running.
  useEffect(() => () => { getCurrentWindow().setTitle('Chrono Sphere').catch(() => {}); }, []);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  // Space = pause/resume · S = skip phase · Esc = close settings
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
        || target.isContentEditable;
      if (e.key === 'Escape') {
        setShowSettings(false);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;

      const state = useTimerStore.getState();
      if (!state.activeTimer) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (state.activeTimer.phase === 'Running') void state.pause();
        else if (state.activeTimer.phase === 'Paused') void state.resume();
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        void state.skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ─── Timer creation logic ─────────────────────────────────────────────────
  // These read actions off getState() rather than closing over render values, so
  // there is no stale-closure hazard and the callbacks never need to change.
  const handlePresetStart = useCallback(async (minutes: number, name: string, soundType?: string) => {
    const s = useTimerStore.getState();
    await s.startTimer({
      name,
      totalSeconds: Math.round(minutes * 60),
      soundType: soundType || s.settings.defaultSound,
      notificationMsg: `${name} complete! ✨`,
    });
  }, []);

  const handleCustomStart = useCallback(async (h: number, m: number, s: number, name: string, sound: string, msg: string) => {
    const state = useTimerStore.getState();
    const total = h * 3600 + m * 60 + s;
    if (total <= 0) { state.showToast('Please set a time > 0'); return; }
    if (total > 86400) { state.showToast('Max 24h'); return; }
    await state.startTimer({
      name,
      totalSeconds: total,
      soundType: sound,
      notificationMsg: msg,
    });
  }, []);

  const handleRevive = useCallback(async (name: string, totalSeconds: number) => {
    const s = useTimerStore.getState();
    await s.startTimer({
      name,
      totalSeconds,
      notificationMsg: `${name} complete! ✨`,
    });
    s.showToast(`Restarted: ${name}`);
  }, []);

  const handlePauseResume = useCallback(async () => {
    const { activeTimer: t, pause, resume } = useTimerStore.getState();
    if (!t) return;
    if (t.phase === 'Running') await pause();
    else if (t.phase === 'Paused') await resume();
  }, []);

  const handleSkip = useCallback(async () => {
    await useTimerStore.getState().skip();
  }, []);

  const handleStop = useCallback(async () => {
    await stop();
  }, [stop]);

  // ─── Circadian header ─────────────────────────────────────────────────────
  const hour = new Date().getHours();
  const circadian = getCircadianHour(hour);

  if (!storeReady) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--cyan-glow)' }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Toast */}
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}

      {/* Settings overlay */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* ── Header ── */}
      <div className="header">
        <div className="header-top">
          <h1>⚡ Chrono Sphere</h1>
          <div className="header-right">
            <div className="circadian-indicator">
              <span className="circadian-icon">{circadian.icon}</span>
              <span className="circadian-label">{circadian.shortMsg}</span>
              <span className="circadian-time">{headerTime}</span>
            </div>
            <button
              className="header-settings-btn"
              title="Settings"
              onClick={() => setShowSettings(true)}
            >
              ⚙️
            </button>
          </div>
        </div>
        <StatsRibbon />
      </div>

      {/* ── Main navigation ── */}
      <div className="nav-tabs">
        {VIEW_TABS.map((t) => (
          <button
            key={t.key}
            className={`nav-tab${view === t.key ? ' active' : ''}`}
            onClick={() => setView(t.key)}
          >
            <span className="nav-tab-icon">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ── Now-running strip (visible when timer runs but user is on another tab) ── */}
      {activeTimer && view !== 'timer' && (
        <button className="running-strip" onClick={() => setView('timer')}>
          <span className="running-strip-dot" />
          <span className="running-strip-name">{activeTimer.name}</span>
          <span className="running-strip-time">
            {formatClock(activeTimer.remaining_seconds)}
          </span>
          <span className="running-strip-hint">view ›</span>
        </button>
      )}

      {/* ══ TIMER VIEW ══ */}
      {view === 'timer' && (
        <>
          {/* Active timer — always at the top, most important thing on screen */}
          {activeTimer && (
            <>
              <div className="section-label">now running</div>
              <div className="timers-list">
                <TimerCard
                  key={activeTimer.id}
                  id={activeTimer.id}
                  name={activeTimer.name}
                  totalSeconds={activeTimer.total_seconds}
                  remainingSeconds={activeTimer.remaining_seconds}
                  soundType={activeTimer.sound_type}
                  isRunning={activeTimer.phase === 'Running'}
                  phase={activeTimer.phase}
                  isSequenceStep={Boolean(activeTimer.sequence_id)}
                  onPause={handlePauseResume}
                  onSkip={handleSkip}
                  onDelete={handleStop}
                />
              </div>
            </>
          )}

          {/* Sequence progress / selector */}
          <SequencesSection />

          {/* Quick start — the most common action when idle */}
          <div className="section-label">quick start</div>
          <PresetButtons onStart={handlePresetStart} />

          {/* Custom timer */}
          <div className="section-label">custom</div>
          <CustomTimerForm onStart={handleCustomStart} />

          {/* Visual sequencer */}
          <div className="section-label">sequencer</div>
          <SequencerPanel />
        </>
      )}

      {/* ══ STOPWATCH VIEW ══ */}
      {view === 'stopwatch' && (
        <>
          <StopwatchPanel
            pendingLabelId={pendingLabelId}
            onPendingLabelChange={setPendingLabelId}
          />
          <div className="section-label">session log</div>
          <SessionLog pendingLabelId={pendingLabelId} />
        </>
      )}

      {/* ══ ACTIVITY VIEW ══ */}
      {view === 'activity' && (
        <>
          <div className="section-label">right now</div>
          <RightNowBlock />
          <div className="section-label">history</div>
          <HistoryList onRevive={handleRevive} />
        </>
      )}
    </div>
  );
}

export default App;
