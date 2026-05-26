// GraphPage — Deep Space Galaxy container
// Uses CosmicProjectGalaxy for immersive 3D visualization

import { useContext } from "react";
import CosmicProjectGalaxy from "@/components/graph/CosmicProjectGalaxy";
import { SidebarContext } from "@/components/layout/AppShell";

interface GraphPageProps {
  projectPath: string;
}

export function GraphPage({ projectPath }: GraphPageProps) {
  const { collapsed } = useContext(SidebarContext);

  return (
    <CosmicProjectGalaxy
      projectPath={projectPath}
      fullscreen={collapsed}
    />
  );
}
