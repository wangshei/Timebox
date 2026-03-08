use active_win_pos_rs::get_active_window as get_active_win;
use chrono::Local;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

/// Get seconds since last user keyboard/mouse input using macOS IOKit.
/// Returns None if the call fails.
#[cfg(target_os = "macos")]
fn get_system_idle_secs() -> Option<u64> {
    use std::ffi::CStr;
    use std::ptr;
    extern "C" {
        fn IOServiceGetMatchingService(masterPort: u32, matching: *const std::ffi::c_void) -> u32;
        fn IOServiceMatching(name: *const i8) -> *const std::ffi::c_void;
        fn IORegistryEntryCreateCFProperties(
            entry: u32,
            properties: *mut *mut std::ffi::c_void,
            allocator: *const std::ffi::c_void,
            options: u32,
        ) -> i32;
        fn IOObjectRelease(object: u32) -> i32;
        fn CFDictionaryGetValue(dict: *const std::ffi::c_void, key: *const std::ffi::c_void) -> *const std::ffi::c_void;
        fn CFNumberGetValue(number: *const std::ffi::c_void, theType: i32, valuePtr: *mut i64) -> bool;
        fn CFRelease(cf: *const std::ffi::c_void);
        fn CFStringCreateWithCString(alloc: *const std::ffi::c_void, cstr: *const i8, encoding: u32) -> *const std::ffi::c_void;
    }
    unsafe {
        let name = CStr::from_bytes_with_nul(b"IOHIDSystem\0").unwrap();
        let matching = IOServiceMatching(name.as_ptr());
        if matching.is_null() { return None; }
        let service = IOServiceGetMatchingService(0, matching);
        if service == 0 { return None; }
        let mut props: *mut std::ffi::c_void = ptr::null_mut();
        let kr = IORegistryEntryCreateCFProperties(service, &mut props, ptr::null(), 0);
        IOObjectRelease(service);
        if kr != 0 || props.is_null() { return None; }
        let key_str = CStr::from_bytes_with_nul(b"HIDIdleTime\0").unwrap();
        let cf_key = CFStringCreateWithCString(ptr::null(), key_str.as_ptr(), 0x08000100); // kCFStringEncodingUTF8
        if cf_key.is_null() { CFRelease(props); return None; }
        let value = CFDictionaryGetValue(props, cf_key);
        CFRelease(cf_key);
        if value.is_null() { CFRelease(props); return None; }
        let mut idle_ns: i64 = 0;
        // kCFNumberSInt64Type = 4
        let ok = CFNumberGetValue(value, 4, &mut idle_ns);
        CFRelease(props);
        if !ok { return None; }
        Some(idle_ns.max(0) as u64 / 1_000_000_000) // nanoseconds → seconds
    }
}

#[cfg(not(target_os = "macos"))]
fn get_system_idle_secs() -> Option<u64> {
    None // Not implemented for other platforms yet
}

/// A merged activity entry (heartbeats collapsed)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityEntry {
    pub id: i64,
    pub app_name: String,
    pub window_title: String,
    pub category: String,
    pub start_time: String,   // ISO 8601
    pub end_time: String,     // ISO 8601
    pub duration_secs: i64,
    pub date: String,         // YYYY-MM-DD
}

/// Summary of time spent per category
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategorySummary {
    pub category: String,
    pub total_minutes: f64,
    pub app_details: Vec<AppDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppDetail {
    pub app_name: String,
    pub minutes: f64,
}

/// Validate YYYY-MM-DD format
fn is_valid_date(s: &str) -> bool {
    chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok()
}

/// Categorize an app name into a high-level category
fn categorize_app(app_name: &str, window_title: &str) -> String {
    let app = app_name.to_lowercase();
    let title = window_title.to_lowercase();

    // AI Agent — detect by terminal/editor title patterns that indicate an AI tool is active
    let is_terminal = app.contains("terminal") || app.contains("iterm") || app.contains("warp");
    if is_terminal && (title.contains("claude") || title.contains("aider")) {
        return "AI Agent".to_string();
    }
    if app.contains("cursor") && (title.contains("composer") || title.contains("chat") || title.contains("agent")) {
        return "AI Agent".to_string();
    }

    // Coding
    if app.contains("code") || app.contains("cursor") || app.contains("intellij")
        || app.contains("xcode") || app.contains("terminal") || app.contains("iterm")
        || app.contains("warp") || app.contains("vim") || app.contains("emacs")
        || app.contains("sublime") || app.contains("webstorm") || app.contains("pycharm")
    {
        return "Coding".to_string();
    }

    // Browsing (check title for common sites)
    if app.contains("chrome") || app.contains("firefox") || app.contains("safari")
        || app.contains("arc") || app.contains("brave") || app.contains("edge")
    {
        if title.contains("github") || title.contains("stackoverflow") || title.contains("docs") {
            return "Coding".to_string();
        }
        if title.contains("youtube") || title.contains("netflix") || title.contains("twitch")
            || title.contains("reddit") || title.contains("twitter") || title.contains("instagram")
        {
            return "Entertainment".to_string();
        }
        if title.contains("gmail") || title.contains("mail") || title.contains("outlook")
            || title.contains("slack") || title.contains("discord") || title.contains("teams")
        {
            return "Communication".to_string();
        }
        if title.contains("docs.google") || title.contains("notion") || title.contains("confluence") {
            return "Writing".to_string();
        }
        return "Browsing".to_string();
    }

    // Communication
    if app.contains("slack") || app.contains("discord") || app.contains("teams")
        || app.contains("zoom") || app.contains("messages") || app.contains("telegram")
        || app.contains("whatsapp") || app.contains("mail") || app.contains("wechat")
    {
        return "Communication".to_string();
    }

    // Design
    if app.contains("figma") || app.contains("sketch") || app.contains("photoshop")
        || app.contains("illustrator") || app.contains("canva") || app.contains("framer")
    {
        return "Design".to_string();
    }

    // Writing / Docs
    if app.contains("notion") || app.contains("obsidian") || app.contains("word")
        || app.contains("pages") || app.contains("google docs") || app.contains("notes")
    {
        return "Writing".to_string();
    }

    // Music
    if app.contains("spotify") || app.contains("music") || app.contains("soundcloud") {
        return "Music".to_string();
    }

    // System / Other
    if app.contains("finder") || app.contains("system") || app.contains("preview")
        || app.contains("activity monitor")
    {
        return "System".to_string();
    }

    "Other".to_string()
}

/// Signals collected during a segment to refine AI Agent categorization
#[derive(Default)]
struct SegmentSignals {
    /// Number of times the window title changed while the app stayed the same
    title_changes: u32,
    /// Number of polls where keyboard/mouse was idle (>10s since last input)
    input_idle_polls: u32,
    /// Total polls in this segment
    total_polls: u32,
}

/// Write a completed activity segment to the database
fn flush_segment(
    conn: &Connection,
    app_name: &str,
    window_title: &str,
    base_category: &str,
    start: chrono::DateTime<chrono::Local>,
    end: chrono::DateTime<chrono::Local>,
    duration: i64,
    signals: &SegmentSignals,
) {
    let mut category = base_category.to_string();

    // Refine AI Agent into sub-categories based on observed signals
    if category == "AI Agent" && signals.total_polls > 0 {
        let idle_ratio = signals.input_idle_polls as f32 / signals.total_polls as f32;
        if signals.title_changes > 0 && idle_ratio > 0.5 {
            // Title changing + keyboard idle = agent is doing the work
            category = "AI Agent (working)".to_string();
        } else {
            // Keyboard active = user is typing prompts / reviewing
            category = "AI Agent (you)".to_string();
        }
    }

    let date = start.format("%Y-%m-%d").to_string();
    if let Err(e) = conn.execute(
        "INSERT INTO activity (app_name, window_title, category, start_time, end_time, duration_secs, date)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![app_name, window_title, category, start.to_rfc3339(), end.to_rfc3339(), duration, date],
    ) {
        eprintln!("[tracker] DB insert error: {e}");
    }
}

pub struct ActivityTracker {
    db_path: PathBuf,
    running: Arc<AtomicBool>,
    thread_handle: Option<thread::JoinHandle<()>>,
}

impl ActivityTracker {
    pub fn new(db_path: PathBuf) -> Result<Self, rusqlite::Error> {
        // Initialize database
        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        conn.busy_timeout(Duration::from_secs(5))?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_name TEXT NOT NULL,
                window_title TEXT NOT NULL,
                category TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                duration_secs INTEGER NOT NULL,
                date TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS preferences (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_activity_date ON activity(date);
            CREATE INDEX IF NOT EXISTS idx_activity_start ON activity(start_time);",
        )?;
        // Prune raw segments older than 90 days
        conn.execute(
            "DELETE FROM activity WHERE date < date('now', '-90 days')",
            [],
        )?;
        Ok(Self {
            db_path,
            running: Arc::new(AtomicBool::new(false)),
            thread_handle: None,
        })
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Acquire)
    }

    pub fn start(&mut self) {
        if self.is_running() {
            return;
        }
        self.running.store(true, Ordering::Release);
        let running = self.running.clone();
        let db_path = self.db_path.clone();

        self.thread_handle = Some(thread::spawn(move || {
            let conn = match Connection::open(&db_path) {
                Ok(c) => {
                    let _ = c.busy_timeout(Duration::from_secs(5));
                    c
                }
                Err(e) => {
                    eprintln!("[tracker] Failed to open DB: {e}");
                    return;
                }
            };

            let mut last_app = String::new();
            let mut last_title = String::new();
            let mut segment_category = String::new(); // category computed once at segment start
            let mut segment_start = Local::now();
            let mut last_seen = Local::now();
            let mut idle = false;
            let mut signals = SegmentSignals::default();
            let min_segment_secs = 5;
            let idle_threshold_secs = 120;
            let input_idle_short = 10;

            // Helper: start a new segment
            macro_rules! new_segment {
                ($app:expr, $title:expr, $now:expr) => {{
                    let cat = categorize_app(&$app, &$title);
                    segment_category = cat.clone();
                    last_app = $app;
                    last_title = $title;
                    segment_start = $now;
                    last_seen = $now;
                    signals = SegmentSignals::default();
                    cat
                }};
            }

            while running.load(Ordering::Acquire) {
                thread::sleep(Duration::from_secs(3));

                let now = Local::now();
                let win = match get_active_win() {
                    Ok(w) => w,
                    Err(_) => {
                        let since_last = (now - last_seen).num_seconds();
                        if !idle && since_last >= idle_threshold_secs && !last_app.is_empty() {
                            let duration = (last_seen - segment_start).num_seconds();
                            if duration >= min_segment_secs {
                                flush_segment(&conn, &last_app, &last_title, &segment_category, segment_start, last_seen, duration, &signals);
                            }
                            last_app.clear();
                            idle = true;
                        }
                        continue;
                    }
                };

                let app_name = win.app_name;
                let window_title: String = win.title.chars().take(120).collect();

                // Check keyboard/mouse idle
                if let Some(input_idle) = get_system_idle_secs() {
                    if input_idle >= idle_threshold_secs as u64 && !idle && !last_app.is_empty() {
                        let active_end = now - chrono::TimeDelta::seconds(input_idle as i64);
                        let duration = (active_end - segment_start).num_seconds();
                        if duration >= min_segment_secs {
                            flush_segment(&conn, &last_app, &last_title, &segment_category, segment_start, active_end, duration, &signals);
                        }
                        last_app.clear();
                        idle = true;
                        continue;
                    }
                }

                // Coming back from idle
                if idle {
                    idle = false;
                    new_segment!(app_name, window_title, now);
                    continue;
                }

                // Detect wake-from-sleep
                let gap_since_last = (now - last_seen).num_seconds();
                if gap_since_last >= idle_threshold_secs && !last_app.is_empty() {
                    let duration = (last_seen - segment_start).num_seconds();
                    if duration >= min_segment_secs {
                        flush_segment(&conn, &last_app, &last_title, &segment_category, segment_start, last_seen, duration, &signals);
                    }
                    new_segment!(app_name, window_title, now);
                    continue;
                }

                last_seen = now;

                // Collect signals
                signals.total_polls += 1;
                if let Some(input_idle) = get_system_idle_secs() {
                    if input_idle >= input_idle_short as u64 {
                        signals.input_idle_polls += 1;
                    }
                }

                // Same app + same title — extend
                if app_name == last_app && window_title == last_title {
                    continue;
                }

                // Same app, different title — for AI agents, count as signal
                if app_name == last_app && segment_category == "AI Agent" {
                    signals.title_changes += 1;
                    last_title = window_title;
                    continue;
                }

                // Different app or title — flush and start new
                if !last_app.is_empty() {
                    let duration = (now - segment_start).num_seconds();
                    if duration >= min_segment_secs {
                        flush_segment(&conn, &last_app, &last_title, &segment_category, segment_start, now, duration, &signals);
                    }
                }

                new_segment!(app_name, window_title, now);
            }

            // Flush final segment on stop
            if !last_app.is_empty() && !idle {
                let now = Local::now();
                let duration = (now - segment_start).num_seconds();
                if duration >= min_segment_secs {
                    flush_segment(&conn, &last_app, &last_title, &segment_category, segment_start, now, duration, &signals);
                }
            }
        }));
    }

    /// Check if user has opted in to tracking (persistent preference).
    /// Returns false if no preference set (first launch — not opted in yet).
    pub fn is_tracking_enabled(&self) -> bool {
        let conn = match Connection::open(&self.db_path) {
            Ok(c) => c,
            Err(_) => return false,
        };
        conn.query_row(
            "SELECT value FROM preferences WHERE key = 'tracking_enabled'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map(|v| v == "true")
        .unwrap_or(false) // not set = not opted in
    }

    /// Set persistent tracking preference.
    pub fn set_tracking_enabled(&self, enabled: bool) {
        if let Ok(conn) = Connection::open(&self.db_path) {
            let _ = conn.execute(
                "INSERT OR REPLACE INTO preferences (key, value) VALUES ('tracking_enabled', ?1)",
                params![if enabled { "true" } else { "false" }],
            );
        }
    }

    /// Signal the tracker thread to stop. Does not block — the thread
    /// will flush its final segment and exit within ~3 seconds.
    pub fn stop(&mut self) {
        self.running.store(false, Ordering::Release);
        // Don't join here — avoids blocking the Tauri async runtime.
        // The thread will exit on its next poll cycle (~3s max).
        // Drop impl joins to ensure cleanup before process exit.
    }

    pub fn get_entries(&self, date_from: &str, date_to: &str) -> Result<Vec<ActivityEntry>, String> {
        if !is_valid_date(date_from) || !is_valid_date(date_to) {
            return Err("Invalid date format. Expected YYYY-MM-DD.".to_string());
        }
        let conn = Connection::open(&self.db_path).map_err(|e| e.to_string())?;
        conn.busy_timeout(Duration::from_secs(5)).map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, app_name, window_title, category, start_time, end_time, duration_secs, date
             FROM activity WHERE date >= ?1 AND date <= ?2 ORDER BY start_time ASC",
        ).map_err(|e| e.to_string())?;
        let entries = stmt
            .query_map(params![date_from, date_to], |row| {
                Ok(ActivityEntry {
                    id: row.get(0)?,
                    app_name: row.get(1)?,
                    window_title: row.get(2)?,
                    category: row.get(3)?,
                    start_time: row.get(4)?,
                    end_time: row.get(5)?,
                    duration_secs: row.get(6)?,
                    date: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(entries)
    }

    pub fn get_summary(&self, date: &str) -> Result<Vec<CategorySummary>, String> {
        if !is_valid_date(date) {
            return Err("Invalid date format. Expected YYYY-MM-DD.".to_string());
        }
        let conn = Connection::open(&self.db_path).map_err(|e| e.to_string())?;
        conn.busy_timeout(Duration::from_secs(5)).map_err(|e| e.to_string())?;

        // Get per-app totals grouped by category
        let mut stmt = conn.prepare(
            "SELECT category, app_name, SUM(duration_secs) as total
             FROM activity WHERE date = ?1
             GROUP BY category, app_name
             ORDER BY category, total DESC",
        ).map_err(|e| e.to_string())?;

        let rows: Vec<(String, String, i64)> = stmt
            .query_map(params![date], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        // Group into CategorySummary
        let mut summaries: Vec<CategorySummary> = Vec::new();
        let mut current_cat: Option<String> = None;
        let mut current_apps: Vec<AppDetail> = Vec::new();
        let mut current_total: f64 = 0.0;

        for (cat, app, secs) in &rows {
            let mins = *secs as f64 / 60.0;
            if current_cat.as_deref() != Some(cat) {
                if let Some(prev_cat) = current_cat.take() {
                    summaries.push(CategorySummary {
                        category: prev_cat,
                        total_minutes: current_total,
                        app_details: std::mem::take(&mut current_apps),
                    });
                }
                current_cat = Some(cat.clone());
                current_total = 0.0;
            }
            current_total += mins;
            current_apps.push(AppDetail {
                app_name: app.clone(),
                minutes: mins,
            });
        }
        if let Some(cat) = current_cat {
            summaries.push(CategorySummary {
                category: cat,
                total_minutes: current_total,
                app_details: current_apps,
            });
        }

        // Sort by total time descending
        summaries.sort_by(|a, b| b.total_minutes.partial_cmp(&a.total_minutes).unwrap_or(std::cmp::Ordering::Equal));

        Ok(summaries)
    }
}

/// A coalesced block for calendar display — adjacent same-category segments merged
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityBlock {
    pub category: String,
    pub app_name: String, // dominant app in this block
    pub start_time: String,
    pub end_time: String,
    pub duration_secs: i64,
    pub date: String,
}

impl ActivityTracker {
    /// Get activity as coalesced calendar blocks.
    /// Merges consecutive same-category segments with gaps < 5 min into single blocks.
    /// Drops blocks shorter than 2 minutes.
    pub fn get_activity_blocks(&self, date: &str) -> Result<Vec<ActivityBlock>, String> {
        if !is_valid_date(date) {
            return Err("Invalid date format. Expected YYYY-MM-DD.".to_string());
        }
        let entries = self.get_entries(date, date)?;
        if entries.is_empty() {
            return Ok(Vec::new());
        }

        let merge_gap_secs = 300; // merge segments with <5 min gap
        let min_block_secs = 120; // drop blocks shorter than 2 min

        let mut blocks: Vec<ActivityBlock> = Vec::new();
        let mut cur_cat = entries[0].category.clone();
        let mut cur_start = entries[0].start_time.clone();
        let mut cur_end = entries[0].end_time.clone();
        let mut cur_dur: i64 = entries[0].duration_secs;
        let mut app_durations: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
        *app_durations.entry(entries[0].app_name.clone()).or_insert(0) += entries[0].duration_secs;

        for entry in entries.iter().skip(1) {
            // Check if same category and gap is small enough to merge
            let gap = Self::time_gap_secs(&cur_end, &entry.start_time);
            if entry.category == cur_cat && gap < merge_gap_secs {
                cur_end = entry.end_time.clone();
                cur_dur += entry.duration_secs;
                *app_durations.entry(entry.app_name.clone()).or_insert(0) += entry.duration_secs;
            } else {
                // Flush current block
                if cur_dur >= min_block_secs {
                    let dominant_app = app_durations.iter()
                        .max_by_key(|(_, &v)| v)
                        .map(|(k, _)| k.clone())
                        .unwrap_or_default();
                    blocks.push(ActivityBlock {
                        category: cur_cat.clone(),
                        app_name: dominant_app,
                        start_time: cur_start.clone(),
                        end_time: cur_end.clone(),
                        duration_secs: cur_dur,
                        date: date.to_string(),
                    });
                }
                // Start new block
                cur_cat = entry.category.clone();
                cur_start = entry.start_time.clone();
                cur_end = entry.end_time.clone();
                cur_dur = entry.duration_secs;
                app_durations.clear();
                *app_durations.entry(entry.app_name.clone()).or_insert(0) += entry.duration_secs;
            }
        }
        // Flush last block
        if cur_dur >= min_block_secs {
            let dominant_app = app_durations.iter()
                .max_by_key(|(_, &v)| v)
                .map(|(k, _)| k.clone())
                .unwrap_or_default();
            blocks.push(ActivityBlock {
                category: cur_cat,
                app_name: dominant_app,
                start_time: cur_start,
                end_time: cur_end,
                duration_secs: cur_dur,
                date: date.to_string(),
            });
        }

        Ok(blocks)
    }

    fn time_gap_secs(end: &str, start: &str) -> i64 {
        let end_dt = chrono::DateTime::parse_from_rfc3339(end).ok();
        let start_dt = chrono::DateTime::parse_from_rfc3339(start).ok();
        match (end_dt, start_dt) {
            (Some(e), Some(s)) => (s - e).num_seconds().max(0),
            _ => i64::MAX, // can't parse — don't merge
        }
    }
}

impl Drop for ActivityTracker {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Release);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join(); // OK to block during process shutdown
        }
    }
}
