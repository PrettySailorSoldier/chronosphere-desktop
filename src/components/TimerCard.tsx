import React, { useState } from 'react';
import { SOUND_MAP, SOUND_LABELS } from '../utils/constants';
import { useTimerStore } from '../store/timerStore';

interface Props {
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  name: string;
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

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function soundLabel(soundType: string | undefined): string {
  if (!soundType) return SOUND_LABELS.chime ?? 'Gentle Chime';
  if (soundType.startsWith('custom_')) return '🎵 Custom';
  return SOUND_LABELS[soundType] ?? soundType;
}

export const TimerCard: React.FC<Props> = ({
  id, name, totalSeconds, remainingSeconds, isRunning, soundType = 'chime', onPause, onDelete,
}) => {
  const { updateTimerSound, customSounds, extendTimer, showToast } = useTimerStore();
  const [showSoundPicker, setShowSoundPicker] = useState(false);

  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const handleSoundChange = (newSound: string) => {
    updateTimerSound(id, newSound);
    setShowSoundPicker(false);
  };

  return (
    <div className="timer-card">
      <div className="timer-header">
        <span className="timer-name">{name}</span>
        <span className="timer-end-time">
          {isRunning ? '▶ Running' : '⏸ Paused'}
        </span>
      </div>

      <div className="timer-progress-wrapper">
        <svg className="progress-ring" width="128" height="128" viewBox="0 0 128 128">
          <defs>
            <linearGradient id={`grad-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="#00f0ff" />
              <stop offset="50%"  stopColor="#b69bff" />
              <stop offset="100%" stopColor="#ff10f0" />
            </linearGradient>
          </defs>
          <circle className="progress-ring-bg" cx="64" cy="64" r={RADIUS} />
          <circle
            className="progress-ring-fill"
            cx="64" cy="64" r={RADIUS}
            stroke={`url(#grad-${id})`}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.9s linear' }}
          />
        </svg>
        <div className="timer-display-overlay">{formatTime(remainingSeconds)}</div>
      </div>

      {/* ── Sound row ── */}
      <div className="timer-sound-row">
        <span className="timer-sound-label">🔔 {soundLabel(soundType)}</span>
        <button
          className="timer-sound-change-btn"
          onClick={() => setShowSoundPicker((v) => !v)}
          title="Change tone for this timer"
        >
          {showSoundPicker ? 'Cancel' : 'Change'}
        </button>
      </div>

      {showSoundPicker && (
        <div className="timer-sound-picker">
          {Object.keys(SOUND_MAP).map((k) => (
            <button
              key={k}
              className={`timer-sound-option${soundType === k ? ' active' : ''}`}
              onClick={() => handleSoundChange(k)}
            >
              {SOUND_LABELS[k] ?? k}
            </button>
          ))}
          {customSounds.map((cs) => (
            <button
              key={cs.id}
              className={`timer-sound-option${soundType === `custom_${cs.id}` ? ' active' : ''}`}
              onClick={() => handleSoundChange(`custom_${cs.id}`)}
            >
              🎵 {cs.name}
            </button>
          ))}
        </div>
      )}

      <div className="timer-actions">
        <button onClick={onPause}>{isRunning ? '⏸ Pause' : '▶ Resume'}</button>
        <button
          className="extend-btn"
          title="Add 1 minute"
          onClick={() => { extendTimer(60); showToast('+1 min'); }}
        >
          +1m
        </button>
        <button
          className="extend-btn"
          title="Add 5 minutes"
          onClick={() => { extendTimer(300); showToast('+5 min'); }}
        >
          +5m
        </button>
        <button className="delete-btn" onClick={onDelete}>🗑</button>
      </div>
    </div>
  );
};
