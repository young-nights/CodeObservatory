// App — Main entry point
// Project selector → AppShell with Dashboard / Timeline / Graph views

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ProjectSelector } from "@/components/project/ProjectSelector";
import { DashboardPage } from "@/pages/Dashboard";
import { TimelinePage } from "@/pages/Timeline";
import { GraphPage } from "@/pages/GraphPage";
import { useProject, useWatcher } from "@/hooks/useObservatory";

type ViewTab = "dashboard" | "timeline" | "graph";

export default function App() {
  const { project, recentProjects, isInitializing, openProject } = useProject();
  const [activeTab, setActiveTab] = useState<ViewTab>("dashboard");
  const status = useWatcher();

  // No project open → show project selector
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

  // Project is open → main shell with views
  return (
    <AppShell
      activeTab={activeTab}
      onTabChange={(tab) => setActiveTab(tab as ViewTab)}
      projectName={project.name}
      watcherRunning={status?.running}
    >
      {activeTab === "dashboard" && <DashboardPage projectPath={project.path} />}
      {activeTab === "timeline" && <TimelinePage projectPath={project.path} />}
      {activeTab === "graph" && <GraphPage projectPath={project.path} />}
    </AppShell>
  );
}
