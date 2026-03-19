import React, { useState } from 'react';
import { useTimerStore, CustomSound } from '../store/timerStore';
import { SOUND_MAP, SOUND_LABELS } from '../utils/constants';

interface Props {
  onStart: (h: number, m: number, s: number, name: string, sound: string, msg: string) => void;
}

export const CustomTimerForm: React.FC<Props> = ({ onStart }) => {
  const { customSounds, addCustomSound, showToast } = useTimerStore();
  const [collapsed, setCollapsed] = useState(true);
  const [hours, setHours]   = useState('');
  const [mins, setMins]     = useState('');
  const [secs, setSecs]     = useState('');
  const [name, setName]     = useState('');
  const [sound, setSound]   = useState('chime');
  const [msg, setMsg]       = useState('');

  const handleStart = () => {
    const h = parseInt(hours) || 0;
    const m = parseInt(mins) || 0;
    const s = parseInt(secs) || 0;
    onStart(h, m, s, name || 'Custom Timer', sound, msg || "Time's up! ✨");
    setHours(''); setMins(''); setSecs(''); setName(''); setMsg('');
    setCollapsed(true);
  };

  const handleSoundChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'upload') {
      document.getElementById('customSoundInput')?.click();
    } else {
      setSound(val);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('File too large! Max 5MB'); return; }
    if (!file.type.startsWith('audio/')) { showToast('Not an audio file'); return; }
    if (customSounds.length >= 10) { showToast('Max 10 custom sounds'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const newSound: CustomSound = {
        id: Date.now().toString(),
        name: file.name.replace(/\.[^/.]+$/, '').slice(0, 30),
        data: ev.target!.result as string,
      };
      addCustomSound(newSound);
      setSound(`custom_${newSound.id}`);
      showToast(`🎵 Sound "${newSound.name}" saved`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="new-timer-section">
      <div className="custom-form-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="section-header">Custom Timer</div>
        <button className="custom-form-toggle" tabIndex={-1}>{collapsed ? '▼ Expand' : '▲ Collapse'}</button>
      </div>

      {!collapsed && <div className="custom-form-body">
      <div className="input-group">
        <input type="number" placeholder="0" min="0" max="23" value={hours} onChange={(e) => setHours(e.target.value)} />
        <span>h</span>
        <input type="number" placeholder="0" min="0" max="59" value={mins}  onChange={(e) => setMins(e.target.value)} />
        <span>m</span>
        <input type="number" placeholder="0" min="0" max="59" value={secs}  onChange={(e) => setSecs(e.target.value)} />
        <span>s</span>
      </div>

      <input
        className="timer-name-input"
        type="text"
        placeholder="Timer name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="sound-selector">
        <label>🔊 Sound:</label>
        <select value={sound} onChange={handleSoundChange}>
          {Object.keys(SOUND_MAP).map(k => (
            <option key={k} value={k}>{SOUND_LABELS[k] || k}</option>
          ))}
          {customSounds.map((cs) => (
            <option key={cs.id} value={`custom_${cs.id}`}>🎵 {cs.name}</option>
          ))}
          <option value="upload">📁 Upload Custom…</option>
        </select>
        <input
          id="customSoundInput"
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
      </div>

      <div className="notification-input">
        <label>💬 Notification message:</label>
        <input
          className="notification-msg-input"
          type="text"
          placeholder="Time's up! ✨"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
        />
      </div>

      <button className="start-btn" onClick={handleStart}>Start Timer</button>
      </div>}
    </div>
  );
};
