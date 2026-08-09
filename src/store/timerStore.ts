import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { playCompletionSound } from '../audio/soundPlayer';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TimerPhase = 'Idle' | 'Running' | 'Paused' | 'Complete';

/** A completed stopwatch session, appended to the log. */
export interface StopwatchSession {
  id: string;
  label: string;
  startedAt: string;   // ISO-8601
  endedAt: string;     // ISO-8601
  durationMs: number;
}

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
  /** Set when the phase ended via Skip rather than by running out of time. */
  skipped: boolean;
}

export type StepKey = 'pomodoro' | 'shortBreak' | 'longBreak' | 'deepWork';

/**
 * A sequence step with its duration and tone already decided. The engine stores
 * these verbatim, so a running sequence can't be reshaped by a later preset edit.
 */
export interface ResolvedStep {
  label: string;
  seconds: number;
  sound: string;
  notification?: string;
}

export interface ResolvedSequenceInput {
  id: string;
  name: string;
  steps: ResolvedStep[];
  loopEnabled: boolean;
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
  steps: StepKey[];
  loop: boolean;
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
  /** Heads-up alerts at the marks in WARNING_MARKS_SECONDS, before the timer ends. */
  warningsEnabled: boolean;
  autoStartBreaks: boolean;
  defaultSound: string;
}

export interface CustomSound {
  id: string;
  name: string;
  data: string; // base64 data URL
}

const STEP_LABELS: Record<StepKey, string> = {
  pomodoro:   'Pomodoro',
  shortBreak: 'Short Break',
  longBreak:  'Long Break',
  deepWork:   'Deep Work',
};

const STEP_SOUNDS: Record<StepKey, string> = {
  pomodoro:   'chime',
  deepWork:   'chime',
  shortBreak: 'water',
  longBreak:  'water',
};

/** Turn a saved preset-based sequence into concrete steps using current settings. */
export function resolveSequenceSteps(sequence: Sequence, settings: Settings): ResolvedStep[] {
  return sequence.steps
    .filter((key): key is StepKey => key in STEP_LABELS)
    .map((key) => {
      const label = STEP_LABELS[key];
      return {
        label,
        seconds: Math.max(1, Math.round((settings.presets[key] ?? 25) * 60)),
        sound: STEP_SOUNDS[key],
        notification: `${label} complete!`,
      };
    });
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

  // ── Stopwatch state ──
  stopwatch: {
    running: boolean;          // actively counting
    paused: boolean;           // frozen mid-session
    startedAt: string | null;        // ISO — start of the CURRENT running segment
    sessionStartedAt: string | null; // ISO — start of the whole session (saved to record)
    accumulatedMs: number;     // ms from segments before the current one
    elapsedMs: number;         // live display value
  };
  stopwatchSessions: StopwatchSession[];

  // ── Engine actions ──
  startTimer: (params: {
    id?: string;
    name: string;
    totalSeconds: number;
    soundType?: string;
    notificationMsg?: string;
  }) => Promise<void>;
  startSequence: (sequence: Sequence) => Promise<void>;
  /** Start a sequence whose steps already carry explicit durations and tones. */
  startResolvedSequence: (input: ResolvedSequenceInput) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  skip: () => Promise<void>;
  stop: () => Promise<void>;
  extendTimer: (seconds: number) => Promise<void>;

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
  removeCustomSound: (id: string) => void;
  renameCustomSound: (id: string, name: string) => void;
  clearHistory: () => void;
  showToast: (msg: string) => void;
  clearToast: () => void;
  hydrate: (data: Partial<TimerStore>) => void;

  // ── Stopwatch actions ──
  startStopwatch: () => void;
  pauseStopwatch: () => void;
  resumeStopwatch: () => void;
  tickStopwatch: () => void;
  stopStopwatch: (label: string) => void;
  /** Abandon the current stopwatch run without recording a session. */
  discardStopwatch: () => void;
  deleteStopwatchSession: (id: string) => void;
  updateStopwatchSessionLabel: (id: string, label: string) => void;
  clearStopwatchSessions: () => void;
}

export const DEFAULT_SETTINGS: Settings = {
  presets: { pomodoro: 25, shortBreak: 5, longBreak: 15, deepWork: 52, writing: 42, planning: 26, deep: 60 },
  volume: 70,
  soundEnabled: true,
  notificationsEnabled: true,
  warningsEnabled: true,
  autoStartBreaks: true,
  defaultSound: 'chime',
};

/**
 * Id of the last completion we acted on.
 *
 * `timer:complete` must be idempotent on this side too: a skip landing on the
 * same tick as the natural end, or a second window acking the same event, would
 * otherwise double-log history and advance the sequence twice (silently eating a
 * step). Cleared whenever a new step starts or the timer ticks, so a looping
 * sequence can legitimately complete the same step id again.
 */
let lastCompletedId: string | null = null;

/** How long a finished standalone timer stays on screen before the UI resets. */
const COMPLETE_LINGER_MS = 8_000;

/**
 * Seconds-remaining marks that earn a heads-up while the timer is still running,
 * so the end tone lands as a confirmation rather than a surprise. Descending.
 */
export const WARNING_MARKS_SECONDS = [600, 300];

/**
 * A mark is only worth announcing if the timer runs this much longer than it.
 * Otherwise "10 minutes left" on a 10:20 timer fires twenty seconds in.
 */
const WARNING_MIN_LEAD_SECONDS = 60;

/**
 * The warning mark this tick just fell past, if any.
 *
 * Only a *downward* crossing counts, so a timer that starts at exactly 10:00 —
 * or one rehydrated below a mark after the window reopened — stays quiet
 * instead of warning about time it never had. A wall-clock resync after the
 * machine sleeps can skip several marks in a single tick; the lowest one is
 * the only thing still worth saying.
 */
function crossedWarningMark(prev: RustTimerState | null, next: RustTimerState): number | null {
  if (!prev || prev.id !== next.id || next.phase !== 'Running') return null;
  const crossed = WARNING_MARKS_SECONDS.filter(
    (mark) =>
      prev.remaining_seconds > mark &&
      next.remaining_seconds <= mark &&
      next.total_seconds - mark >= WARNING_MIN_LEAD_SECONDS,
  );
  return crossed.length > 0 ? Math.min(...crossed) : null;
}

/** Send a desktop notification, asking for permission the first time. */
async function notify(title: string, body: string): Promise<void> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === 'granted';
    }
    if (granted) {
      sendNotification({ title, body });
    }
  } catch (e) {
    console.warn('Notification error:', e);
  }
}

const IDLE_STOPWATCH: TimerStore['stopwatch'] = {
  running: false,
  paused: false,
  startedAt: null,
  sessionStartedAt: null,
  accumulatedMs: 0,
  elapsedMs: 0,
};

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

  // Stopwatch state
  stopwatch: IDLE_STOPWATCH,
  stopwatchSessions: [],

  // ── Engine actions ──────────────────────────────────────────────────────────

  // Every engine call adopts the state the engine returns rather than guessing
  // locally, so the UI can never drift out of sync with the authoritative timer.

  startTimer: async ({ id, name, totalSeconds, soundType, notificationMsg }) => {
    const { settings } = get();
    lastCompletedId = null;
    const timer = await invoke<RustTimerState>('cmd_start_timer', {
      id: id ?? crypto.randomUUID(),
      name,
      totalSeconds,
      soundType: soundType ?? settings.defaultSound,
      notificationMsg: notificationMsg ?? `${name} complete!`,
    });
    set({ activeTimer: timer, isSequenceActive: false, sequenceComplete: false });
  },

  startSequence: async (sequence) => {
    const { settings } = get();
    const steps = resolveSequenceSteps(sequence, settings);
    if (steps.length === 0) {
      get().showToast('That sequence has no valid steps');
      return;
    }
    await get().startResolvedSequence({
      id: sequence.id,
      name: sequence.name,
      steps,
      loopEnabled: sequence.loop,
    });
  },

  startResolvedSequence: async (input) => {
    if (input.steps.length === 0) {
      get().showToast('Add at least one step first');
      return;
    }
    lastCompletedId = null;
    const timer = await invoke<RustTimerState>('cmd_start_sequence', { sequence: input });
    set({ activeTimer: timer, isSequenceActive: true, sequenceComplete: false });
  },

  pause: async () => {
    const timer = await invoke<RustTimerState | null>('cmd_pause_timer');
    if (timer) set({ activeTimer: timer });
  },

  resume: async () => {
    const timer = await invoke<RustTimerState | null>('cmd_resume_timer');
    if (timer) set({ activeTimer: timer });
  },

  skip: async () => {
    await invoke('cmd_skip_timer');
  },

  extendTimer: async (seconds) => {
    const timer = await invoke<RustTimerState | null>('cmd_extend_timer', { seconds });
    if (timer) set({ activeTimer: timer });
  },

  stop: async () => {
    lastCompletedId = null;
    await invoke('cmd_stop_timer');
    set({ activeTimer: null, isSequenceActive: false, sequenceComplete: false });
  },

  // ── Internal event handlers ─────────────────────────────────────────────────

  _onTick: (timerState) => {
    lastCompletedId = null;
    const previous = get().activeTimer;
    set({ activeTimer: timerState });

    const mark = crossedWarningMark(previous, timerState);
    if (mark === null) return;

    const { settings } = get();
    if (!settings.warningsEnabled) return;

    // Deliberately silent. The tone is the part that startles, so a heads-up
    // gets a toast and a notification and leaves the audio alone.
    const minutes = Math.round(mark / 60);
    get().showToast(`⏳ ${minutes} min left — ${timerState.name}`);
    if (settings.notificationsEnabled) {
      void notify(
        `⏳ ${minutes} minutes left`,
        `${timerState.name} — time to start wrapping up.`,
      );
    }
  },

  _onComplete: async (timerState, onPersist?) => {
    if (lastCompletedId === timerState.id) return;
    lastCompletedId = timerState.id;

    set({ activeTimer: timerState });

    const { settings, customSounds, stats } = get();
    const skipped = timerState.skipped === true;

    // A skipped phase is not an accomplishment: no tone, no notification, and no
    // entry in history or the pomodoro count. It only moves the sequence along.
    if (!skipped) {
      if (settings.soundEnabled) {
        playCompletionSound(timerState.sound_type, customSounds, settings.volume);
      }

      if (settings.notificationsEnabled) {
        await notify(
          '✨ Timer Complete!',
          timerState.notification_msg || `${timerState.name} is done!`,
        );
      }

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
    }

    // If this was a sequence step, hand control back to the engine. Passing the
    // step index lets the engine reject a duplicate or stale ack instead of
    // skipping a step. A skip always chains straight into the next step —
    // gating it behind auto-start would leave the user stranded on a phase they
    // just asked to leave.
    const { isSequenceActive: stillActive, settings: current } = get();
    if (stillActive && timerState.sequence_id) {
      try {
        const next = await invoke<RustTimerState | null>('cmd_next_sequence_step', {
          completedStep: timerState.sequence_step ?? null,
          startPaused: !skipped && !current.autoStartBreaks,
        });
        if (next) {
          set({ activeTimer: next });
          if (next.phase === 'Paused') {
            get().showToast(`Up next: ${next.name} — press Resume`);
          }
        }
      } catch (e) {
        console.warn('Sequence advance failed:', e);
      }
    } else {
      // A finished standalone timer used to sit on screen at 00:00 forever,
      // labelled "Paused", until the user hit the bin. Let it linger long enough
      // to be noticed, then return the UI to idle. A skip clears at once — the
      // user is already done with it.
      if (skipped) {
        await get().stop();
      } else {
        setTimeout(() => {
          const cur = get();
          if (cur.activeTimer?.id === timerState.id && cur.activeTimer.phase === 'Complete') {
            void cur.stop();
          }
        }, COMPLETE_LINGER_MS);
      }
    }

    onPersist?.();
  },

  _onSequenceStepStarted: () => {
    // A fresh step means the previous completion is fully handled; re-arm the
    // dedupe guard so a looping sequence can complete the same step id again.
    lastCompletedId = null;
  },

  _onSequenceComplete: () => {
    lastCompletedId = null;
    set({ isSequenceActive: false, sequenceComplete: true, activeTimer: null });
    get().showToast('🎉 Sequence complete!');
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

  removeCustomSound: (id) =>
    set((s) => {
      const customSounds = s.customSounds.filter((cs) => cs.id !== id);
      // If the deleted tone was the default, fall back to the built-in chime
      const settings = s.settings.defaultSound === `custom_${id}`
        ? { ...s.settings, defaultSound: 'chime' }
        : s.settings;
      return { customSounds, settings };
    }),

  renameCustomSound: (id, name) =>
    set((s) => ({
      customSounds: s.customSounds.map((cs) =>
        cs.id === id ? { ...cs, name } : cs
      ),
    })),

  clearHistory: () => set({ history: [] }),

  showToast: (msg) => set({ toast: msg }),
  clearToast: () => set({ toast: null }),

  hydrate: (data) =>
    set((s) => {
      // A stopwatch persisted mid-run comes back *paused* at the elapsed value it
      // had when the app closed. Letting it stay "running" would bill all the
      // time the app wasn't even open to the session.
      const sw = data.stopwatch;
      const stopwatch = sw
        ? sw.running && sw.startedAt
          ? {
              ...sw,
              running: false,
              paused: true,
              startedAt: null,
              accumulatedMs: sw.elapsedMs,
            }
          : sw
        : s.stopwatch;

      return {
        ...s,
        ...data,
        stopwatch,
        stopwatchSessions: data.stopwatchSessions ?? s.stopwatchSessions,
      };
    }),

  // ── Stopwatch actions ────────────────────────────────────────────────────────

  startStopwatch: () => {
    const now = new Date().toISOString();
    set({
      stopwatch: {
        running: true,
        paused: false,
        startedAt: now,
        sessionStartedAt: now,
        accumulatedMs: 0,
        elapsedMs: 0,
      },
    });
  },

  pauseStopwatch: () =>
    set((s) => {
      if (!s.stopwatch.running) return s;
      const extra = s.stopwatch.startedAt
        ? Date.now() - new Date(s.stopwatch.startedAt).getTime()
        : 0;
      const accumulated = s.stopwatch.accumulatedMs + extra;
      return {
        stopwatch: {
          ...s.stopwatch,
          running: false,
          paused: true,
          startedAt: null,
          accumulatedMs: accumulated,
          elapsedMs: accumulated,
        },
      };
    }),

  resumeStopwatch: () =>
    set((s) => {
      if (!s.stopwatch.paused) return s;
      return {
        stopwatch: {
          ...s.stopwatch,
          running: true,
          paused: false,
          startedAt: new Date().toISOString(),
        },
      };
    }),

  tickStopwatch: () =>
    set((s) => {
      if (!s.stopwatch.running || !s.stopwatch.startedAt) return s;
      return {
        stopwatch: {
          ...s.stopwatch,
          elapsedMs:
            s.stopwatch.accumulatedMs +
            (Date.now() - new Date(s.stopwatch.startedAt).getTime()),
        },
      };
    }),

  stopStopwatch: (label) =>
    set((s) => {
      const sw = s.stopwatch;
      // Allow stopping from either running or paused state
      if (!sw.running && !sw.paused) return s;
      const endedAt = new Date().toISOString();
      // Measure from the clock rather than reusing elapsedMs, which is only as
      // fresh as the last 250ms tick and would round the session short.
      const durationMs = sw.running && sw.startedAt
        ? sw.accumulatedMs + (Date.now() - new Date(sw.startedAt).getTime())
        : sw.elapsedMs;
      const session: StopwatchSession = {
        id: crypto.randomUUID(),
        label,
        startedAt: sw.sessionStartedAt ?? sw.startedAt ?? endedAt,
        endedAt,
        durationMs: Math.max(0, durationMs),
      };
      return {
        stopwatch: IDLE_STOPWATCH,
        stopwatchSessions: [...s.stopwatchSessions, session],
      };
    }),

  discardStopwatch: () => set({ stopwatch: IDLE_STOPWATCH }),

  deleteStopwatchSession: (id) =>
    set((s) => ({
      stopwatchSessions: s.stopwatchSessions.filter((sess) => sess.id !== id),
    })),

  updateStopwatchSessionLabel: (id, label) =>
    set((s) => ({
      stopwatchSessions: s.stopwatchSessions.map((sess) =>
        sess.id === id ? { ...sess, label } : sess
      ),
    })),

  clearStopwatchSessions: () => set({ stopwatchSessions: [] }),
}));

// ─── Event listener setup ─────────────────────────────────────────────────────
// Call this once from App.tsx inside useEffect. Returns a cleanup function.

export async function initTimerListeners(onPersist?: () => void): Promise<() => void> {
  // Subscribe *before* rehydrating so a tick that fires mid-setup isn't dropped.
  const unlisteners: UnlistenFn[] = await Promise.all([
    listen<RustTimerState>('timer:tick', (e) => {
      useTimerStore.getState()._onTick(e.payload);
    }),
    listen<RustTimerState>('timer:complete', (e) => {
      void useTimerStore.getState()._onComplete(e.payload, onPersist);
    }),
    listen<number>('sequence:step-started', (e) => {
      useTimerStore.getState()._onSequenceStepStarted(e.payload);
    }),
    listen('sequence:complete', () => {
      useTimerStore.getState()._onSequenceComplete();
    }),
  ]);

  // Rehydrate if the window was closed/reopened mid-session. The engine syncs
  // against the wall clock first, so this reflects real elapsed time even if the
  // machine slept in between.
  try {
    lastCompletedId = null;
    const currentState = await invoke<RustTimerState | null>('cmd_get_timer_state');
    if (currentState) {
      useTimerStore.setState({
        activeTimer: currentState,
        isSequenceActive: Boolean(currentState.sequence_id),
        sequenceComplete: false,
      });
    }
  } catch (e) {
    console.warn('State rehydration failed:', e);
  }

  return () => unlisteners.forEach((u) => u());
}
