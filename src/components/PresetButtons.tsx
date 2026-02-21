import React from 'react';
import { useTimerStore } from '../store/timerStore';

interface Props {
  onStart: (minutes: number, name: string) => void;
}

const PRESETS = [
  { key: 'pomodoro',   emoji: '🍅', label: 'Pomodoro',    nameKey: 'Pomodoro'     },
  { key: 'shortBreak', emoji: '☕', label: 'Short',        nameKey: 'Short Break'  },
  { key: 'longBreak',  emoji: '🌙', label: 'Long',         nameKey: 'Long Break'   },
  { key: 'deepWork',   emoji: '🎯', label: 'Deep',         nameKey: 'Deep Work'    },
] as const;

export const PresetButtons: React.FC<Props> = ({ onStart }) => {
  const { settings } = useTimerStore();

  return (
    <div className="presets-section">
      <div className="presets-grid">
        {PRESETS.map((p) => {
          const mins = settings.presets[p.key];
          return (
            <button
              key={p.key}
              className="preset-btn"
              onClick={() => onStart(mins, p.nameKey)}
            >
              {p.emoji} {p.label}
              <span className="preset-time">{mins}min</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
