// Types for CodeObservatory

export type ChangeKind = "created" | "modified" | "deleted";

export interface ChangeRecord {
  id: string;
  timestamp: string; // ISO 8601
  kind: ChangeKind;
  filePath: string;
  relativePath: string;
  summary: string;
  agent?: string; // optional agent identifier
  commitHash?: string;
}

export interface ProjectConfig {
  name: string;
  path: string;
  lastOpened: string; // ISO 8601
  observatoryPath: string;
  isInitialized: boolean;
}

export interface GlobalConfig {
  recentProjects: ProjectConfig[];
  theme: "light" | "dark" | "system";
}

export interface FileNode {
  id: string;
  label: string;
  path: string;
  changeCount?: number;
  /** "dir" or "file"; present only in scan_directory results */
  kind?: "dir" | "file";
  /** File extension without dot; present only for files in scan results */
  extension?: string;
  /** File size in bytes; present only for files in scan results */
  size?: number;
  /** Last modification time as ISO 8601; present only in scan results */
  modified?: string;
}

export interface FileEdge {
  id: string;
  source: string;
  target: string;
  weight?: number;
  label?: string;
}

export interface GraphData {
  nodes: FileNode[];
  edges: FileEdge[];
}

export interface WatcherStatus {
  running: boolean;
  projectPath: string;
  changesDetected: number;
}
