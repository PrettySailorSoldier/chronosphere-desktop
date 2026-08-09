import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTimerStore } from '../store/timerStore';

const STEP_LABELS: Record<string, string> = {
  pomodoro:   '🍅 Pomodoro',
  shortBreak: '☕ Short Break',
  longBreak:  '🌙 Long Break',
  deepWork:   '🎯 Deep Work',
};

export const SequencesSection: React.FC = () => {
  const { sequences, activeTimer, isSequenceActive } = useTimerStore(
    useShallow((s) => ({
      sequences: s.sequences,
      activeTimer: s.activeTimer,
      isSequenceActive: s.isSequenceActive,
    })),
  );
  const { startSequence, stop, skip, showToast } = useTimerStore.getState();

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

    try {
      await startSequence(seq);
      setSelectedSeqId('');
      showToast(`▶ Started: ${seq.name}`);
    } catch (e) {
      // Previously the selection was cleared before the call, so a rejected
      // start left the user with no sequence selected and no explanation.
      console.warn('Sequence start failed:', e);
      showToast(typeof e === 'string' ? e : 'Could not start that sequence');
    }
  };

  const handleStop = async () => {
    await stop();
    showToast('Sequence stopped');
  };

  const handleSkip = async () => {
    await skip();
  };

  if (sequences.length === 0 && !isSequenceActive) return null;

  return (
    <div>
      {/* Active sequence progress.
          Driven by the engine's own step metadata, so it still renders for
          sequences with no saved definition (built in the sequencer, or deleted
          from settings while running) instead of silently disappearing. */}
      {isSequenceActive && currentStep !== null && totalSteps !== null && (
        <div className="sequence-progress">
          <div className="sequence-progress-header">
            <span className="sequence-progress-name">
              🔗 {activeSeqDef?.name ?? activeTimer?.name ?? 'Sequence'}
            </span>
            <span className="sequence-progress-count">
              Step {currentStep + 1} of {totalSteps}
            </span>
            <button className="sequence-stop-btn" onClick={handleSkip} title="Skip to next step (S)">
              Skip
            </button>
            <button className="sequence-stop-btn" onClick={handleStop}>Stop</button>
          </div>
          <div className="sequence-progress-steps">
            {(activeSeqDef?.steps ?? Array.from({ length: totalSteps }, (_, i) => `Step ${i + 1}`))
              .map((step, i) => {
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
