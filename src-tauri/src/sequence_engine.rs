use serde::{Deserialize, Serialize};

use crate::timer_engine::MAX_SECONDS;

/// A fully resolved step: label, duration and tone are decided before the
/// sequence starts.
///
/// Previously the engine stored abstract step *types* and re-resolved their
/// durations from the user's presets on every transition, which meant editing a
/// preset mid-sequence silently changed the length of steps already in flight.
/// Resolving up front makes a running sequence immutable and lets arbitrary
/// user-authored phases share this one engine.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SequenceStep {
    pub label: String,
    pub seconds: u32,
    pub sound: String,
    pub notification: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sequence {
    pub id: String,
    pub name: String,
    pub steps: Vec<SequenceStep>,
    pub current_step: usize,
    pub loop_enabled: bool,
}

impl Sequence {
    pub fn new(
        id: String,
        name: String,
        steps: Vec<SequenceStep>,
        loop_enabled: bool,
    ) -> Result<Self, String> {
        if steps.is_empty() {
            return Err("Sequence has no steps".to_string());
        }
        let steps = steps
            .into_iter()
            .map(|mut s| {
                s.seconds = s.seconds.clamp(1, MAX_SECONDS);
                s
            })
            .collect();
        Ok(Sequence { id, name, steps, current_step: 0, loop_enabled })
    }

    /// The step now in flight. Returns None only if `current_step` was somehow
    /// pushed out of range — callers treat that as "sequence over" instead of panicking.
    pub fn current(&self) -> Option<&SequenceStep> {
        self.steps.get(self.current_step)
    }

    pub fn total_steps(&self) -> usize {
        self.steps.len()
    }

    /// Advance to the next step. Returns false when the sequence is finished.
    pub fn advance(&mut self) -> bool {
        let next = self.current_step + 1;
        if next < self.steps.len() {
            self.current_step = next;
            true
        } else if self.loop_enabled {
            self.current_step = 0;
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(label: &str, seconds: u32) -> SequenceStep {
        SequenceStep {
            label: label.into(),
            seconds,
            sound: "chime".into(),
            notification: format!("{label} complete!"),
        }
    }

    fn seq(loop_enabled: bool) -> Sequence {
        Sequence::new(
            "s1".into(),
            "Test".into(),
            vec![step("Focus", 1500), step("Break", 300)],
            loop_enabled,
        )
        .unwrap()
    }

    #[test]
    fn rejects_empty_sequence() {
        assert!(Sequence::new("s".into(), "n".into(), vec![], false).is_err());
    }

    #[test]
    fn clamps_out_of_range_durations() {
        let s = Sequence::new(
            "s".into(),
            "n".into(),
            vec![step("Zero", 0), step("Huge", u32::MAX)],
            false,
        )
        .unwrap();
        assert_eq!(s.steps[0].seconds, 1);
        assert_eq!(s.steps[1].seconds, MAX_SECONDS);
    }

    #[test]
    fn advances_linearly_then_stops() {
        let mut s = seq(false);
        assert_eq!(s.current().unwrap().label, "Focus");
        assert!(s.advance());
        assert_eq!(s.current().unwrap().label, "Break");
        assert!(!s.advance());
        // A finished sequence stays put no matter how often advance is called.
        assert!(!s.advance());
        assert_eq!(s.current_step, 1);
    }

    #[test]
    fn wraps_when_looping() {
        let mut s = seq(true);
        assert!(s.advance());
        assert!(s.advance());
        assert_eq!(s.current_step, 0);
        assert_eq!(s.current().unwrap().label, "Focus");
    }

    #[test]
    fn single_step_loop_repeats_itself() {
        let mut s = Sequence::new("s".into(), "n".into(), vec![step("Solo", 60)], true).unwrap();
        assert!(s.advance());
        assert_eq!(s.current_step, 0);
    }

    #[test]
    fn current_is_none_when_index_out_of_range() {
        let mut s = seq(false);
        s.current_step = 99;
        assert!(s.current().is_none());
    }
}
