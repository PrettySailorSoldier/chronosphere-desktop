use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum StepType {
    Pomodoro,
    ShortBreak,
    LongBreak,
    DeepWork,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sequence {
    pub id: String,
    pub name: String,
    pub steps: Vec<StepType>,
    pub current_step: usize,
    pub loop_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Presets {
    pub pomodoro: u32,
    pub short_break: u32,
    pub long_break: u32,
    pub deep_work: u32,
}

impl Default for Presets {
    fn default() -> Self {
        Presets {
            pomodoro: 25,
            short_break: 5,
            long_break: 15,
            deep_work: 52,
        }
    }
}

impl Sequence {
    /// Returns the duration in seconds for the current step using provided presets.
    pub fn current_step_seconds(&self, presets: &Presets) -> u32 {
        match &self.steps[self.current_step] {
            StepType::Pomodoro   => presets.pomodoro   * 60,
            StepType::ShortBreak => presets.short_break * 60,
            StepType::LongBreak  => presets.long_break  * 60,
            StepType::DeepWork   => presets.deep_work   * 60,
        }
    }

    /// Returns the display name for the current step.
    pub fn current_step_name(&self) -> &'static str {
        match &self.steps[self.current_step] {
            StepType::Pomodoro   => "Pomodoro",
            StepType::ShortBreak => "Short Break",
            StepType::LongBreak  => "Long Break",
            StepType::DeepWork   => "Deep Work",
        }
    }

    /// Returns the sound type for the current step.
    pub fn current_step_sound(&self) -> &'static str {
        match &self.steps[self.current_step] {
            StepType::Pomodoro | StepType::DeepWork => "chime",
            StepType::ShortBreak | StepType::LongBreak => "water",
        }
    }

    /// Advances to the next step. Returns true if there is a next step, false if sequence is done.
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

    /// Returns true if current step is the last one and loop is disabled.
    pub fn is_final_step(&self) -> bool {
        self.current_step + 1 >= self.steps.len() && !self.loop_enabled
    }
}
