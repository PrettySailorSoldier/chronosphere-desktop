export type TimeBlock = {
  emoji: string;
  name: string;
  directive: string;
  suggestedTimers: Array<'deep' | 'pomodoro' | 'short' | 'long' | 'writing' | 'planning'>;
}

export const TIME_BLOCKS = [
  {
    hours: [5, 6, 7, 8],
    emoji: '🌅',
    name: 'Wake Ramp',
    directive: 'Ease in. No deep decisions yet. Good for hygiene, breakfast, light reading, or setting intentions for the day.',
    suggestedTimers: ['short', 'planning'],
  },
  {
    hours: [9, 10, 11],
    emoji: '⚡',
    name: 'Morning Surge',
    directive: 'Peak focus window. Start your hardest or most important task now, before the day gets loud.',
    suggestedTimers: ['deep', 'pomodoro'],
  },
  {
    hours: [12, 13],
    emoji: '☁️',
    name: 'Midday Drag',
    directive: "Energy naturally dips here. Eat, move, rest. Don't fight it — protect this window for recovery.",
    suggestedTimers: ['short'],
  },
  {
    hours: [14, 15, 16],
    emoji: '🔁',
    name: 'Afternoon Push',
    directive: 'Second wind. Strong window for creative work, writing, or clearing admin tasks.',
    suggestedTimers: ['pomodoro', 'writing'],
  },
  {
    hours: [17, 18],
    emoji: '🌇',
    name: 'Wind Down',
    directive: 'Start wrapping up. Good time to review what got done, prep tomorrow, and close open loops.',
    suggestedTimers: ['planning', 'short'],
  },
  {
    hours: [19, 20, 21],
    emoji: '🌙',
    name: 'Evening Recovery',
    directive: 'Personal time. Step away from tasks. This is the window that makes tomorrow possible.',
    suggestedTimers: ['long'],
  },
  {
    hours: [22, 23, 0, 1, 2, 3, 4],
    emoji: '🌑',
    name: 'Late Night',
    directive: "You're up late. That's fine — just be honest about whether this is productive or avoidance.",
    suggestedTimers: ['short', 'pomodoro'],
  },
];

export function getCurrentBlock(hour: number): TimeBlock {
  const block = TIME_BLOCKS.find((b) => b.hours.includes(hour));
  if (block) {
    return {
      emoji: block.emoji,
      name: block.name,
      directive: block.directive,
      suggestedTimers: block.suggestedTimers as TimeBlock['suggestedTimers'],
    };
  }
  // Default to Wake Ramp if nothing matches
  return {
    emoji: '🌅',
    name: 'Wake Ramp',
    directive: 'Ease in. No deep decisions yet. Good for hygiene, breakfast, light reading, or setting intentions for the day.',
    suggestedTimers: ['short', 'planning'],
  };
}
