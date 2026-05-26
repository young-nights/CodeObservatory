// TopBar — Cosmic theme, 44px
// Breadcrumb with serif project name, watcher status dot

import { cn } from "@/lib/utils";
import { FolderOpen, ChevronRight, PanelLeft } from "lucide-react";

interface TopBarProps {
  projectName?: string;
  watcherRunning?: boolean;
  collapsed?: boolean;
  onExpand?: () => void;
}

export function TopBar({
  projectName,
  watcherRunning,
  collapsed,
  onExpand,
}: TopBarProps) {
  return (
    <header className="co-topbar shrink-0">
      {/* Left: expand button (collapsed) + breadcrumb */}
      <div className="co-topbar-breadcrumb min-w-0">
        {collapsed && (
          <button
            onClick={onExpand}
            className="co-topbar-expand-btn"
            title="Expand sidebar"
          >
            <PanelLeft size={16} />
          </button>
        )}
        {projectName ? (
          <div className="co-animate-fade-in flex items-center gap-2 min-w-0">
            <FolderOpen
              size={13}
              className="shrink-0"
              style={{ color: "var(--cosmic-text-dim)" }}
            />
            <span style={{ color: "var(--cosmic-text-dim)" }}>
              Projects
            </span>
            <ChevronRight
              size={11}
              className="shrink-0"
              style={{ color: "var(--cosmic-text-dim)" }}
            />
            <span className="co-topbar-breadcrumb-current truncate">
              {projectName}
            </span>
          </div>
        ) : (
          <span className="co-topbar-breadcrumb-current">
            CodeObservatory
          </span>
        )}
      </div>

      {/* Right: watcher status dot */}
      <div className="co-topbar-status">
        <div className="co-animate-fade-in flex items-center gap-1.5">
          <span
            className={cn(
              "co-status-dot",
              watcherRunning ? "co-status-dot-active" : "co-status-dot-idle",
            )}
          />
          <span
            style={{
              color: watcherRunning ? "#50c878" : "var(--cosmic-text-dim)",
            }}
          >
            {watcherRunning ? "Watching" : "Idle"}
          </span>
        </div>
      </div>
    </header>
  );
}
