use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::time;
use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TimerPhase {
    Idle,
    Running,
    Paused,
    Complete,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerState {
    pub id: String,
    pub name: String,
    pub phase: TimerPhase,
    pub total_seconds: u32,
    pub remaining_seconds: u32,
    pub sound_type: String,
    pub notification_msg: String,
    // Sequence metadata (None if standalone timer)
    pub sequence_id: Option<String>,
    pub sequence_step: Option<usize>,
    pub sequence_total_steps: Option<usize>,
}

// Shared mutable state wrapped in Arc<Mutex<>>
pub type SharedTimerState = Arc<Mutex<Option<TimerState>>>;

pub fn new_shared_state() -> SharedTimerState {
    Arc::new(Mutex::new(None))
}

/// Spawns the authoritative 1-second tick loop.
/// This task runs for the lifetime of the app.
/// It reads SharedTimerState, counts down, and emits events to the frontend.
pub async fn run_tick_loop(app: AppHandle, state: SharedTimerState) {
    let mut interval = time::interval(Duration::from_secs(1));
    interval.set_missed_tick_behavior(time::MissedTickBehavior::Skip);

    loop {
        interval.tick().await;

        let mut lock = state.lock().unwrap();
        if let Some(ref mut timer) = *lock {
            if timer.phase != TimerPhase::Running {
                continue;
            }

            if timer.remaining_seconds == 0 {
                // Already complete — wait for frontend to ack
                continue;
            }

            timer.remaining_seconds = timer.remaining_seconds.saturating_sub(1);

            if timer.remaining_seconds == 0 {
                timer.phase = TimerPhase::Complete;
                let snapshot = timer.clone();
                drop(lock); // Release before emitting
                let _ = app.emit("timer:complete", snapshot);
            } else {
                let snapshot = timer.clone();
                drop(lock);
                let _ = app.emit("timer:tick", snapshot);
            }
        }
        // If lock is None, loop idles silently
    }
}
