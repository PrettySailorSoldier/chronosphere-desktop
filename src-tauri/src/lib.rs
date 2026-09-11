// Chrono Sphere desktop — Tauri app entry point (timer engine rebuild)
mod timer_engine;
mod sequence_engine;

use timer_engine::{
    lock_or_recover, new_shared_state, run_tick_loop, SharedTimerState, TimerState,
    MAX_CONCURRENT_TIMERS, MAX_SECONDS,
};
use sequence_engine::{Sequence, SequenceStep};

use tauri::{AppHandle, Emitter, State};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// Shared active sequences, keyed the same way as SharedTimerState (slot_key).
pub type SharedSequenceState = Arc<Mutex<HashMap<String, Sequence>>>;

fn new_shared_sequence() -> SharedSequenceState {
    Arc::new(Mutex::new(HashMap::new()))
}

/// Payload for the `sequence:step-started` event — the frontend needs the slot
/// id alongside the step index now that more than one sequence can be running.
#[derive(Clone, Serialize)]
struct SequenceStepStarted {
    id: String,
    step: usize,
}

fn cap_error() -> String {
    format!("Too many timers running (max {MAX_CONCURRENT_TIMERS}). Stop one first.")
}

// ─── Payloads sent from the frontend ──────────────────────────────────────────
// Steps arrive fully resolved (label + seconds + tone). The frontend owns preset
// values, so resolving there keeps a single source of truth and stops a preset
// edit from retroactively changing a sequence that is already running.

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SequenceStepInput {
    label: String,
    seconds: u32,
    #[serde(default)]
    sound: Option<String>,
    #[serde(default)]
    notification: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SequenceInput {
    id: String,
    name: String,
    steps: Vec<SequenceStepInput>,
    #[serde(default)]
    loop_enabled: bool,
}

impl From<SequenceStepInput> for SequenceStep {
    fn from(s: SequenceStepInput) -> Self {
        let label = if s.label.trim().is_empty() { "Step".to_string() } else { s.label };
        let notification = s
            .notification
            .filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| format!("{label} complete!"));
        SequenceStep {
            label,
            seconds: s.seconds,
            sound: s.sound.filter(|x| !x.is_empty()).unwrap_or_else(|| "chime".to_string()),
            notification,
        }
    }
}

/// Build the timer for whichever step a sequence is currently pointing at.
fn timer_for_current_step(sequence: &Sequence, start_paused: bool) -> Option<TimerState> {
    let step = sequence.current()?;
    Some(
        TimerState::new(
            format!("{}-step-{}", sequence.id, sequence.current_step),
            step.label.clone(),
            step.seconds,
            step.sound.clone(),
            step.notification.clone(),
            start_paused,
        )
        .with_sequence(
            sequence.id.clone(),
            sequence.current_step,
            sequence.total_steps(),
        ),
    )
}

// ═══════════════════════════════════════════════════
// TAURI COMMANDS — called from React via invoke()
// ═══════════════════════════════════════════════════
//
// The start/pause/resume/extend commands all return the resulting TimerState so
// the UI can render the new state immediately instead of guessing locally and
// waiting up to a tick for the engine to confirm it.

/// Start a standalone (non-sequence) timer. `id` is its slot key — starting
/// again with an id already in flight restarts that one slot rather than
/// adding a new one, so this never needs to touch any other running timer.
#[tauri::command]
fn cmd_start_timer(
    id: String,
    name: String,
    total_seconds: u32,
    sound_type: String,
    notification_msg: String,
    timer_state: State<SharedTimerState>,
) -> Result<TimerState, String> {
    if total_seconds == 0 {
        return Err("Timer duration must be greater than zero".to_string());
    }
    if total_seconds > MAX_SECONDS {
        return Err("Timer duration must be 24 hours or less".to_string());
    }

    let mut lock = lock_or_recover(&timer_state);
    if !lock.contains_key(&id) && lock.len() >= MAX_CONCURRENT_TIMERS {
        return Err(cap_error());
    }

    let new_timer = TimerState::new(id.clone(), name, total_seconds, sound_type, notification_msg, false);
    lock.insert(id, new_timer.clone());
    Ok(new_timer)
}

/// Start a sequence — loads the first step into the timer engine. The
/// sequence's own id is its slot key, so starting the same sequence again
/// while it's still running just restarts that one slot.
#[tauri::command]
fn cmd_start_sequence(
    sequence: SequenceInput,
    timer_state: State<SharedTimerState>,
    sequence_state: State<SharedSequenceState>,
) -> Result<TimerState, String> {
    let steps: Vec<SequenceStep> = sequence.steps.into_iter().map(Into::into).collect();
    let id = sequence.id.clone();
    let seq = Sequence::new(sequence.id, sequence.name, steps, sequence.loop_enabled)?;

    let new_timer = timer_for_current_step(&seq, false)
        .ok_or_else(|| "Sequence has no startable step".to_string())?;

    // Lock ordering is sequence-then-timer everywhere to avoid deadlock.
    let mut seq_lock = lock_or_recover(&sequence_state);
    let mut timer_lock = lock_or_recover(&timer_state);
    if !timer_lock.contains_key(&id) && timer_lock.len() >= MAX_CONCURRENT_TIMERS {
        return Err(cap_error());
    }
    seq_lock.insert(id.clone(), seq);
    timer_lock.insert(id, new_timer.clone());

    Ok(new_timer)
}

/// Advance to the next sequence step after the frontend acks a `timer:complete`.
///
/// `completed_step` is the step index the caller believes just finished. If it no
/// longer matches the engine's current step the call is a duplicate or a stale
/// ack (two windows, a skip racing the tick loop) and is ignored — without this
/// guard a doubled ack silently swallows a whole step.
#[tauri::command]
fn cmd_next_sequence_step(
    app: AppHandle,
    id: String,
    completed_step: Option<usize>,
    start_paused: bool,
    timer_state: State<SharedTimerState>,
    sequence_state: State<SharedSequenceState>,
) -> Result<Option<TimerState>, String> {
    let mut seq_lock = lock_or_recover(&sequence_state);
    let Some(sequence) = seq_lock.get_mut(&id) else {
        // Nothing to advance — a stop() that landed first, not an error worth surfacing.
        return Ok(None);
    };

    if let Some(expected) = completed_step {
        if expected != sequence.current_step {
            return Ok(None);
        }
    }

    if !sequence.advance() {
        seq_lock.remove(&id);
        drop(seq_lock);
        lock_or_recover(&timer_state).remove(&id);
        let _ = app.emit("sequence:complete", id);
        return Ok(None);
    }

    let step = sequence.current_step;
    let Some(new_timer) = timer_for_current_step(sequence, start_paused) else {
        seq_lock.remove(&id);
        drop(seq_lock);
        lock_or_recover(&timer_state).remove(&id);
        let _ = app.emit("sequence:complete", id);
        return Ok(None);
    };

    drop(seq_lock);
    lock_or_recover(&timer_state).insert(id.clone(), new_timer.clone());
    let _ = app.emit("sequence:step-started", SequenceStepStarted { id, step });
    Ok(Some(new_timer))
}

/// Pause a running timer — snapshots remaining time and drops the deadline
#[tauri::command]
fn cmd_pause_timer(id: String, timer_state: State<SharedTimerState>) -> Option<TimerState> {
    let mut lock = lock_or_recover(&timer_state);
    let timer = lock.get_mut(&id)?;
    timer.pause();
    Some(timer.clone())
}

/// Resume a paused timer
#[tauri::command]
fn cmd_resume_timer(id: String, timer_state: State<SharedTimerState>) -> Option<TimerState> {
    let mut lock = lock_or_recover(&timer_state);
    let timer = lock.get_mut(&id)?;
    timer.resume();
    Some(timer.clone())
}

/// Skip the remaining time on the current phase — completes it immediately.
///
/// The completion is tagged `skipped` so the frontend advances the sequence but
/// does not log it as finished work or play the completion tone.
#[tauri::command]
fn cmd_skip_timer(app: AppHandle, id: String, timer_state: State<SharedTimerState>) {
    let snapshot = {
        let mut lock = lock_or_recover(&timer_state);
        match lock.get_mut(&id) {
            // `complete` returns false if the tick loop already finished this
            // phase, so a skip landing at the buzzer cannot emit a second event.
            Some(timer) => timer.complete(true).then(|| timer.clone()),
            None => None,
        }
    };

    if let Some(snapshot) = snapshot {
        let _ = app.emit("timer:complete", snapshot);
    }
}

/// Change the completion tone of a timer (or a running sequence step).
/// The frontend used to only update its own copy of the state, so the choice
/// never reached the engine and the timer kept playing whatever tone it
/// started with.
#[tauri::command]
fn cmd_set_timer_sound(
    id: String,
    sound_type: String,
    timer_state: State<SharedTimerState>,
) -> Option<TimerState> {
    let mut lock = lock_or_recover(&timer_state);
    let timer = lock.get_mut(&id)?;
    timer.set_sound(sound_type);
    Some(timer.clone())
}

/// Adjust a running/paused timer by a signed delta (e.g. +60, -300)
#[tauri::command]
fn cmd_extend_timer(
    app: AppHandle,
    id: String,
    seconds: i64,
    timer_state: State<SharedTimerState>,
) -> Option<TimerState> {
    let snapshot = {
        let mut lock = lock_or_recover(&timer_state);
        match lock.get_mut(&id) {
            Some(timer) => timer.extend(seconds).then(|| timer.clone()),
            None => None,
        }
    };

    if let Some(ref snapshot) = snapshot {
        let _ = app.emit("timer:tick", snapshot.clone());
    }
    snapshot
}

/// Stop and clear one timer/sequence slot, leaving every other slot untouched.
#[tauri::command]
fn cmd_stop_timer(
    id: String,
    timer_state: State<SharedTimerState>,
    sequence_state: State<SharedSequenceState>,
) {
    lock_or_recover(&sequence_state).remove(&id);
    lock_or_recover(&timer_state).remove(&id);
}

/// List every active timer/sequence slot (used for UI rehydration on window open).
///
/// Syncs each entry against the wall clock first so a window reopened after the
/// machine slept sees the true remaining time rather than a stale snapshot.
#[tauri::command]
fn cmd_list_timer_states(timer_state: State<SharedTimerState>) -> Vec<TimerState> {
    let mut lock = lock_or_recover(&timer_state);
    lock.values_mut()
        .map(|timer| {
            timer.sync_remaining();
            timer.clone()
        })
        .collect()
}

// ═══════════════════════════════════════════════════
// APP ENTRY POINT
// ═══════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let timer_state = new_shared_state();
    let sequence_state = new_shared_sequence();
    let timer_state_for_thread = Arc::clone(&timer_state);

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .manage(timer_state)
        .manage(sequence_state)
        .invoke_handler(tauri::generate_handler![
            cmd_start_timer,
            cmd_start_sequence,
            cmd_next_sequence_step,
            cmd_pause_timer,
            cmd_resume_timer,
            cmd_skip_timer,
            cmd_set_timer_sound,
            cmd_extend_timer,
            cmd_stop_timer,
            cmd_list_timer_states,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            // Spawn the tick loop as a background async task
            tauri::async_runtime::spawn(async move {
                run_tick_loop(app_handle, timer_state_for_thread).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
