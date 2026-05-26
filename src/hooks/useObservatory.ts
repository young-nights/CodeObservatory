// React hooks for CodeObservatory state management

import { useState, useCallback, useEffect, useRef } from "react";
import type { ChangeRecord, WatcherStatus, GraphData, ProjectConfig } from "@/lib/types";
import * as api from "@/lib/api";

// Local storage key for recent projects
const RECENT_PROJECTS_KEY = "code-observatory-recent-projects";

function loadRecentProjects(): ProjectConfig[] {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentProjects(projects: ProjectConfig[]) {
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(projects));
}

/** Hook managing the active project state */
export function useProject() {
  const [project, setProject] = useState<ProjectConfig | null>(null);
  const [recentProjects, setRecentProjects] = useState<ProjectConfig[]>(loadRecentProjects);
  const [isInitializing, setIsInitializing] = useState(false);

  const openProject = useCallback(async (projectPath?: string) => {
    setIsInitializing(true);
    try {
      const path = projectPath ?? (await api.selectProject());
      if (!path) return;

      const hasObservatory = await api.checkObservatory(path);
      if (!hasObservatory) {
        await api.initProject(path);
      }

      const config: ProjectConfig = {
        name: path.split("/").pop() || path,
        path,
        lastOpened: new Date().toISOString(),
        observatoryPath: `${path}/.observatory`,
        isInitialized: true,
      };

      setProject(config);

      // Update recent projects list
      setRecentProjects((prev) => {
        const filtered = prev.filter((p) => p.path !== path);
        const updated = [config, ...filtered].slice(0, 10);
        saveRecentProjects(updated);
        return updated;
      });

      // Start file watcher for this project
      await api.startWatching(path);
    } catch (err) {
      console.error("Failed to open project:", err);
    } finally {
      setIsInitializing(false);
    }
  }, []);

  const closeProject = useCallback(async () => {
    try {
      await api.stopWatching();
    } catch {
      // watcher may already be stopped
    }
    setProject(null);
  }, []);

  return {
    project,
    recentProjects,
    isInitializing,
    openProject,
    closeProject,
  };
}

/** Hook that polls for changes from the backend */
export function useChanges(projectPath: string | null, pollIntervalMs = 3000) {
  const [changes, setChanges] = useState<ChangeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchChanges = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const records = await api.getChanges(projectPath);
      setChanges(records);
    } catch (err) {
      console.error("Failed to fetch changes:", err);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    if (!projectPath) {
      setChanges([]);
      return;
    }
    fetchChanges();
    intervalRef.current = setInterval(fetchChanges, pollIntervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [projectPath, pollIntervalMs, fetchChanges]);

  return { changes, loading, refresh: fetchChanges };
}

/** Hook for watcher status */
export function useWatcher(pollIntervalMs = 5000) {
  const [status, setStatus] = useState<WatcherStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await api.getWatcherStatus();
      setStatus(s);
    } catch {
      // watcher not started yet
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, pollIntervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pollIntervalMs, fetchStatus]);

  return status;
}

/** Hook for graph data */
export function useGraph(projectPath: string | null) {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchGraph = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const data = await api.buildGraph(projectPath);
      setGraph(data);
    } catch (err) {
      console.error("Failed to build graph:", err);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    if (projectPath) fetchGraph();
  }, [projectPath, fetchGraph]);

  return { graph, loading, refresh: fetchGraph };
}
