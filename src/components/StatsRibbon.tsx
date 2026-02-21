import React from 'react';
import { useTimerStore } from '../store/timerStore';

export const StatsRibbon: React.FC = () => {
  const { history, stats } = useTimerStore();

  const today = new Date().toDateString();
  const todayHistory = history.filter(
    (item) => new Date(item.completedAt).toDateString() === today
  );
  const todayCount = todayHistory.length;
  const todayMinutes = Math.round(
    todayHistory.reduce((sum, item) => sum + item.duration, 0) / 60
  );

  return (
    <div className="stats-ribbon">
      <div className="stat-item">
        <span className="stat-value">{todayCount}</span>
        <span className="stat-label">Done</span>
      </div>
      <div className="stat-divider" />
      <div className="stat-item">
        <span className="stat-value">{todayMinutes}m</span>
        <span className="stat-label">Focus</span>
      </div>
      <div className="stat-divider" />
      <div className="stat-item">
        <span className="stat-value">{stats.streak}</span>
        <span className="stat-label">Streak</span>
      </div>
    </div>
  );
};
