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
  changeCount: number;
}

export interface FileEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  label: string;
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
