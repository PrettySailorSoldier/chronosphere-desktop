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
  const discardStopwatch   = useTimerStore((s) => s.discardStopwatch);

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
    if (!window.confirm('Discard without saving?')) return;
    setAwaitingLabel(false);
    setLabel('');
    discardStopwatch();
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
