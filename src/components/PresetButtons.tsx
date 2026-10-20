import React, { useState, useEffect } from 'react';
import { useTimerStore, PresetKey, TimerKind, presetKind } from '../store/timerStore';
import { suggestedPresets } from '../utils/circadian';
import { SOUND_MAP, SOUND_LABELS } from '../utils/constants';

interface Props {
  onStart: (minutes: number, name: string, soundType: string, kind: TimerKind) => void;
}

// Six fills the 3-column grid exactly. A seventh "🦾 Deep" preset used to sit
// next to "🎯 Deep Work" — two near-identical names for the same idea.
export const PRESETS: ReadonlyArray<{ key: PresetKey; emoji: string; label: string; name: string }> = [
  { key: 'deepWork',   emoji: '🎯', label: 'Deep Work', name: 'Deep Work' },
  { key: 'writing',    emoji: '✍️', label: 'Writing',   name: 'Writing' },
  { key: 'planning',   emoji: '📋', label: 'Planning',  name: 'Planning' },
  { key: 'pomodoro',   emoji: '🍅', label: 'Pomodoro',  name: 'Pomodoro' },
  { key: 'shortBreak', emoji: '☕', label: 'Short',     name: 'Short Break' },
  { key: 'longBreak',  emoji: '🌙', label: 'Long',      name: 'Long Break' },
];

export const PresetButtons: React.FC<Props> = ({ onStart }) => {
  // Narrow selectors — reading the whole store re-rendered this on every engine tick.
  const presets      = useTimerStore((s) => s.settings.presets);
  const defaultSound = useTimerStore((s) => s.settings.defaultSound);
  const customSounds = useTimerStore((s) => s.customSounds);
  const [suggestedKeys, setSuggestedKeys] = useState<PresetKey[]>(() => suggestedPresets(new Date().getHours()));
  const [selectedSound, setSelectedSound] = useState(defaultSound);

  useEffect(() => {
    const update = () => setSuggestedKeys(suggestedPresets(new Date().getHours()));
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setSelectedSound(defaultSound);
  }, [defaultSound]);

  return (
    <div className="presets-section">
      <div className="presets-header">
        <label className="presets-sound-label">
          🔊 Tone:
          <select
            value={selectedSound}
            onChange={(e) => setSelectedSound(e.target.value)}
            className="preset-sound-select"
          >
            {Object.keys(SOUND_MAP).map(k => (
              <option key={k} value={k}>{SOUND_LABELS[k] || k}</option>
            ))}
            {customSounds.map(cs => (
              <option key={cs.id} value={`custom_${cs.id}`}>🎵 {cs.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="presets-grid">
        {PRESETS.map((p) => {
          const mins = presets[p.key];
          const isSuggested = suggestedKeys.includes(p.key);
          return (
            <button
              key={p.key}
              className={`preset-btn${isSuggested ? ' suggested' : ''}`}
              onClick={() => onStart(mins, p.name, selectedSound, presetKind(p.key))}
              title={isSuggested ? 'Suggested for this time of day' : undefined}
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
