mod tracker;

use std::sync::Mutex;
use tauri::Manager;
use tracker::{ActivityTracker, ActivityEntry, ActivityBlock};

/// Shared state for the activity tracker
struct TrackerState(Mutex<ActivityTracker>);

/// Start background activity tracking + persist preference
#[tauri::command]
fn start_tracking(state: tauri::State<'_, TrackerState>) -> Result<(), String> {
    let mut tracker = state.0.lock().map_err(|e| e.to_string())?;
    tracker.set_tracking_enabled(true);
    tracker.start();
    Ok(())
}

/// Stop background activity tracking + persist preference
#[tauri::command]
fn stop_tracking(state: tauri::State<'_, TrackerState>) -> Result<(), String> {
    let mut tracker = state.0.lock().map_err(|e| e.to_string())?;
    tracker.set_tracking_enabled(false);
    tracker.stop();
    Ok(())
}

/// Check if tracking is currently active
#[tauri::command]
fn is_tracking(state: tauri::State<'_, TrackerState>) -> Result<bool, String> {
    let tracker = state.0.lock().map_err(|e| e.to_string())?;
    Ok(tracker.is_running())
}

/// Get activity log for a date range
#[tauri::command]
fn get_activity_log(
    state: tauri::State<'_, TrackerState>,
    date_from: String,
    date_to: String,
) -> Result<Vec<ActivityEntry>, String> {
    let tracker = state.0.lock().map_err(|e| e.to_string())?;
    tracker.get_entries(&date_from, &date_to)
}

/// Get categorized activity summary for a date
#[tauri::command]
fn get_activity_summary(
    state: tauri::State<'_, TrackerState>,
    date: String,
) -> Result<Vec<tracker::CategorySummary>, String> {
    let tracker = state.0.lock().map_err(|e| e.to_string())?;
    tracker.get_summary(&date)
}

/// Get coalesced activity blocks for calendar display
#[tauri::command]
fn get_activity_blocks(
    state: tauri::State<'_, TrackerState>,
    date: String,
) -> Result<Vec<ActivityBlock>, String> {
    let tracker = state.0.lock().map_err(|e| e.to_string())?;
    tracker.get_activity_blocks(&date)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("failed to get app data dir");
            std::fs::create_dir_all(&app_dir).ok();
            let db_path = app_dir.join("activity.db");
            let mut tracker = ActivityTracker::new(db_path).expect("failed to init tracker");
            // Only auto-start if user previously opted in
            if tracker.is_tracking_enabled() {
                tracker.start();
            }
            app.manage(TrackerState(Mutex::new(tracker)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_tracking,
            stop_tracking,
            is_tracking,
            get_activity_log,
            get_activity_summary,
            get_activity_blocks,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
