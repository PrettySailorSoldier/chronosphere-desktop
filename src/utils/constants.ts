export const SOUND_LABELS: Record<string, string> = {
  chime: '🔔 Gentle Chime',
  water: '💧 Running Water',
  alarm: '⏰ Stark Alarm',
  bell: '🔔 Bell',
  birds: '🐦 Birds',
  gong: '🥁 Gong',
  piano: '🎹 Piano',
  afone: '📱 Afone',
  antagonist: '🦹 Antagonist',
  banjo: '🪕 Banjo',
  bassBoost: '🔊 Bass Boost',
  bassSoHard: '🔉 Bass So Hard',
  cyberpunk: '🌃 Cyberpunk',
  darkParadise: '🌌 Dark Paradise',
  morpheus: '💊 Morpheus',
  motivation: '🔥 Motivation Trap',
  viral: '📈 Viral',
  workComplete: '✅ Work Complete',
  breakComplete: '☕ Break Complete',
};

export const SOUND_MAP: Record<string, string> = {
  chime: new URL('../assets/sounds/chime.wav', import.meta.url).href,
  water: new URL('../assets/sounds/water.wav', import.meta.url).href,
  alarm: new URL('../assets/sounds/alarm.wav', import.meta.url).href,
  bell:  new URL('../assets/sounds/bell.wav', import.meta.url).href,
  birds: new URL('../assets/sounds/birds.wav', import.meta.url).href,
  gong:  new URL('../assets/sounds/gong.wav', import.meta.url).href,
  piano: new URL('../assets/sounds/piano.wav', import.meta.url).href,
  afone: new URL('../assets/sounds/afone.mp3', import.meta.url).href,
  antagonist: new URL('../assets/sounds/antagonist.mp3', import.meta.url).href,
  banjo: new URL('../assets/sounds/banjo.mp3', import.meta.url).href,
  bassBoost: new URL('../assets/sounds/bass_boost_ringtone.mp3', import.meta.url).href,
  bassSoHard: new URL('../assets/sounds/bass_so_hard.mp3', import.meta.url).href,
  cyberpunk: new URL('../assets/sounds/cyberpunk_iy.mp3', import.meta.url).href,
  darkParadise: new URL('../assets/sounds/dark_paradise_remix.mp3', import.meta.url).href,
  morpheus: new URL('../assets/sounds/morpheus.mp3', import.meta.url).href,
  motivation: new URL('../assets/sounds/motivation_trap_tone.mp3', import.meta.url).href,
  viral: new URL('../assets/sounds/viral.mp3', import.meta.url).href,
  // work-complete.mp3 and break-complete.mp3 were byte-for-byte duplicates of
  // chime.wav and birds.wav under different names (present since the first
  // commit — never distinct audio). Vite's content-hashed asset output was
  // silently deduping them down to chime's/birds' file, so picking "Work
  // Complete" already played chime and "Break Complete" already played birds;
  // this just makes that alias explicit instead of shipping two dead
  // duplicate binaries. Give these their own recordings to make them real.
  workComplete: new URL('../assets/sounds/chime.wav', import.meta.url).href,
  breakComplete: new URL('../assets/sounds/birds.wav', import.meta.url).href,
};
