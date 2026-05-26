// File watcher commands: start/stop monitoring using notify crate

use crate::state::AppState;
use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::fs;
use std::path::PathBuf;
use std::sync::mpsc::channel;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

/// Event payload emitted when a file change is detected
#[derive(Clone, serde::Serialize)]
pub struct FileChangeEvent {
    pub id: String,
    pub timestamp: String,
    pub kind: String,
    pub file_path: String,
    pub relative_path: String,
}

/// Start watching the project directory for file system changes
#[tauri::command]
pub fn start_watching(
    project_path: String,
    app_handle: AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    // Stop any existing watcher first
    if *state.watcher_running.lock() {
        *state.watcher.lock() = None;
        *state.watcher_running.lock() = false;
    }

    let base = PathBuf::from(&project_path);
    let obs_dir = base.join(".observatory");
    let changes_dir = obs_dir.join("changes");
    let db_path = obs_dir.join("db.sqlite");

    // Create a new channel for notify events
    let (tx, rx) = channel();

    // Build the watcher
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        let _ = tx.send(res);
    })
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    // Watch the project directory recursively
    watcher
        .watch(&base, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch directory: {}", e))?;

    // Exclude the .observatory directory from triggering events
    // (notify doesn't have built-in exclusion, so we filter in the processing loop)

    // Store the watcher and set state
    *state.watcher.lock() = Some(watcher);
    *state.watcher_running.lock() = true;
    *state.active_project.lock() = Some(base.clone());

    // Spawn a background thread to process file events
    let app_clone = app_handle.clone();
    let base_clone = base.clone();
    let changes_dir_clone = changes_dir.clone();
    let db_path_clone = db_path.clone();

    std::thread::spawn(move || {
        for event_result in rx {
            match event_result {
                Ok(event) => {
                    // Filter: ignore events inside .observatory or hidden files
                    let should_ignore = event.paths.iter().any(|p| {
                        let s = p.to_string_lossy();
                        s.contains("/.observatory/")
                            || s.contains("\\.observatory\\")
                            || s.contains("/.git/")
                            || s.contains("\\.git\\")
                            || s.contains("/node_modules/")
                            || s.contains("\\node_modules\\")
                            || s.contains("/target/")
                            || s.contains("\\target\\")
                    });

                    if should_ignore {
                        continue;
                    }

                    // Determine change kind
                    let kind: &str = match event.kind {
                        EventKind::Create(_) => "created",
                        EventKind::Modify(_) => "modified",
                        EventKind::Remove(_) => "deleted",
                        _ => continue,
                    };
                    let relevant_paths: Vec<&std::path::Path> = event.paths.iter().map(|p| p.as_path()).collect();

                    for path in relevant_paths {
                        if !path.is_file() && kind != "deleted" {
                            continue;
                        }

                        let abs = path.to_string_lossy().to_string();
                        let rel = path
                            .strip_prefix(&base_clone)
                            .unwrap_or(path)
                            .to_string_lossy()
                            .to_string();

                        let change_id = Uuid::new_v4().to_string();
                        let timestamp = chrono::Utc::now().to_rfc3339();

                        // Write change record as Markdown
                        if let Err(e) = write_change_markdown(
                            &changes_dir_clone,
                            &change_id,
                            &timestamp,
                            kind,
                            &rel,
                        ) {
                            eprintln!("Failed to write change markdown: {}", e);
                        }

                        // Insert into SQLite
                        if let Err(e) = insert_change_db(
                            &db_path_clone,
                            &change_id,
                            &timestamp,
                            kind,
                            &abs,
                            &rel,
                        ) {
                            eprintln!("Failed to insert change into DB: {}", e);
                        }

                        // Emit event to frontend
                        let _ = app_clone.emit(
                            "file-change",
                            FileChangeEvent {
                                id: change_id.clone(),
                                timestamp: timestamp.clone(),
                                kind: kind.to_string(),
                                file_path: abs.clone(),
                                relative_path: rel.clone(),
                            },
                        );
                    }

                    // Update change count in state (best effort via app_handle)
                    let _ = app_clone.clone();
                }
                Err(e) => {
                    eprintln!("Watch error: {:?}", e);
                }
            }
        }
    });

    Ok(())
}

/// Write a change record as a Markdown file in .observatory/changes/
fn write_change_markdown(
    changes_dir: &PathBuf,
    id: &str,
    timestamp: &str,
    kind: &str,
    relative_path: &str,
) -> Result<(), String> {
    fs::create_dir_all(changes_dir)
        .map_err(|e| format!("Failed to create changes dir: {}", e))?;

    let md_content = format!(
        "---\nid: {}\ntimestamp: {}\nkind: {}\nfile: {}\n---\n\n# Change: {}\n\n- **Kind**: {}\n- **File**: {}\n- **Timestamp**: {}\n",
        id, timestamp, kind, relative_path, relative_path, kind, relative_path, timestamp
    );

    let file_path = changes_dir.join(format!("{}.md", id));
    fs::write(&file_path, md_content)
        .map_err(|e| format!("Failed to write markdown: {}", e))?;

    Ok(())
}

/// Insert a change record into the SQLite database
fn insert_change_db(
    db_path: &PathBuf,
    id: &str,
    timestamp: &str,
    kind: &str,
    abs_path: &str,
    rel_path: &str,
) -> Result<(), String> {
    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;

    conn.execute(
        "INSERT INTO changes (id, timestamp, kind, file_path, relative_path) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, timestamp, kind, abs_path, rel_path],
    )
    .map_err(|e| format!("Failed to insert: {}", e))?;

    Ok(())
}

/// Stop the file watcher
#[tauri::command]
pub fn stop_watching(state: State<AppState>) -> Result<(), String> {
    *state.watcher.lock() = None;
    *state.watcher_running.lock() = false;
    *state.active_project.lock() = None;
    *state.change_count.lock() = 0;
    Ok(())
}

/// Get current watcher status
#[tauri::command]
pub fn get_watcher_status(state: State<AppState>) -> Result<serde_json::Value, String> {
    let running = *state.watcher_running.lock();
    let project_path = state
        .active_project
        .lock()
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let count = *state.change_count.lock();

    Ok(serde_json::json!({
        "running": running,
        "projectPath": project_path,
        "changesDetected": count,
    }))
}
