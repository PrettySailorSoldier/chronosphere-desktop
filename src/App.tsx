import { useEffect, useState, useCallback, useRef } from 'react';
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

function App() {
  const store = useTimerStore();
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
    if (!store.toast) return;
    const t = setTimeout(() => store.clearToast(), 3000);
    return () => clearTimeout(t);
  }, [store.toast]);

  // ─── Persist to Tauri store ──────────────────────────────────────────
  const persist = useCallback(async () => {
    if (!storeRef.current) return;
    const s = useTimerStore.getState();
    await storeRef.current.set('history',           s.history);
    await storeRef.current.set('stats',             s.stats);
    await storeRef.current.set('settings',          s.settings);
    await storeRef.current.set('sequences',         s.sequences);
    await storeRef.current.set('customSounds',      s.customSounds);
    await storeRef.current.set('stopwatchSessions', s.stopwatchSessions);
    await storeRef.current.save();
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
        store.hydrate({
          history, stats, sequences, customSounds, stopwatchSessions,
          ...(settings ? { settings: { ...DEFAULT_SETTINGS, ...settings } } : {}),
        });
      } catch (e) {
        console.warn('Store load failed:', e);
      } finally {
        setStoreReady(true);
      }
    })();
  }, []);

  // ─── Wire up Rust timer event listeners ───────────────────────────────────
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initTimerListeners(persist).then((fn) => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, []);

  // ─── Persist whenever any persisted slice changes ─────────────────────────
  // customSounds/history/stats were previously missing here, so uploaded tones
  // were lost on restart unless a timer happened to complete afterwards.
  useEffect(() => { if (storeReady) persist(); },
    [store.settings, store.sequences, store.stopwatchSessions,
     store.customSounds, store.history, store.stats, storeReady]);

  // ─── Window title shows live countdown ────────────────────────────────────
  useEffect(() => {
    const t = store.activeTimer;
    const title = t && t.phase !== 'Complete'
      ? `${t.phase === 'Paused' ? '⏸' : '⏳'} ${formatClock(t.remaining_seconds)} · ${t.name}`
      : 'Chrono Sphere';
    getCurrentWindow().setTitle(title).catch(() => {});
  }, [store.activeTimer?.remaining_seconds, store.activeTimer?.phase, store.activeTimer?.name]);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  // Space = pause/resume active timer · Esc = close settings
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (e.key === 'Escape') {
        setShowSettings(false);
        return;
      }
      if (e.code === 'Space' && !typing) {
        const { activeTimer, pause, resume } = useTimerStore.getState();
        if (!activeTimer) return;
        e.preventDefault();
        if (activeTimer.phase === 'Running') pause();
        else if (activeTimer.phase === 'Paused') resume();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ─── Timer creation logic ─────────────────────────────────────────────────
  const handlePresetStart = useCallback(async (minutes: number, name: string, soundType?: string) => {
    await store.startTimer({
      name,
      totalSeconds: minutes * 60,
      soundType: soundType || store.settings.defaultSound,
      notificationMsg: `${name} complete! ✨`,
    });
  }, [store.settings.defaultSound]);

  const handleCustomStart = useCallback(async (h: number, m: number, s: number, name: string, sound: string, msg: string) => {
    const total = h * 3600 + m * 60 + s;
    if (total <= 0) { store.showToast('Please set a time > 0'); return; }
    if (total > 86400) { store.showToast('Max 24h'); return; }
    await store.startTimer({
      name,
      totalSeconds: total,
      soundType: sound,
      notificationMsg: msg,
    });
  }, []);

  const handleRevive = useCallback(async (name: string, totalSeconds: number) => {
    await store.startTimer({
      name,
      totalSeconds,
      notificationMsg: `${name} complete! ✨`,
    });
    store.showToast(`Restarted: ${name}`);
  }, [store.settings.defaultSound]);

  const handlePauseResume = useCallback(async () => {
    const { activeTimer, pause, resume } = useTimerStore.getState();
    if (!activeTimer) return;
    if (activeTimer.phase === 'Running') {
      await pause();
    } else if (activeTimer.phase === 'Paused') {
      await resume();
    }
  }, []);

  const handleStop = useCallback(async () => {
    await store.stop();
  }, []);

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
      {store.toast && <div className="toast">{store.toast}</div>}

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
      {store.activeTimer && view !== 'timer' && (
        <button className="running-strip" onClick={() => setView('timer')}>
          <span className="running-strip-dot" />
          <span className="running-strip-name">{store.activeTimer.name}</span>
          <span className="running-strip-time">
            {formatClock(store.activeTimer.remaining_seconds)}
          </span>
          <span className="running-strip-hint">view ›</span>
        </button>
      )}

      {/* ══ TIMER VIEW ══ */}
      {view === 'timer' && (
        <>
          {/* Active timer — always at the top, most important thing on screen */}
          {store.activeTimer && (
            <>
              <div className="section-label">now running</div>
              <div className="timers-list">
                <TimerCard
                  key={store.activeTimer.id}
                  id={store.activeTimer.id}
                  name={store.activeTimer.name}
                  totalSeconds={store.activeTimer.total_seconds}
                  remainingSeconds={store.activeTimer.remaining_seconds}
                  soundType={store.activeTimer.sound_type}
                  isRunning={store.activeTimer.phase === 'Running'}
                  onPause={handlePauseResume}
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
