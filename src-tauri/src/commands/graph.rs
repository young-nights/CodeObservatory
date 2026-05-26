// Graph building command: construct file relationship graph from change history

use std::collections::HashMap;
use std::path::PathBuf;

/// A node in the file relationship graph
#[derive(serde::Serialize, Clone)]
pub struct FileNode {
    pub id: String,
    pub label: String,
    pub path: String,
    #[serde(rename = "changeCount")]
    pub change_count: u32,
}

/// An edge between two files in the graph
#[derive(serde::Serialize)]
pub struct FileEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub weight: u32,
    pub label: String,
}

/// The complete graph data
#[derive(serde::Serialize)]
pub struct GraphData {
    pub nodes: Vec<FileNode>,
    pub edges: Vec<FileEdge>,
}

/// Build a file relationship graph from the change history.
/// Files that change together (within the same time window) are connected.
#[tauri::command]
pub fn build_graph(project_path: String) -> Result<GraphData, String> {
    let db_path = PathBuf::from(&project_path)
        .join(".observatory")
        .join("db.sqlite");

    if !db_path.exists() {
        return Ok(GraphData {
            nodes: vec![],
            edges: vec![],
        });
    }

    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    // Get all file paths and their change counts
    let mut stmt = conn
        .prepare(
            "SELECT relative_path, COUNT(*) as cnt
             FROM changes
             GROUP BY relative_path
             ORDER BY cnt DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let file_stats: Vec<(String, u32)> = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?))
        })
        .map_err(|e| format!("Failed to query: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // Build nodes
    let mut nodes: Vec<FileNode> = Vec::new();
    let mut path_to_id: HashMap<String, String> = HashMap::new();

    for (i, (path, count)) in file_stats.iter().enumerate() {
        let node_id = format!("n{}", i);
        let label = path.split('/').last().unwrap_or(path).to_string();
        path_to_id.insert(path.clone(), node_id.clone());
        nodes.push(FileNode {
            id: node_id,
            label,
            path: path.clone(),
            change_count: *count,
        });
    }

    // Build edges: connect files that changed near each other in time
    // We use a simple heuristic: files changed within 5 minutes of each other
    // are considered "related"
    let mut stmt2 = conn
        .prepare(
            "SELECT relative_path, timestamp FROM changes ORDER BY timestamp ASC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let timed_changes: Vec<(String, String)> = stmt2
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format!("Failed to query: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // Group changes by time windows (5-minute buckets)
    let mut edge_weights: HashMap<(String, String), u32> = HashMap::new();
    let window_secs = 300; // 5 minutes

    for i in 0..timed_changes.len() {
        let (path_a, ts_a) = &timed_changes[i];
        let t_a = chrono::DateTime::parse_from_rfc3339(ts_a)
            .unwrap_or_default();

        for j in (i + 1)..timed_changes.len() {
            let (path_b, ts_b) = &timed_changes[j];
            if path_a == path_b {
                continue;
            }

            let t_b = chrono::DateTime::parse_from_rfc3339(ts_b)
                .unwrap_or_default();
            let diff = (t_b - t_a).num_seconds().abs();

            if diff > window_secs {
                break; // changes are ordered, so if we exceed window, remaining will too
            }

            let id_a = path_to_id.get(path_a);
            let id_b = path_to_id.get(path_b);
            if let (Some(a), Some(b)) = (id_a, id_b) {
                let key = if a < b {
                    (a.clone(), b.clone())
                } else {
                    (b.clone(), a.clone())
                };
                *edge_weights.entry(key).or_insert(0) += 1;
            }
        }
    }

    // Convert edge weights to edges
    let mut edges: Vec<FileEdge> = Vec::new();
    let mut edge_idx = 0;
    for ((source, target), weight) in &edge_weights {
        edges.push(FileEdge {
            id: format!("e{}", edge_idx),
            source: source.clone(),
            target: target.clone(),
            weight: *weight,
            label: format!("{} co-changes", weight),
        });
        edge_idx += 1;
    }

    Ok(GraphData { nodes, edges })
}
