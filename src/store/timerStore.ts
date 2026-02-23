import { create } from 'zustand';

// ─── Types ───────────────────────────────────────────────────────────────────

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
}

export interface CustomSound {
  id: string;
  name: string;
  data: string; // base64 data URL
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface TimerStore {
  timers: Timer[];
  history: HistoryItem[];
  stats: Stats;
  sequences: Sequence[];
  activeSequence: ActiveSequence | null;
  settings: Settings;
  customSounds: CustomSound[];
  toast: string | null;

  // Timer actions
  addTimer: (timer: Timer) => void;
  removeTimer: (id: string) => void;
  pauseTimer: (id: string) => void;
  resumeTimer: (id: string, newEndTime: number) => void;
  tickTimer: (id: string, remaining: number) => void;
  completeTimer: (id: string) => Timer | undefined;

  // History / Stats
  addHistory: (item: HistoryItem) => void;
  updateStats: (stats: Partial<Stats>) => void;

  // Sequences
  setSequences: (seqs: Sequence[]) => void;
  setActiveSequence: (seq: ActiveSequence | null) => void;

  // Settings
  setSettings: (settings: Settings) => void;


  // Custom sounds
  setCustomSounds: (sounds: CustomSound[]) => void;
  addCustomSound: (sound: CustomSound) => void;

  // Toast
  showToast: (msg: string) => void;
  clearToast: () => void;

  // Bulk hydrate from persisted store
  hydrate: (data: Partial<TimerStore>) => void;
}

const DEFAULT_SETTINGS: Settings = {
  presets: { pomodoro: 25, shortBreak: 5, longBreak: 15, deepWork: 52, writing: 42, planning: 26, deep: 60 },
  volume: 70,
  soundEnabled: true,
  notificationsEnabled: true,
  autoStartBreaks: false,
};

export const useTimerStore = create<TimerStore>((set, get) => ({
  timers: [],
  history: [],
  stats: { lastActiveDate: null, streak: 0, pomodoroCount: 0 },
  sequences: [],
  activeSequence: null,
  settings: DEFAULT_SETTINGS,
  customSounds: [],
  toast: null,

  addTimer: (timer) => set((s) => ({ timers: [...s.timers, timer] })),

  removeTimer: (id) => set((s) => ({ timers: s.timers.filter((t) => t.id !== id) })),

  pauseTimer: (id) =>
    set((s) => ({
      timers: s.timers.map((t) =>
        t.id === id
          ? { ...t, isRunning: false }
          : t
      ),
    })),

  resumeTimer: (id, newEndTime) =>
    set((s) => ({
      timers: s.timers.map((t) =>
        t.id === id ? { ...t, isRunning: true, endTime: newEndTime } : t
      ),
    })),

  tickTimer: (id, remaining) =>
    set((s) => ({
      timers: s.timers.map((t) =>
        t.id === id ? { ...t, remainingSeconds: remaining } : t
      ),
    })),

  completeTimer: (id) => {
    const timer = get().timers.find((t) => t.id === id);
    set((s) => ({ timers: s.timers.filter((t) => t.id !== id) }));
    return timer;
  },

  addHistory: (item) =>
    set((s) => {
      const history = [...s.history, item].slice(-100);
      return { history };
    }),

  updateStats: (partial) =>
    set((s) => ({ stats: { ...s.stats, ...partial } })),

  setSequences: (seqs) => set({ sequences: seqs }),

  setActiveSequence: (seq) => set({ activeSequence: seq }),

  setSettings: (settings) => set({ settings }),


  setCustomSounds: (sounds) => set({ customSounds: sounds }),

  addCustomSound: (sound) =>
    set((s) => ({ customSounds: [...s.customSounds, sound] })),

  showToast: (msg) => set({ toast: msg }),
  clearToast: () => set({ toast: null }),

  hydrate: (data) => set((s) => ({ ...s, ...data })),
}));
