import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTimerStore, SequenceStep, isCustomStep, sequenceStepLabel } from '../store/timerStore';

const STEP_LABELS: Record<string, string> = {
  pomodoro:   '🍅 Pomodoro',
  shortBreak: '☕ Short Break',
  longBreak:  '🌙 Long Break',
  deepWork:   '🎯 Deep Work',
};

/** Custom steps carry their own name; preset keys get the decorated label. */
function stepIndicatorLabel(step: SequenceStep): string {
  if (isCustomStep(step)) return sequenceStepLabel(step);
  return STEP_LABELS[step] ?? step;
}

export const SequencesSection: React.FC = () => {
  const { sequences, timers } = useTimerStore(
    useShallow((s) => ({
      sequences: s.sequences,
      timers: s.timers,
    })),
  );
  const { startSequence, stop, skip, showToast } = useTimerStore.getState();

  const [selectedSeqId, setSelectedSeqId] = React.useState('');

  // Every currently-running sequence slot, each rendered as its own progress card.
  const activeSequences = Object.entries(timers).filter(([, t]) => t.sequence_id);

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

  const handleStop = async (id: string) => {
    await stop(id);
    showToast('Sequence stopped');
  };

  const handleSkip = async (id: string) => {
    await skip(id);
  };

  if (sequences.length === 0 && activeSequences.length === 0) return null;

  return (
    <div>
      {/* Active sequence progress — one block per running sequence slot.
          Driven by the engine's own step metadata, so it still renders for
          sequences with no saved definition (built in the sequencer, or deleted
          from settings while running) instead of silently disappearing. */}
      {activeSequences.map(([id, timer]) => {
        const currentStep = timer.sequence_step ?? null;
        const totalSteps = timer.sequence_total_steps ?? null;
        if (currentStep === null || totalSteps === null) return null;
        const seqDef = sequences.find((s) => s.id === timer.sequence_id);

        return (
          <div className="sequence-progress" key={id}>
            <div className="sequence-progress-header">
              <span className="sequence-progress-name">
                🔗 {seqDef?.name ?? timer.name ?? 'Sequence'}
              </span>
              <span className="sequence-progress-count">
                Step {currentStep + 1} of {totalSteps}
              </span>
              <button className="sequence-stop-btn" onClick={() => handleSkip(id)} title="Skip to next step">
                Skip
              </button>
              <button className="sequence-stop-btn" onClick={() => handleStop(id)}>Stop</button>
            </div>
            <div className="sequence-progress-steps">
              {(seqDef?.steps ?? Array.from({ length: totalSteps }, (_, i): SequenceStep => ({ label: `Step ${i + 1}`, seconds: 0 })))
                .map((step, i) => {
                  let cls = 'sequence-step-indicator';
                  if (i < currentStep) cls += ' completed';
                  else if (i === currentStep) cls += ' current';
                  return <span key={i} className={cls}>{stepIndicatorLabel(step)}</span>;
                })}
            </div>
          </div>
        );
      })}

      {/* Sequence selector — starting is additive, so this stays visible even
          while one or more sequences are already running. */}
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
