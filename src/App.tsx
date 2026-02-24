import { useEffect, useState, useCallback, useRef } from 'react';
import { load } from '@tauri-apps/plugin-store';
import { useTimerStore, Timer, Settings, Sequence, HistoryItem, Stats, CustomSound } from './store/timerStore';
import { useTauriTimer, startTimerBackend, cancelTimerBackend } from './hooks/useTauriTimer';

import { TimerCard }        from './components/TimerCard';
import { PresetButtons }    from './components/PresetButtons';
import { CustomTimerForm }  from './components/CustomTimerForm';
import { HistoryList }      from './components/HistoryList';
import { StatsRibbon }      from './components/StatsRibbon';
import { RightNowBlock }   from './components/RightNowBlock';
import { SequencesSection } from './components/SequencesSection';
import { SettingsPanel }    from './components/SettingsPanel';

import './styles/globals.css';

// ─── Circadian header data ────────────────────────────────────────────────────
const CIRCADIAN_PATTERNS: Record<number, { icon: string; msg: string }> = {
  0:{ icon:'🌙', msg:'Late night'}, 1:{icon:'🌙', msg:'Rest recommended'}, 2:{icon:'😴', msg:'Deep rest'},
  3:{icon:'😴', msg:'Deep rest'}, 4:{icon:'😴', msg:'Early quiet'}, 5:{icon:'🌅', msg:'Waking up'},
  6:{icon:'🌅', msg:'Morning routine'}, 7:{icon:'⚡', msg:'Morning surge'}, 8:{icon:'⚡', msg:'Morning surge'},
  9:{icon:'🎯', msg:'Peak focus'}, 10:{icon:'🎯', msg:'Peak focus'}, 11:{icon:'🎯', msg:'Peak focus'},
  12:{icon:'🍽️', msg:'Lunch'}, 13:{icon:'😴', msg:'Post-lunch dip'}, 14:{icon:'😴', msg:'Post-lunch dip'},
  15:{icon:'📈', msg:'Afternoon recovery'}, 16:{icon:'⚡', msg:'Second wind'}, 17:{icon:'⚡', msg:'Second wind'},
  18:{icon:'🌆', msg:'Evening work'}, 19:{icon:'🌆', msg:'Evening work'}, 20:{icon:'🌙', msg:'Evening focus'},
  21:{icon:'🌙', msg:'Winding down'}, 22:{icon:'✨', msg:'Prepare for sleep'}, 23:{icon:'✨', msg:'Prepare for sleep'},
};

const STORE_FILE = 'chronosphere.json';

function App() {
  const store = useTimerStore();
  const [showSettings, setShowSettings] = useState(false);
  const [storeReady, setStoreReady] = useState(false);
  const storeRef = useRef<Awaited<ReturnType<typeof load>> | null>(null);

  // Toast auto-dismiss
  useEffect(() => {
    if (!store.toast) return;
    const t = setTimeout(() => store.clearToast(), 3000);
    return () => clearTimeout(t);
  }, [store.toast]);

  // ─── Persist to Tauri store ────────────────────────────────────────────────
  const persist = useCallback(async () => {
    if (!storeRef.current) return;
    const s = useTimerStore.getState();
    await storeRef.current.set('history',      s.history);
    await storeRef.current.set('stats',        s.stats);
    await storeRef.current.set('settings',     s.settings);
    await storeRef.current.set('sequences',    s.sequences);
    await storeRef.current.set('customSounds', s.customSounds);
    await storeRef.current.save();
  }, []);

  // ─── Load persisted data on mount ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const s = await load(STORE_FILE, { defaults: {} });
        storeRef.current = s;
        const history      = (await s.get<HistoryItem[]>('history'))      ?? [];
        const stats        = (await s.get<Stats>('stats'))                ?? { lastActiveDate: null, streak: 0, pomodoroCount: 0 };
        const settings     = (await s.get<Settings>('settings'))          ?? undefined;
        const sequences    = (await s.get<Sequence[]>('sequences'))        ?? [];
        const customSounds = (await s.get<CustomSound[]>('customSounds')) ?? [];
        store.hydrate({
          history, stats, sequences, customSounds,
          ...(settings ? { settings } : {}),
        });
      } catch (e) {
        console.warn('Store load failed:', e);
      } finally {
        setStoreReady(true);
      }
    })();
  }, []);

  // ─── Tauri timer event hook ────────────────────────────────────────────────
  useTauriTimer(persist);

  // ─── Persist whenever settings / sequences / energy change ────────────────
  useEffect(() => { if (storeReady) persist(); }, [store.settings, store.sequences, storeReady]);

  // ─── Timer creation logic ──────────────────────────────────────────────────
  const createAndStartTimer = useCallback(async (timer: Timer) => {
    store.addTimer(timer);
    await startTimerBackend(timer);
  }, []);

  const handlePresetStart = useCallback(async (minutes: number, name: string, soundType?: string) => {
    const now = Date.now();
    const timer: Timer = {
      id: now.toString(),
      name,
      totalSeconds: minutes * 60,
      remainingSeconds: minutes * 60,
      endTime: now + minutes * 60 * 1000,
      soundType: soundType || store.settings.defaultSound,
      notificationMsg: `${name} complete! ✨`,
      isRunning: true,
    };
    await createAndStartTimer(timer);
  }, [createAndStartTimer, store.settings.defaultSound]);

  const handleCustomStart = useCallback(async (h: number, m: number, s: number, name: string, sound: string, msg: string) => {
    const total = h * 3600 + m * 60 + s;
    if (total <= 0) { store.showToast('Please set a time > 0'); return; }
    if (total > 86400) { store.showToast('Max 24h'); return; }
    const now = Date.now();
    const timer: Timer = {
      id: now.toString(),
      name,
      totalSeconds: total,
      remainingSeconds: total,
      endTime: now + total * 1000,
      soundType: sound,
      notificationMsg: msg,
      isRunning: true,
    };
    await createAndStartTimer(timer);
  }, [createAndStartTimer]);

  const handleRevive = useCallback(async (name: string, totalSeconds: number) => {
    const now = Date.now();
    const timer: Timer = {
      id: now.toString(),
      name,
      totalSeconds,
      remainingSeconds: totalSeconds,
      endTime: now + totalSeconds * 1000,
      soundType: store.settings.defaultSound,
      notificationMsg: `${name} complete! ✨`,
      isRunning: true,
    };
    await createAndStartTimer(timer);
    store.showToast(`Restarted: ${name}`);
  }, [createAndStartTimer, store.settings.defaultSound]);

  const handlePause = useCallback(async (timer: Timer) => {
    if (timer.isRunning) {
      store.pauseTimer(timer.id);
      await cancelTimerBackend(timer.id);
    } else {
      const newEnd = Date.now() + timer.remainingSeconds * 1000;
      store.resumeTimer(timer.id, newEnd);
      const resumed: Timer = { ...timer, isRunning: true, endTime: newEnd };
      await startTimerBackend(resumed);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await cancelTimerBackend(id);
    store.removeTimer(id);
  }, []);

  // ─── Circadian header ─────────────────────────────────────────────────────
  const hour = new Date().getHours();
  const circadian = CIRCADIAN_PATTERNS[hour];

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
        <h1>⚡ Chrono Sphere</h1>
        <div className="circadian-indicator">
          <span className="circadian-icon">{circadian.icon}</span>
          <span className="circadian-label">{circadian.msg}</span>
        </div>
        <StatsRibbon />
      </div>

      {/* ── Circadian section ── */}
      <RightNowBlock />

      {/* ── Sequences ── */}
      <SequencesSection onStartTimer={(_t) => { /* timer already added by SequencesSection */ }} />

      {/* ── Preset buttons ── */}
      <PresetButtons onStart={handlePresetStart} />

      {/* ── Custom timer ── */}
      <CustomTimerForm onStart={handleCustomStart} />

      {/* ── Active timers ── */}
      <div className="timers-list">
        {store.timers.length === 0 ? (
          <div className="empty-state">No active timers<br />Start one above! 🌸</div>
        ) : (
          store.timers.map((t) => (
            <TimerCard
              key={t.id}
              id={t.id}
              name={t.name}
              totalSeconds={t.totalSeconds}
              remainingSeconds={t.remainingSeconds}
              endTime={t.endTime}
              soundType={t.soundType}
              isRunning={t.isRunning}
              onPause={() => handlePause(t)}
              onDelete={() => handleDelete(t.id)}
            />
          ))
        )}
      </div>

      {/* ── History ── */}
      <HistoryList onRevive={handleRevive} />

      {/* ── Footer ── */}
      <div className="settings-link">
        <div className="footer-buttons">
          <button className="subtle-btn" onClick={() => setShowSettings(true)}>⚙️ Settings</button>
        </div>
      </div>
    </div>
  );
}

export default App;
