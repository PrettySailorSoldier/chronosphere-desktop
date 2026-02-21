use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

// Global cancellation registry: timer_id -> cancelled flag
pub type CancelRegistry = Arc<Mutex<HashMap<String, bool>>>;

pub fn get_cancel_registry(app: &AppHandle) -> CancelRegistry {
    app.state::<CancelRegistry>().inner().clone()
}

#[tauri::command]
pub async fn start_timer_backend(
    app: AppHandle,
    duration_seconds: u32,
    timer_id: String,
    timer_name: String,
) {
    let registry = get_cancel_registry(&app);

    // Register this timer as active (not cancelled)
    {
        let mut reg = registry.lock().unwrap();
        reg.insert(timer_id.clone(), false);
    }

    let handle = app.clone();
    let id = timer_id.clone();

    tokio::spawn(async move {
        let mut remaining = duration_seconds;
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;

            // Check if cancelled
            {
                let reg = registry.lock().unwrap();
                if reg.get(&id).copied().unwrap_or(true) {
                    // Cancelled — clean up and exit
                    drop(reg);
                    let mut reg = registry.lock().unwrap();
                    reg.remove(&id);
                    return;
                }
            }

            if remaining == 0 {
                handle
                    .emit(
                        "timer-complete",
                        serde_json::json!({ "timerId": id, "timerName": timer_name }),
                    )
                    .ok();
                let mut reg = registry.lock().unwrap();
                reg.remove(&id);
                break;
            }

            remaining = remaining.saturating_sub(1);
            handle
                .emit(
                    "timer-tick",
                    serde_json::json!({ "timerId": id, "remaining": remaining }),
                )
                .ok();
        }
    });
}

#[tauri::command]
pub async fn cancel_timer(app: AppHandle, timer_id: String) {
    let registry = get_cancel_registry(&app);
    let mut reg = registry.lock().unwrap();
    if let Some(flag) = reg.get_mut(&timer_id) {
        *flag = true;
    }
}
