// Graph building commands: change-history graph + directory scan graph
// Optimized for large projects (10k+ files) with smart filtering

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::SystemTime;

// ══════════════════════════════════════════════════
// Data structures
// ══════════════════════════════════════════════════

#[derive(serde::Serialize, Clone)]
pub struct FileNode {
    pub id: String,
    pub label: String,
    pub path: String,
    #[serde(rename = "changeCount")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub change_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extension: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_children: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<bool>,
}

#[derive(serde::Serialize, Clone)]
pub struct FileEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weight: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(serde::Serialize, Clone)]
pub struct GraphData {
    pub nodes: Vec<FileNode>,
    pub edges: Vec<FileEdge>,
}

// ══════════════════════════════════════════════════
// Skip rules — comprehensive
// ══════════════════════════════════════════════════

/// Directories to always skip (case-sensitive exact match or starts-with-dot)
const SKIP_DIRS: &[&str] = &[
    ".observatory", ".git", ".hg", ".svn",
    "node_modules", "bower_components",
    "target", "dist", "build", "out", "release", "debug",
    "__pycache__", ".pytest_cache", ".mypy_cache", ".tox", ".nox",
    ".vscode", ".idea", ".vs", ".fleet",
    "obj", "bin", "Debug", "Release", "x64", "x86",
    ".next", ".nuxt", ".output", ".svelte-kit",
    "coverage", ".nyc_output", ".cache", ".parcel-cache",
    "venv", ".venv", "env", ".env", "virtualenv",
    "__MACOSX", ".DS_Store",
    "tmp", "temp", ".tmp",
    ".turbo", ".angular", ".astro",
];

/// Directory name suffixes to skip
const SKIP_DIR_SUFFIXES: &[&str] = &[
    ".egg-info", ".dist-info",
];

/// Hidden file prefixes (starts with . and not in SPECIAL_FILENAMES)
fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

/// Files to always skip by exact name
const SKIP_FILENAMES: &[&str] = &[
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "Cargo.lock", "Gemfile.lock", "poetry.lock",
    "Thumbs.db", ".DS_Store", "desktop.ini",
];

/// File substrings that indicate generated/minified content
const SKIP_FILE_CONTAINS: &[&str] = &[
    ".min.", ".bundle.", ".chunk.",
];

/// Source code + documentation extensions (whitelist)
const TRACKED_EXTENSIONS: &[&str] = &[
    // TypeScript/JavaScript
    "ts", "tsx", "mts", "cts",
    "js", "jsx", "mjs", "cjs",
    // Rust
    "rs",
    // Python
    "py", "pyi", "pyx",
    // C/C++
    "c", "cc", "cpp", "cxx", "h", "hh", "hpp", "hxx",
    // Web
    "css", "scss", "sass", "less", "html", "htm", "svg", "xml",
    // Config/data
    "json", "toml", "yaml", "yml",
    // Documentation
    "md", "mdx", "rst", "txt",
    // Other languages
    "java", "kt", "kts", "swift",
    "go", "rb", "php", "lua",
    "vue", "svelte", "astro",
    "proto", "sql", "graphql", "prisma",
    "sh", "bash", "zsh", "fish",
    "nix", "dhall",
    "dockerfile", "dockerignore",
];

/// Extensions to always skip (binaries, assets, compiled artifacts)
const SKIP_EXTENSIONS: &[&str] = &[
    // Compiled
    "o", "obj", "exe", "dll", "so", "dylib", "a", "lib", "class", "jar",
    "pyc", "pyo", "pyd", "wasm",
    "bin", "elf", "hex", "out", "gch",
    // Media
    "png", "jpg", "jpeg", "gif", "ico", "webp", "bmp", "tiff", "avif",
    "svg", // SVG is tracked above for code, but here as fallback skip
    "ttf", "otf", "woff", "woff2", "eot",
    "mp3", "mp4", "wav", "ogg", "flac", "avi", "mov", "mkv", "webm",
    // Archives/documents
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "zip", "tar", "gz", "bz2", "xz", "rar", "7z", "zst",
    // Database
    "db", "sqlite", "sqlite3",
    // Map files
    "map",
];

/// Special files without extensions to track
const SPECIAL_FILENAMES: &[&str] = &[
    "Dockerfile", "docker-compose.yml", ".dockerignore",
    "Makefile", "CMakeLists.txt", "BUILD", "WORKSPACE",
    ".gitignore", ".gitattributes",
    ".env.example", ".env.sample",
    ".eslintrc", ".eslintrc.js", ".eslintrc.json",
    ".prettierrc", ".prettierrc.js", ".prettierrc.json",
    ".editorconfig",
    "LICENSE", "LICENCE", "COPYING",
    "README", "CHANGELOG", "CONTRIBUTING",
    "Procfile", "Dockerfile",
];

// ══════════════════════════════════════════════════
// File filtering logic
// ══════════════════════════════════════════════════

fn should_track_file(name: &str, ext: &Option<String>) -> bool {
    // Exact filename skip
    if SKIP_FILENAMES.contains(&name) {
        return false;
    }
    // Skip minified/bundled
    for pattern in SKIP_FILE_CONTAINS {
        if name.contains(pattern) {
            return false;
        }
    }
    // Special files without extension
    if SPECIAL_FILENAMES.contains(&name) {
        return true;
    }
    if let Some(e) = ext {
        let ext_lower = e.to_lowercase();
        return TRACKED_EXTENSIONS.contains(&ext_lower.as_str());
    }
    false
}

fn should_skip_dir(name: &str) -> bool {
    if is_hidden(name) { return true; }
    if SKIP_DIRS.contains(&name) { return true; }
    SKIP_DIR_SUFFIXES.iter().any(|suffix| name.ends_with(suffix))
}

// ══════════════════════════════════════════════════
// Scan command — optimized single-pass walk
// ══════════════════════════════════════════════════

fn do_scan(project_path: &str, root: &PathBuf, max_depth: u32) -> Result<GraphData, String> {
    let root_label = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| project_path.to_string());

    // Pre-allocate for large projects
    let mut nodes: Vec<FileNode> = Vec::with_capacity(4096);
    let mut edges: Vec<FileEdge> = Vec::with_capacity(4096);
    let mut edge_idx: u32 = 0;

    // Root node
    nodes.push(FileNode {
        id: project_path.to_string(),
        label: root_label.clone(),
        path: project_path.to_string(),
        change_count: None,
        kind: Some("dir".to_string()),
        extension: None,
        size: None,
        modified: get_modified(root),
        has_children: None,
        truncated: None,
    });

    walk(root, project_path, 0, max_depth, &mut nodes, &mut edges, &mut edge_idx)
        .map_err(|e| format!("Scan error: {}", e))?;

    // Post: mark dirs with children
    let mut has_kids: HashMap<String, bool> = HashMap::with_capacity(edges.len());
    for e in &edges {
        has_kids.insert(e.source.clone(), true);
    }
    for n in &mut nodes {
        if n.kind.as_deref() == Some("dir") {
            n.has_children = Some(has_kids.contains_key(&n.id));
        }
    }

    Ok(GraphData { nodes, edges })
}

/// Optimised scan with in-memory cache.
/// First call does a real scan; subsequent calls return cached data
/// unless the root directory's modification time has changed.
#[tauri::command]
pub fn scan_directory(
    project_path: String,
    max_depth: Option<u32>,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<GraphData, String> {
    let max_depth = max_depth.unwrap_or(6);
    let root = PathBuf::from(&project_path);

    if !root.exists() {
        return Err(format!("Path does not exist: {}", project_path));
    }
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {}", project_path));
    }

    // Check cache — if root mtime is unchanged, return cached result instantly
    let root_mtime = root.metadata().ok().and_then(|m| m.modified().ok());
    {
        let cache = state.scan_cache.lock();
        if let Some(cached) = cache.get(&project_path) {
            if cached.root_mtime == root_mtime {
                return Ok(cached.data.clone());
            }
        }
    }

    // Cache miss or stale — do full scan
    let data = do_scan(&project_path, &root, max_depth)?;

    // Store in cache
    {
        let mut cache = state.scan_cache.lock();
        cache.insert(project_path.clone(), crate::state::CachedGraph {
            data: data.clone(),
            root_mtime,
            scanned_at: SystemTime::now(),
        });
    }

    Ok(data)
}

/// Single-pass recursive walk
fn walk(
    dir: &PathBuf,
    parent_id: &str,
    depth: u32,
    max_depth: u32,
    nodes: &mut Vec<FileNode>,
    edges: &mut Vec<FileEdge>,
    edge_idx: &mut u32,
) -> std::io::Result<()> {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()), // Permission denied → skip silently
    };

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        let is_dir = match entry.file_type() {
            Ok(ft) => ft.is_dir(),
            Err(_) => continue,
        };

        if is_dir {
            if should_skip_dir(&name) { continue; }

            let dir_id = path.to_string_lossy().to_string();
            let truncated = depth >= max_depth;

            nodes.push(FileNode {
                id: dir_id.clone(),
                label: name.clone(),
                path: dir_id.clone(),
                change_count: None,
                kind: Some("dir".to_string()),
                extension: None,
                size: None,
                modified: get_modified(&path),
                has_children: None,
                truncated: Some(truncated),
            });
            edges.push(FileEdge {
                id: format!("e{edge_idx}"),
                source: parent_id.to_string(),
                target: dir_id.clone(),
                weight: None,
                label: None,
            });
            *edge_idx += 1;

            if !truncated {
                walk(&path, &dir_id, depth + 1, max_depth, nodes, edges, edge_idx)?;
            }
        } else {
            let ext = path.extension().map(|e| e.to_string_lossy().to_string());
            if !should_track_file(&name, &ext) { continue; }

            let size = entry.metadata().ok().map(|m| m.len());
            let file_id = path.to_string_lossy().to_string();

            nodes.push(FileNode {
                id: file_id.clone(),
                label: name.clone(),
                path: file_id.clone(),
                change_count: None,
                kind: Some("file".to_string()),
                extension: ext,
                size,
                modified: get_modified(&path),
                has_children: None,
                truncated: None,
            });
            edges.push(FileEdge {
                id: format!("e{edge_idx}"),
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

fn get_modified(path: &PathBuf) -> Option<String> {
    path.metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .map(|t| {
            let dt: chrono::DateTime<chrono::Utc> = t.into();
            dt.to_rfc3339()
        })
}

// ══════════════════════════════════════════════════
// Build graph from change history (unchanged logic)
// ══════════════════════════════════════════════════

#[tauri::command]
pub fn build_graph(project_path: String) -> Result<GraphData, String> {
    let db_path = PathBuf::from(&project_path).join(".observatory").join("db.sqlite");
    if !db_path.exists() {
        return Ok(GraphData { nodes: vec![], edges: vec![] });
    }

    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("DB open failed: {e}"))?;

    let mut stmt = conn.prepare(
        "SELECT relative_path, COUNT(*) as cnt FROM changes GROUP BY relative_path ORDER BY cnt DESC"
    ).map_err(|e| format!("Query failed: {e}"))?;

    let file_stats: Vec<(String, u32)> = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?)))
        .map_err(|e| format!("Query failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let mut nodes: Vec<FileNode> = Vec::with_capacity(file_stats.len());
    let mut path_to_id: HashMap<String, String> = HashMap::with_capacity(file_stats.len());

    for (i, (path, count)) in file_stats.iter().enumerate() {
        let id = format!("n{i}");
        let label = path.rsplit('/').next().unwrap_or(path).to_string();
        path_to_id.insert(path.clone(), id.clone());
        nodes.push(FileNode {
            id, label, path: path.clone(),
            change_count: Some(*count),
            kind: None, extension: None, size: None, modified: None,
            has_children: None, truncated: None,
        });
    }

    let mut stmt2 = conn.prepare(
        "SELECT relative_path, timestamp FROM changes ORDER BY timestamp ASC"
    ).map_err(|e| format!("Query failed: {e}"))?;

    let timed: Vec<(String, String)> = stmt2
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| format!("Query failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let window_secs = 300;
    let mut edge_weights: HashMap<(String, String), u32> = HashMap::new();

    for i in 0..timed.len() {
        let (pa, ta) = &timed[i];
        let t_a = chrono::DateTime::parse_from_rfc3339(ta).unwrap_or_default();
        for j in (i + 1)..timed.len() {
            let (pb, tb) = &timed[j];
            if pa == pb { continue; }
            let t_b = chrono::DateTime::parse_from_rfc3339(tb).unwrap_or_default();
            if (t_b - t_a).num_seconds().abs() > window_secs { break; }
            if let (Some(a), Some(b)) = (path_to_id.get(pa), path_to_id.get(pb)) {
                let key = if a < b { (a.clone(), b.clone()) } else { (b.clone(), a.clone()) };
                *edge_weights.entry(key).or_insert(0) += 1;
            }
        }
    }

    let mut edges: Vec<FileEdge> = Vec::with_capacity(edge_weights.len());
    for (idx, ((s, t), w)) in edge_weights.iter().enumerate() {
        edges.push(FileEdge {
            id: format!("e{idx}"),
            source: s.clone(), target: t.clone(),
            weight: Some(*w), label: Some(format!("{w} co-changes")),
        });
    }

    Ok(GraphData { nodes, edges })
}
