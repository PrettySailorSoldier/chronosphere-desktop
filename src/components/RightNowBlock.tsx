import React, { useState, useEffect } from 'react';
import { getCircadianHour, type CircadianHour } from '../utils/circadian';
import { useTimerStore } from '../store/timerStore';

// ─── Component ────────────────────────────────────────────────────────────────

export const RightNowBlock: React.FC = () => {
  const [hour, setHour] = useState<CircadianHour>(() => getCircadianHour(new Date().getHours()));

  const startTimer   = useTimerStore((s) => s.startTimer);
  const activeTimer  = useTimerStore((s) => s.activeTimer);
  const defaultSound = useTimerStore((s) => s.settings.defaultSound);
  const showToast    = useTimerStore((s) => s.showToast);

  useEffect(() => {
    const update = () => setHour(getCircadianHour(new Date().getHours()));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  const handleStartSuggested = async () => {
    await startTimer({
      name: hour.phase,
      totalSeconds: hour.timerHint * 60,
      soundType: defaultSound,
      notificationMsg: `${hour.phase} block complete! ✨`,
    });
    showToast(`Started ${hour.timerHint}m · ${hour.phase}`);
  };

  return (
    <section className="right-now-block">
      <div className="rnb-header">
        <span className="rnb-icon">{hour.icon}</span>
        <div className="rnb-titles">
          <span className="rnb-phase">{hour.phase}</span>
          <span className="rnb-quality-dot" data-quality={hour.quality} />
        </div>
      </div>
      <p className="rnb-suggestion">{hour.suggestion}</p>
      <div className="rnb-hint">
        suggested: <strong>{hour.timerHint}m</strong>
      </div>
      <button
        className="rnb-start-btn"
        onClick={handleStartSuggested}
        disabled={!!activeTimer}
        title={activeTimer ? 'A timer is already running' : `Start a ${hour.timerHint}-minute ${hour.phase} block`}
      >
        ▶ Start {hour.timerHint}m
      </button>
    </section>
  );
};
