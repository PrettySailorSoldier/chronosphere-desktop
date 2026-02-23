import React, { useState, useEffect } from 'react';
import { useTimerStore } from '../store/timerStore';
import { getCurrentBlock } from '../utils/timeBlocks';

interface Props {
  onStart: (minutes: number, name: string) => void;
}

const PRESETS = [
  { key: 'deepWork',   emoji: '🎯', label: 'Deep Work', nameKey: 'Deep Work' },
  { key: 'writing',    emoji: '✍️', label: 'Writing',   nameKey: 'Writing' },
  { key: 'planning',   emoji: '📋', label: 'Planning',  nameKey: 'Planning' },
  { key: 'pomodoro',   emoji: '🍅', label: 'Pomodoro',  nameKey: 'Pomodoro' },
  { key: 'shortBreak', emoji: '☕', label: 'Short',     nameKey: 'Short Break' },
  { key: 'longBreak',  emoji: '🌙', label: 'Long',      nameKey: 'Long Break' },
  { key: 'deep',       emoji: '🦾', label: 'Deep',      nameKey: 'Deep' },
] as const;

// Map suggested timer keys to our preset keys
const SUGGESTION_MAP: Record<string, string[]> = {
  'deep': ['deepWork', 'deep'],
  'pomodoro': ['pomodoro'],
  'short': ['shortBreak'],
  'long': ['longBreak'],
  'writing': ['writing'],
  'planning': ['planning'],
};

export const PresetButtons: React.FC<Props> = ({ onStart }) => {
  const { settings } = useTimerStore();
  const [suggestedKeys, setSuggestedKeys] = useState<string[]>([]);

  useEffect(() => {
    const updateSuggestions = () => {
      const block = getCurrentBlock(new Date().getHours());
      const keys: string[] = [];
      block.suggestedTimers.forEach(s => {
        if (SUGGESTION_MAP[s]) {
          keys.push(...SUGGESTION_MAP[s]);
        }
      });
      setSuggestedKeys(keys);
    };

    updateSuggestions();
    const interval = setInterval(updateSuggestions, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="presets-section">
      <div className="presets-grid">
        {PRESETS.map((p) => {
          const mins = settings.presets[p.key as keyof typeof settings.presets];
          const isSuggested = suggestedKeys.includes(p.key);
          return (
            <button
              key={p.key}
              className={`preset-btn${isSuggested ? ' suggested' : ''}`}
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
