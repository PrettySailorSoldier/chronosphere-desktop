import { useEffect, useRef, useCallback, useState } from 'react';
import { load } from '@tauri-apps/plugin-store';
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

function findNextPhase(phases: Phase[], fromIdx: number, completed: Set<number>): number | null {
  for (let i = fromIdx + 1; i < phases.length; i++) {
    if (!completed.has(i)) return i;
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SequencerPanel() {
  // ── Persisted phases ────────────────────────────────────────────────────────
  const [phases, setPhases] = useState<Phase[]>(DEFAULT_PHASES);

  // ── Timer state ─────────────────────────────────────────────────────────────
  const [activeIdx,    setActiveIdx]    = useState<number | null>(null);
  const [secondsLeft,  setSecondsLeft]  = useState(0);
  const [running,      setRunning]      = useState(false);
  const [completedSet, setCompletedSet] = useState<Set<number>>(new Set());
  const [isComplete,   setIsComplete]   = useState(false);

  // ── Editor UI state ─────────────────────────────────────────────────────────
  const [editingDurId,  setEditingDurId]  = useState<string | null>(null);
  const [editingDurVal, setEditingDurVal] = useState('');
  const [dragOverIdx,   setDragOverIdx]   = useState<number | null>(null);
  const [newPhaseId,    setNewPhaseId]    = useState<string | null>(null);

  // ── Refs (for use inside intervals / callbacks without stale closures) ───────
  const storeRef         = useRef<Awaited<ReturnType<typeof load>> | null>(null);
  const mountedRef       = useRef(true);
  const phasesRef        = useRef<Phase[]>(phases);
  const activeIdxRef     = useRef<number | null>(null);
  const secondsLeftRef   = useRef(0);
  const runningRef       = useRef(false);
  const completedSetRef  = useRef<Set<number>>(new Set());
  const dragIdxRef       = useRef<number | null>(null);

  // Keep refs in sync with state (synchronous, before any effects)
  phasesRef.current       = phases;
  activeIdxRef.current    = activeIdx;
  secondsLeftRef.current  = secondsLeft;
  runningRef.current      = running;
  completedSetRef.current = completedSet;

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

  // ── Session complete ─────────────────────────────────────────────────────────
  const handleSessionComplete = useCallback(() => {
    runningRef.current     = false;
    activeIdxRef.current   = null;
    secondsLeftRef.current = 0;
    setRunning(false);
    setActiveIdx(null);
    setSecondsLeft(0);
    setIsComplete(true);
    setTimeout(() => {
      if (mountedRef.current) setIsComplete(false);
    }, 4000);
  }, []);

  // ── Advance to next non-completed phase ──────────────────────────────────────
  const advancePhase = useCallback(() => {
    const curIdx = activeIdxRef.current;
    if (curIdx === null) return;

    const newCompleted = new Set([...completedSetRef.current, curIdx]);
    completedSetRef.current = newCompleted;
    setCompletedSet(new Set(newCompleted));

    const nextIdx = findNextPhase(phasesRef.current, curIdx, newCompleted);
    if (nextIdx === null) {
      handleSessionComplete();
    } else {
      const dur = phasesRef.current[nextIdx].durationSeconds;
      activeIdxRef.current   = nextIdx;
      secondsLeftRef.current = dur;
      setActiveIdx(nextIdx);
      setSecondsLeft(dur);
    }
  }, [handleSessionComplete]);

  // ── Tick interval ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (secondsLeftRef.current > 1) {
        secondsLeftRef.current -= 1;
        setSecondsLeft(secondsLeftRef.current);
      } else {
        advancePhase();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [running, advancePhase]);

  // ── Control handlers ──────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (activeIdxRef.current === null) {
      const firstIdx = phasesRef.current.findIndex((_, i) => !completedSetRef.current.has(i));
      if (firstIdx === -1) return;
      const dur = phasesRef.current[firstIdx].durationSeconds;
      activeIdxRef.current   = firstIdx;
      secondsLeftRef.current = dur;
      setActiveIdx(firstIdx);
      setSecondsLeft(dur);
    }
    runningRef.current = true;
    setRunning(true);
    setIsComplete(false);
  }, []);

  const handlePause = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
  }, []);

  const handleSkip = useCallback(() => {
    advancePhase();
  }, [advancePhase]);

  const handleReset = useCallback(() => {
    runningRef.current      = false;
    activeIdxRef.current    = null;
    secondsLeftRef.current  = 0;
    completedSetRef.current = new Set();
    setRunning(false);
    setActiveIdx(null);
    setSecondsLeft(0);
    setCompletedSet(new Set());
    setIsComplete(false);
  }, []);

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
    // If this is the active phase, also shift secondsLeft
    const idx = phasesRef.current.findIndex(p => p.id === id);
    if (idx === activeIdxRef.current) {
      const newLeft = Math.max(1, secondsLeftRef.current + delta);
      secondsLeftRef.current = newLeft;
      setSecondsLeft(newLeft);
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

    if (idx === activeIdxRef.current) {
      // Removing the active phase — stop the timer
      runningRef.current      = false;
      activeIdxRef.current    = null;
      secondsLeftRef.current  = 0;
      completedSetRef.current = new Set();
      setRunning(false);
      setActiveIdx(null);
      setSecondsLeft(0);
      setCompletedSet(new Set());
    } else {
      // Shift completed indices around the removed slot
      const newCompleted = new Set<number>();
      completedSetRef.current.forEach(i => {
        if (i < idx) newCompleted.add(i);
        else if (i > idx) newCompleted.add(i - 1);
      });
      completedSetRef.current = newCompleted;
      setCompletedSet(new Set(newCompleted));
      // Shift activeIdx down if needed
      if (activeIdxRef.current !== null && idx < activeIdxRef.current) {
        activeIdxRef.current -= 1;
        setActiveIdx(activeIdxRef.current);
      }
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

  const handleTemplate = useCallback((key: string) => {
    const template = TEMPLATES[key];
    if (!template) return;
    const newPhases = makePhases(template);
    // Reset timer state
    runningRef.current      = false;
    activeIdxRef.current    = null;
    secondsLeftRef.current  = 0;
    completedSetRef.current = new Set();
    setRunning(false);
    setActiveIdx(null);
    setSecondsLeft(0);
    setCompletedSet(new Set());
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

    // Reset timer on reorder
    runningRef.current      = false;
    activeIdxRef.current    = null;
    secondsLeftRef.current  = 0;
    completedSetRef.current = new Set();
    setRunning(false);
    setActiveIdx(null);
    setSecondsLeft(0);
    setCompletedSet(new Set());

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
  const activePhase   = activeIdx !== null ? phases[activeIdx] : null;
  const totalDuration = phases.reduce((acc, p) => acc + p.durationSeconds, 0) || 1;

  const progress   = activePhase && secondsLeft > 0 ? secondsLeft / activePhase.durationSeconds : 0;
  const ringOffset = RING_CIRC * (1 - progress);
  const ringColor  = activePhase ? TYPE_COLORS[activePhase.type] : 'rgba(100,60,140,0.4)';
  const timerColor = activePhase ? TIMER_COLORS[activePhase.type] : 'rgba(207,245,255,0.25)';

  const digitsDisplay = isComplete
    ? '00:00'
    : activeIdx !== null
      ? fmtTime(secondsLeft)
      : '--:--';

  const labelDisplay = isComplete
    ? '✦ sequence complete'
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
                i === activeIdx     ? styles.active    : '',
                completedSet.has(i) ? styles.completed : '',
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
        <button
          className={styles.primaryBtn}
          onClick={running ? handlePause : handleStart}
          disabled={phases.length === 0}
        >
          {running ? '⏸ Pause' : '▶ Start'}
        </button>
        <button
          className={styles.secondaryBtn}
          onClick={handleSkip}
          disabled={activeIdx === null}
          title="Skip to next phase"
        >
          ⏭ Skip
        </button>
        <button
          className={styles.secondaryBtn}
          onClick={handleReset}
          title="Reset all"
        >
          ↺ Reset
        </button>
      </div>

      {/* ── SECTION 4 + 5: Phase Editor ── */}
      <div className={styles.editorSection}>

        {/* Quick-load templates (hidden while running) */}
        {!running && (
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

        {/* Phase rows */}
        <div className={styles.phaseList}>
          {phases.map((phase, i) => (
            <div
              key={phase.id}
              className={[
                styles.phaseRow,
                dragOverIdx === i ? styles.dragOver : '',
              ].filter(Boolean).join(' ')}
              draggable={!running}
              onDragStart={() => handleDragStart(i)}
              onDragOver={e => handleDragOver(e, i)}
              onDrop={() => handleDrop(i)}
              onDragLeave={() => setDragOverIdx(null)}
              onDragEnd={() => { setDragOverIdx(null); dragIdxRef.current = null; }}
            >
              {/* Drag handle */}
              <span
                className={[styles.dragHandle, running ? styles.disabledHandle : ''].filter(Boolean).join(' ')}
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
          ))}
        </div>

        {/* Add phase */}
        <button className={styles.addPhaseBtn} onClick={handleAddPhase}>
          + add phase
        </button>
      </div>
    </div>
  );
}
