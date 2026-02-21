import React, { useState } from 'react';
import { useTimerStore, HistoryItem } from '../store/timerStore';

interface Props {
  onRevive: (name: string, totalSeconds: number) => void;
}

function getTimeAgo(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  const h = Math.round(diff / 3600000);
  const d = Math.round(diff / 86400000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const leftover = m % 60;
    return `${h}h ${leftover}m`;
  }
  return `${m}m ${rem}s`;
}

export const HistoryList: React.FC<Props> = ({ onRevive }) => {
  const { history } = useTimerStore();
  const [visible, setVisible] = useState(false);
  const recent = [...history].reverse().slice(0, 10);

  return (
    <div className="history-section">
      <div className="history-header">
        <span>📜 History</span>
        <button className="history-toggle-btn" onClick={() => setVisible(!visible)}>
          {visible ? 'Hide ▲' : 'Show ▼'}
        </button>
      </div>

      {visible && (
        <div className="history-list">
          {recent.length === 0 ? (
            <div className="empty-state" style={{ padding: '10px' }}>No completed timers yet</div>
          ) : (
            recent.map((item: HistoryItem, idx) => (
              <div
                key={idx}
                className="history-item"
                title={`Click to restart '${item.name}'`}
                onClick={() => onRevive(item.name, item.duration)}
              >
                <div>
                  <div className="history-name">{item.name}</div>
                  <div className="history-date">{getTimeAgo(item.completedAt)}</div>
                </div>
                <div className="history-time">{formatDuration(item.duration)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
