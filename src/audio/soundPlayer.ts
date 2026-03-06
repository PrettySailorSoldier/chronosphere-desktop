import { SOUND_MAP } from '../hooks/useTauriTimer';

// ─── Sound playback ──────────────────────────────────────────────────────────

let currentAudio: HTMLAudioElement | null = null;

/**
 * Resolve a sound type key to a playable URL.
 * Supports: built-in sound keys, custom_<id> keys, and base64 data URLs.
 */
export function resolveSound(
  soundType: string,
  customSounds: Array<{ id: string; data: string }>,
): string {
  if (soundType.startsWith('custom_')) {
    const id = soundType.replace('custom_', '');
    const custom = customSounds.find((s) => s.id === id);
    if (custom) return custom.data;
  }
  return SOUND_MAP[soundType] ?? SOUND_MAP.chime;
}

/**
 * Play a completion sound. Uses the same SOUND_MAP as the old hook
 * to ensure full compatibility with all built-in and custom sounds.
 */
export function playCompletionSound(
  soundType: string,
  customSounds: Array<{ id: string; data: string }>,
  volume: number = 70,
) {
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    const url = resolveSound(soundType, customSounds);
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume / 100));
    audio.play().catch(console.warn);
    currentAudio = audio;
  } catch (e) {
    console.warn('Sound playback failed:', e);
  }
}
