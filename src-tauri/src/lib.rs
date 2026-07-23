// Chrono Sphere desktop — Tauri app entry point (timer engine rebuild)
mod timer_engine;
mod sequence_engine;

use timer_engine::{new_shared_state, run_tick_loop, SharedTimerState, TimerState, TimerPhase};
use sequence_engine::{Sequence, Presets, StepType};

use tauri::{AppHandle, Emitter, State};
use std::sync::{Arc, Mutex};

// Shared active sequence state
pub type SharedSequenceState = Arc<Mutex<Option<Sequence>>>;

fn new_shared_sequence() -> SharedSequenceState {
    Arc::new(Mutex::new(None))
}

// ─── JSON step-type helper ────────────────────────────────────────────────────
// Frontend sends camelCase step types, we convert them to the Rust enum.
fn parse_step_type(s: &str) -> Option<StepType> {
    match s {
        "pomodoro"   => Some(StepType::Pomodoro),
        "shortBreak" => Some(StepType::ShortBreak),
        "longBreak"  => Some(StepType::LongBreak),
        "deepWork"   => Some(StepType::DeepWork),
        _            => None,
    }
}

// ─── Raw JSON types for receiving sequence from frontend ──────────────────────
#[derive(serde::Deserialize)]
struct SequenceRaw {
    id: String,
    name: String,
    steps: Vec<String>,
    #[serde(rename = "loop")]
    loop_enabled: bool,
}

#[derive(serde::Deserialize, Default)]
struct PresetsRaw {
    pomodoro:    Option<u32>,
    #[serde(rename = "short_break")]
    short_break: Option<u32>,
    #[serde(rename = "long_break")]
    long_break:  Option<u32>,
    #[serde(rename = "deep_work")]
    deep_work:   Option<u32>,
}

impl From<PresetsRaw> for Presets {
    fn from(r: PresetsRaw) -> Self {
        Presets {
            pomodoro:    r.pomodoro.unwrap_or(25),
            short_break: r.short_break.unwrap_or(5),
            long_break:  r.long_break.unwrap_or(15),
            deep_work:   r.deep_work.unwrap_or(52),
        }
    }
}

// ═══════════════════════════════════════════════════
// TAURI COMMANDS — called from React via invoke()
// ═══════════════════════════════════════════════════

/// Start a standalone (non-sequence) timer
#[tauri::command]
fn cmd_start_timer(
    id: String,
    name: String,
    total_seconds: u32,
    sound_type: String,
    notification_msg: String,
    timer_state: State<SharedTimerState>,
    sequence_state: State<SharedSequenceState>,
) {
    // Clear any active sequence
    *sequence_state.lock().unwrap() = None;

    let new_timer = TimerState {
        id,
        name,
        phase: TimerPhase::Running,
        total_seconds,
        remaining_seconds: total_seconds,
        sound_type,
        notification_msg,
        sequence_id: None,
        sequence_step: None,
        sequence_total_steps: None,
    };
    *timer_state.lock().unwrap() = Some(new_timer);
}

/// Start a sequence — loads first step into the timer engine
#[tauri::command]
fn cmd_start_sequence(
    sequence_json: String,
    presets_json: String,
    timer_state: State<SharedTimerState>,
    sequence_state: State<SharedSequenceState>,
) -> Result<(), String> {
    let raw: SequenceRaw = serde_json::from_str(&sequence_json)
        .map_err(|e| format!("Invalid sequence JSON: {e}"))?;

    let steps: Vec<StepType> = raw.steps.iter()
        .filter_map(|s| parse_step_type(s))
        .collect();

    if steps.is_empty() {
        return Err("Sequence has no valid steps".to_string());
    }

    let sequence = Sequence {
        id: raw.id,
        name: raw.name,
        steps,
        current_step: 0,
        loop_enabled: raw.loop_enabled,
    };

    let presets: Presets = serde_json::from_str::<PresetsRaw>(&presets_json)
        .unwrap_or_default()
        .into();

    let total_seconds = sequence.current_step_seconds(&presets);
    let name = sequence.current_step_name().to_string();
    let sound = sequence.current_step_sound().to_string();
    let step = sequence.current_step;
    let total_steps = sequence.steps.len();
    let seq_id = sequence.id.clone();

    let new_timer = TimerState {
        id: format!("{}-step-{}", seq_id, step),
        name,
        phase: TimerPhase::Running,
        total_seconds,
        remaining_seconds: total_seconds,
        sound_type: sound,
        notification_msg: format!("{} complete!", sequence.current_step_name()),
        sequence_id: Some(seq_id),
        sequence_step: Some(step),
        sequence_total_steps: Some(total_steps),
    };

    *sequence_state.lock().unwrap() = Some(sequence);
    *timer_state.lock().unwrap() = Some(new_timer);

    Ok(())
}

/// Advance to next sequence step after frontend acks a timer:complete event
#[tauri::command]
fn cmd_next_sequence_step(
    app: AppHandle,
    presets_json: String,
    timer_state: State<SharedTimerState>,
    sequence_state: State<SharedSequenceState>,
) -> Result<bool, String> {
    let presets: Presets = serde_json::from_str::<PresetsRaw>(&presets_json)
        .unwrap_or_default()
        .into();

    let mut seq_lock = sequence_state.lock().unwrap();
    if let Some(ref mut sequence) = *seq_lock {
        let has_next = sequence.advance();
        if has_next {
            let total_seconds = sequence.current_step_seconds(&presets);
            let name = sequence.current_step_name().to_string();
            let sound = sequence.current_step_sound().to_string();
            let step = sequence.current_step;
            let total_steps = sequence.steps.len();
            let seq_id = sequence.id.clone();

            let new_timer = TimerState {
                id: format!("{}-step-{}", seq_id, step),
                name,
                phase: TimerPhase::Running,
                total_seconds,
                remaining_seconds: total_seconds,
                sound_type: sound,
                notification_msg: format!("{} complete!", sequence.current_step_name()),
                sequence_id: Some(seq_id),
                sequence_step: Some(step),
                sequence_total_steps: Some(total_steps),
            };
            *timer_state.lock().unwrap() = Some(new_timer);
            let _ = app.emit("sequence:step-started", step);
            Ok(true)
        } else {
            // Sequence finished
            *timer_state.lock().unwrap() = None;
            let _ = app.emit("sequence:complete", ());
            Ok(false)
        }
    } else {
        Err("No active sequence".to_string())
    }
}

/// Pause the running timer — snapshots remaining_seconds
#[tauri::command]
fn cmd_pause_timer(timer_state: State<SharedTimerState>) {
    let mut lock = timer_state.lock().unwrap();
    if let Some(ref mut timer) = *lock {
        if timer.phase == TimerPhase::Running {
            timer.phase = TimerPhase::Paused;
        }
    }
}

/// Resume a paused timer
#[tauri::command]
fn cmd_resume_timer(timer_state: State<SharedTimerState>) {
    let mut lock = timer_state.lock().unwrap();
    if let Some(ref mut timer) = *lock {
        if timer.phase == TimerPhase::Paused {
            timer.phase = TimerPhase::Running;
        }
    }
}

/// Skip remaining time on current phase — immediately triggers completion
#[tauri::command]
fn cmd_skip_timer(
    app: AppHandle,
    timer_state: State<SharedTimerState>,
) {
    let mut lock = timer_state.lock().unwrap();
    if let Some(ref mut timer) = *lock {
        timer.remaining_seconds = 0;
        timer.phase = TimerPhase::Complete;
        let snapshot = timer.clone();
        drop(lock);
        let _ = app.emit("timer:complete", snapshot);
    }
}

/// Add time to the running/paused timer (e.g. +1 min, +5 min)
#[tauri::command]
fn cmd_extend_timer(
    app: AppHandle,
    seconds: u32,
    timer_state: State<SharedTimerState>,
) {
    let mut lock = timer_state.lock().unwrap();
    if let Some(ref mut timer) = *lock {
        if timer.phase == TimerPhase::Running || timer.phase == TimerPhase::Paused {
            const MAX_SECONDS: u32 = 86_400;
            timer.remaining_seconds = (timer.remaining_seconds + seconds).min(MAX_SECONDS);
            timer.total_seconds = (timer.total_seconds + seconds).min(MAX_SECONDS);
            let snapshot = timer.clone();
            drop(lock);
            let _ = app.emit("timer:tick", snapshot);
        }
    }
}

/// Stop and clear everything
#[tauri::command]
fn cmd_stop_timer(
    timer_state: State<SharedTimerState>,
    sequence_state: State<SharedSequenceState>,
) {
    *timer_state.lock().unwrap() = None;
    *sequence_state.lock().unwrap() = None;
}

/// Get current timer state snapshot (used for UI rehydration on window open)
#[tauri::command]
fn cmd_get_timer_state(timer_state: State<SharedTimerState>) -> Option<TimerState> {
    timer_state.lock().unwrap().clone()
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
            cmd_extend_timer,
            cmd_stop_timer,
            cmd_get_timer_state,
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
