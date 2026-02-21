// Chrono Sphere desktop — Tauri app entry point
mod timer;
use timer::{cancel_timer, start_timer_backend, CancelRegistry};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .manage(Arc::new(Mutex::new(HashMap::<String, bool>::new())) as CancelRegistry)
        .invoke_handler(tauri::generate_handler![start_timer_backend, cancel_timer])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
