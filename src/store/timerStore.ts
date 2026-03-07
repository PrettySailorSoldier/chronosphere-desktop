import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { playCompletionSound } from '../audio/soundPlayer';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TimerPhase = 'Idle' | 'Running' | 'Paused' | 'Complete';

/** Shape of the timer object emitted from Rust. Uses snake_case to match serde output. */
export interface RustTimerState {
  id: string;
  name: string;
  phase: TimerPhase;
  total_seconds: number;
  remaining_seconds: number;
  sound_type: string;
  notification_msg: string;
  sequence_id?: string;
  sequence_step?: number;
  sequence_total_steps?: number;
}

/** Legacy Timer shape used by history/stats parts of the store. */
export interface Timer {
  id: string;
  name: string;
  totalSeconds: number;
  remainingSeconds: number;
  endTime: number;
  soundType: string;
  notificationMsg: string;
  isRunning: boolean;
  sequenceTimer?: boolean;
  autoStarted?: boolean;
}

export interface HistoryItem {
  name: string;
  duration: number;
  completedAt: number;
}

export interface Stats {
  lastActiveDate: string | null;
  streak: number;
  pomodoroCount: number;
}

export interface Sequence {
  id: string;
  name: string;
  steps: Array<'pomodoro' | 'shortBreak' | 'longBreak' | 'deepWork'>;
  loop: boolean;
}

export interface ActiveSequence {
  id: string;
  name: string;
  steps: Array<'pomodoro' | 'shortBreak' | 'longBreak' | 'deepWork'>;
  loop: boolean;
  currentStep: number;
}

export interface Settings {
  presets: {
    pomodoro: number;
    shortBreak: number;
    longBreak: number;
    deepWork: number;
    writing: number;
    planning: number;
    deep: number;
  };
  volume: number;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  autoStartBreaks: boolean;
  defaultSound: string;
}

export interface CustomSound {
  id: string;
  name: string;
  data: string; // base64 data URL
}

export interface EnginePresets {
  pomodoro: number;
  short_break: number;
  long_break: number;
  deep_work: number;
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface TimerStore {
  // ── Engine state (driven by Rust) ──
  activeTimer: RustTimerState | null;
  isSequenceActive: boolean;
  sequenceComplete: boolean;

  // ── Persisted state ──
  history: HistoryItem[];
  stats: Stats;
  sequences: Sequence[];
  settings: Settings;
  customSounds: CustomSound[];
  toast: string | null;

  // ── Engine actions ──
  startTimer: (params: {
    id?: string;
    name: string;
    totalSeconds: number;
    soundType?: string;
    notificationMsg?: string;
  }) => Promise<void>;
  startSequence: (sequence: Sequence) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  skip: () => Promise<void>;
  stop: () => Promise<void>;

  // ── Event handlers (called internally by listeners) ──
  _onTick: (state: RustTimerState) => void;
  _onComplete: (state: RustTimerState, onPersist?: () => void) => Promise<void>;
  _onSequenceStepStarted: (step: number) => void;
  _onSequenceComplete: () => void;

  // ── Legacy timer actions (for history/settings parts of the app) ──
  updateTimerSound: (id: string, soundType: string) => void;  // no-op on new engine, kept for TimerCard compat
  addHistory: (item: HistoryItem) => void;
  updateStats: (stats: Partial<Stats>) => void;
  setSequences: (seqs: Sequence[]) => void;
  setSettings: (settings: Settings) => void;
  setCustomSounds: (sounds: CustomSound[]) => void;
  addCustomSound: (sound: CustomSound) => void;
  showToast: (msg: string) => void;
  clearToast: () => void;
  hydrate: (data: Partial<TimerStore>) => void;
}

export const DEFAULT_SETTINGS: Settings = {
  presets: { pomodoro: 25, shortBreak: 5, longBreak: 15, deepWork: 52, writing: 42, planning: 26, deep: 60 },
  volume: 70,
  soundEnabled: true,
  notificationsEnabled: true,
  autoStartBreaks: false,
  defaultSound: 'chime',
};

function settingsToEnginePresets(s: Settings): EnginePresets {
  return {
    pomodoro:    s.presets.pomodoro,
    short_break: s.presets.shortBreak,
    long_break:  s.presets.longBreak,
    deep_work:   s.presets.deepWork,
  };
}

// ─── Store creation ───────────────────────────────────────────────────────────

export const useTimerStore = create<TimerStore>((set, get) => ({
  // Engine state
  activeTimer: null,
  isSequenceActive: false,
  sequenceComplete: false,

  // Persisted state
  history: [],
  stats: { lastActiveDate: null, streak: 0, pomodoroCount: 0 },
  sequences: [],
  settings: DEFAULT_SETTINGS,
  customSounds: [],
  toast: null,

  // ── Engine actions ──────────────────────────────────────────────────────────

  startTimer: async ({ id, name, totalSeconds, soundType, notificationMsg }) => {
    const { settings } = get();
    set({ isSequenceActive: false, sequenceComplete: false });
    await invoke('cmd_start_timer', {
      id: id ?? Date.now().toString(),
      name,
      totalSeconds,
      soundType: soundType ?? settings.defaultSound,
      notificationMsg: notificationMsg ?? `${name} complete!`,
    });
  },

  startSequence: async (sequence) => {
    const { settings } = get();
    set({ isSequenceActive: true, sequenceComplete: false });
    await invoke('cmd_start_sequence', {
      sequenceJson: JSON.stringify(sequence),
      presetsJson: JSON.stringify(settingsToEnginePresets(settings)),
    });
  },

  pause: async () => {
    await invoke('cmd_pause_timer');
    set((s) => ({
      activeTimer: s.activeTimer ? { ...s.activeTimer, phase: 'Paused' } : null,
    }));
  },

  resume: async () => {
    await invoke('cmd_resume_timer');
    set((s) => ({
      activeTimer: s.activeTimer ? { ...s.activeTimer, phase: 'Running' } : null,
    }));
  },

  skip: async () => {
    await invoke('cmd_skip_timer');
  },

  stop: async () => {
    await invoke('cmd_stop_timer');
    set({ activeTimer: null, isSequenceActive: false, sequenceComplete: false });
  },

  // ── Internal event handlers ─────────────────────────────────────────────────

  _onTick: (timerState) => {
    set({ activeTimer: timerState });
  },

  _onComplete: async (timerState, onPersist?) => {
    set({ activeTimer: timerState });

    const { settings, customSounds, stats } = get();

    // Play sound
    if (settings.soundEnabled) {
      playCompletionSound(timerState.sound_type, customSounds, settings.volume);
    }

    // Desktop notification
    if (settings.notificationsEnabled) {
      try {
        let granted = await isPermissionGranted();
        if (!granted) {
          const perm = await requestPermission();
          granted = perm === 'granted';
        }
        if (granted) {
          sendNotification({
            title: '✨ Timer Complete!',
            body: timerState.notification_msg || `${timerState.name} is done!`,
          });
        }
      } catch (e) {
        console.warn('Notification error:', e);
      }
    }

    // Add to history
    const historyItem: HistoryItem = {
      name: timerState.name,
      duration: timerState.total_seconds,
      completedAt: Date.now(),
    };
    get().addHistory(historyItem);

    // Update daily stats
    const today = new Date().toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    let { streak, pomodoroCount } = stats;
    if (stats.lastActiveDate !== today) {
      if (stats.lastActiveDate === yesterday.toDateString()) {
        streak++;
      } else {
        streak = 1;
      }
    }
    if (timerState.name.includes('Pomodoro') || timerState.name.includes('Deep Work')) {
      pomodoroCount++;
    }
    get().updateStats({ lastActiveDate: today, streak, pomodoroCount });

    // If sequence, auto-advance
    const { isSequenceActive: stillActive } = get();
    if (stillActive && timerState.sequence_id) {
      const updatedSettings = get().settings;
      invoke('cmd_next_sequence_step', {
        presetsJson: JSON.stringify(settingsToEnginePresets(updatedSettings)),
      }).catch(console.warn);
    }

    onPersist?.();
  },

  _onSequenceStepStarted: (step) => {
    console.log(`[Chronosphere] Sequence step ${step} started`);
  },

  _onSequenceComplete: () => {
    set({ isSequenceActive: false, sequenceComplete: true, activeTimer: null });
    useTimerStore.getState().showToast('🎉 Sequence complete!');
  },

  // ── Persisted/legacy actions ────────────────────────────────────────────────

  // Kept for TimerCard compatibility — sound is now stored in Rust state for
  // active timers, but we can still update the in-memory activeTimer so the
  // UI reflects the user's sound picker choice immediately.
  updateTimerSound: (id, soundType) => {
    set((s) => ({
      activeTimer: s.activeTimer?.id === id
        ? { ...s.activeTimer, sound_type: soundType }
        : s.activeTimer,
    }));
  },

  addHistory: (item) =>
    set((s) => {
      const history = [...s.history, item].slice(-100);
      return { history };
    }),

  updateStats: (partial) =>
    set((s) => ({ stats: { ...s.stats, ...partial } })),

  setSequences: (seqs) => set({ sequences: seqs }),

  setSettings: (settings) => set({ settings }),

  setCustomSounds: (sounds) => set({ customSounds: sounds }),

  addCustomSound: (sound) =>
    set((s) => ({ customSounds: [...s.customSounds, sound] })),

  showToast: (msg) => set({ toast: msg }),
  clearToast: () => set({ toast: null }),

  hydrate: (data) => set((s) => ({ ...s, ...data })),
}));

// ─── Event listener setup ─────────────────────────────────────────────────────
// Call this once from App.tsx inside useEffect. Returns a cleanup function.

export async function initTimerListeners(onPersist?: () => void): Promise<() => void> {
  // Rehydrate state if window was closed/reopened mid-session
  try {
    const currentState = await invoke<RustTimerState | null>('cmd_get_timer_state');
    if (currentState) {
      useTimerStore.setState({ activeTimer: currentState });
      if (currentState.sequence_id) {
        useTimerStore.setState({ isSequenceActive: true });
      }
    }
  } catch (e) {
    console.warn('State rehydration failed:', e);
  }

  const unlisteners: UnlistenFn[] = await Promise.all([
    listen<RustTimerState>('timer:tick', (e) => {
      useTimerStore.getState()._onTick(e.payload);
    }),
    listen<RustTimerState>('timer:complete', (e) => {
      useTimerStore.getState()._onComplete(e.payload, onPersist);
    }),
    listen<number>('sequence:step-started', (e) => {
      useTimerStore.getState()._onSequenceStepStarted(e.payload);
    }),
    listen('sequence:complete', () => {
      useTimerStore.getState()._onSequenceComplete();
    }),
  ]);

  return () => unlisteners.forEach((u) => u());
}
