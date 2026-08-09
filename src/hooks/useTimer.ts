import { useShallow } from 'zustand/react/shallow';
import { useTimerStore } from '../store/timerStore';

/**
 * Convenience hook that derives all computed values from the engine-driven
 * timer store. Components should use this instead of useTimerStore() directly
 * for timer display logic.
 */
export function useTimer() {
  // Selected shallowly rather than pulling the whole store: an unselected
  // useTimerStore() re-renders every consumer on *any* state change, including
  // the 250ms stopwatch tick, which has nothing to do with the countdown.
  const {
    activeTimer,
    isSequenceActive,
    sequenceComplete,
    settings,
  } = useTimerStore(
    useShallow((s) => ({
      activeTimer: s.activeTimer,
      isSequenceActive: s.isSequenceActive,
      sequenceComplete: s.sequenceComplete,
      settings: s.settings,
    })),
  );

  // Actions are stable across renders, so reading them off the store directly
  // costs nothing and keeps them out of the subscription.
  const {
    startTimer, startSequence, startResolvedSequence,
    pause, resume, skip, stop, extendTimer, setSettings,
  } = useTimerStore.getState();

  const isRunning  = activeTimer?.phase === 'Running';
  const isPaused   = activeTimer?.phase === 'Paused';
  const isComplete = activeTimer?.phase === 'Complete';
  const isIdle     = !activeTimer;

  // Progress fraction 0–1 for the ring animation (elapsed share of the phase)
  const progress = activeTimer && activeTimer.total_seconds > 0
    ? (activeTimer.total_seconds - activeTimer.remaining_seconds) / activeTimer.total_seconds
    : 0;

  // MM:SS (or H:MM:SS) formatted remaining time
  const formattedTime = (() => {
    const secs = activeTimer?.remaining_seconds ?? 0;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  })();

  // Sequence progress (0-indexed step out of total steps)
  const sequenceStep       = activeTimer?.sequence_step       ?? null;
  const sequenceTotalSteps = activeTimer?.sequence_total_steps ?? null;

  // Sound type of the currently active timer (for the sound picker in TimerCard)
  const activeSoundType = activeTimer?.sound_type ?? settings.defaultSound;

  return {
    activeTimer,
    isRunning,
    isPaused,
    isComplete,
    isIdle,
    isSequenceActive,
    sequenceComplete,
    progress,
    formattedTime,
    sequenceStep,
    sequenceTotalSteps,
    activeSoundType,
    settings,
    // Actions
    startTimer,
    startSequence,
    startResolvedSequence,
    pause,
    resume,
    skip,
    stop,
    extendTimer,
    setSettings,
  };
}
