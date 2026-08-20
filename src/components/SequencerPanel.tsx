import { useEffect, useRef, useCallback, useState } from 'react';
import { load } from '@tauri-apps/plugin-store';
import { useShallow } from 'zustand/react/shallow';
import { useTimerStore, ResolvedStep } from '../store/timerStore';
import styles from './SequencerPanel.module.css';

// ── Types ────────────────────────────────────────────────────────────────────

interface Phase {
  id: string;
  label: string;
  durationSeconds: number;
  type: 'work' | 'break' | 'transition';
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<Phase['type'], string> = {
  work:       '#9333ea',
  break:      '#2563eb',
  transition: '#d97706',
};

const TIMER_COLORS: Record<Phase['type'], string> = {
  work:       'rgba(192,132,252,1)',
  break:      'rgba(96,165,250,1)',
  transition: 'rgba(251,191,36,1)',
};

const TYPE_CYCLE: Phase['type'][] = ['work', 'break', 'transition'];

const RING_R    = 62;
const RING_CIRC = 2 * Math.PI * RING_R; // ≈ 389.6

/** Stable id so the panel can recognise its own run in the shared engine. */
const SEQUENCER_ID = 'sequencer';

/** Completion tone per phase type — the panel used to transition in silence. */
const TYPE_SOUNDS: Record<Phase['type'], string> = {
  work:       'workComplete',
  break:      'breakComplete',
  transition: 'chime',
};

const TEMPLATES: Record<string, Omit<Phase, 'id'>[]> = {
  '🍅 Pomodoro': [
    { label: 'Focus',      durationSeconds: 1500, type: 'work' },
    { label: 'Break',      durationSeconds:  300, type: 'break' },
    { label: 'Focus',      durationSeconds: 1500, type: 'work' },
    { label: 'Break',      durationSeconds:  300, type: 'break' },
    { label: 'Focus',      durationSeconds: 1500, type: 'work' },
    { label: 'Long Break', durationSeconds:  900, type: 'break' },
  ],
  '🌊 Flow': [
    { label: 'Warm Up',   durationSeconds:  300, type: 'transition' },
    { label: 'Deep Work', durationSeconds: 2700, type: 'work' },
    { label: 'Rest',      durationSeconds:  600, type: 'break' },
  ],
  '⚡ Sprint': [
    { label: 'Sprint', durationSeconds: 900, type: 'work' },
    { label: 'Sprint', durationSeconds: 900, type: 'work' },
    { label: 'Sprint', durationSeconds: 900, type: 'work' },
    { label: 'Rest',   durationSeconds: 300, type: 'break' },
  ],
  '🌱 Starter': [
    { label: 'Just start.', durationSeconds: 300, type: 'work' },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function genId(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function makePhases(templates: Omit<Phase, 'id'>[]): Phase[] {
  return templates.map(t => ({ ...t, id: genId() }));
}

const DEFAULT_PHASES: Phase[] = makePhases([
  { label: 'Focus',      durationSeconds: 1500, type: 'work' },
  { label: 'Break',      durationSeconds:  300, type: 'break' },
  { label: 'Focus',      durationSeconds: 1500, type: 'work' },
  { label: 'Break',      durationSeconds:  300, type: 'break' },
  { label: 'Focus',      durationSeconds: 1500, type: 'work' },
  { label: 'Long Break', durationSeconds:  900, type: 'break' },
]);

function fmtTime(s: number): string {
  const m  = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function fmtDuration(s: number): string {
  if (s % 60 === 0) return `${s / 60}m`;
  const m  = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

function parseDuration(raw: string): number | null {
  const t = raw.trim();
  if (/^\d+$/.test(t)) return Math.min(7200, Math.max(30, parseInt(t) * 60));
  const m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) {
    const mins = parseInt(m[1]);
    const secs = parseInt(m[2]);
    if (secs >= 60) return null;
    return Math.min(7200, Math.max(30, mins * 60 + secs));
  }
  return null;
}

function toResolvedSteps(phases: Phase[]): ResolvedStep[] {
  return phases.map((p, i) => {
    const label = p.label.trim() || `Phase ${i + 1}`;
    return {
      label,
      seconds: p.durationSeconds,
      sound: TYPE_SOUNDS[p.type],
      notification: `${label} complete!`,
    };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SequencerPanel() {
  // ── Persisted phases ────────────────────────────────────────────────────────
  const [phases, setPhases] = useState<Phase[]>(DEFAULT_PHASES);

  // ── Timer state — owned by the Rust engine, not this component ──────────────
  //
  // This panel used to run its own setInterval countdown entirely separate from
  // the app's timer engine. That meant it drifted (interval callbacks are not a
  // clock), advanced phases in total silence, lost everything when the window
  // closed, and could run at the same time as a "real" timer with the two
  // fighting over the UI. It now drives the same engine as every other timer,
  // so it inherits wall-clock accuracy, tones, notifications and rehydration.
  const { activeTimer, isSequenceActive, sequenceComplete } = useTimerStore(
    useShallow((s) => ({
      activeTimer: s.activeTimer,
      isSequenceActive: s.isSequenceActive,
      sequenceComplete: s.sequenceComplete,
    })),
  );

  const isOurs      = isSequenceActive && activeTimer?.sequence_id === SEQUENCER_ID;
  const activeIdx   = isOurs ? activeTimer?.sequence_step ?? null : null;
  const secondsLeft = isOurs ? activeTimer?.remaining_seconds ?? 0 : 0;
  const running     = isOurs && activeTimer?.phase === 'Running';
  const paused      = isOurs && activeTimer?.phase === 'Paused';
  const started     = activeIdx !== null;

  const [isComplete, setIsComplete] = useState(false);

  // ── Editor UI state ─────────────────────────────────────────────────────────
  const [editingDurId,  setEditingDurId]  = useState<string | null>(null);
  const [editingDurVal, setEditingDurVal] = useState('');
  const [dragOverIdx,   setDragOverIdx]   = useState<number | null>(null);
  const [newPhaseId,    setNewPhaseId]    = useState<string | null>(null);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const storeRef     = useRef<Awaited<ReturnType<typeof load>> | null>(null);
  const mountedRef   = useRef(true);
  const phasesRef    = useRef<Phase[]>(phases);
  const activeIdxRef = useRef<number | null>(null);
  const dragIdxRef   = useRef<number | null>(null);

  phasesRef.current    = phases;
  activeIdxRef.current = activeIdx;

  // Flash the "complete" state, but only when our run actually reached the end —
  // being stopped, reset, or displaced by another timer is not a completion.
  const wasOursRef = useRef(false);
  useEffect(() => {
    if (isOurs) {
      wasOursRef.current = true;
      setIsComplete(false);
      return;
    }
    if (!wasOursRef.current) return;
    wasOursRef.current = false;
    if (!sequenceComplete) return;
    setIsComplete(true);
    const t = setTimeout(() => { if (mountedRef.current) setIsComplete(false); }, 4000);
    return () => clearTimeout(t);
  }, [isOurs, sequenceComplete]);

  // ── Load from store ONCE on mount ────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const s = await load('sequencer-state.json', { autoSave: false, defaults: {} });
        storeRef.current = s;
        const saved = await s.get<{ phases: Phase[] }>('state');
        if (saved?.phases?.length) {
          setPhases(saved.phases);
        }
      } catch (e) {
        console.warn('SequencerPanel: store load failed', e);
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, []); // intentionally empty — load once only

  // ── Persist to store (call after any phases mutation) ────────────────────────
  const saveToStore = useCallback(async (updatedPhases: Phase[]) => {
    if (!storeRef.current) return;
    try {
      await storeRef.current.set('state', { phases: updatedPhases });
      await storeRef.current.save();
    } catch (e) {
      console.warn('SequencerPanel: save failed', e);
    }
  }, []);

  // ── Control handlers — all delegate to the shared engine ─────────────────────
  const handleStart = useCallback(async () => {
    const store = useTimerStore.getState();

    // Resume rather than restart if this sequence is merely paused.
    if (isOurs && store.activeTimer?.phase === 'Paused') {
      await store.resume();
      return;
    }

    const steps = toResolvedSteps(phasesRef.current);
    if (steps.length === 0) return;

    if (store.activeTimer && !isOurs) {
      const label = store.activeTimer.name;
      if (!window.confirm(`"${label}" is still running. Replace it with this sequence?`)) return;
    }

    setIsComplete(false);
    try {
      await store.startResolvedSequence({
        id: SEQUENCER_ID,
        name: 'Sequencer',
        steps,
        loopEnabled: false,
      });
    } catch (e) {
      console.warn('Sequencer start failed:', e);
      store.showToast('Could not start the sequence');
    }
  }, [isOurs]);

  const handlePause = useCallback(() => { void useTimerStore.getState().pause(); }, []);

  const handleSkip = useCallback(() => { void useTimerStore.getState().skip(); }, []);

  const handleReset = useCallback(() => {
    setIsComplete(false);
    wasOursRef.current = false;
    if (isOurs) void useTimerStore.getState().stop();
  }, [isOurs]);

  // ── Phase list mutations (all save immediately) ───────────────────────────────
  const handleLabelChange = useCallback((id: string, value: string) => {
    setPhases(prev => {
      const next = prev.map(p => p.id === id ? { ...p, label: value } : p);
      saveToStore(next);
      return next;
    });
  }, [saveToStore]);

  const handleTypeClick = useCallback((id: string) => {
    setPhases(prev => {
      const next = prev.map(p => {
        if (p.id !== id) return p;
        const nextType = TYPE_CYCLE[(TYPE_CYCLE.indexOf(p.type) + 1) % TYPE_CYCLE.length];
        return { ...p, type: nextType };
      });
      saveToStore(next);
      return next;
    });
  }, [saveToStore]);

  const handleAdjust = useCallback((id: string, delta: number) => {
    // If this is the phase in flight, push the change through to the engine so
    // the live countdown and the editor stay in agreement.
    const idx = phasesRef.current.findIndex(p => p.id === id);
    if (idx !== -1 && idx === activeIdxRef.current) {
      void useTimerStore.getState().extendTimer(delta);
    }
    setPhases(prev => {
      const next = prev.map(p => {
        if (p.id !== id) return p;
        return { ...p, durationSeconds: Math.min(7200, Math.max(30, p.durationSeconds + delta)) };
      });
      saveToStore(next);
      return next;
    });
  }, [saveToStore]);

  const handleRemove = useCallback((id: string) => {
    const idx = phasesRef.current.findIndex(p => p.id === id);
    if (idx === -1) return;

    // The engine holds an immutable copy of the steps it started with, so
    // deleting the phase that is currently running has to end the run — there is
    // no coherent way to keep counting down a phase the user just removed.
    if (idx === activeIdxRef.current) {
      void useTimerStore.getState().stop();
    }

    setPhases(prev => {
      const next = prev.filter(p => p.id !== id);
      saveToStore(next);
      return next;
    });
  }, [saveToStore]);

  const handleAddPhase = useCallback(() => {
    const id = genId();
    setNewPhaseId(id);
    setPhases(prev => {
      const next = [...prev, { id, label: '', durationSeconds: 300, type: 'work' as const }];
      saveToStore(next);
      return next;
    });
  }, [saveToStore]);

  // Insert a new blank phase at the given index.
  // If the sequence is running and the user inserts before/at the active step,
  // the engine's immutable step list is now out of sync — we have to stop it.
  const handleInsertAt = useCallback((insertIdx: number) => {
    const activeI = activeIdxRef.current;
    if (activeI !== null && insertIdx <= activeI) {
      if (!window.confirm('Inserting before the current phase will stop the running sequence. Continue?')) return;
      void useTimerStore.getState().stop();
    }
    const id = genId();
    setNewPhaseId(id);
    setPhases(prev => {
      const next = [...prev];
      next.splice(insertIdx, 0, { id, label: '', durationSeconds: 300, type: 'work' as const });
      saveToStore(next);
      return next;
    });
  }, [saveToStore]);

  const handleTemplate = useCallback((key: string) => {
    const template = TEMPLATES[key];
    if (!template) return;
    const newPhases = makePhases(template);
    // Loading a template replaces the phase list wholesale, so any run based on
    // the old list has to end with it.
    if (activeIdxRef.current !== null) void useTimerStore.getState().stop();
    setIsComplete(false);
    setPhases(newPhases);
    saveToStore(newPhases);
  }, [saveToStore]);

  // ── Drag and drop ─────────────────────────────────────────────────────────────
  const handleDragStart = useCallback((idx: number) => {
    dragIdxRef.current = idx;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  }, []);

  const handleDrop = useCallback((dropIdx: number) => {
    const dragIdx = dragIdxRef.current;
    setDragOverIdx(null);
    dragIdxRef.current = null;
    if (dragIdx === null || dragIdx === dropIdx) return;

    // Reordering invalidates the step indices the engine is running against.
    if (activeIdxRef.current !== null) void useTimerStore.getState().stop();

    setPhases(prev => {
      const next = [...prev];
      const [dragged] = next.splice(dragIdx, 1);
      next.splice(dropIdx, 0, dragged);
      saveToStore(next);
      return next;
    });
  }, [saveToStore]);

  // ── Inline duration editing ───────────────────────────────────────────────────
  const handleDurClick = useCallback((id: string, current: number) => {
    setEditingDurId(id);
    setEditingDurVal(fmtDuration(current));
  }, []);

  const handleDurCommit = useCallback((id: string) => {
    const parsed = parseDuration(editingDurVal);
    if (parsed !== null) {
      setPhases(prev => {
        const next = prev.map(p => p.id === id ? { ...p, durationSeconds: parsed } : p);
        saveToStore(next);
        return next;
      });
    }
    setEditingDurId(null);
    setEditingDurVal('');
  }, [editingDurVal, saveToStore]);

  // ── Derived values for render ─────────────────────────────────────────────────
  const activePhase   = activeIdx !== null ? phases[activeIdx] ?? null : null;
  const totalDuration = phases.reduce((acc, p) => acc + p.durationSeconds, 0) || 1;

  // Measure progress against the engine's own total for this step, so a live
  // ±5m adjustment doesn't make the ring disagree with the digits.
  const phaseTotal = isOurs ? activeTimer?.total_seconds ?? 0 : 0;
  const progress   = phaseTotal > 0 ? Math.min(1, secondsLeft / phaseTotal) : 0;
  const ringOffset = RING_CIRC * (1 - progress);
  const ringColor  = activePhase ? TYPE_COLORS[activePhase.type] : 'rgba(100,60,140,0.4)';
  const timerColor = activePhase ? TIMER_COLORS[activePhase.type] : 'rgba(207,245,255,0.25)';

  const digitsDisplay = isComplete
    ? '00:00'
    : started
      ? fmtTime(secondsLeft)
      : '--:--';

  const labelDisplay = isComplete
    ? '✦ sequence complete'
    : paused
      ? `${activePhase?.label || 'phase'} · paused`
      : activePhase
        ? (activePhase.label || 'running')
        : 'ready';

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.panel}>

      {/* ── SECTION 1: Sequence Strip ── */}
      <div className={styles.strip}>
        {phases.map((phase, i) => {
          const flexVal = Math.max(1, (phase.durationSeconds / totalDuration) * phases.length * 2);
          return (
            <div
              key={phase.id}
              className={[
                styles.stripCapsule,
                i === activeIdx ? styles.active : '',
                // Steps run strictly in order, so everything before the active
                // one is done. (Previously tracked in a parallel Set that could
                // drift out of step with the timer.)
                activeIdx !== null && i < activeIdx ? styles.completed : '',
              ].filter(Boolean).join(' ')}
              style={{
                flex:        flexVal,
                background:  `${TYPE_COLORS[phase.type]}1a`,
                borderColor: i === activeIdx
                  ? TYPE_COLORS[phase.type]
                  : 'rgba(255,255,255,0.09)',
              }}
            >
              <span className={styles.capsuleLabel}>{phase.label || '…'}</span>
              <span className={styles.capsuleDuration}>{fmtDuration(phase.durationSeconds)}</span>
            </div>
          );
        })}
      </div>

      {/* ── SECTION 2: Timer Display ── */}
      <div className={styles.timerDisplay}>
        <svg
          className={styles.progressRing}
          width="160"
          height="160"
          viewBox="0 0 160 160"
        >
          <circle
            className={styles.progressRingBg}
            cx="80" cy="80" r={RING_R}
          />
          <circle
            className={styles.progressRingFill}
            cx="80" cy="80" r={RING_R}
            stroke={ringColor}
            strokeDasharray={RING_CIRC}
            strokeDashoffset={ringOffset}
            style={{ transition: running ? 'stroke-dashoffset 0.95s linear' : 'none' }}
          />
        </svg>

        <div className={styles.timerInner}>
          <span className={styles.timerDigits} style={{ color: timerColor }}>
            {digitsDisplay}
          </span>
          <span
            className={[styles.timerLabel, isComplete ? styles.completeText : ''].filter(Boolean).join(' ')}
            style={{ color: activePhase ? TIMER_COLORS[activePhase.type] : 'rgba(207,245,255,0.35)' }}
          >
            {labelDisplay}
          </span>
        </div>
      </div>

      {/* ── SECTION 3: Controls ── */}
      <div className={styles.controls}>
        {/* Live ±5 min adjust buttons — only shown while a phase is active */}
        {(running || paused) && activePhase && (
          <button
            className={styles.liveAdjBtn}
            onClick={() => handleAdjust(activePhase.id, -300)}
            title="−5 min from current phase"
          >
            −5m
          </button>
        )}

        <button
          className={styles.primaryBtn}
          onClick={running ? handlePause : handleStart}
          disabled={phases.length === 0}
        >
          {running ? '⏸ Pause' : paused ? '▶ Resume' : '▶ Start'}
        </button>
        <button
          className={styles.secondaryBtn}
          onClick={handleSkip}
          disabled={!started}
          title="Skip to next phase (S)"
        >
          ⏭ Skip
        </button>
        <button
          className={styles.secondaryBtn}
          onClick={handleReset}
          disabled={!started && !isComplete}
          title="Stop and reset"
        >
          ↺ Reset
        </button>

        {/* Live +5 min */}
        {(running || paused) && activePhase && (
          <button
            className={styles.liveAdjBtn}
            onClick={() => handleAdjust(activePhase.id, 300)}
            title="+5 min to current phase"
          >
            +5m
          </button>
        )}
      </div>

      {/* ── SECTION 4 + 5: Phase Editor ── */}
      <div className={styles.editorSection}>

        {/* Quick-load templates (hidden mid-run — loading one would end it) */}
        {!started && (
          <div className={styles.templates}>
            {Object.keys(TEMPLATES).map(key => (
              <button
                key={key}
                className={styles.templatePill}
                onClick={() => handleTemplate(key)}
              >
                {key}
              </button>
            ))}
          </div>
        )}

        <div className={styles.sectionLabel}>Phases</div>

        {/* The engine freezes step durations when a run starts, so say so rather
            than letting edits look like they apply to the run in progress. */}
        {started && (
          <div className={styles.sectionLabel} style={{ opacity: 0.7, textTransform: 'none' }}>
            Duration edits apply to the next run — except ±5 on the playing phase.
            You can insert phases at any position; inserting before the current phase will stop the run.
          </div>
        )}

        {/* Phase rows */}
        <div className={styles.phaseList}>

          {/* Insert-at-top button */}
          <button
            className={styles.insertBetweenBtn}
            onClick={() => handleInsertAt(0)}
            title="Insert phase at the beginning"
          >
            <span className={styles.insertBetweenLine} />
            <span className={styles.insertBetweenPlus}>+ insert</span>
            <span className={styles.insertBetweenLine} />
          </button>

          {phases.map((phase, i) => (
            <div key={phase.id}>
              <div
                className={[
                  styles.phaseRow,
                  i === activeIdx ? styles.activePhaseRow : '',
                  dragOverIdx === i ? styles.dragOver : '',
                ].filter(Boolean).join(' ')}
                draggable={!started}
                onDragStart={() => handleDragStart(i)}
                onDragOver={e => handleDragOver(e, i)}
                onDrop={() => handleDrop(i)}
                onDragLeave={() => setDragOverIdx(null)}
                onDragEnd={() => { setDragOverIdx(null); dragIdxRef.current = null; }}
              >
                {/* Drag handle */}
                <span
                  className={[styles.dragHandle, started ? styles.disabledHandle : ''].filter(Boolean).join(' ')}
                  aria-hidden="true"
                >
                  <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                    <circle cx="3" cy="2.5"  r="1.2" />
                    <circle cx="7" cy="2.5"  r="1.2" />
                    <circle cx="3" cy="7"    r="1.2" />
                    <circle cx="7" cy="7"    r="1.2" />
                    <circle cx="3" cy="11.5" r="1.2" />
                    <circle cx="7" cy="11.5" r="1.2" />
                  </svg>
                </span>

                {/* Type dot — click cycles work → break → transition */}
                <button
                  className={styles.typeDot}
                  style={{ background: TYPE_COLORS[phase.type] }}
                  onClick={() => handleTypeClick(phase.id)}
                  title={`Type: ${phase.type} (click to cycle)`}
                />

                {/* Label */}
                <input
                  ref={phase.id === newPhaseId
                    ? (el) => { if (el) { el.focus(); setNewPhaseId(null); } }
                    : undefined}
                  className={styles.labelInput}
                  value={phase.label}
                  placeholder="Phase name…"
                  onChange={e => handleLabelChange(phase.id, e.target.value)}
                />

                {/* −5 min */}
                <button
                  className={styles.adjBtn}
                  onClick={() => handleAdjust(phase.id, -300)}
                  title="−5 min"
                >
                  −5
                </button>

                {/* Duration display / inline edit */}
                {editingDurId === phase.id ? (
                  <input
                    className={styles.durationInput}
                    value={editingDurVal}
                    onChange={e => setEditingDurVal(e.target.value)}
                    onBlur={() => handleDurCommit(phase.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleDurCommit(phase.id);
                      if (e.key === 'Escape') { setEditingDurId(null); setEditingDurVal(''); }
                    }}
                    autoFocus
                  />
                ) : (
                  <span
                    className={styles.durationDisplay}
                    onClick={() => handleDurClick(phase.id, phase.durationSeconds)}
                    title="Click to edit duration"
                  >
                    {fmtDuration(phase.durationSeconds)}
                  </span>
                )}

                {/* +5 min */}
                <button
                  className={styles.adjBtn}
                  onClick={() => handleAdjust(phase.id, 300)}
                  title="+5 min"
                >
                  +5
                </button>

                {/* Remove */}
                <button
                  className={styles.removeBtn}
                  onClick={() => handleRemove(phase.id)}
                  title="Remove phase"
                >
                  ×
                </button>
              </div>

              {/* Insert-between button — appears after every row */}
              <button
                className={styles.insertBetweenBtn}
                onClick={() => handleInsertAt(i + 1)}
                title={`Insert phase after "${phase.label || `Phase ${i + 1}`}"`}
              >
                <span className={styles.insertBetweenLine} />
                <span className={styles.insertBetweenPlus}>+ insert</span>
                <span className={styles.insertBetweenLine} />
              </button>
            </div>
          ))}
        </div>

        {/* Append phase at end */}
        <button className={styles.addPhaseBtn} onClick={handleAddPhase}>
          + append phase
        </button>
      </div>
    </div>
  );
}
