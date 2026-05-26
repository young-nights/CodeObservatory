// TopBar — 44px, serif project name, watcher dot + text
// Design: Precision Instrument · no glass · no badges
// Obsidian-style: expand button when sidebar is collapsed

import { cn } from "@/lib/utils";
import { FolderOpen, ChevronRight, PanelLeft } from "lucide-react";

interface TopBarProps {
  projectName?: string;
  watcherRunning?: boolean;
  children?: React.ReactNode;
  collapsed?: boolean;
  onExpand?: () => void;
}

export function TopBar({
  projectName,
  watcherRunning,
  children,
  collapsed,
  onExpand,
}: TopBarProps) {
  return (
    <header className="co-topbar shrink-0">
      {/* Left: expand button (when collapsed) + serif project name breadcrumb */}
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
              style={{ color: "var(--co-text-muted)" }}
            />
            <span style={{ color: "var(--co-text-muted)" }}>
              Projects
            </span>
            <ChevronRight
              size={11}
              className="shrink-0"
              style={{ color: "var(--co-text-dim)" }}
            />
            <span className="co-topbar-breadcrumb-current truncate">
              {projectName}
            </span>
          </div>
        ) : (
          <span
            className="co-topbar-breadcrumb-current"
            style={{ fontFamily: "var(--co-font-serif)" }}
          >
            CodeObservatory
          </span>
        )}
      </div>

      {/* Center: children */}
      <div className="flex-1 flex items-center justify-center">
        {children}
      </div>

      {/* Right: watcher status — dot + text only */}
      <div className="co-topbar-status">
        <div className="co-animate-fade-in flex items-center gap-1.5">
          <span
            className={cn(
              "co-status-dot",
              watcherRunning ? "co-status-dot-active" : "co-status-dot-idle"
            )}
          />
          <span
            style={{
              color: watcherRunning
                ? "var(--co-success)"
                : "var(--co-text-muted)",
            }}
          >
            {watcherRunning ? "Watching" : "Idle"}
          </span>
        </div>
      </div>
    </header>
  );
}
