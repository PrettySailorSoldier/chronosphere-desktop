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
 * A step that carries its own duration instead of borrowing one from a preset.
 * Sequences hold a mix of these and preset keys, so "25 min focus / 4 min stand
 * up / 12 min reading" is expressible without inventing a preset for each part.
 */
export interface CustomStep {
  label: string;
  seconds: number;
  /** Falls back to the user's default tone when unset. */
  sound?: string;
}

/** A saved sequence step: a preset key, or a hand-entered duration. */
export type SequenceStep = StepKey | CustomStep;

export function isCustomStep(step: SequenceStep): step is CustomStep {
  return typeof step === 'object' && step !== null;
}

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
  steps: SequenceStep[];
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

/** Duration of a saved step in seconds — preset steps read the current settings. */
export function sequenceStepSeconds(step: SequenceStep, settings: Settings): number {
  if (isCustomStep(step)) return Math.max(1, Math.round(step.seconds));
  return Math.max(1, Math.round((settings.presets[step] ?? 25) * 60));
}

/** Display name of a saved step, without the emoji the UI layers add. */
export function sequenceStepLabel(step: SequenceStep): string {
  if (isCustomStep(step)) return step.label.trim() || 'Step';
  return STEP_LABELS[step] ?? step;
}

/** Turn a saved sequence into concrete steps using current settings. */
export function resolveSequenceSteps(sequence: Sequence, settings: Settings): ResolvedStep[] {
  return sequence.steps.flatMap((step) => {
    // Skip anything unrecognisable rather than starting a sequence with a hole
    // in it — old backups and hand-edited state files both land here.
    if (!isCustomStep(step) && !(step in STEP_LABELS)) return [];

    const label = sequenceStepLabel(step);
    return [{
      label,
      seconds: sequenceStepSeconds(step, settings),
      sound: isCustomStep(step)
        ? step.sound ?? settings.defaultSound
        : STEP_SOUNDS[step],
      notification: `${label} complete!`,
    }];
  });
}

/**
 * The key a timer lives under in the `timers` map.
 *
 * A standalone timer's slot is its own id. A sequence's slot is the
 * *sequence's* id, which stays stable across all of its steps even though the
 * timer's own `id` changes every step — that stability is what lets a running
 * sequence keep the same card in place as it advances. Mirrors `slot_key`-style
 * logic on the Rust side (see src-tauri/src/lib.rs), computed the same way.
 */
export function slotKeyOf(t: RustTimerState): string {
  return t.sequence_id ?? t.id;
}

/** Soft cap on concurrently-running timers/sequences, mirrors MAX_CONCURRENT_TIMERS in Rust. */
export const MAX_CONCURRENT_TIMERS = 8;

// ─── Store interface ──────────────────────────────────────────────────────────

interface TimerStore {
  // ── Engine state (driven by Rust) ──
  /** Every concurrently-running timer/sequence, keyed by slotKeyOf(). */
  timers: Record<string, RustTimerState>;

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

  // ── Engine actions ── (all keyed by slot id — see slotKeyOf())
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
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  skip: (id: string) => Promise<void>;
  stop: (id: string) => Promise<void>;
  extendTimer: (id: string, seconds: number) => Promise<void>;

  // ── Event handlers (called internally by listeners) ──
  _onTick: (state: RustTimerState) => void;
  _onComplete: (state: RustTimerState, onPersist?: () => void) => Promise<void>;
  _onSequenceStepStarted: (payload: { id: string; step: number }) => void;
  _onSequenceComplete: (id: string) => void;

  // ── Legacy timer actions (for history/settings parts of the app) ──
  updateTimerSound: (id: string, soundType: string) => Promise<void>;
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
 * Id of the last completion we acted on, per slot.
 *
 * `timer:complete` must be idempotent on this side too: a skip landing on the
 * same tick as the natural end, or a second window acking the same event, would
 * otherwise double-log history and advance the sequence twice (silently eating a
 * step). Cleared whenever that slot's step starts or ticks, so a looping
 * sequence can legitimately complete the same step id again — and keyed per
 * slot so one timer's completion never blocks another's.
 */
const lastCompletedIdBySlot: Record<string, string> = {};

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
  timers: {},

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
    const slotId = id ?? crypto.randomUUID();
    delete lastCompletedIdBySlot[slotId];
    try {
      const timer = await invoke<RustTimerState>('cmd_start_timer', {
        id: slotId,
        name,
        totalSeconds,
        soundType: soundType ?? settings.defaultSound,
        notificationMsg: notificationMsg ?? `${name} complete!`,
      });
      set((s) => ({ timers: { ...s.timers, [slotKeyOf(timer)]: timer } }));
    } catch (e) {
      get().showToast(typeof e === 'string' ? e : 'Could not start that timer');
    }
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
    delete lastCompletedIdBySlot[input.id];
    try {
      const timer = await invoke<RustTimerState>('cmd_start_sequence', { sequence: input });
      set((s) => ({ timers: { ...s.timers, [slotKeyOf(timer)]: timer } }));
    } catch (e) {
      get().showToast(typeof e === 'string' ? e : 'Could not start that sequence');
    }
  },

  pause: async (id) => {
    const timer = await invoke<RustTimerState | null>('cmd_pause_timer', { id });
    if (timer) set((s) => ({ timers: { ...s.timers, [id]: timer } }));
  },

  resume: async (id) => {
    const timer = await invoke<RustTimerState | null>('cmd_resume_timer', { id });
    if (timer) set((s) => ({ timers: { ...s.timers, [id]: timer } }));
  },

  skip: async (id) => {
    await invoke('cmd_skip_timer', { id });
  },

  extendTimer: async (id, seconds) => {
    const timer = await invoke<RustTimerState | null>('cmd_extend_timer', { id, seconds });
    if (timer) set((s) => ({ timers: { ...s.timers, [id]: timer } }));
  },

  stop: async (id) => {
    delete lastCompletedIdBySlot[id];
    await invoke('cmd_stop_timer', { id });
    set((s) => {
      const timers = { ...s.timers };
      delete timers[id];
      return { timers };
    });
  },

  // ── Internal event handlers ─────────────────────────────────────────────────

  _onTick: (timerState) => {
    const slot = slotKeyOf(timerState);
    delete lastCompletedIdBySlot[slot];
    const previous = get().timers[slot] ?? null;
    set((s) => ({ timers: { ...s.timers, [slot]: timerState } }));

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
    const slot = slotKeyOf(timerState);
    if (lastCompletedIdBySlot[slot] === timerState.id) return;
    lastCompletedIdBySlot[slot] = timerState.id;

    set((s) => ({ timers: { ...s.timers, [slot]: timerState } }));

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
    const { settings: current } = get();
    if (timerState.sequence_id) {
      try {
        const next = await invoke<RustTimerState | null>('cmd_next_sequence_step', {
          id: slot,
          completedStep: timerState.sequence_step ?? null,
          startPaused: !skipped && !current.autoStartBreaks,
        });
        if (next) {
          set((s) => ({ timers: { ...s.timers, [slot]: next } }));
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
        await get().stop(slot);
      } else {
        setTimeout(() => {
          const cur = get().timers[slot];
          if (cur?.id === timerState.id && cur.phase === 'Complete') {
            void get().stop(slot);
          }
        }, COMPLETE_LINGER_MS);
      }
    }

    onPersist?.();
  },

  _onSequenceStepStarted: ({ id }) => {
    // A fresh step means the previous completion is fully handled; re-arm the
    // dedupe guard so a looping sequence can complete the same step id again.
    delete lastCompletedIdBySlot[id];
  },

  _onSequenceComplete: (id) => {
    delete lastCompletedIdBySlot[id];
    const name = get().timers[id]?.name ?? 'Sequence';
    set((s) => {
      const timers = { ...s.timers };
      delete timers[id];
      return { timers };
    });
    get().showToast(`🎉 ${name} complete!`);
  },

  // ── Persisted/legacy actions ────────────────────────────────────────────────

  // Sound is authoritative in Rust state — the engine, not this in-memory
  // copy, is what plays the tone on completion, so the choice has to reach it
  // via invoke() rather than just being set locally.
  updateTimerSound: async (id, soundType) => {
    if (!get().timers[id]) return;
    try {
      const timer = await invoke<RustTimerState | null>('cmd_set_timer_sound', { id, soundType });
      if (timer) set((s) => ({ timers: { ...s.timers, [id]: timer } }));
    } catch (e) {
      console.warn('Failed to update timer sound:', e);
    }
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
    listen<{ id: string; step: number }>('sequence:step-started', (e) => {
      useTimerStore.getState()._onSequenceStepStarted(e.payload);
    }),
    listen<string>('sequence:complete', (e) => {
      useTimerStore.getState()._onSequenceComplete(e.payload);
    }),
  ]);

  // Rehydrate if the window was closed/reopened mid-session. The engine syncs
  // against the wall clock first, so this reflects real elapsed time even if the
  // machine slept in between.
  try {
    const currentStates = await invoke<RustTimerState[]>('cmd_list_timer_states');
    const timers: Record<string, RustTimerState> = {};
    for (const t of currentStates) {
      const slot = slotKeyOf(t);
      timers[slot] = t;
      delete lastCompletedIdBySlot[slot];
    }
    useTimerStore.setState({ timers });
  } catch (e) {
    console.warn('State rehydration failed:', e);
  }

  return () => unlisteners.forEach((u) => u());
}
