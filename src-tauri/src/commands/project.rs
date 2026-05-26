// Project management commands: select, init, check observatory directory

use crate::state::AppState;
use std::fs;
use std::path::PathBuf;
use tauri::State;

/// Open native directory picker and return the selected path
#[tauri::command]
pub async fn select_project(
    app_handle: tauri::AppHandle,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app_handle
        .dialog()
        .file()
        .blocking_pick_folder();
    Ok(path.map(|p| p.to_string()))
}

/// Initialize the .observatory directory structure for a project
#[tauri::command]
pub fn init_project(
    project_path: String,
    state: State<AppState>,
) -> Result<(), String> {
    let base = PathBuf::from(&project_path);
    let obs_dir = base.join(".observatory");

    // Create directory structure
    let dirs = vec![
        obs_dir.clone(),
        obs_dir.join("changes"),
        obs_dir.join("entities"),
        obs_dir.join("graphs"),
    ];

    for dir in &dirs {
        fs::create_dir_all(dir).map_err(|e| format!("Failed to create {}: {}", dir.display(), e))?;
    }

    // Initialize SQLite database
    let db_path = obs_dir.join("db.sqlite");
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS changes (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            kind TEXT NOT NULL,
            file_path TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            summary TEXT DEFAULT '',
            agent TEXT,
            commit_hash TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_changes_timestamp ON changes(timestamp);
        CREATE INDEX IF NOT EXISTS idx_changes_file_path ON changes(file_path);
        CREATE INDEX IF NOT EXISTS idx_changes_kind ON changes(kind);",
    )
    .map_err(|e| format!("Failed to create tables: {}", e))?;

    // Mark as active project
    *state.active_project.lock() = Some(base);

    Ok(())
}

/// Check whether .observatory exists for a given project path
#[tauri::command]
pub fn check_observatory(project_path: String) -> Result<bool, String> {
    let obs_dir = PathBuf::from(&project_path).join(".observatory");
    Ok(obs_dir.exists() && obs_dir.is_dir())
}
