import React, { useState, useRef, useEffect } from 'react';
import { useTimerStore, Sequence, Settings, CustomSound, HistoryItem, Stats, StopwatchSession, DEFAULT_SETTINGS } from '../store/timerStore';
import { resolveSound } from '../audio/soundPlayer';
import { SOUND_MAP, SOUND_LABELS } from '../utils/constants';

// Audio playback has been moved into the component to support stopping.

interface Props {
  onClose: () => void;
}

type Tab = 'presets' | 'sound' | 'sequences' | 'data';

const STEP_OPTIONS = [
  { key: 'pomodoro',   label: '🍅 Pomodoro'   },
  { key: 'shortBreak', label: '☕ Short Break' },
  { key: 'longBreak',  label: '🌙 Long Break'  },
  { key: 'deepWork',   label: '🎯 Deep Work'   },
] as const;

export const SettingsPanel: React.FC<Props> = ({ onClose }) => {
  const {
    settings, setSettings, sequences, setSequences, history, customSounds,
    addCustomSound, removeCustomSound, renameCustomSound, clearHistory, hydrate, showToast,
  } = useTimerStore();
  const [tab, setTab] = useState<Tab>('presets');

  // Local preset drafts
  const [presets, setPresets] = useState({ ...settings.presets });
  const [volume, setVolume] = useState(settings.volume);
  const [soundEnabled, setSoundEnabled] = useState(settings.soundEnabled);
  const [notifEnabled, setNotifEnabled] = useState(settings.notificationsEnabled);
  const [autoBreaks, setAutoBreaks]   = useState(settings.autoStartBreaks);
  const [defaultSound, setDefaultSound] = useState(settings.defaultSound);

  // Sequence builder
  const [seqName, setSeqName] = useState('');
  const [seqSteps, setSeqSteps] = useState<string[]>([]);
  const [seqLoop, setSeqLoop] = useState(false);

  const previewTimeout = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Custom tone management
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [previewingToneId, setPreviewingToneId] = useState<string | null>(null);
  const [renamingToneId, setRenamingToneId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const saveSettings = () => {
    const updated: Settings = {
      presets: { ...presets },
      volume,
      soundEnabled,
      notificationsEnabled: notifEnabled,
      autoStartBreaks: autoBreaks,
      defaultSound,
    };
    setSettings(updated);
    showToast('Settings saved ✓');
  };

  const stopSound = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsPlaying(false);
    setPreviewingToneId(null);
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    // Play preview sound after a short debounce
    if (previewTimeout.current) clearTimeout(previewTimeout.current);
    previewTimeout.current = setTimeout(() => {
      stopSound();
      const url = resolveSound(defaultSound, customSounds);
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, newVol / 100));
      audio.onended = () => {
        if (audioRef.current === audio) {
          setIsPlaying(false);
          audioRef.current = null;
        }
      };
      audio.play().catch(console.warn);
      audioRef.current = audio;
      setIsPlaying(true);
    }, 150);
  };

  const sampleSound = () => {
    if (isPlaying) {
      stopSound();
      return;
    }
    const url = resolveSound(defaultSound, customSounds);
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume / 100));
    audio.onended = () => {
      if (audioRef.current === audio) {
        setIsPlaying(false);
        audioRef.current = null;
      }
    };
    audio.play().catch(console.warn);
    audioRef.current = audio;
    setIsPlaying(true);
  };

  // ── Custom tone upload / management ──────────────────────────────────────

  const handleToneUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('audio/')) { showToast('Not an audio file'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('File too large! Max 5MB'); return; }
    if (customSounds.length >= 10) { showToast('Max 10 custom tones — delete one first'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const newSound: CustomSound = {
        id: Date.now().toString(),
        name: file.name.replace(/\.[^/.]+$/, '').slice(0, 30),
        data: ev.target!.result as string,
      };
      addCustomSound(newSound);
      setDefaultSound(`custom_${newSound.id}`);
      showToast(`🎵 Tone "${newSound.name}" added`);
    };
    reader.onerror = () => showToast('Could not read file');
    reader.readAsDataURL(file);
  };

  const previewTone = (cs: CustomSound) => {
    if (previewingToneId === cs.id) { stopSound(); setPreviewingToneId(null); return; }
    stopSound();
    const audio = new Audio(cs.data);
    audio.volume = Math.max(0, Math.min(1, volume / 100));
    audio.onended = () => {
      if (audioRef.current === audio) {
        audioRef.current = null;
        setPreviewingToneId(null);
      }
    };
    audio.play().catch(console.warn);
    audioRef.current = audio;
    setPreviewingToneId(cs.id);
  };

  const deleteTone = (cs: CustomSound) => {
    if (previewingToneId === cs.id) { stopSound(); setPreviewingToneId(null); }
    removeCustomSound(cs.id);
    // Keep the local draft in sync if the deleted tone was selected
    if (defaultSound === `custom_${cs.id}`) setDefaultSound('chime');
    showToast(`Deleted "${cs.name}"`);
  };

  const startRename = (cs: CustomSound) => {
    setRenamingToneId(cs.id);
    setRenameDraft(cs.name);
  };

  const commitRename = () => {
    if (renamingToneId && renameDraft.trim()) {
      renameCustomSound(renamingToneId, renameDraft.trim().slice(0, 30));
    }
    setRenamingToneId(null);
    setRenameDraft('');
  };

  const toggleStep = (key: string) => {
    setSeqSteps((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  };

  const addSequence = () => {
    if (!seqName.trim()) { showToast('Enter a sequence name'); return; }
    if (seqSteps.length === 0) { showToast('Add at least one step'); return; }
    const newSeq: Sequence = {
      id: Date.now().toString(),
      name: seqName.trim(),
      steps: seqSteps as Sequence['steps'],
      loop: seqLoop,
    };
    setSequences([...sequences, newSeq]);
    setSeqName(''); setSeqSteps([]); setSeqLoop(false);
    showToast('Sequence added ✓');
  };

  const deleteSequence = (id: string) => {
    setSequences(sequences.filter((s) => s.id !== id));
  };

  const exportData = () => {
    const s = useTimerStore.getState();
    const data = {
      app: 'chronosphere',
      version: 1,
      exportedAt: new Date().toISOString(),
      history: s.history,
      stats: s.stats,
      settings: s.settings,
      sequences: s.sequences,
      customSounds: s.customSounds,
      stopwatchSessions: s.stopwatchSessions,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chronosphere-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📥 Backup downloaded');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target!.result as string);
        if (data.app !== 'chronosphere' && !data.history && !data.settings) {
          showToast('Not a Chronosphere backup file');
          return;
        }
        hydrate({
          ...(Array.isArray(data.history)           ? { history: data.history as HistoryItem[] } : {}),
          ...(data.stats                            ? { stats: data.stats as Stats } : {}),
          ...(data.settings                         ? { settings: { ...DEFAULT_SETTINGS, ...data.settings } } : {}),
          ...(Array.isArray(data.sequences)         ? { sequences: data.sequences as Sequence[] } : {}),
          ...(Array.isArray(data.customSounds)      ? { customSounds: data.customSounds as CustomSound[] } : {}),
          ...(Array.isArray(data.stopwatchSessions) ? { stopwatchSessions: data.stopwatchSessions as StopwatchSession[] } : {}),
        });
        showToast('✅ Backup restored');
        onClose();
      } catch {
        showToast('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  };

  const handleClearHistory = () => {
    clearHistory();
    showToast('History cleared');
  };

  return (
    <div className="settings-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-panel">
        <div className="settings-header">
          <span className="settings-title">⚙️ Settings</span>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-tabs">
          {(['presets', 'sound', 'sequences', 'data'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`settings-tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Presets ── */}
        {tab === 'presets' && (
          <div className="settings-group">
            <div className="settings-section-title">Timer Durations (minutes)</div>
            {([['pomodoro', '🍅 Pomodoro'], ['shortBreak', '☕ Short Break'], ['longBreak', '🌙 Long Break'], ['deepWork', '🎯 Deep Work'], ['writing', '✍️ Writing'], ['planning', '📋 Planning'], ['deep', '🦾 Deep']] as const).map(([k, label]) => (
              <div className="settings-row" key={k}>
                <span className="settings-label">{label}</span>
                <input
                  className="settings-input"
                  type="number" min={1} max={180}
                  value={presets[k]}
                  onChange={(e) => setPresets({ ...presets, [k]: parseInt(e.target.value) || 1 })}
                />
              </div>
            ))}
            <div className="settings-row" style={{ marginTop: 8 }}>
              <span className="settings-label">Auto-start breaks</span>
              <button className={`settings-toggle${autoBreaks ? ' on' : ''}`} onClick={() => setAutoBreaks(!autoBreaks)} />
            </div>
            <button className="export-btn" style={{ marginTop: 8 }} onClick={saveSettings}>Save Presets</button>
          </div>
        )}

        {/* ── Sound ── */}
        {tab === 'sound' && (
          <div className="settings-group">
            <div className="settings-row">
              <span className="settings-label">Sound enabled</span>
              <button className={`settings-toggle${soundEnabled ? ' on' : ''}`} onClick={() => setSoundEnabled(!soundEnabled)} />
            </div>
            <div className="settings-row">
              <span className="settings-label">Notifications</span>
              <button className={`settings-toggle${notifEnabled ? ' on' : ''}`} onClick={() => setNotifEnabled(!notifEnabled)} />
            </div>
            
            <div className="settings-section-title" style={{ marginTop: 12 }}>Audio Preferences</div>
            
            <div className="settings-row">
              <span className="settings-label">Default Tone</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select 
                  className="settings-input" 
                  style={{ width: 140 }}
                  value={defaultSound}
                  onChange={(e) => {
                    setDefaultSound(e.target.value);
                    if (isPlaying) stopSound();
                  }}
                >
                  {Object.keys(SOUND_MAP).map(k => (
                    <option key={k} value={k}>{SOUND_LABELS[k] || k}</option>
                  ))}
                  {customSounds.map(cs => (
                    <option key={cs.id} value={`custom_${cs.id}`}>🎵 {cs.name}</option>
                  ))}
                </select>
                <button className="subtle-btn" onClick={sampleSound} title={isPlaying ? "Stop tone" : "Sample tone"}>
                  {isPlaying ? "⏹️" : "🔊"}
                </button>
              </div>
            </div>

            <div className="settings-row">
              <span className="settings-label">Volume: {volume}%</span>
              <input
                type="range" min={0} max={100} value={volume}
                onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                style={{ width: 120 }}
              />
            </div>

            {/* ── Custom tones ── */}
            <div className="settings-section-title" style={{ marginTop: 12 }}>
              Custom Tones ({customSounds.length}/10)
            </div>
            {customSounds.length === 0 && (
              <div className="settings-hint">
                Upload your own MP3/WAV tones — they'll appear in every sound picker.
              </div>
            )}
            {customSounds.map((cs) => (
              <div className="tone-item" key={cs.id}>
                {renamingToneId === cs.id ? (
                  <input
                    className="tone-rename-input"
                    value={renameDraft}
                    autoFocus
                    maxLength={30}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') { setRenamingToneId(null); setRenameDraft(''); }
                    }}
                  />
                ) : (
                  <span
                    className="tone-name"
                    title="Click to rename"
                    onClick={() => startRename(cs)}
                  >
                    🎵 {cs.name}
                  </span>
                )}
                <div className="tone-actions">
                  <button
                    className="tone-btn"
                    title={previewingToneId === cs.id ? 'Stop' : 'Preview'}
                    onClick={() => previewTone(cs)}
                  >
                    {previewingToneId === cs.id ? '⏹' : '▶'}
                  </button>
                  <button className="tone-btn tone-btn--delete" title="Delete tone" onClick={() => deleteTone(cs)}>🗑</button>
                </div>
              </div>
            ))}
            <button
              className="export-btn"
              onClick={() => uploadInputRef.current?.click()}
              disabled={customSounds.length >= 10}
            >
              📁 Upload Tone…
            </button>
            <input
              ref={uploadInputRef}
              type="file"
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={handleToneUpload}
            />

            <button className="export-btn" style={{ marginTop: 12 }} onClick={saveSettings}>Save Sound</button>
          </div>
        )}

        {/* ── Sequences ── */}
        {tab === 'sequences' && (
          <div className="settings-group">
            {sequences.length > 0 && (
              <>
                <div className="settings-section-title">Saved Sequences</div>
                {sequences.map((s) => (
                  <div className="seq-item" key={s.id}>
                    <span>{s.name} ({s.steps.length} steps){s.loop ? ' 🔁' : ''}</span>
                    <button className="seq-item-delete" onClick={() => deleteSequence(s.id)}>🗑</button>
                  </div>
                ))}
              </>
            )}

            <div className="settings-section-title" style={{ marginTop: 12 }}>Create Sequence</div>
            <div className="seq-builder">
              <input placeholder="Sequence name" value={seqName} onChange={(e) => setSeqName(e.target.value)} />
              <div className="seq-steps-selector">
                {STEP_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    className={`seq-step-btn${seqSteps.includes(o.key) ? ' selected' : ''}`}
                    onClick={() => toggleStep(o.key)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {seqSteps.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--purple-holo)' }}>
                  Order: {seqSteps.map((s) => STEP_OPTIONS.find((o: any) => o.key === s)?.label).join(' → ')}
                </div>
              )}
              <div className="seq-loop-row">
                <input type="checkbox" id="seqLoop" checked={seqLoop} onChange={(e) => setSeqLoop(e.target.checked)} />
                <label htmlFor="seqLoop">Loop sequence</label>
              </div>
              <button className="seq-add-btn" onClick={addSequence}>+ Add Sequence</button>
            </div>
          </div>
        )}

        {/* ── Data ── */}
        {tab === 'data' && (
          <div className="settings-group">
            <div className="settings-section-title">Backup</div>
            <div className="settings-hint">
              Everything — settings, custom tones, sequences, history ({history.length} entries), and stopwatch sessions — in one JSON file.
            </div>
            <button className="export-btn" onClick={exportData}>📥 Download Backup</button>

            <div className="settings-section-title" style={{ marginTop: 12 }}>Restore</div>
            <div className="settings-hint">
              Import a previously exported backup. It replaces the sections present in the file.
            </div>
            <button className="export-btn" onClick={() => importInputRef.current?.click()}>📂 Import Backup…</button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={handleImport}
            />

            <div className="settings-section-title" style={{ marginTop: 12 }}>Danger Zone</div>
            <button className="export-btn export-btn--danger" onClick={handleClearHistory}>
              🗑 Clear Timer History
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
