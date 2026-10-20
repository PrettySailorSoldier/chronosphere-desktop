import React, { useEffect } from 'react';
import { useTimerStore } from '../store/timerStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatElapsed(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
// Clock and controls only. Saved sessions are listed (and renamed) in
// SessionLog — this panel used to keep a second "recent sessions" copy.

interface StopwatchPanelProps {
  /** Called with the new session's id after Stop, so SessionLog can prompt for a name. */
  onPendingLabelChange: (id: string | null) => void;
}

const StopwatchPanel: React.FC<StopwatchPanelProps> = ({ onPendingLabelChange }) => {
  const stopwatch        = useTimerStore((s) => s.stopwatch);
  const startStopwatch   = useTimerStore((s) => s.startStopwatch);
  const pauseStopwatch   = useTimerStore((s) => s.pauseStopwatch);
  const resumeStopwatch  = useTimerStore((s) => s.resumeStopwatch);
  const tickStopwatch    = useTimerStore((s) => s.tickStopwatch);
  const stopStopwatch    = useTimerStore((s) => s.stopStopwatch);
  const discardStopwatch = useTimerStore((s) => s.discardStopwatch);

  // ── Tick interval ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!stopwatch.running) return;
    // Each tick recomputes elapsed from startedAt, so a missed or late interval
    // callback costs nothing — the displayed value can't drift.
    tickStopwatch();
    const id = setInterval(tickStopwatch, 250);
    return () => clearInterval(id);
  }, [stopwatch.running, tickStopwatch]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleStart() {
    onPendingLabelChange(null);
    startStopwatch();
  }

  function handleStop() {
    // Save with a "Session" placeholder — user edits inline immediately after
    stopStopwatch('Session');
    // The newest session will be last in the array; grab its id via getState
    const sessions = useTimerStore.getState().stopwatchSessions;
    const newest   = sessions[sessions.length - 1];
    if (newest) onPendingLabelChange(newest.id);
  }

  function handleDiscard() {
    const elapsed = useTimerStore.getState().stopwatch.elapsedMs;
    // Only nag if there's something worth losing.
    if (elapsed > 10_000 && !window.confirm('Discard this session without saving?')) return;
    discardStopwatch();
    onPendingLabelChange(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="swp-root">

      {/* ── Clock display ── */}
      <div
        className={[
          'swp-clock',
          stopwatch.running  ? 'swp-clock--running' : '',
          stopwatch.paused   ? 'swp-clock--paused'  : '',
        ].filter(Boolean).join(' ')}
        aria-label="Elapsed time"
      >
        {formatElapsed(stopwatch.elapsedMs)}
      </div>

      {/* ── Controls ── */}
      <div className="swp-controls">
        {/* IDLE */}
        {!stopwatch.running && !stopwatch.paused && (
          <button
            id="swp-start-btn"
            className="swp-btn swp-btn--start"
            onClick={handleStart}
            aria-label="Start stopwatch"
          >
            <span className="swp-btn-icon">▶</span>
            Start
          </button>
        )}

        {/* RUNNING: Pause + Stop */}
        {stopwatch.running && (
          <>
            <button
              id="swp-pause-btn"
              className="swp-btn swp-btn--pause"
              onClick={pauseStopwatch}
              aria-label="Pause stopwatch"
            >
              <span className="swp-btn-icon">⏸</span>
              Pause
            </button>
            <button
              id="swp-stop-btn"
              className="swp-btn swp-btn--stop"
              onClick={handleStop}
              aria-label="Stop and save"
            >
              <span className="swp-btn-icon">⏹</span>
              Stop
            </button>
          </>
        )}

        {/* PAUSED: Resume + Stop */}
        {stopwatch.paused && (
          <>
            <button
              id="swp-resume-btn"
              className="swp-btn swp-btn--resume"
              onClick={resumeStopwatch}
              aria-label="Resume stopwatch"
            >
              <span className="swp-btn-icon">▶</span>
              Resume
            </button>
            <button
              id="swp-stop-btn-paused"
              className="swp-btn swp-btn--stop"
              onClick={handleStop}
              aria-label="Stop and save"
            >
              <span className="swp-btn-icon">⏹</span>
              Stop
            </button>
          </>
        )}

        {/* Stopping always wrote a session, so a mistimed start could only be
            undone by deleting the row afterwards. */}
        {(stopwatch.running || stopwatch.paused) && (
          <button
            id="swp-discard-btn"
            className="swp-btn swp-btn--discard"
            onClick={handleDiscard}
            aria-label="Discard without saving"
          >
            <span className="swp-btn-icon">✕</span>
            Discard
          </button>
        )}
      </div>
    </div>
  );
};

export default StopwatchPanel;
