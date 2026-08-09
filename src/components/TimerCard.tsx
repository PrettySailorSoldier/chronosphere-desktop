import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SOUND_MAP, SOUND_LABELS } from '../utils/constants';
import { useTimerStore, TimerPhase } from '../store/timerStore';

interface Props {
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  name: string;
  soundType: string;
  id: string;
  phase: TimerPhase;
  /** Part of a running sequence — skipping advances rather than ending everything. */
  isSequenceStep?: boolean;
  onPause: () => void;
  onSkip: () => void;
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

const PHASE_LABELS: Record<TimerPhase, string> = {
  Idle:     '· Idle',
  Running:  '▶ Running',
  Paused:   '⏸ Paused',
  Complete: '✓ Complete',
};

export const TimerCard: React.FC<Props> = ({
  id, name, totalSeconds, remainingSeconds, isRunning, soundType = 'chime',
  phase, isSequenceStep = false, onPause, onSkip, onDelete,
}) => {
  const customSounds = useTimerStore((s) => s.customSounds);
  const { updateTimerSound, extendTimer, showToast } = useTimerStore(
    useShallow((s) => ({
      updateTimerSound: s.updateTimerSound,
      extendTimer: s.extendTimer,
      showToast: s.showToast,
    })),
  );
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const isDone = phase === 'Complete';

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
        {/* Reported the phase as a running/paused binary, so a finished timer
            sat there claiming to be paused. */}
        <span className="timer-end-time">{PHASE_LABELS[phase]}</span>
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
            // Only ease between ticks while actually counting; animating a pause,
            // a +5m or a step change makes the ring visibly lag the digits.
            style={{ transition: isRunning ? 'stroke-dashoffset 0.9s linear' : 'none' }}
          />
        </svg>
        <div className="timer-display-overlay" aria-live="off">{formatTime(remainingSeconds)}</div>
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
        <button onClick={onPause} disabled={isDone} title="Pause or resume (Space)">
          {isRunning ? '⏸ Pause' : '▶ Resume'}
        </button>
        <button
          className="extend-btn"
          disabled={isDone}
          title="Subtract 5 minutes"
          onClick={() => { void extendTimer(-300); showToast('−5 min'); }}
        >
          −5m
        </button>
        <button
          className="extend-btn"
          disabled={isDone}
          title="Add 5 minutes"
          onClick={() => { void extendTimer(300); showToast('+5 min'); }}
        >
          +5m
        </button>
        {/* The engine has always supported skip; nothing in the UI ever called it. */}
        <button
          className="extend-btn"
          disabled={isDone}
          title={isSequenceStep ? 'Skip to next step (S)' : 'End this timer now (S)'}
          onClick={onSkip}
        >
          ⏭ Skip
        </button>
        <button
          className="delete-btn"
          title={isDone ? 'Dismiss' : isSequenceStep ? 'Stop the whole sequence' : 'Stop timer'}
          onClick={onDelete}
        >
          {isDone ? '✓' : '🗑'}
        </button>
      </div>
    </div>
  );
};
