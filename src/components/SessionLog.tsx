import React, { useEffect, useRef, useState } from 'react';
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
  /** Session whose label is being edited (set by StopwatchPanel right after Stop). */
  pendingLabelId: string | null;
  onPendingLabelChange: (id: string | null) => void;
}

// ─── Session card ─────────────────────────────────────────────────────────────

interface CardProps {
  session: StopwatchSession;
  isEditing: boolean;
  onStartEdit: (session: StopwatchSession) => void;
  onSaveLabel: (id: string, label: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
}

const SessionCard: React.FC<CardProps> = ({
  session, isEditing, onStartEdit, onSaveLabel, onCancelEdit, onDelete,
}) => {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Fresh sessions arrive labelled "Session" — start those blank so the user
  // just types, rather than having to clear a placeholder first.
  useEffect(() => {
    if (!isEditing) return;
    setDraft(session.label === 'Session' ? '' : session.label);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [isEditing, session.label]);

  return (
    <div
      className={`sl-card${isEditing ? ' sl-card--pending' : ''}`}
      aria-label={`Session: ${session.label}`}
    >
      <button
        className="sl-delete-btn"
        onClick={() => onDelete(session.id)}
        aria-label={`Delete session ${session.label}`}
        title="Delete"
      >
        ×
      </button>

      {/* Line 1 — label, editable in place */}
      {isEditing ? (
        <div className="swp-label-edit">
          <input
            ref={inputRef}
            className="swp-label-input"
            type="text"
            value={draft}
            placeholder="Name this session…"
            maxLength={80}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter')  { e.preventDefault(); onSaveLabel(session.id, draft); }
              if (e.key === 'Escape') onCancelEdit();
            }}
          />
          <button className="swp-save-btn" onClick={() => onSaveLabel(session.id, draft)}>
            Save
          </button>
        </div>
      ) : (
        <div
          className="sl-label sl-label--editable"
          title="Click to rename"
          onClick={() => onStartEdit(session)}
        >
          {session.label}
          <span className="swp-edit-hint"> ✎</span>
        </div>
      )}

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
};

// ─── SessionLog ───────────────────────────────────────────────────────────────
// The one list of stopwatch sessions. StopwatchPanel used to keep its own
// "recent sessions" list as well, so every session showed up twice on the tab.

export const SessionLog: React.FC<SessionLogProps> = ({ pendingLabelId, onPendingLabelChange }) => {
  const stopwatchSessions           = useTimerStore((s) => s.stopwatchSessions);
  const deleteStopwatchSession      = useTimerStore((s) => s.deleteStopwatchSession);
  const updateStopwatchSessionLabel = useTimerStore((s) => s.updateStopwatchSessionLabel);
  const clearStopwatchSessions      = useTimerStore((s) => s.clearStopwatchSessions);

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

  const handleSaveLabel = (id: string, label: string) => {
    updateStopwatchSessionLabel(id, label.trim() || 'Session');
    onPendingLabelChange(null);
  };

  return (
    <div className="sl-root">
      <div className="swp-sessions-header">
        <span className="swp-sessions-title">{sorted.length} session{sorted.length === 1 ? '' : 's'}</span>
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

      {sorted.map((sess) => (
        <SessionCard
          key={sess.id}
          session={sess}
          isEditing={pendingLabelId === sess.id}
          onStartEdit={(s) => onPendingLabelChange(s.id)}
          onSaveLabel={handleSaveLabel}
          onCancelEdit={() => onPendingLabelChange(null)}
          onDelete={deleteStopwatchSession}
        />
      ))}
    </div>
  );
};
