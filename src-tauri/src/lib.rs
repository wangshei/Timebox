mod tracker;

use std::sync::Mutex;
use tauri::Manager;
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
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

/// Check if we can read the active window (Accessibility permission check).
#[tauri::command]
fn check_accessibility() -> Result<bool, String> {
    // Use std::thread to avoid potential issues with calling this on the main thread
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let result = match active_win_pos_rs::get_active_window() {
            Ok(_) => true,
            Err(_) => false,
        };
        let _ = tx.send(result);
    });
    match rx.recv_timeout(std::time::Duration::from_secs(3)) {
        Ok(v) => Ok(v),
        Err(_) => Ok(false),
    }
}

/// Get the number of app/tab switches for a given date
#[tauri::command]
fn get_switch_count(
    state: tauri::State<'_, TrackerState>,
    date: String,
) -> Result<i64, String> {
    let tracker = state.0.lock().map_err(|e| e.to_string())?;
    tracker.get_switch_count(&date)
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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

            // System tray — keeps app alive when window is closed
            let show = MenuItemBuilder::with_id("show", "Show Window").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show)
                .separator()
                .item(&quit)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().expect("no app icon"))
                .tooltip("The Timeboxing Club")
                .menu(&menu)
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // Click tray icon to show/focus window
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        if let Some(win) = tray.app_handle().get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide window instead of quitting when user closes it
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            start_tracking,
            stop_tracking,
            is_tracking,
            get_activity_log,
            get_activity_summary,
            get_activity_blocks,
            get_switch_count,
            check_accessibility,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
