// Tauri command wrappers for CodeObservatory
// All commands invoke Rust backend functions via @tauri-apps/api

import { invoke } from "@tauri-apps/api/core";
import type { ChangeRecord, WatcherStatus, GraphData } from "./types";

// -- Project Management --

/** Select a project directory via native dialog */
export async function selectProject(): Promise<string | null> {
  return invoke<string | null>("select_project");
}

/** Initialize observatory data for a given project path */
export async function initProject(projectPath: string): Promise<void> {
  return invoke("init_project", { projectPath });
}

/** Check if .observatory exists in the given directory */
export async function checkObservatory(projectPath: string): Promise<boolean> {
  return invoke<boolean>("check_observatory", { projectPath });
}

// -- File Watching --

/** Start watching the project directory for file changes */
export async function startWatching(projectPath: string): Promise<void> {
  return invoke("start_watching", { projectPath });
}

/** Stop the file watcher */
export async function stopWatching(): Promise<void> {
  return invoke("stop_watching");
}

/** Get current watcher status */
export async function getWatcherStatus(): Promise<WatcherStatus> {
  return invoke<WatcherStatus>("get_watcher_status");
}

// -- Change Records --

/** Fetch all change records from SQLite index */
export async function getChanges(
  projectPath: string,
  limit?: number,
  offset?: number
): Promise<ChangeRecord[]> {
  return invoke<ChangeRecord[]>("get_changes", {
    projectPath,
    limit: limit ?? 100,
    offset: offset ?? 0,
  });
}

/** Get a single change record by ID */
export async function getChangeById(
  projectPath: string,
  changeId: string
): Promise<ChangeRecord | null> {
  return invoke<ChangeRecord | null>("get_change_by_id", {
    projectPath,
    changeId,
  });
}

// -- Graph Data --

/** Build file relationship graph from change history */
export async function buildGraph(projectPath: string): Promise<GraphData> {
  return invoke<GraphData>("build_graph", { projectPath });
}
