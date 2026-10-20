import React, { useMemo, useState } from 'react';
import { useTimerStore, HistoryItem, TimerKind, isFocusItem } from '../store/timerStore';

interface Props {
  onRevive: (name: string, totalSeconds: number, kind: TimerKind) => void;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const leftover = m % 60;
    return `${h}h ${leftover}m`;
  }
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

function formatMinutes(seconds: number) {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function dayLabel(day: string): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (day === today.toDateString()) return 'Today';
  if (day === yesterday.toDateString()) return 'Yesterday';
  return new Date(day).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

interface DayGroup {
  day: string;
  items: HistoryItem[];
  focusSeconds: number;
  focusCount: number;
}

/** Newest-first, bucketed by calendar day with each day's focus totals. */
function groupByDay(history: HistoryItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of [...history].reverse()) {
    const day = new Date(item.completedAt).toDateString();
    let group = groups[groups.length - 1];
    if (!group || group.day !== day) {
      group = { day, items: [], focusSeconds: 0, focusCount: 0 };
      groups.push(group);
    }
    group.items.push(item);
    if (isFocusItem(item)) {
      group.focusSeconds += item.duration;
      group.focusCount += 1;
    }
  }
  return groups;
}

export const HistoryList: React.FC<Props> = ({ onRevive }) => {
  const history           = useTimerStore((s) => s.history);
  const updateHistoryNote = useTimerStore((s) => s.updateHistoryNote);
  const groups = useMemo(() => groupByDay(history), [history]);

  const [editingAt, setEditingAt] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const startEdit = (item: HistoryItem) => {
    setEditingAt(item.completedAt);
    setNoteDraft(item.note ?? '');
  };

  const commitEdit = () => {
    if (editingAt !== null) updateHistoryNote(editingAt, noteDraft);
    setEditingAt(null);
    setNoteDraft('');
  };

  if (groups.length === 0) {
    return <div className="empty-state history-empty">No completed timers yet — finished timers show up here.</div>;
  }

  return (
    <div className="history-section">
      {groups.map((group) => (
        <div className="history-day" key={group.day}>
          <div className="history-day-header">
            <span className="history-day-label">{dayLabel(group.day)}</span>
            <span className="history-day-total">
              {group.focusCount} focus · {formatMinutes(group.focusSeconds)}
            </span>
          </div>

          <div className="history-list">
            {group.items.map((item) => {
              const focus = isFocusItem(item);
              const editing = editingAt === item.completedAt;
              return (
                <div key={item.completedAt} className={`history-item${focus ? '' : ' history-item--break'}`}>
                  <div className="history-main">
                    <div className="history-name">{item.name}</div>
                    <div className="history-date">
                      {new Date(item.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {!focus && ' · break'}
                    </div>
                    {editing ? (
                      <input
                        className="history-note-input"
                        value={noteDraft}
                        maxLength={140}
                        placeholder="What did you work on?"
                        autoFocus
                        onChange={(e) => setNoteDraft(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit();
                          if (e.key === 'Escape') { setEditingAt(null); setNoteDraft(''); }
                        }}
                      />
                    ) : item.note ? (
                      <div className="history-note" onClick={() => startEdit(item)} title="Click to edit note">
                        {item.note}
                      </div>
                    ) : null}
                  </div>

                  <div className="history-side">
                    <div className="history-time">{formatDuration(item.duration)}</div>
                    <div className="history-actions">
                      {!editing && (
                        <button
                          className="history-action-btn"
                          onClick={() => startEdit(item)}
                          title={item.note ? 'Edit note' : 'Add a note'}
                        >
                          ✎
                        </button>
                      )}
                      <button
                        className="history-action-btn"
                        onClick={() => onRevive(item.name, item.duration, item.kind ?? (focus ? 'focus' : 'break'))}
                        title={`Start '${item.name}' again`}
                      >
                        ↻
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
