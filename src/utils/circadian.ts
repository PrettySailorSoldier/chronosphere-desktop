// ─── Circadian single source of truth ────────────────────────────────────────
// Merges the old CIRCADIAN_PATTERNS (App.tsx header badge) and SLOTS
// (RightNowBlock.tsx suggestion card) into one canonical per-hour table.
//
// Field origins:
//   icon, phase, quality, suggestion, timerHint  ← SLOTS (most complete)
//   shortMsg                                      ← CIRCADIAN_PATTERNS[hour].msg

export type CircadianQuality = 'high' | 'medium' | 'low' | 'rest';

export interface CircadianHour {
  icon: string;         // emoji for this hour
  phase: string;        // short phase name e.g. "Peak Focus"
  shortMsg: string;     // <= ~18 chars, for the header badge (was CIRCADIAN_PATTERNS.msg)
  quality: CircadianQuality;
  suggestion: string;   // full sentence (was SLOTS.suggestion)
  timerHint: number;    // suggested minutes (was SLOTS.timerHint)
}

// 24 entries, keys 0..23
export const CIRCADIAN_HOURS: Record<number, CircadianHour> = {
  0:  { icon: '🌙', phase: 'Late Night',      shortMsg: 'Late night',          quality: 'rest',   suggestion: "If you're up, keep it light — reading or journaling only.",        timerHint: 15 },
  1:  { icon: '🌙', phase: 'Late Night',      shortMsg: 'Rest recommended',    quality: 'rest',   suggestion: 'Your brain needs sleep more than tasks right now.',                   timerHint: 15 },
  2:  { icon: '😴', phase: 'Deep Rest',       shortMsg: 'Deep rest',           quality: 'rest',   suggestion: 'Deep rest window. Even a short sleep is worth more than work.',      timerHint: 15 },
  3:  { icon: '😴', phase: 'Deep Rest',       shortMsg: 'Deep rest',           quality: 'rest',   suggestion: 'Biological repair is happening. Rest if you can.',                   timerHint: 15 },
  4:  { icon: '😴', phase: 'Early Quiet',     shortMsg: 'Early quiet',         quality: 'rest',   suggestion: 'Cortisol is just starting to rise. Light tasks only.',               timerHint: 20 },
  5:  { icon: '🌅', phase: 'Waking Up',       shortMsg: 'Waking up',           quality: 'low',    suggestion: 'Ease in — hydrate, move, and avoid heavy decisions.',                timerHint: 20 },
  6:  { icon: '🌅', phase: 'Morning Routine', shortMsg: 'Morning routine',     quality: 'low',    suggestion: 'Good for admin, email, or getting organised.',                       timerHint: 25 },
  7:  { icon: '⚡', phase: 'Morning Surge',   shortMsg: 'Morning surge',       quality: 'medium', suggestion: 'Alertness is climbing. Good for planning and lighter creative work.', timerHint: 25 },
  8:  { icon: '⚡', phase: 'Morning Surge',   shortMsg: 'Morning surge',       quality: 'high',   suggestion: 'Great time to start something that needs momentum.',                  timerHint: 25 },
  9:  { icon: '🎯', phase: 'Peak Focus',      shortMsg: 'Peak focus',          quality: 'high',   suggestion: 'Your sharpest window. Tackle the hardest thing on your list.',       timerHint: 52 },
  10: { icon: '🎯', phase: 'Peak Focus',      shortMsg: 'Peak focus',          quality: 'high',   suggestion: 'Still peak. Protect this time — close distractions.',                timerHint: 52 },
  11: { icon: '🎯', phase: 'Peak Focus',      shortMsg: 'Peak focus',          quality: 'high',   suggestion: 'Last of the morning peak. Use it for decisions or deep work.',       timerHint: 52 },
  12: { icon: '🍽️', phase: 'Midday',         shortMsg: 'Lunch',               quality: 'low',    suggestion: 'Eat something real. Avoid major decisions right after lunch.',        timerHint: 20 },
  13: { icon: '😴', phase: 'Post-Lunch Dip',  shortMsg: 'Post-lunch dip',      quality: 'low',    suggestion: 'Energy dip is normal. A short walk helps more than caffeine.',       timerHint: 15 },
  14: { icon: '😴', phase: 'Post-Lunch Dip',  shortMsg: 'Post-lunch dip',      quality: 'low',    suggestion: 'If you must work, pick something routine or mechanical.',             timerHint: 20 },
  15: { icon: '📈', phase: 'Afternoon Rise',  shortMsg: 'Afternoon recovery',  quality: 'medium', suggestion: 'Recovery underway. Good for collaborative or communicative tasks.',  timerHint: 25 },
  16: { icon: '⚡', phase: 'Second Wind',     shortMsg: 'Second wind',         quality: 'high',   suggestion: 'Second cognitive peak — great for creative or analytical work.',     timerHint: 52 },
  17: { icon: '⚡', phase: 'Second Wind',     shortMsg: 'Second wind',         quality: 'high',   suggestion: 'Still strong. Good time to finish anything that needs real thought.', timerHint: 52 },
  18: { icon: '🌆', phase: 'Evening Work',    shortMsg: 'Evening work',        quality: 'medium', suggestion: 'Energy declining. Wrap up, review, or do lighter creative work.',    timerHint: 25 },
  19: { icon: '🌆', phase: 'Evening Work',    shortMsg: 'Evening work',        quality: 'medium', suggestion: 'Good for writing, reading, or anything you find absorbing.',         timerHint: 25 },
  20: { icon: '🌙', phase: 'Evening Focus',   shortMsg: 'Evening focus',       quality: 'low',    suggestion: 'Blue light and screens will delay your sleep. Wrap up soon.',        timerHint: 20 },
  21: { icon: '🌙', phase: 'Winding Down',    shortMsg: 'Winding down',        quality: 'low',    suggestion: 'Start your wind-down ritual. Stop new tasks.',                       timerHint: 15 },
  22: { icon: '✨', phase: 'Pre-Sleep',       shortMsg: 'Prepare for sleep',   quality: 'rest',   suggestion: 'Dim screens, calm inputs. Prepare your space for tomorrow.',          timerHint: 15 },
  23: { icon: '✨', phase: 'Pre-Sleep',       shortMsg: 'Prepare for sleep',   quality: 'rest',   suggestion: 'Sleep will do more for you than any timer right now.',                timerHint: 15 },
};

export function getCircadianHour(hour: number): CircadianHour {
  return CIRCADIAN_HOURS[hour] ?? CIRCADIAN_HOURS[9];
}
