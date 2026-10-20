import React, { useMemo } from 'react';
import { useTimerStore, isFocusItem, currentStreak } from '../store/timerStore';

export const StatsRibbon: React.FC = () => {
  // Narrow selectors: this sits in the header, and reading the whole store made
  // it re-filter history on every engine tick.
  const history = useTimerStore((s) => s.history);
  const stats   = useTimerStore((s) => s.stats);

  // Breaks are rest, not output — counting them made "Focus" include every
  // coffee break and "Done" count each break phase of a sequence.
  // Read outside the memo so the counts roll over at midnight (the header clock
  // re-renders this every 30s) rather than waiting for the next completion.
  const today = new Date().toDateString();
  const { todayCount, todayMinutes } = useMemo(() => {
    const focusToday = history.filter(
      (item) => isFocusItem(item) && new Date(item.completedAt).toDateString() === today,
    );
    return {
      todayCount: focusToday.length,
      todayMinutes: Math.round(focusToday.reduce((sum, item) => sum + item.duration, 0) / 60),
    };
  }, [history, today]);

  return (
    <div className="stats-ribbon">
      <div className="stat-item" title="Focus sessions completed today">
        <span className="stat-value">{todayCount}</span>
        <span className="stat-label">Done</span>
      </div>
      <div className="stat-divider" />
      <div className="stat-item" title="Minutes of focus completed today (breaks not counted)">
        <span className="stat-value">{todayMinutes}m</span>
        <span className="stat-label">Focus</span>
      </div>
      <div className="stat-divider" />
      <div className="stat-item" title="Days in a row with at least one completed timer">
        <span className="stat-value">{currentStreak(stats)}</span>
        <span className="stat-label">Streak</span>
      </div>
    </div>
  );
};
