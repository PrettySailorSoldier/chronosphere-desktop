import React, { useState, useEffect } from 'react';
import { useTimerStore, StopwatchState } from '../store/timerStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function elapsedMs(sw: StopwatchState | null): number {
  if (!sw) return 0;
  return sw.accumulatedMs + (sw.isRunning ? Date.now() - sw.startTime : 0);
}

function fmtClock(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

// ─── Component ────────────────────────────────────────────────────────────────

export const Stopwatch: React.FC = () => {
  const stopwatch         = useTimerStore((s) => s.stopwatch);
  const startStopwatch    = useTimerStore((s) => s.startStopwatch);
  const pauseStopwatch    = useTimerStore((s) => s.pauseStopwatch);
  const resumeStopwatch   = useTimerStore((s) => s.resumeStopwatch);
  const stopStopwatch     = useTimerStore((s) => s.stopStopwatch);
  const clearStopwatch    = useTimerStore((s) => s.clearStopwatch);

  // Local controlled input for the label
  const [label, setLabel] = useState('');
  // Tick counter — only drives re-render; actual elapsed is always recomputed from startTime
  const [, setNowTick] = useState(0);
  // Whether we're showing the inline "label needed before save" prompt
  const [awaitingLabel, setAwaitingLabel] = useState(false);

  // Start / stop the 1-second interval based on running state
  useEffect(() => {
    if (!stopwatch?.isRunning) return;
    const id = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [stopwatch?.isRunning]);

  // Reset awaitingLabel whenever the stopwatch disappears (saved or discarded)
  useEffect(() => {
    if (!stopwatch) {
      setAwaitingLabel(false);
    }
  }, [stopwatch]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleStart() {
    startStopwatch(label.trim());
    setLabel('');
  }

  function handleStopClick() {
    if (!stopwatch) return;
    // If the stopwatch already has a label, save immediately
    if (stopwatch.label.trim()) {
      stopStopwatch();
    } else {
      // No label — show the inline prompt
      setAwaitingLabel(true);
    }
  }

  function handleConfirmSave() {
    stopStopwatch(label.trim() || 'Untitled');
    setLabel('');
    setAwaitingLabel(false);
  }

  function handleDiscard() {
    if (window.confirm('Discard without saving?')) {
      clearStopwatch();
      setLabel('');
      setAwaitingLabel(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const displayMs = elapsedMs(stopwatch);

  // ── State: no stopwatch running ───────────────────────────────────────────
  if (!stopwatch) {
    return (
      <div className="stopwatch">
        <input
          id="sw-label-input"
          className="sw-input"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleStart(); }}
          placeholder="What are you timing? (optional)"
          maxLength={80}
        />
        <div className="sw-actions">
          <button
            id="sw-start-btn"
            className="sw-btn sw-btn--start"
            onClick={handleStart}
          >
            ▶ Start
          </button>
        </div>
      </div>
    );
  }

  // ── State: stopwatch running or paused ────────────────────────────────────
  const currentLabel = stopwatch.label.trim() || 'Untitled';

  return (
    <div className="stopwatch">
      {/* Elapsed display */}
      <div className="sw-display">{fmtClock(displayMs)}</div>

      {/* Current label */}
      <div className="sw-label">{currentLabel}</div>

      {/* Inline label-prompt when saving an unlabeled session */}
      {awaitingLabel && (
        <div className="sw-save-prompt">
          <input
            id="sw-save-label-input"
            className="sw-input"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmSave(); }}
            placeholder="Name this session (optional)"
            autoFocus
            maxLength={80}
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="sw-actions">
        {!awaitingLabel && (
          <>
            {stopwatch.isRunning ? (
              <button
                id="sw-pause-btn"
                className="sw-btn sw-btn--pause"
                onClick={pauseStopwatch}
              >
                ⏸ Pause
              </button>
            ) : (
              <button
                id="sw-resume-btn"
                className="sw-btn sw-btn--pause"
                onClick={resumeStopwatch}
              >
                ▶ Resume
              </button>
            )}

            <button
              id="sw-stop-btn"
              className="sw-btn sw-btn--stop"
              onClick={handleStopClick}
            >
              ⏹ Stop &amp; Save
            </button>

            <button
              id="sw-discard-btn"
              className="sw-btn sw-btn--discard"
              onClick={handleDiscard}
            >
              ✕ Discard
            </button>
          </>
        )}

        {awaitingLabel && (
          <>
            <button
              id="sw-confirm-save-btn"
              className="sw-btn sw-btn--stop"
              onClick={handleConfirmSave}
            >
              Save
            </button>
            <button
              id="sw-cancel-save-btn"
              className="sw-btn sw-btn--discard"
              onClick={() => { setAwaitingLabel(false); setLabel(''); }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
};
