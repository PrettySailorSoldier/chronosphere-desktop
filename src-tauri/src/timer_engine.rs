use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::time;
use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};

/// How often the engine re-reads the wall clock. Finer than 1s so the displayed
/// second flips close to the real boundary instead of drifting up to a second late.
const TICK_INTERVAL_MS: u64 = 200;

/// Hard ceiling on any single timer (24h), applied to both duration and extensions.
pub const MAX_SECONDS: u32 = 86_400;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
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
    /// True when this phase ended because the user skipped it rather than because
    /// it ran out of time. The frontend uses this to avoid logging skipped phases
    /// as completed work and to stay quiet instead of playing the completion tone.
    pub skipped: bool,

    /// Wall-clock deadline as unix epoch milliseconds. `Some` only while Running.
    ///
    /// This — not a tick counter — is the source of truth for how much time is
    /// left. Counting ticks loses time whenever the machine suspends or the async
    /// runtime is starved; reading the wall clock does not.
    #[serde(skip)]
    pub ends_at_ms: Option<u128>,
}

impl TimerState {
    pub fn new(
        id: String,
        name: String,
        total_seconds: u32,
        sound_type: String,
        notification_msg: String,
        start_paused: bool,
    ) -> Self {
        let total = total_seconds.clamp(1, MAX_SECONDS);
        let mut timer = TimerState {
            id,
            name,
            phase: if start_paused { TimerPhase::Paused } else { TimerPhase::Running },
            total_seconds: total,
            remaining_seconds: total,
            sound_type,
            notification_msg,
            sequence_id: None,
            sequence_step: None,
            sequence_total_steps: None,
            skipped: false,
            ends_at_ms: None,
        };
        if !start_paused {
            timer.arm();
        }
        timer
    }

    pub fn with_sequence(mut self, id: String, step: usize, total_steps: usize) -> Self {
        self.sequence_id = Some(id);
        self.sequence_step = Some(step);
        self.sequence_total_steps = Some(total_steps);
        self
    }

    /// Anchor the current `remaining_seconds` to a fresh wall-clock deadline.
    fn arm(&mut self) {
        self.ends_at_ms = Some(now_ms() + (self.remaining_seconds as u128) * 1000);
    }

    pub fn is_active(&self) -> bool {
        matches!(self.phase, TimerPhase::Running | TimerPhase::Paused)
    }

    /// Recompute `remaining_seconds` from the wall-clock deadline.
    /// Returns true when the displayed second changed.
    pub fn sync_remaining(&mut self) -> bool {
        if self.phase != TimerPhase::Running {
            return false;
        }
        let Some(ends_at) = self.ends_at_ms else {
            // Running without a deadline should be impossible; re-arm rather than
            // leaving the timer wedged.
            self.arm();
            return false;
        };

        let now = now_ms();
        let remaining = if ends_at > now {
            // Round up so the display reads "25:00" for the whole first second
            // rather than flicking to 24:59 immediately.
            ((ends_at - now) as f64 / 1000.0).ceil() as u32
        } else {
            0
        };

        let changed = remaining != self.remaining_seconds;
        self.remaining_seconds = remaining;
        changed
    }

    pub fn pause(&mut self) -> bool {
        if self.phase != TimerPhase::Running {
            return false;
        }
        self.sync_remaining();
        self.phase = TimerPhase::Paused;
        self.ends_at_ms = None;
        true
    }

    pub fn resume(&mut self) -> bool {
        if self.phase != TimerPhase::Paused {
            return false;
        }
        if self.remaining_seconds == 0 {
            return false;
        }
        self.phase = TimerPhase::Running;
        self.arm();
        true
    }

    /// Adjust a running or paused timer by a signed number of seconds.
    ///
    /// Signed so the same path serves "+5m" and "−5m". Arithmetic goes through
    /// i64 and clamps: `remaining + seconds` in u32 would overflow and panic in
    /// debug, and subtraction can never drive a timer to 0 by accident — ending
    /// early is what Skip is for. Returns false if the phase does not allow it.
    pub fn extend(&mut self, delta_seconds: i64) -> bool {
        if !self.is_active() {
            return false;
        }
        self.sync_remaining();
        let apply = |value: u32| -> u32 {
            (value as i64)
                .saturating_add(delta_seconds)
                .clamp(1, MAX_SECONDS as i64) as u32
        };
        self.remaining_seconds = apply(self.remaining_seconds);
        // Keep total >= remaining so the progress ring never exceeds 100%.
        self.total_seconds = apply(self.total_seconds).max(self.remaining_seconds);
        if self.phase == TimerPhase::Running {
            self.arm();
        }
        true
    }

    /// Move to Complete exactly once. Returns false if it was already complete,
    /// which is what stops a skip racing the tick loop into a double completion.
    pub fn complete(&mut self, skipped: bool) -> bool {
        if self.phase == TimerPhase::Complete {
            return false;
        }
        self.phase = TimerPhase::Complete;
        self.remaining_seconds = 0;
        self.ends_at_ms = None;
        self.skipped = skipped;
        true
    }
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

// Shared mutable state wrapped in Arc<Mutex<>>
pub type SharedTimerState = Arc<Mutex<Option<TimerState>>>;

pub fn new_shared_state() -> SharedTimerState {
    Arc::new(Mutex::new(None))
}

/// Lock that survives a poisoned mutex.
///
/// A panic anywhere while the timer lock was held would otherwise poison it and
/// make every later `lock().unwrap()` panic too — one transient bug would brick
/// the whole app until restart. The guarded data is a plain state snapshot, so
/// recovering the inner value is safe.
pub fn lock_or_recover<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Spawns the authoritative tick loop. Runs for the lifetime of the app.
///
/// It never mutates elapsed time itself — it only re-derives `remaining_seconds`
/// from the deadline and emits when the visible value changes.
pub async fn run_tick_loop(app: AppHandle, state: SharedTimerState) {
    let mut interval = time::interval(Duration::from_millis(TICK_INTERVAL_MS));
    interval.set_missed_tick_behavior(time::MissedTickBehavior::Skip);

    loop {
        interval.tick().await;

        // Collect what to emit while holding the lock, then emit after releasing it.
        let mut tick_event: Option<TimerState> = None;
        let mut complete_event: Option<TimerState> = None;

        {
            let mut lock = lock_or_recover(&state);
            if let Some(timer) = lock.as_mut() {
                if timer.phase == TimerPhase::Running {
                    let changed = timer.sync_remaining();
                    if timer.remaining_seconds == 0 {
                        if timer.complete(false) {
                            complete_event = Some(timer.clone());
                        }
                    } else if changed {
                        tick_event = Some(timer.clone());
                    }
                }
            }
        }

        if let Some(snapshot) = complete_event {
            let _ = app.emit("timer:complete", snapshot);
        } else if let Some(snapshot) = tick_event {
            let _ = app.emit("timer:tick", snapshot);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn timer(seconds: u32) -> TimerState {
        TimerState::new(
            "t1".into(),
            "Test".into(),
            seconds,
            "chime".into(),
            "done".into(),
            false,
        )
    }

    #[test]
    fn starts_running_and_armed() {
        let t = timer(60);
        assert_eq!(t.phase, TimerPhase::Running);
        assert_eq!(t.remaining_seconds, 60);
        assert!(t.ends_at_ms.is_some());
    }

    #[test]
    fn zero_duration_is_clamped_up() {
        // A 0s timer would otherwise sit at Running/0 forever, never completing.
        let t = timer(0);
        assert_eq!(t.total_seconds, 1);
    }

    #[test]
    fn pause_clears_deadline_and_resume_rearms() {
        let mut t = timer(60);
        assert!(t.pause());
        assert_eq!(t.phase, TimerPhase::Paused);
        assert!(t.ends_at_ms.is_none());
        // A paused timer must not lose time as the wall clock advances.
        std::thread::sleep(Duration::from_millis(30));
        assert_eq!(t.remaining_seconds, 60);
        assert!(t.resume());
        assert!(t.ends_at_ms.is_some());
    }

    #[test]
    fn pause_is_idempotent() {
        let mut t = timer(60);
        assert!(t.pause());
        assert!(!t.pause());
    }

    #[test]
    fn complete_only_fires_once() {
        let mut t = timer(60);
        assert!(t.complete(true));
        assert!(!t.complete(false));
        // The first completion's reason wins — a racing tick cannot relabel a skip.
        assert!(t.skipped);
        assert_eq!(t.remaining_seconds, 0);
    }

    #[test]
    fn extend_saturates_instead_of_overflowing() {
        let mut t = timer(60);
        assert!(t.extend(i64::MAX));
        assert_eq!(t.remaining_seconds, MAX_SECONDS);
        assert_eq!(t.total_seconds, MAX_SECONDS);
    }

    #[test]
    fn extend_accepts_negative_delta() {
        let mut t = timer(600);
        assert!(t.extend(-300));
        assert_eq!(t.remaining_seconds, 300);
    }

    #[test]
    fn extend_never_drives_below_one_second() {
        let mut t = timer(60);
        assert!(t.extend(-6_000));
        assert_eq!(t.remaining_seconds, 1);
        assert_eq!(t.phase, TimerPhase::Running);
    }

    #[test]
    fn extend_keeps_total_at_least_remaining() {
        let mut t = timer(60);
        t.extend(300);
        assert!(t.total_seconds >= t.remaining_seconds);
    }

    #[test]
    fn extend_rejected_once_complete() {
        let mut t = timer(60);
        t.complete(false);
        assert!(!t.extend(60));
    }

    #[test]
    fn remaining_is_derived_from_wall_clock() {
        let mut t = timer(10);
        // Backdate the deadline by 4s: 6s should remain regardless of tick count.
        t.ends_at_ms = Some(t.ends_at_ms.unwrap() - 4_000);
        assert!(t.sync_remaining());
        assert_eq!(t.remaining_seconds, 6);
    }

    #[test]
    fn elapsed_deadline_drives_to_zero() {
        let mut t = timer(10);
        t.ends_at_ms = Some(t.ends_at_ms.unwrap() - 60_000);
        t.sync_remaining();
        assert_eq!(t.remaining_seconds, 0);
    }
}
