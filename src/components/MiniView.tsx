import React from 'react';
import { RustTimerState } from '../store/timerStore';

interface Props {
  timer: RustTimerState | null;
  timerCount: number;
  formatClock: (seconds: number) => string;
  onPauseResume: (id: string) => void;
  onExit: () => void;
  /** Slot key of `timer` in the store — what pause/resume act on. */
  timerSlot: string | null;
}

/** Compact always-on-top view: just the countdown that matters most. */
export const MiniView: React.FC<Props> = ({
  timer, timerCount, formatClock, onPauseResume, onExit, timerSlot,
}) => {
  const progress = timer && timer.total_seconds > 0
    ? 1 - timer.remaining_seconds / timer.total_seconds
    : 0;

  return (
    <div className="mini-view">
      {timer && timerSlot ? (
        <>
          <div className="mini-main">
            <span className="mini-name" title={timer.name}>
              {timer.name}
              {timerCount > 1 && <span className="mini-more"> +{timerCount - 1}</span>}
            </span>
            <span className={`mini-time${timer.phase === 'Paused' ? ' mini-time--paused' : ''}`}>
              {formatClock(timer.remaining_seconds)}
            </span>
          </div>
          <div className="mini-progress"><div style={{ width: `${progress * 100}%` }} /></div>
          <div className="mini-actions">
            <button
              onClick={() => onPauseResume(timerSlot)}
              disabled={timer.phase === 'Complete'}
              title="Pause or resume (Space)"
            >
              {timer.phase === 'Running' ? '⏸' : '▶'}
            </button>
            <button onClick={onExit} title="Back to the full window">⤢</button>
          </div>
        </>
      ) : (
        <div className="mini-idle">
          <span>Nothing running</span>
          <button onClick={onExit} title="Back to the full window">⤢</button>
        </div>
      )}
    </div>
  );
};
