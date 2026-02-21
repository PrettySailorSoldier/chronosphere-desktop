import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { useTimerStore, Timer, ActiveSequence } from '../store/timerStore';

// ─── Sound playback ───────────────────────────────────────────────────────────
const SOUND_MAP: Record<string, string> = {
  chime: new URL('../assets/sounds/chime.wav', import.meta.url).href,
  water: new URL('../assets/sounds/water.wav', import.meta.url).href,
  alarm: new URL('../assets/sounds/alarm.wav', import.meta.url).href,
  bell:  new URL('../assets/sounds/bell.wav', import.meta.url).href,
  birds: new URL('../assets/sounds/birds.wav', import.meta.url).href,
  gong:  new URL('../assets/sounds/gong.wav', import.meta.url).href,
  piano: new URL('../assets/sounds/piano.wav', import.meta.url).href,
};

function resolveSound(soundType: string, customSounds: Array<{ id: string; data: string }>): string {
  if (soundType.startsWith('custom_')) {
    const id = soundType.replace('custom_', '');
    const custom = customSounds.find((s) => s.id === id);
    if (custom) return custom.data;
  }
  return SOUND_MAP[soundType] ?? SOUND_MAP.chime;
}

let currentAudio: HTMLAudioElement | null = null;

export function playSound(url: string, volume: number) {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  const audio = new Audio(url);
  audio.volume = volume / 100;
  audio.play().catch(console.warn);
  currentAudio = audio;
}

// ─── Start / Cancel helpers ─────────────────────────────────────────────────

export async function startTimerBackend(timer: Timer) {
  await invoke('start_timer_backend', {
    durationSeconds: timer.remainingSeconds,
    timerId: timer.id,
    timerName: timer.name,
  });
}

export async function cancelTimerBackend(timerId: string) {
  await invoke('cancel_timer', { timerId });
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTauriTimer(onPersist: () => void) {
  const store = useTimerStore();
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    let mounted = true;

    // Timer tick — update remaining seconds in store
    listen<{ timerId: string; remaining: number }>('timer-tick', (event) => {
      if (!mounted) return;
      store.tickTimer(event.payload.timerId, event.payload.remaining);
    }).then((fn) => unlistenRefs.current.push(fn));

    // Timer complete — play sound, show notification, handle sequence/autostart
    listen<{ timerId: string; timerName: string }>('timer-complete', async (event) => {
      if (!mounted) return;
      const { timerId } = event.payload;
      const s = useTimerStore.getState();

      const timer = s.completeTimer(timerId);
      if (!timer) return;

      // Play sound
      if (s.settings.soundEnabled) {
        const url = resolveSound(timer.soundType, s.customSounds);
        playSound(url, s.settings.volume);
      }

      // Desktop notification
      if (s.settings.notificationsEnabled) {
        let granted = await isPermissionGranted();
        if (!granted) {
          const perm = await requestPermission();
          granted = perm === 'granted';
        }
        if (granted) {
          sendNotification({
            title: '✨ Timer Complete!',
            body: timer.notificationMsg || `${timer.name} is done!`,
          });
        }
      }

      // Add to history
      const historyItem = { name: timer.name, duration: timer.totalSeconds, completedAt: Date.now() };
      s.addHistory(historyItem);

      // Update daily stats
      const today = new Date().toDateString();
      const st = useTimerStore.getState().stats;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      let { streak, pomodoroCount } = st;
      if (st.lastActiveDate === today) {
        // already counted today
      } else if (st.lastActiveDate === yesterday.toDateString()) {
        streak++;
      } else {
        streak = 1;
      }
      if (timer.name.includes('Pomodoro') || timer.name.includes('Deep Work')) {
        pomodoroCount++;
      }
      s.updateStats({ lastActiveDate: today, streak, pomodoroCount });

      // Sequence progression
      const { activeSequence, settings } = useTimerStore.getState();
      if (timer.sequenceTimer && activeSequence) {
        await handleSequenceProgress(activeSequence);
      } else if (settings.autoStartBreaks && !timer.sequenceTimer && !timer.autoStarted) {
        await handleAutoStart(timer);
      }

      onPersist();
    }).then((fn) => unlistenRefs.current.push(fn));

    return () => {
      mounted = false;
      unlistenRefs.current.forEach((fn) => fn());
      unlistenRefs.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ─── Sequence progression (ported from background.js) ────────────────────────

const STEP_NAMES: Record<string, string> = {
  pomodoro: 'Pomodoro',
  shortBreak: 'Short Break',
  longBreak: 'Long Break',
  deepWork: 'Deep Work',
};

async function handleSequenceProgress(activeSequence: ActiveSequence) {
  const s = useTimerStore.getState();
  const nextStep = activeSequence.currentStep + 1;

  if (nextStep >= activeSequence.steps.length) {
    if (activeSequence.loop) {
      const reset = { ...activeSequence, currentStep: 0 };
      useTimerStore.getState().setActiveSequence(reset);
      await startSequenceStep(reset, s.settings);
    } else {
      useTimerStore.getState().setActiveSequence(null);
      useTimerStore.getState().showToast('🎉 Sequence complete!');
    }
  } else {
    const advanced = { ...activeSequence, currentStep: nextStep };
    useTimerStore.getState().setActiveSequence(advanced);
    await startSequenceStep(advanced, s.settings);
  }
}

async function startSequenceStep(seq: ActiveSequence, settings: { presets: Record<string, number> }) {
  const step = seq.steps[seq.currentStep];
  const presets: Record<string, number> = {
    pomodoro: settings.presets.pomodoro,
    shortBreak: settings.presets.shortBreak,
    longBreak: settings.presets.longBreak,
    deepWork: settings.presets.deepWork,
  };
  const minutes = presets[step] ?? 25;
  const name = STEP_NAMES[step] ?? step;
  const now = Date.now();
  const timer: Timer = {
    id: now.toString(),
    name,
    totalSeconds: minutes * 60,
    remainingSeconds: minutes * 60,
    endTime: now + minutes * 60 * 1000,
    soundType: 'chime',
    notificationMsg: `${name} complete!`,
    isRunning: true,
    sequenceTimer: true,
  };
  useTimerStore.getState().addTimer(timer);
  await startTimerBackend(timer);
}

// ─── Auto-start breaks (ported from background.js) ───────────────────────────

const WORK_TIMERS = ['Pomodoro', 'Deep Work'];
const BREAK_TIMERS = ['Short Break', 'Long Break'];

async function handleAutoStart(completedTimer: Timer) {
  const s = useTimerStore.getState();
  const presets = s.settings.presets;
  let nextTimer: Timer | null = null;
  const now = Date.now();

  if (WORK_TIMERS.some((n) => completedTimer.name.includes(n))) {
    const isLong = s.stats.pomodoroCount % 4 === 0;
    const mins = isLong ? presets.longBreak : presets.shortBreak;
    const bname = isLong ? 'Long Break' : 'Short Break';
    nextTimer = {
      id: now.toString(),
      name: bname,
      totalSeconds: mins * 60,
      remainingSeconds: mins * 60,
      endTime: now + mins * 60 * 1000,
      soundType: completedTimer.soundType,
      notificationMsg: `${bname} complete! 💪`,
      isRunning: true,
      autoStarted: true,
    };
  } else if (BREAK_TIMERS.some((n) => completedTimer.name.includes(n))) {
    const mins = presets.pomodoro;
    nextTimer = {
      id: now.toString(),
      name: 'Pomodoro',
      totalSeconds: mins * 60,
      remainingSeconds: mins * 60,
      endTime: now + mins * 60 * 1000,
      soundType: completedTimer.soundType,
      notificationMsg: 'Pomodoro complete! 🎉',
      isRunning: true,
      autoStarted: true,
    };
  }

  if (nextTimer) {
    s.addTimer(nextTimer);
    await startTimerBackend(nextTimer);
    s.showToast(`⏱️ Auto-started: ${nextTimer.name}`);
  }
}
