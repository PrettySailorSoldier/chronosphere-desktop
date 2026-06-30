import React, { useState } from 'react';
import { useTimerStore, StopwatchSession } from '../store/timerStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  const h = Math.round(diff / 3600000);
  const d = Math.round(diff / 86400000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const leftover = m % 60;
    return `${h}h ${leftover}m`;
  }
  return `${m}m ${rem}s`;
}

// ─── Per-label aggregation ────────────────────────────────────────────────────

interface LabelStat {
  label: string;
  count: number;
  totalMs: number;
  avgMs: number;
}

function aggregateByLabel(sessions: StopwatchSession[]): LabelStat[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const s of sessions) {
    const entry = map.get(s.label) ?? { count: 0, total: 0 };
    map.set(s.label, { count: entry.count + 1, total: entry.total + s.durationMs });
  }
  return Array.from(map.entries())
    .map(([label, { count, total }]) => ({
      label,
      count,
      totalMs: total,
      avgMs: Math.round(total / count),
    }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

// ─── Component ────────────────────────────────────────────────────────────────

export const StopwatchStats: React.FC = () => {
  const sessions = useTimerStore((s) => s.stopwatchSessions);
  const [visible, setVisible] = useState(false);

  const labelStats = aggregateByLabel(sessions);
  const recentSessions = [...sessions].reverse().slice(0, 10);

  return (
    <div className="history-section">
      {/* Header — same pattern as HistoryList */}
      <div className="history-header">
        <span>⏱ Timed Sessions</span>
        <button
          id="sw-stats-toggle-btn"
          className="history-toggle-btn"
          onClick={() => setVisible(!visible)}
        >
          {visible ? 'Hide ▲' : 'Show ▼'}
        </button>
      </div>

      {visible && (
        <div className="history-list" style={{ maxHeight: 'none' }}>
          {sessions.length === 0 ? (
            <div className="empty-state" style={{ padding: '10px' }}>
              No timed sessions yet
            </div>
          ) : (
            <>
              {/* ── Per-label summary ── */}
              <div className="sw-stats">
                {labelStats.map((stat) => (
                  <div key={stat.label} className="sw-stats-row">
                    <span className="sw-stats-label">{stat.label}</span>
                    <span className="sw-stats-meta">
                      {stat.count}&times; &nbsp;·&nbsp; avg {formatDuration(stat.avgMs)} &nbsp;·&nbsp; total {formatDuration(stat.totalMs)}
                    </span>
                  </div>
                ))}
              </div>

              {/* ── Divider ── */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0' }} />

              {/* ── Recent individual sessions (mirrors HistoryList rows) ── */}
              {recentSessions.map((item: StopwatchSession) => (
                <div
                  key={item.id}
                  className="history-item"
                  style={{ cursor: 'default' }}
                >
                  <div>
                    <div className="history-name">{item.label}</div>
                    <div className="history-date">{getTimeAgo(item.endedAt)}</div>
                  </div>
                  <div className="history-time">{formatDuration(item.durationMs)}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};
