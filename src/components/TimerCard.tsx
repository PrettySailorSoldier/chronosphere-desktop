import React from 'react';

interface Props {
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  name: string;
  endTime: number;
  soundType: string;
  id: string;
  onPause: () => void;
  onDelete: () => void;
}

function formatTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatEndTime(ts: number) {
  const d = new Date(ts);
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const TimerCard: React.FC<Props> = ({
  id, name, totalSeconds, remainingSeconds, isRunning, endTime, onPause, onDelete,
}) => {
  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <div className="timer-card">
      <div className="timer-header">
        <span className="timer-name">{name}</span>
        <span className="timer-end-time">
          {isRunning ? `⏰ ${formatEndTime(endTime)}` : 'Paused'}
        </span>
      </div>

      <div className="timer-progress-wrapper">
        <svg className="progress-ring" width="108" height="108" viewBox="0 0 108 108">
          <defs>
            <linearGradient id={`grad-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="#00f0ff" />
              <stop offset="50%"  stopColor="#b69bff" />
              <stop offset="100%" stopColor="#ff10f0" />
            </linearGradient>
          </defs>
          <circle className="progress-ring-bg" cx="54" cy="54" r={RADIUS} />
          <circle
            className="progress-ring-fill"
            cx="54" cy="54" r={RADIUS}
            stroke={`url(#grad-${id})`}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.9s linear' }}
          />
        </svg>
        <div className="timer-display-overlay">{formatTime(remainingSeconds)}</div>
      </div>

      <div className="timer-actions">
        <button onClick={onPause}>{isRunning ? '⏸ Pause' : '▶ Resume'}</button>
        <button className="delete-btn" onClick={onDelete}>🗑</button>
      </div>
    </div>
  );
};
