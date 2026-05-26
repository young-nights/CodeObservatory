// Graph building commands: change-history graph + directory scan graph

use std::collections::HashMap;
use std::path::PathBuf;

/// A node in the file relationship graph
#[derive(serde::Serialize, Clone)]
pub struct FileNode {
    pub id: String,
    pub label: String,
    pub path: String,
    #[serde(rename = "changeCount")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub change_count: Option<u32>,
    /// "dir" or "file"; present only in scan_directory results
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    /// File extension (without dot); present only in scan_directory results
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extension: Option<String>,
    /// File size in bytes; present only for files in scan_directory results
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    /// Last modification time as ISO 8601 string; present only in scan_directory results
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified: Option<String>,
    /// Whether this directory contains children (files or subdirs); computed post-scan
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_children: Option<bool>,
    /// Whether directory scan was truncated at max_depth
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<bool>,
}

/// An edge between two files in the graph
#[derive(serde::Serialize)]
pub struct FileEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weight: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// The complete graph data
#[derive(serde::Serialize)]
pub struct GraphData {
    pub nodes: Vec<FileNode>,
    pub edges: Vec<FileEdge>,
}

/// Directories to skip during scanning
const SKIP_DIRS: &[&str] = &[
    ".observatory",
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    "__pycache__",
    ".vscode",
    ".idea",
    ".vs",
    "obj",
    "bin",
    "Debug",
    "Release",
    "out",
    ".next",
    ".nuxt",
    "coverage",
    ".cache",
    ".tox",
    "venv",
    ".venv",
    "env",
    ".env",
    ".pytest_cache",
    ".mypy_cache",
];

/// File extensions we want to track (whitelist — source code + docs)
const TRACKED_EXTENSIONS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "rs", "py", "c", "cpp", "h", "hpp",
    "css", "scss", "less", "html", "md", "json", "toml", "yaml", "yml",
    "java", "go", "rb", "php", "swift", "kt", "kts", "vue", "svelte",
    "svg", "txt", "xml", "proto", "sql", "graphql", "prisma",
];

/// File extensions to always skip (compiled artifacts, binaries, assets)
const SKIP_EXTENSIONS: &[&str] = &[
    "o", "obj", "exe", "dll", "so", "dylib", "a", "lib", "class",
    "pyc", "pyd", "wasm", "bin", "elf", "hex", "map", "lock",
    "png", "jpg", "jpeg", "gif", "ico", "webp", "bmp",
    "ttf", "woff", "woff2", "eot", "mp3", "mp4", "wav", "ogg",
    "pdf", "zip", "tar", "gz", "rar", "7z", "dat", "db", "sqlite",
];

/// Special filenames without extensions that we still want to track
const SPECIAL_FILENAMES: &[&str] = &[
    "Dockerfile",
    "Makefile",
    "CMakeLists.txt",
    ".gitignore",
    ".env.example",
    ".eslintrc",
    ".prettierrc",
    ".editorconfig",
];

/// Recursively scan a project directory and build a file/directory relationship graph.
/// `max_depth` limits directory nesting below project root (default: 4).
/// Directories beyond max_depth are marked `truncated: true` and not recursed into.
#[tauri::command]
pub fn scan_directory(project_path: String, max_depth: Option<u32>) -> Result<GraphData, String> {
    let max_depth = max_depth.unwrap_or(4);
    let root = PathBuf::from(&project_path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", project_path));
    }
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {}", project_path));
    }

    let mut nodes: Vec<FileNode> = Vec::new();
    let mut edges: Vec<FileEdge> = Vec::new();
    let mut edge_idx: u32 = 0;

    // Add root node
    let root_label = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| project_path.clone());
    let root_modified = get_modified_iso(&root);
    nodes.push(FileNode {
        id: project_path.clone(),
        label: root_label.clone(),
        path: project_path.clone(),
        change_count: None,
        kind: Some("dir".to_string()),
        extension: None,
        size: None,
        modified: root_modified,
        has_children: None,
        truncated: None,
    });

    walk_dir(&root, &project_path, &project_path, &mut nodes, &mut edges, &mut edge_idx, 0, max_depth)
        .map_err(|e| format!("Failed to scan directory: {}", e))?;

    // Post-processing: mark directories that have children
    let mut has_kids: HashMap<String, bool> = HashMap::new();
    for edge in &edges {
        has_kids.insert(edge.source.clone(), true);
    }
    for node in &mut nodes {
        if node.kind.as_deref() == Some("dir") {
            node.has_children = Some(has_kids.contains_key(&node.id));
        }
    }

    Ok(GraphData { nodes, edges })
}

/// Determine whether a file should be included in the graph based on its extension
/// and special filenames (whitelist approach — only source code + docs).
fn should_track_file(name: &str, ext: &Option<String>) -> bool {
    // Special filenames without extensions (e.g. Dockerfile, Makefile, .gitignore)
    if SPECIAL_FILENAMES.contains(&name) {
        return true;
    }

    // If the file has an extension:
    if let Some(e) = ext {
        let ext_lower = e.to_lowercase();
        // Blacklist is an extra safety net: explicitly skip compiled artifacts
        if SKIP_EXTENSIONS.contains(&ext_lower.as_str()) {
            return false;
        }
        // Whitelist: only track known source/doc extensions
        return TRACKED_EXTENSIONS.contains(&ext_lower.as_str());
    }

    // Files without extensions that aren't in SPECIAL_FILENAMES → skip
    false
}

/// Recursively walk a directory, collecting nodes and edges.
/// `depth` is the current nesting level (root = 0).
/// Directories at `depth >= max_depth` are marked truncated and not recursed into.
fn walk_dir(
    dir: &PathBuf,
    root_prefix: &str,
    parent_id: &str,
    nodes: &mut Vec<FileNode>,
    edges: &mut Vec<FileEdge>,
    edge_idx: &mut u32,
    depth: u32,
    max_depth: u32,
) -> std::io::Result<()> {
    let entries = std::fs::read_dir(dir)?;

    for entry in entries {
        let entry = entry?;
        let file_name = entry.file_name();
        let name_str = file_name.to_string_lossy().to_string();

        let file_type = entry.file_type()?;
        let full_path = entry.path();

        if file_type.is_dir() {
            // Skip known noise directories (includes dot-prefixed like .git, .vscode)
            if SKIP_DIRS.contains(&name_str.as_str()) || name_str.starts_with('.') {
                continue;
            }

            let dir_id = full_path.to_string_lossy().to_string();
            let modified = get_modified_iso(&full_path);

            let truncated = depth >= max_depth;

            nodes.push(FileNode {
                id: dir_id.clone(),
                label: name_str.clone(),
                path: dir_id.clone(),
                change_count: None,
                kind: Some("dir".to_string()),
                extension: None,
                size: None,
                modified,
                has_children: None,
                truncated: Some(truncated),
            });

            edges.push(FileEdge {
                id: format!("e{}", edge_idx),
                source: parent_id.to_string(),
                target: dir_id.clone(),
                weight: None,
                label: None,
            });
            *edge_idx += 1;

            // Recurse into subdirectory only if not at max depth
            if !truncated {
                walk_dir(&full_path, root_prefix, &dir_id, nodes, edges, edge_idx, depth + 1, max_depth)?;
            }
        } else if file_type.is_file() {
            let ext = full_path
                .extension()
                .map(|e| e.to_string_lossy().to_string());

            // Filter: only track source-code / documentation files
            if !should_track_file(&name_str, &ext) {
                continue;
            }

            let file_id = full_path.to_string_lossy().to_string();
            let size = entry.metadata().ok().map(|m| m.len());
            let modified = get_modified_iso(&full_path);

            nodes.push(FileNode {
                id: file_id.clone(),
                label: name_str.clone(),
                path: file_id.clone(),
                change_count: None,
                kind: Some("file".to_string()),
                extension: ext,
                size,
                modified,
                has_children: None,
                truncated: None,
            });

            edges.push(FileEdge {
                id: format!("e{}", edge_idx),
                source: parent_id.to_string(),
                target: file_id,
                weight: None,
                label: None,
            });
            *edge_idx += 1;
        }
    }

    Ok(())
}

/// Get the last-modified time of a path as an ISO 8601 string.
fn get_modified_iso(path: &PathBuf) -> Option<String> {
    path.metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .map(|t| {
            let dt: chrono::DateTime<chrono::Utc> = t.into();
            dt.to_rfc3339()
        })
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
            change_count: Some(*count),
            kind: None,
            extension: None,
            size: None,
            modified: None,
            has_children: None,
            truncated: None,
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
            weight: Some(*weight),
            label: Some(format!("{} co-changes", weight)),
        });
        edge_idx += 1;
    }

    Ok(GraphData { nodes, edges })
}
