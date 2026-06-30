import React from 'react';
import { useTimerStore, StopwatchSession } from '../store/timerStore';

// ─── Duration formatter ────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms >= 3_600_000) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1_000);
    return `${h}h ${m}m ${s}s`;
  }
  if (ms >= 60_000) {
    const m = Math.floor(ms / 60_000);
    const s = Math.floor((ms % 60_000) / 1_000);
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }
  return `${Math.floor(ms / 1_000)}s`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SessionLogProps {
  pendingLabelId?: string | null;
}

// ─── Session card ─────────────────────────────────────────────────────────────

interface CardProps {
  session: StopwatchSession;
  isPending: boolean;
  onDelete: (id: string) => void;
}

const SessionCard: React.FC<CardProps> = ({ session, isPending, onDelete }) => (
  <div
    className={`sl-card${isPending ? ' sl-card--pending' : ''}`}
    aria-label={`Session: ${session.label}`}
  >
    {/* Delete button */}
    <button
      className="sl-delete-btn"
      onClick={() => onDelete(session.id)}
      aria-label={`Delete session ${session.label}`}
      title="Delete"
    >
      ×
    </button>

    {/* Line 1 — label */}
    <div className="sl-label" title={session.label}>
      {session.label}
    </div>

    {/* Line 2 — duration */}
    <div className="sl-duration">
      {formatDuration(session.durationMs)}
    </div>

    {/* Line 3 — start · end times */}
    <div className="sl-times">
      Started {fmtTime(session.startedAt)}
      <span className="sl-times-sep"> · </span>
      Ended {fmtTime(session.endedAt)}
    </div>

    {/* Line 4 — date */}
    <div className="sl-date">
      {fmtDate(session.startedAt)}
    </div>
  </div>
);

// ─── SessionLog ───────────────────────────────────────────────────────────────

export const SessionLog: React.FC<SessionLogProps> = ({ pendingLabelId }) => {
  const stopwatchSessions      = useTimerStore((s) => s.stopwatchSessions);
  const deleteStopwatchSession = useTimerStore((s) => s.deleteStopwatchSession);

  // Sort newest-first by startedAt
  const sorted = [...stopwatchSessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  if (sorted.length === 0) {
    return (
      <div className="sl-empty">
        No sessions yet. Start tracking something.
      </div>
    );
  }

  return (
    <div className="sl-root">
      {sorted.map((sess) => (
        <SessionCard
          key={sess.id}
          session={sess}
          isPending={pendingLabelId === sess.id}
          onDelete={deleteStopwatchSession}
        />
      ))}
    </div>
  );
};
