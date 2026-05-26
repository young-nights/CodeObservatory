// TopBar — Sci-fi minimal top bar
// 44px, clean, watcher status indicator

import { PanelLeft, ChevronRight, FolderOpen } from "lucide-react";

interface TopBarProps {
  projectName?: string;
  watcherRunning?: boolean;
  collapsed: boolean;
  onExpand: () => void;
}

export function TopBar({
  projectName,
  watcherRunning,
  collapsed,
  onExpand,
}: TopBarProps) {
  return (
    <div
      className="flex items-center h-11 px-4 shrink-0 justify-between"
      style={{
        background: "#0c0c10",
        borderBottom: "1px solid #1c1c24",
      }}
    >
      {/* Left section */}
      <div className="flex items-center gap-2 min-w-0">
        {collapsed && (
          <button
            onClick={onExpand}
            className="flex items-center justify-center w-6 h-6 rounded transition-colors"
            style={{ color: "#52525b" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#a1a1aa";
              e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#52525b";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <PanelLeft size={15} />
          </button>
        )}

        {/* Breadcrumb */}
        {projectName ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <FolderOpen size={13} style={{ color: "#52525b", flexShrink: 0 }} />
            <ChevronRight size={10} style={{ color: "#3f3f46", flexShrink: 0 }} />
            <span
              className="text-sm font-medium truncate"
              style={{ color: "#d4d4d8", fontFamily: "system-ui, sans-serif" }}
            >
              {projectName}
            </span>
          </div>
        ) : (
          <span className="text-sm" style={{ color: "#52525b", fontFamily: "system-ui, sans-serif" }}>
            CodeObservatory
          </span>
        )}
      </div>

      {/* Right section — Watcher status */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background: watcherRunning ? "#06b6d4" : "#3f3f46",
            boxShadow: watcherRunning ? "0 0 6px rgba(6,182,212,0.5)" : "none",
          }}
        />
        <span
          className="text-xs"
          style={{
            color: watcherRunning ? "#71717a" : "#3f3f46",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {watcherRunning ? "Watching" : "Idle"}
        </span>
      </div>
    </div>
  );
}
