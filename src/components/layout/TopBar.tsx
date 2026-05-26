// TopBar — Linear-style minimal top bar, 48px
// Left: PanelLeft button when sidebar collapsed
// Center: current project name
// Right: watcher status dot + label

import { PanelLeft } from "lucide-react";

interface TopBarProps {
  projectName?: string;
  watcherRunning?: boolean;
  collapsed?: boolean;
  onExpandSidebar?: () => void;
}

export function TopBar({
  projectName,
  watcherRunning,
  collapsed,
  onExpandSidebar,
}: TopBarProps) {
  return (
    <header
      className="flex items-center shrink-0"
      style={{
        height: 48,
        padding: "0 16px",
        background: "#0c0c0e",
        borderBottom: "1px solid #1a1a1e",
      }}
    >
      {/* Left: expand button (only when sidebar is collapsed) */}
      <div className="flex items-center" style={{ width: 32 }}>
        {collapsed && (
          <button
            onClick={onExpandSidebar}
            className="flex items-center justify-center rounded-md transition-colors duration-150"
            style={{
              width: 28,
              height: 28,
              border: "none",
              background: "none",
              color: "#52525b",
              cursor: "pointer",
            }}
            title="Expand sidebar"
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#a1a1aa";
              e.currentTarget.style.background = "rgba(6,182,212,0.06)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#52525b";
              e.currentTarget.style.background = "none";
            }}
          >
            <PanelLeft size={16} />
          </button>
        )}
      </div>

      {/* Center: project name */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        {projectName ? (
          <span
            className="truncate"
            style={{ fontSize: 13, color: "#e4e4e7", fontWeight: 500 }}
          >
            {projectName}
          </span>
        ) : (
          <span style={{ fontSize: 13, color: "#71717a" }}>
            CodeObservatory
          </span>
        )}
      </div>

      {/* Right: watcher status */}
      <div className="flex items-center justify-end" style={{ width: 120 }}>
        <div className="flex items-center gap-2">
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: watcherRunning ? "#06b6d4" : "#3f3f46",
              boxShadow: watcherRunning ? "0 0 6px rgba(6,182,212,0.5)" : "none",
              flexShrink: 0,
              transition: "background 0.2s ease, box-shadow 0.2s ease",
            }}
          />
          <span
            style={{
              fontSize: 12,
              color: watcherRunning ? "#a1a1aa" : "#52525b",
              transition: "color 0.2s ease",
            }}
          >
            {watcherRunning ? "Watching" : "Idle"}
          </span>
        </div>
      </div>
    </header>
  );
}
