// Application state shared across Tauri commands

use notify::Event;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::time::SystemTime;

/// Cached scan result — returned instantly on repeat requests
#[derive(Clone)]
pub struct CachedGraph {
    pub data: crate::commands::graph::GraphData,
    pub root_mtime: Option<SystemTime>,
    pub scanned_at: SystemTime,
}

/// Global application state managed by Tauri
#[allow(dead_code)]
pub struct AppState {
    /// Currently active project path
    pub active_project: Mutex<Option<PathBuf>>,
    /// Notify watcher handle for file monitoring
    pub watcher: Mutex<Option<notify::RecommendedWatcher>>,
    /// Channel sender to signal new file events (used internally)
    pub event_tx: Mutex<Option<Sender<notify::Result<Event>>>>,
    /// Channel receiver for file events
    pub event_rx: Mutex<Option<Receiver<notify::Result<Event>>>>,
    /// Count of changes detected since watcher started
    pub change_count: Mutex<u64>,
    /// Whether the watcher is running
    pub watcher_running: Mutex<bool>,
    /// In-memory scan cache: project_path → CachedGraph
    pub scan_cache: Mutex<HashMap<String, CachedGraph>>,
}

impl Default for AppState {
    fn default() -> Self {
        let (tx, rx) = channel();
        Self {
            active_project: Mutex::new(None),
            watcher: Mutex::new(None),
            event_tx: Mutex::new(Some(tx)),
            event_rx: Mutex::new(Some(rx)),
            change_count: Mutex::new(0),
            watcher_running: Mutex::new(false),
            scan_cache: Mutex::new(HashMap::new()),
        }
    }
}
