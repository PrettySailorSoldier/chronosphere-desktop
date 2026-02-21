import React from 'react';
import { useTimerStore } from '../store/timerStore';

const CIRCADIAN_PATTERNS: Record<number, { energy: string; duration: number; icon: string; msg: string }> = {
  0:  { energy: 'low',    duration: 1500, icon: '🌙', msg: 'Late night winding down' },
  1:  { energy: 'low',    duration: 1500, icon: '🌙', msg: 'Rest recommended' },
  2:  { energy: 'low',    duration: 1500, icon: '😴', msg: 'Deep rest time' },
  3:  { energy: 'low',    duration: 1500, icon: '😴', msg: 'Deep rest time' },
  4:  { energy: 'low',    duration: 1500, icon: '😴', msg: 'Early morning quiet' },
  5:  { energy: 'medium', duration: 1800, icon: '🌅', msg: 'Waking up' },
  6:  { energy: 'medium', duration: 2400, icon: '🌅', msg: 'Morning routine' },
  7:  { energy: 'high',   duration: 3120, icon: '⚡', msg: 'Morning surge' },
  8:  { energy: 'high',   duration: 3120, icon: '⚡', msg: 'Morning surge' },
  9:  { energy: 'high',   duration: 3120, icon: '🎯', msg: 'Peak focus window' },
  10: { energy: 'high',   duration: 3120, icon: '🎯', msg: 'Peak focus window' },
  11: { energy: 'high',   duration: 3120, icon: '🎯', msg: 'Peak focus window' },
  12: { energy: 'medium', duration: 2400, icon: '🍽️', msg: 'Lunch transition' },
  13: { energy: 'low',    duration: 1500, icon: '😴', msg: 'Post-lunch dip' },
  14: { energy: 'low',    duration: 1500, icon: '😴', msg: 'Post-lunch dip' },
  15: { energy: 'medium', duration: 2400, icon: '📈', msg: 'Afternoon recovery' },
  16: { energy: 'high',   duration: 2700, icon: '⚡', msg: 'Second wind' },
  17: { energy: 'high',   duration: 2700, icon: '⚡', msg: 'Second wind' },
  18: { energy: 'medium', duration: 1800, icon: '🌆', msg: 'Evening work' },
  19: { energy: 'medium', duration: 1800, icon: '🌆', msg: 'Evening work' },
  20: { energy: 'medium', duration: 2700, icon: '🌙', msg: 'Evening focus' },
  21: { energy: 'medium', duration: 1800, icon: '🌙', msg: 'Winding down' },
  22: { energy: 'low',    duration: 1500, icon: '✨', msg: 'Prepare for sleep' },
  23: { energy: 'low',    duration: 1500, icon: '✨', msg: 'Prepare for sleep' },
};

const ENERGY_MULTIPLIERS: Record<string, number> = { high: 1.2, medium: 1.0, low: 0.7 };

function getRecommendation(hour: number, mins: number): string {
  if (hour >= 5 && hour <= 7)  return `🌅 Morning routine time. Start with ${mins}min planning or light tasks before peak focus`;
  if (hour >= 8 && hour <= 11) return `🧠 Peak cognitive time! Tackle complex problems in ${mins}min blocks`;
  if (hour === 12)              return `🍽️ Take a proper break. Light ${mins}min tasks only`;
  if (hour >= 13 && hour <= 14) return `😴 Natural energy dip. Try ${mins}min admin tasks or a power nap`;
  if (hour === 15)              return `📈 Energy returning. Good for ${mins}min collaborative work`;
  if (hour >= 16 && hour <= 17) return `⚡ Second wind! Great for ${mins}min creative tasks`;
  if (hour >= 18 && hour <= 19) return `🌆 Evening focus. ${mins}min sessions for wrapping up`;
  if (hour >= 20 && hour <= 21) return `🌙 Winding down. Light ${mins}min tasks`;
  if (hour >= 22 && hour <= 23) return `✨ Rest time approaching. Only essential ${mins}min tasks`;
  return `🦉 Late night. Keep to quick ${mins}min sprints`;
}

function getSuggestedTasks(hour: number, base: number) {
  if (hour >= 5 && hour <= 11) return [{ icon: '🧠', name: 'Deep Work', m: base }, { icon: '✍️', name: 'Writing', m: Math.round(base*0.8) }, { icon: '📋', name: 'Planning', m: Math.round(base*0.5) }];
  if (hour === 12)              return [{ icon: '📧', name: 'Emails', m: 15 }, { icon: '🚶', name: 'Walk Break', m: 10 }, { icon: '📖', name: 'Reading', m: 20 }];
  if (hour >= 13 && hour <= 14) return [{ icon: '😴', name: 'Power Nap', m: 20 }, { icon: '📧', name: 'Admin', m: base }, { icon: '🎧', name: 'Light Work', m: Math.round(base*0.7) }];
  if (hour >= 15 && hour <= 17) return [{ icon: '💡', name: 'Creative', m: base }, { icon: '🤝', name: 'Collaborate', m: 30 }, { icon: '🎯', name: 'Finish Tasks', m: Math.round(base*0.6) }];
  if (hour >= 18 && hour <= 21) return [{ icon: '📝', name: 'Review Day', m: 15 }, { icon: '📚', name: 'Learning', m: base }, { icon: '🧘', name: 'Mindfulness', m: 10 }];
  return [{ icon: '📖', name: 'Light Read', m: 15 }, { icon: '🧘', name: 'Relax', m: 10 }, { icon: '✨', name: 'Quick Task', m: Math.round(base*0.5) }];
}

interface Props {
  onStartTask: (minutes: number, name: string) => void;
}

export const CircadianSection: React.FC<Props> = ({ onStartTask }) => {
  const { userEnergy, setUserEnergy } = useTimerStore();

  const hour = new Date().getHours();
  const pattern = CIRCADIAN_PATTERNS[hour];
  const multiplier = ENERGY_MULTIPLIERS[userEnergy] ?? 1;
  const recMins = Math.round((pattern.duration / 60) * multiplier);
  const suggestion = getRecommendation(hour, recMins);
  const tasks = getSuggestedTasks(hour, recMins);

  const sliderMap: Record<string, number> = { low: 1, medium: 2, high: 3 };
  const reverseMap: Record<number, 'low' | 'medium' | 'high'> = { 1: 'low', 2: 'medium', 3: 'high' };

  return (
    <div className="circadian-section">
      <div className="section-header">☀️ Circadian Rhythm</div>

      <div className="energy-slider-wrapper">
        <div className="slider-icons"><span>🌙</span><span>☀️</span></div>
        <input
          type="range" className="energy-slider"
          min={1} max={3} value={sliderMap[userEnergy]}
          onChange={(e) => setUserEnergy(reverseMap[parseInt(e.target.value)])}
        />
      </div>

      <div className="circadian-presets">
        {(['low', 'medium', 'high'] as const).map((lvl) => (
          <button
            key={lvl}
            className={`preset-pill${userEnergy === lvl ? ' active' : ''}`}
            onClick={() => setUserEnergy(lvl)}
          >
            {lvl === 'low' ? 'Energize' : lvl === 'medium' ? 'Balanced' : 'Relax'}
          </button>
        ))}
      </div>

      <div className="circadian-recommendation">
        <span className="rec-icon">💡</span>
        <span className="rec-text">{suggestion}</span>
      </div>

      <div className="suggested-tasks">
        {tasks.map((t, i) => (
          <button key={i} className="suggested-task" onClick={() => onStartTask(t.m, t.name)}>
            <span className="task-icon">{t.icon}</span>
            <span className="task-name">{t.name}</span>
            <span className="task-time">{t.m}m</span>
          </button>
        ))}
      </div>
    </div>
  );
};
