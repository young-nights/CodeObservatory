import { useContext } from "react";
import ProjectGalaxy from "@/components/graph/ProjectGalaxy";
import { SidebarContext } from "@/components/layout/AppShell";

interface GraphPageProps { projectPath: string; }

export function GraphPage({ projectPath }: GraphPageProps) {
  const { collapsed } = useContext(SidebarContext);
  return <ProjectGalaxy projectPath={projectPath} fullscreen={collapsed} />;
}
