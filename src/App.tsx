// App — Main entry point
// Single ThemeProvider wrapping entire app

import { useState } from "react";
import { ThemeProvider } from "@/hooks/useTheme";
import { AppShell } from "@/components/layout/AppShell";
import { ProjectSelector } from "@/components/project/ProjectSelector";
import { DashboardPage } from "@/pages/Dashboard";
import { TimelinePage } from "@/pages/Timeline";
import { useProject, useWatcher } from "@/hooks/useObservatory";

type ViewTab = "dashboard" | "timeline";

function AppContent() {
  const { project, recentProjects, isInitializing, openProject, closeProject } = useProject();
  const [activeTab, setActiveTab] = useState<ViewTab>("dashboard");
  const status = useWatcher();

  if (!project) {
    return (
      <ProjectSelector
        recentProjects={recentProjects}
        isInitializing={isInitializing}
        onOpenProject={openProject}
        onSelectRecent={(path) => openProject(path)}
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
