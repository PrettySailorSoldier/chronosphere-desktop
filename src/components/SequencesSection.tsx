import React from 'react';
import { useTimerStore } from '../store/timerStore';

const STEP_LABELS: Record<string, string> = {
  pomodoro:   '🍅 Pomodoro',
  shortBreak: '☕ Short Break',
  longBreak:  '🌙 Long Break',
  deepWork:   '🎯 Deep Work',
};

export const SequencesSection: React.FC = () => {
  const {
    sequences,
    activeTimer,
    isSequenceActive,
    startSequence,
    stop,
    showToast,
  } = useTimerStore();

  const [selectedSeqId, setSelectedSeqId] = React.useState('');

  // Derive which step we're on from the active timer's sequence metadata
  const currentStep = activeTimer?.sequence_step ?? null;
  const totalSteps  = activeTimer?.sequence_total_steps ?? null;

  // Find the active sequence definition for rendering step indicators
  const activeSeqDef = isSequenceActive && activeTimer?.sequence_id
    ? sequences.find((s) => s.id === activeTimer.sequence_id)
    : null;

  const handleStart = async () => {
    if (!selectedSeqId) { showToast('Please select a sequence'); return; }
    const seq = sequences.find((s) => s.id === selectedSeqId);
    if (!seq) return;

    setSelectedSeqId('');
    await startSequence(seq);
    showToast(`▶ Started: ${seq.name}`);
  };

  const handleStop = async () => {
    await stop();
    showToast('Sequence stopped');
  };

  if (sequences.length === 0 && !isSequenceActive) return null;

  return (
    <div>
      {/* Active sequence progress */}
      {isSequenceActive && activeSeqDef && currentStep !== null && totalSteps !== null && (
        <div className="sequence-progress">
          <div className="sequence-progress-header">
            <span className="sequence-progress-name">🔗 {activeSeqDef.name}</span>
            <span className="sequence-progress-count">
              Step {currentStep + 1} of {totalSteps}
            </span>
            <button className="sequence-stop-btn" onClick={handleStop}>Stop</button>
          </div>
          <div className="sequence-progress-steps">
            {activeSeqDef.steps.map((step, i) => {
              let cls = 'sequence-step-indicator';
              if (i < currentStep) cls += ' completed';
              else if (i === currentStep) cls += ' current';
              return <span key={i} className={cls}>{STEP_LABELS[step] ?? step}</span>;
            })}
          </div>
        </div>
      )}

      {/* Sequence selector (only show when not in an active sequence) */}
      {sequences.length > 0 && !isSequenceActive && (
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
