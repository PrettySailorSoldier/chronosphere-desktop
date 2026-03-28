import React, { useState, useEffect } from 'react';

// ─── Circadian data ────────────────────────────────────────────────────────────

type CircadianSlot = {
  icon: string;
  phase: string;
  quality: 'high' | 'medium' | 'low' | 'rest';
  suggestion: string;
  timerHint: number;
};

const SLOTS: Record<number, CircadianSlot> = {
  0:  { icon: '🌙', phase: 'Late Night',      quality: 'rest',   suggestion: "If you're up, keep it light — reading or journaling only.",        timerHint: 15 },
  1:  { icon: '🌙', phase: 'Late Night',      quality: 'rest',   suggestion: 'Your brain needs sleep more than tasks right now.',                   timerHint: 15 },
  2:  { icon: '😴', phase: 'Deep Rest',       quality: 'rest',   suggestion: 'Deep rest window. Even a short sleep is worth more than work.',      timerHint: 15 },
  3:  { icon: '😴', phase: 'Deep Rest',       quality: 'rest',   suggestion: 'Biological repair is happening. Rest if you can.',                   timerHint: 15 },
  4:  { icon: '😴', phase: 'Early Quiet',     quality: 'rest',   suggestion: 'Cortisol is just starting to rise. Light tasks only.',               timerHint: 20 },
  5:  { icon: '🌅', phase: 'Waking Up',       quality: 'low',    suggestion: 'Ease in — hydrate, move, and avoid heavy decisions.',                timerHint: 20 },
  6:  { icon: '🌅', phase: 'Morning Routine', quality: 'low',    suggestion: 'Good for admin, email, or getting organised.',                       timerHint: 25 },
  7:  { icon: '⚡', phase: 'Morning Surge',   quality: 'medium', suggestion: 'Alertness is climbing. Good for planning and lighter creative work.', timerHint: 25 },
  8:  { icon: '⚡', phase: 'Morning Surge',   quality: 'high',   suggestion: 'Great time to start something that needs momentum.',                  timerHint: 25 },
  9:  { icon: '🎯', phase: 'Peak Focus',      quality: 'high',   suggestion: 'Your sharpest window. Tackle the hardest thing on your list.',       timerHint: 52 },
  10: { icon: '🎯', phase: 'Peak Focus',      quality: 'high',   suggestion: 'Still peak. Protect this time — close distractions.',                timerHint: 52 },
  11: { icon: '🎯', phase: 'Peak Focus',      quality: 'high',   suggestion: 'Last of the morning peak. Use it for decisions or deep work.',       timerHint: 52 },
  12: { icon: '🍽️', phase: 'Midday',         quality: 'low',    suggestion: 'Eat something real. Avoid major decisions right after lunch.',        timerHint: 20 },
  13: { icon: '😴', phase: 'Post-Lunch Dip',  quality: 'low',    suggestion: 'Energy dip is normal. A short walk helps more than caffeine.',       timerHint: 15 },
  14: { icon: '😴', phase: 'Post-Lunch Dip',  quality: 'low',    suggestion: 'If you must work, pick something routine or mechanical.',             timerHint: 20 },
  15: { icon: '📈', phase: 'Afternoon Rise',  quality: 'medium', suggestion: 'Recovery underway. Good for collaborative or communicative tasks.',  timerHint: 25 },
  16: { icon: '⚡', phase: 'Second Wind',     quality: 'high',   suggestion: 'Second cognitive peak — great for creative or analytical work.',     timerHint: 52 },
  17: { icon: '⚡', phase: 'Second Wind',     quality: 'high',   suggestion: 'Still strong. Good time to finish anything that needs real thought.', timerHint: 52 },
  18: { icon: '🌆', phase: 'Evening Work',    quality: 'medium', suggestion: 'Energy declining. Wrap up, review, or do lighter creative work.',    timerHint: 25 },
  19: { icon: '🌆', phase: 'Evening Work',    quality: 'medium', suggestion: 'Good for writing, reading, or anything you find absorbing.',         timerHint: 25 },
  20: { icon: '🌙', phase: 'Evening Focus',   quality: 'low',    suggestion: 'Blue light and screens will delay your sleep. Wrap up soon.',        timerHint: 20 },
  21: { icon: '🌙', phase: 'Winding Down',    quality: 'low',    suggestion: 'Start your wind-down ritual. Stop new tasks.',                       timerHint: 15 },
  22: { icon: '✨', phase: 'Pre-Sleep',       quality: 'rest',   suggestion: 'Dim screens, calm inputs. Prepare your space for tomorrow.',          timerHint: 15 },
  23: { icon: '✨', phase: 'Pre-Sleep',       quality: 'rest',   suggestion: 'Sleep will do more for you than any timer right now.',                timerHint: 15 },
};

// ─── Component ────────────────────────────────────────────────────────────────

export const RightNowBlock: React.FC = () => {
  const [slot, setSlot] = useState<CircadianSlot>(() => SLOTS[new Date().getHours()]);

  useEffect(() => {
    const update = () => setSlot(SLOTS[new Date().getHours()]);
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="right-now-block">
      <div className="rnb-header">
        <span className="rnb-icon">{slot.icon}</span>
        <div className="rnb-titles">
          <span className="rnb-phase">{slot.phase}</span>
          <span className="rnb-quality-dot" data-quality={slot.quality} />
        </div>
      </div>
      <p className="rnb-suggestion">{slot.suggestion}</p>
      <div className="rnb-hint">
        suggested: <strong>{slot.timerHint}m</strong>
      </div>
    </section>
  );
};
