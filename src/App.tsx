// App — Main entry point
// Single ThemeProvider wrapping entire app

import { useState, useCallback, useEffect } from "react";
import { ThemeProvider } from "@/hooks/useTheme";
import { AppShell } from "@/components/layout/AppShell";
import { ProjectSelector } from "@/components/project/ProjectSelector";
import { DashboardPage } from "@/pages/Dashboard";
import { TimelinePage } from "@/pages/Timeline";
import { GraphPage } from "@/pages/GraphPage";
import { useProject, useWatcher } from "@/hooks/useObservatory";

type ViewTab = "dashboard" | "timeline" | "graph";

const SELECTED_PROJECTS_KEY = "code-observatory-selected-projects";

function loadSelectedProjects(): string[] {
  try {
    const raw = localStorage.getItem(SELECTED_PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSelectedProjects(projects: string[]) {
  localStorage.setItem(SELECTED_PROJECTS_KEY, JSON.stringify(projects));
}

function AppContent() {
  const { project, recentProjects, isInitializing, openProject, closeProject } = useProject();
  const [activeTab, setActiveTab] = useState<ViewTab>("dashboard");
  const status = useWatcher();

  // Multi-project selection state
  const [selectedProjects, setSelectedProjects] = useState<string[]>(loadSelectedProjects);

  const toggleProjectSelection = useCallback((path: string) => {
    setSelectedProjects((prev) => {
      const next = prev.includes(path)
        ? prev.filter((p) => p !== path)
        : [...prev, path];
      saveSelectedProjects(next);
      return next;
    });
  }, []);

  const selectAllProjects = useCallback((paths: string[]) => {
    setSelectedProjects(paths);
    saveSelectedProjects(paths);
  }, []);

  // Auto-add opened project to selectedProjects for galaxy cluster
  useEffect(() => {
    if (project) {
      setSelectedProjects((prev) => {
        if (prev.includes(project.path)) return prev;
        const next = [...prev, project.path];
        saveSelectedProjects(next);
        return next;
      });
    }
  }, [project]);

  if (!project) {
    return (
      <ProjectSelector
        recentProjects={recentProjects}
        isInitializing={isInitializing}
        onOpenProject={openProject}
        onSelectRecent={(path) => openProject(path)}
        selectedProjects={selectedProjects}
        onToggleProject={toggleProjectSelection}
        onSelectAll={selectAllProjects}
      />
    );
  }

  return (
    <AppShell
      activeTab={activeTab}
      onTabChange={(tab) => setActiveTab(tab as ViewTab)}
      projectName={project.name}
      watcherRunning={status?.running}
      onCloseProject={closeProject}
    >
      {activeTab === "dashboard" && <DashboardPage projectPath={project.path} />}
      {activeTab === "timeline" && <TimelinePage projectPath={project.path} />}
      {activeTab === "graph" && <GraphPage selectedProjects={selectedProjects} />}
    </AppShell>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
