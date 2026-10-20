import React, { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTimerStore, RustTimerState } from '../store/timerStore';
import { formatElapsed } from './StopwatchPanel';

interface Props {
  /** Soonest-to-finish timer, or null when no timer is running. */
  soonestTimer: RustTimerState | null;
  timerCount: number;
  /** Hide the timer row while the user is already looking at the timers. */
  showTimers: boolean;
  /** Hide the stopwatch row while the user is already on the stopwatch tab. */
  showStopwatch: boolean;
  formatClock: (seconds: number) => string;
  onOpenTimers: () => void;
  onOpenStopwatch: () => void;
}

/**
 * "Something is running elsewhere" strips, shown under the tabs. The stopwatch
 * used to be invisible outside its own tab, so it was easy to forget it was on.
 */
export const RunningStrip: React.FC<Props> = ({
  soonestTimer, timerCount, showTimers, showStopwatch, formatClock, onOpenTimers, onOpenStopwatch,
}) => {
  const sw = useTimerStore(useShallow((s) => ({
    running: s.stopwatch.running,
    paused: s.stopwatch.paused,
    startedAt: s.stopwatch.startedAt,
    accumulatedMs: s.stopwatch.accumulatedMs,
  })));
  const stopwatchActive = showStopwatch && (sw.running || sw.paused);

  // The stopwatch only ticks while its panel is mounted, so derive the elapsed
  // time here from its start time instead of relying on the store's copy.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!stopwatchActive || !sw.running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stopwatchActive, sw.running]);

  const elapsedMs = sw.running && sw.startedAt
    ? sw.accumulatedMs + (now - new Date(sw.startedAt).getTime())
    : sw.accumulatedMs;

  return (
    <>
      {showTimers && soonestTimer && (
        <button className="running-strip" onClick={onOpenTimers}>
          <span className="running-strip-dot" />
          <span className="running-strip-name">
            {timerCount > 1 ? `${timerCount} timers running` : soonestTimer.name}
          </span>
          <span className="running-strip-time">
            {formatClock(soonestTimer.remaining_seconds)}
          </span>
          <span className="running-strip-hint">view ›</span>
        </button>
      )}
      {stopwatchActive && (
        <button className="running-strip running-strip--stopwatch" onClick={onOpenStopwatch}>
          <span className={`running-strip-dot${sw.paused ? ' running-strip-dot--paused' : ''}`} />
          <span className="running-strip-name">
            ⏱ Stopwatch{sw.paused ? ' · paused' : ''}
          </span>
          <span className="running-strip-time">{formatElapsed(Math.max(0, elapsedMs))}</span>
          <span className="running-strip-hint">view ›</span>
        </button>
      )}
    </>
  );
};
