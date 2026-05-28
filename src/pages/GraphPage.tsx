import { useContext } from "react";
import CosmicProjectGalaxy from "@/components/graph/CosmicProjectGalaxy";
import { SidebarContext } from "@/components/layout/AppShell";

interface GraphPageProps { projectPath: string; }

export function GraphPage({ projectPath }: GraphPageProps) {
  const { collapsed } = useContext(SidebarContext);
  
  // Safety: ensure projectPath is valid before rendering heavy 3D component
  if (!projectPath) {
    return <div style={{ padding: 40, color: "#8070a0" }}>No project selected</div>;
  }
  
  return (
    <ErrorBoundary fallback={<div style={{ padding: 40, color: "#ff6b6b" }}>Graph failed to load. Check console for errors.</div>}>
      <CosmicProjectGalaxy projectPath={projectPath} fullscreen={collapsed} />
    </ErrorBoundary>
  );
}

// Simple error boundary
import { Component, type ReactNode } from "react";
class ErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error) { console.error("[GraphPage Error]", error); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: "center" }}>
          <p style={{ color: "#ff6b6b", fontSize: 16, fontWeight: 600 }}>Graph Error</p>
          <p style={{ color: "#8070a0", fontSize: 13, marginTop: 8 }}>{this.state.error?.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
