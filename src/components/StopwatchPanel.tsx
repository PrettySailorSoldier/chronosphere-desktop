import React, { useEffect, useRef, useState } from 'react';
import { useTimerStore } from '../store/timerStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatShortDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
  }
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(diff / 3_600_000);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface StopwatchPanelProps {
  /** ID of the session currently being labelled (lifted to App so SessionLog can highlight it). */
  pendingLabelId: string | null;
  onPendingLabelChange: (id: string | null) => void;
}

const StopwatchPanel: React.FC<StopwatchPanelProps> = ({
  pendingLabelId,
  onPendingLabelChange,
}) => {
  const stopwatch                   = useTimerStore((s) => s.stopwatch);
  const stopwatchSessions           = useTimerStore((s) => s.stopwatchSessions);
  const startStopwatch              = useTimerStore((s) => s.startStopwatch);
  const tickStopwatch               = useTimerStore((s) => s.tickStopwatch);
  const stopStopwatch               = useTimerStore((s) => s.stopStopwatch);
  const updateStopwatchSessionLabel = useTimerStore((s) => s.updateStopwatchSessionLabel);
  const deleteStopwatchSession      = useTimerStore((s) => s.deleteStopwatchSession);
  const clearStopwatchSessions      = useTimerStore((s) => s.clearStopwatchSessions);

  // id of the session currently being labelled; null = none — lifted to parent
  const [pendingLabelText, setPendingLabelText]   = useState('');
  const labelInputRef = useRef<HTMLInputElement>(null);

  // ── Tick interval ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!stopwatch.running) return;
    const id = setInterval(tickStopwatch, 250);
    return () => clearInterval(id);
  }, [stopwatch.running]);

  // Auto-focus label input whenever it appears
  useEffect(() => {
    if (pendingLabelId) {
      setTimeout(() => labelInputRef.current?.focus(), 0);
    }
  }, [pendingLabelId]);

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
    if (newest) {
      onPendingLabelChange(newest.id);
      setPendingLabelText('');
    }
  }

  function handleLabelSave(id: string) {
    const trimmed = pendingLabelText.trim();
    updateStopwatchSessionLabel(id, trimmed || 'Session');
    onPendingLabelChange(null);
    setPendingLabelText('');
  }

  function handleLabelKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === 'Enter')  { e.preventDefault(); handleLabelSave(id); }
    if (e.key === 'Escape') { onPendingLabelChange(null); setPendingLabelText(''); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  // Show last 10 sessions, newest-first
  const recentSessions = [...stopwatchSessions].reverse().slice(0, 10);

  return (
    <div className="swp-root">

      {/* ── Clock display ── */}
      <div
        className={`swp-clock ${stopwatch.running ? 'swp-clock--running' : ''}`}
        aria-label="Elapsed time"
      >
        {formatElapsed(stopwatch.elapsedMs)}
      </div>

      {/* ── Controls ── */}
      <div className="swp-controls">
        {!stopwatch.running ? (
          <button
            id="swp-start-btn"
            className="swp-btn swp-btn--start"
            onClick={handleStart}
            aria-label="Start stopwatch"
          >
            <span className="swp-btn-icon">▶</span>
            Start
          </button>
        ) : (
          <button
            id="swp-stop-btn"
            className="swp-btn swp-btn--stop"
            onClick={handleStop}
            aria-label="Stop stopwatch"
          >
            <span className="swp-btn-icon">⏹</span>
            Stop
          </button>
        )}
      </div>

      {/* ── Session history ── */}
      {recentSessions.length > 0 && (
        <div className="swp-sessions">
          <div className="swp-sessions-header">
            <span className="swp-sessions-title">Recent sessions</span>
            <button
              className="swp-clear-btn"
              onClick={() => {
                if (window.confirm('Clear all stopwatch sessions?')) {
                  clearStopwatchSessions();
                  onPendingLabelChange(null);
                }
              }}
              aria-label="Clear all sessions"
            >
              Clear all
            </button>
          </div>

          <div className="swp-session-list">
            {recentSessions.map((sess) => (
              <div key={sess.id} className="swp-session-card">

                {/* Label row or inline edit */}
                {pendingLabelId === sess.id ? (
                  <div className="swp-label-edit">
                    <input
                      ref={labelInputRef}
                      id={`swp-label-input-${sess.id}`}
                      className="swp-label-input"
                      type="text"
                      value={pendingLabelText}
                      placeholder="Name this session…"
                      maxLength={80}
                      onChange={(e) => setPendingLabelText(e.target.value)}
                      onKeyDown={(e) => handleLabelKeyDown(e, sess.id)}
                    />
                    <button
                      className="swp-save-btn"
                      onClick={() => handleLabelSave(sess.id)}
                      aria-label="Save label"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="swp-session-top">
                    <span
                      className="swp-session-label"
                      title={sess.label}
                      onClick={() => {
                        onPendingLabelChange(sess.id);
                        setPendingLabelText(sess.label === 'Session' ? '' : sess.label);
                      }}
                    >
                      {sess.label}
                      <span className="swp-edit-hint"> ✎</span>
                    </span>
                    <button
                      className="swp-delete-btn"
                      onClick={() => deleteStopwatchSession(sess.id)}
                      aria-label={`Delete session ${sess.label}`}
                    >
                      ×
                    </button>
                  </div>
                )}

                {/* Meta row */}
                <div className="swp-session-meta">
                  <span className="swp-session-duration">
                    {formatShortDuration(sess.durationMs)}
                  </span>
                  <span className="swp-session-ago">{timeAgo(sess.endedAt)}</span>
                </div>

              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StopwatchPanel;
