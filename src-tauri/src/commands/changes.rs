// Change record commands: query change history from SQLite

use std::path::PathBuf;

/// A change record returned to the frontend
#[derive(serde::Serialize)]
pub struct ChangeRecord {
    pub id: String,
    pub timestamp: String,
    pub kind: String,
    #[serde(rename = "filePath")]
    pub file_path: String,
    #[serde(rename = "relativePath")]
    pub relative_path: String,
    pub summary: String,
    pub agent: Option<String>,
    #[serde(rename = "commitHash")]
    pub commit_hash: Option<String>,
}

/// Fetch change records from the SQLite database
#[tauri::command]
pub fn get_changes(
    project_path: String,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<ChangeRecord>, String> {
    let db_path = PathBuf::from(&project_path)
        .join(".observatory")
        .join("db.sqlite");

    if !db_path.exists() {
        return Ok(vec![]);
    }

    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    let limit = limit.unwrap_or(100);
    let offset = offset.unwrap_or(0);

    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp, kind, file_path, relative_path, summary, agent, commit_hash
             FROM changes
             ORDER BY timestamp DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let records = stmt
        .query_map(
            rusqlite::params![limit as i64, offset as i64],
            |row| {
                Ok(ChangeRecord {
                    id: row.get(0)?,
                    timestamp: row.get(1)?,
                    kind: row.get(2)?,
                    file_path: row.get(3)?,
                    relative_path: row.get(4)?,
                    summary: row.get(5)?,
                    agent: row.get(6)?,
                    commit_hash: row.get(7)?,
                })
            },
        )
        .map_err(|e| format!("Failed to execute query: {}", e))?;

    let mut result = Vec::new();
    for record in records {
        match record {
            Ok(r) => result.push(r),
            Err(e) => eprintln!("Row error: {}", e),
        }
    }

    Ok(result)
}

/// Get change records for a specific file, ordered by timestamp descending
#[tauri::command]
pub fn get_file_changes(
    project_path: String,
    file_path: String,
) -> Result<Vec<ChangeRecord>, String> {
    let db_path = PathBuf::from(&project_path)
        .join(".observatory")
        .join("db.sqlite");

    if !db_path.exists() {
        return Ok(vec![]);
    }

    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp, kind, file_path, relative_path, summary, agent, commit_hash
             FROM changes
             WHERE file_path = ?1 OR relative_path = ?1
             ORDER BY timestamp DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let records = stmt
        .query_map(rusqlite::params![file_path], |row| {
            Ok(ChangeRecord {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                kind: row.get(2)?,
                file_path: row.get(3)?,
                relative_path: row.get(4)?,
                summary: row.get(5)?,
                agent: row.get(6)?,
                commit_hash: row.get(7)?,
            })
        })
        .map_err(|e| format!("Failed to execute query: {}", e))?;

    let mut result = Vec::new();
    for record in records {
        match record {
            Ok(r) => result.push(r),
            Err(e) => eprintln!("Row error: {}", e),
        }
    }

    Ok(result)
}

/// Get a single change record by ID
#[tauri::command]
pub fn get_change_by_id(
    project_path: String,
    change_id: String,
) -> Result<Option<ChangeRecord>, String> {
    let db_path = PathBuf::from(&project_path)
        .join(".observatory")
        .join("db.sqlite");

    if !db_path.exists() {
        return Ok(None);
    }

    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp, kind, file_path, relative_path, summary, agent, commit_hash
             FROM changes WHERE id = ?1",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let record = stmt
        .query_row(rusqlite::params![change_id], |row| {
            Ok(ChangeRecord {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                kind: row.get(2)?,
                file_path: row.get(3)?,
                relative_path: row.get(4)?,
                summary: row.get(5)?,
                agent: row.get(6)?,
                commit_hash: row.get(7)?,
            })
        })
        .ok();

    Ok(record)
}
