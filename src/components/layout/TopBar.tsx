// TopBar component — Linear-inspired co-theme design system
// Layout/spacing: Tailwind. Colors/effects: co-* CSS classes.

import { cn } from "@/lib/utils";
import { Search, FolderOpen, ChevronRight } from "lucide-react";

interface TopBarProps {
  projectName?: string;
  watcherRunning?: boolean;
  children?: React.ReactNode;
}

export function TopBar({ projectName, watcherRunning, children }: TopBarProps) {
  return (
    <header className="co-glass co-topbar relative z-10 shrink-0 border-b" style={{ borderColor: "var(--co-border)" }}>
      {/* Left: Breadcrumb */}
      <div className="co-topbar-breadcrumb min-w-0">
        {projectName ? (
          <div className="co-animate-fade-in flex items-center gap-2 min-w-0">
            <FolderOpen
              size={14}
              color="var(--co-text-muted)"
              className="shrink-0"
            />
            <span className="font-medium" style={{ color: "var(--co-text-muted)" }}>
              Projects
            </span>
            <ChevronRight size={12} className="shrink-0" style={{ color: "var(--co-text-dim)" }} />
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

      {/* Center: children (page-specific actions) */}
      <div className="relative z-10 flex-1 flex items-center justify-center">
        {children}
      </div>

      {/* Right: Search + Status */}
      <div className="co-topbar-status">
        {/* Search box placeholder */}
        <div className="hidden sm:flex items-center gap-2 h-7 px-3 rounded-md border text-xs cursor-not-allowed select-none"
          style={{
            background: "var(--co-bg-hover)",
            borderColor: "var(--co-border)",
            color: "var(--co-text-muted)",
            fontSize: "var(--co-font-size-xs)",
          }}
        >
          <Search size={12} />
          <span>Search</span>
          <kbd className="ml-4 px-1.5 py-0.5 rounded text-[10px] border"
            style={{
              background: "var(--co-bg-card)",
              borderColor: "var(--co-border)",
              color: "var(--co-text-dim)",
            }}
          >
            ⌘K
          </kbd>
        </div>

        {/* Separator */}
        <div className="w-px h-5" style={{ background: "var(--co-border)" }} />

        {/* Watcher status */}
        <div className="co-animate-fade-in flex items-center gap-2">
          <span
            className={cn(
              "co-status-dot",
              watcherRunning ? "co-status-dot-online" : "co-status-dot-offline"
            )}
          />
          <span
            className={cn(
              "co-badge text-[10px]",
              watcherRunning ? "co-badge-success" : "co-badge-secondary"
            )}
          >
            {watcherRunning ? "Watching" : "Idle"}
          </span>
        </div>
      </div>
    </header>
  );
}
