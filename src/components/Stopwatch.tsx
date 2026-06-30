import React, { useState, useEffect } from 'react';
import { useTimerStore } from '../store/timerStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtClock(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

// ─── Component ────────────────────────────────────────────────────────────────

export const Stopwatch: React.FC = () => {
  const stopwatch          = useTimerStore((s) => s.stopwatch);
  const startStopwatch     = useTimerStore((s) => s.startStopwatch);
  const tickStopwatch      = useTimerStore((s) => s.tickStopwatch);
  const stopStopwatch      = useTimerStore((s) => s.stopStopwatch);

  // Local controlled input for the session label
  const [label, setLabel] = useState('');
  // Whether we're showing the inline label-prompt before saving
  const [awaitingLabel, setAwaitingLabel] = useState(false);

  // Drive 1-second ticks while the stopwatch is running
  useEffect(() => {
    if (!stopwatch.running) return;
    const id = setInterval(() => tickStopwatch(), 1000);
    return () => clearInterval(id);
  }, [stopwatch.running]);

  // Reset awaitingLabel when the stopwatch resets to idle
  useEffect(() => {
    if (!stopwatch.running && !stopwatch.startedAt) {
      setAwaitingLabel(false);
    }
  }, [stopwatch.running, stopwatch.startedAt]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleStart() {
    setLabel('');
    startStopwatch();
  }

  function handleStopClick() {
    if (!stopwatch.running) return;
    setAwaitingLabel(true);
  }

  function handleConfirmSave() {
    stopStopwatch(label.trim() || 'Untitled');
    setLabel('');
    setAwaitingLabel(false);
  }

  function handleDiscard() {
    if (window.confirm('Discard without saving?')) {
      // Reset to idle by stopping with a discard marker (won't appear — or use a dedicated reset)
      // Since the new slice has no clearStopwatch, we call stopStopwatch with a sentinel
      // that the user won't see because we immediately clear it — but to avoid polluting
      // sessions we skip saving entirely: just reset state by calling startStopwatch on a
      // zeroed watch via a no-save path. Instead we stop and won't display the result.
      // Actually the cleanest approach: just leave running=false, startedAt=null, elapsedMs=0
      // by calling stopStopwatch() — but that adds a session. So we skip this and let
      // the user cancel the label prompt without saving.
      setAwaitingLabel(false);
      setLabel('');
      // Force-reset by starting fresh then immediately stopping without a session
      // (use store directly to bypass session push)
      useTimerStore.setState({
        stopwatch: { running: false, paused: false, startedAt: null, sessionStartedAt: null, accumulatedMs: 0, elapsedMs: 0 },
      });
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const displayMs = stopwatch.elapsedMs;

  // ── State: idle (not running, no pending session) ────────────────────────────
  if (!stopwatch.running && !awaitingLabel) {
    return (
      <div className="stopwatch">
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

  // ── State: running or awaiting label before save ─────────────────────────────
  return (
    <div className="stopwatch">
      {/* Elapsed display */}
      <div className="sw-display">{fmtClock(displayMs)}</div>

      {/* Inline label prompt when saving */}
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
          <button
            id="sw-stop-btn"
            className="sw-btn sw-btn--stop"
            onClick={handleStopClick}
          >
            ⏹ Stop &amp; Save
          </button>
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

        {!awaitingLabel && (
          <button
            id="sw-discard-btn"
            className="sw-btn sw-btn--discard"
            onClick={handleDiscard}
          >
            ✕ Discard
          </button>
        )}
      </div>
    </div>
  );
};
