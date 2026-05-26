// CodeObservatory Tauri application library
// Registers all commands, plugins, and app state

mod commands;
mod state;

use state::AppState;

/// Create and configure the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            // Project commands
            commands::project::select_project,
            commands::project::init_project,
            commands::project::check_observatory,
            // Watcher commands
            commands::watcher::start_watching,
            commands::watcher::stop_watching,
            commands::watcher::get_watcher_status,
            // Change record commands
            commands::changes::get_changes,
            commands::changes::get_change_by_id,
            // Graph commands
            commands::graph::build_graph,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CodeObservatory");
}
