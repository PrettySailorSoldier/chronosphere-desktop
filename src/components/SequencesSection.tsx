import React from 'react';
import { useTimerStore } from '../store/timerStore';
import { startTimerBackend } from '../hooks/useTauriTimer';
import { Timer } from '../store/timerStore';

const STEP_LABELS: Record<string, string> = {
  pomodoro:   '🍅 Pomodoro',
  shortBreak: '☕ Short Break',
  longBreak:  '🌙 Long Break',
  deepWork:   '🎯 Deep Work',
};

interface Props {
  onStartTimer: (timer: Timer) => void;
}

export const SequencesSection: React.FC<Props> = ({ onStartTimer }) => {
  const { sequences, activeSequence, settings, setActiveSequence, addTimer, showToast } = useTimerStore();

  if (sequences.length === 0 && !activeSequence) return null;

  const [selectedSeqId, setSelectedSeqId] = React.useState('');

  const handleStart = async () => {
    if (!selectedSeqId) { showToast('Please select a sequence'); return; }
    const seq = sequences.find((s) => s.id === selectedSeqId);
    if (!seq) return;

    const active = { ...seq, currentStep: 0 };
    setActiveSequence(active);
    setSelectedSeqId('');

    // Start first step
    const step = seq.steps[0];
    const presets = settings.presets as Record<string, number>;
    const nameMap: Record<string, string> = { pomodoro: 'Pomodoro', shortBreak: 'Short Break', longBreak: 'Long Break', deepWork: 'Deep Work' };
    const minutes = presets[step] ?? 25;
    const name = nameMap[step] ?? step;
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
    addTimer(timer);
    await startTimerBackend(timer);
    onStartTimer(timer);
    showToast(`▶ Started: ${seq.name}`);
  };

  const handleStop = () => {
    setActiveSequence(null);
    showToast('Sequence stopped');
  };

  return (
    <div>
      {/* Active sequence progress */}
      {activeSequence && (
        <div className="sequence-progress">
          <div className="sequence-progress-header">
            <span className="sequence-progress-name">🔗 {activeSequence.name}</span>
            <button className="sequence-stop-btn" onClick={handleStop}>Stop</button>
          </div>
          <div className="sequence-progress-steps">
            {activeSequence.steps.map((step, i) => {
              let cls = 'sequence-step-indicator';
              if (i < activeSequence.currentStep) cls += ' completed';
              else if (i === activeSequence.currentStep) cls += ' current';
              return <span key={i} className={cls}>{STEP_LABELS[step] ?? step}</span>;
            })}
          </div>
        </div>
      )}

      {/* Sequence selector */}
      {sequences.length > 0 && (
        <div className="sequences-section">
          <div className="section-header">Flow Sequences</div>
          <div className="sequence-controls">
            <select
              className="sequence-select"
              value={selectedSeqId}
              onChange={(e) => setSelectedSeqId(e.target.value)}
            >
              <option value="">Select a sequence…</option>
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.steps.length} steps){s.loop ? ' 🔁' : ''}
                </option>
              ))}
            </select>
            <button className="sequence-btn" onClick={handleStart}>▶ Start</button>
          </div>
        </div>
      )}
    </div>
  );
};
