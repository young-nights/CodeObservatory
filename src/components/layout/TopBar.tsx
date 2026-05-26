// TopBar — Theme-aware, always visible, all inline styles
// Language toggle + Theme toggle + project path breadcrumb + watcher status

import { PanelLeft, ChevronRight, FolderOpen, Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "react-i18next";

interface TopBarProps {
  projectName?: string;
  watcherRunning?: boolean;
  collapsed: boolean;
  onExpand: () => void;
}

export function TopBar({ projectName, watcherRunning, collapsed, onExpand }: TopBarProps) {
  const { theme, toggle } = useTheme();
  const { t, i18n } = useTranslation();
  const isDark = theme === "dark";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 44,
        padding: "0 16px",
        flexShrink: 0,
        background: isDark
          ? "rgba(12, 12, 16, 0.92)"
          : "rgba(255, 255, 255, 0.92)",
        backdropFilter: "blur(16px)",
        borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
      }}
    >
      {/* Left: expand button + breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {collapsed && (
          <button
            onClick={onExpand}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 24, height: 24, borderRadius: 4,
              color: isDark ? "#a1a1aa" : "#71717a",
              background: "transparent", border: "none", cursor: "pointer",
            }}
          >
            <PanelLeft size={15} />
          </button>
        )}

        {projectName ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <FolderOpen size={13} color={isDark ? "#a1a1aa" : "#71717a"} />
            <ChevronRight size={10} color={isDark ? "#52525b" : "#d4d4d8"} />
            <span
              style={{
                fontSize: 13, fontWeight: 500, maxWidth: 300,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                color: isDark ? "#fafafa" : "#18181b",
                fontFamily: "system-ui, sans-serif",
              }}
            >
              {projectName}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 13, color: isDark ? "#71717a" : "#a1a1aa", fontFamily: "system-ui, sans-serif" }}>
            CodeObservatory
          </span>
        )}
      </div>

      {/* Right: language toggle + theme toggle + watcher */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {/* Language toggle */}
        <button
          onClick={() => i18n.changeLanguage(i18n.language === "en" ? "zh" : "en")}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 24, borderRadius: 4,
            fontSize: 12, fontWeight: 600,
            color: isDark ? "#a1a1aa" : "#71717a",
            background: "transparent", border: "none", cursor: "pointer",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {i18n.language === "en" ? "中" : "EN"}
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, borderRadius: 4,
            color: isDark ? "#a1a1aa" : "#71717a",
            background: "transparent", border: "none", cursor: "pointer",
          }}
        >
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {/* Watcher status */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span
            style={{
              display: "inline-block", width: 6, height: 6, borderRadius: "50%",
              background: watcherRunning ? "#06b6d4" : "#71717a",
              boxShadow: watcherRunning ? "0 0 6px rgba(6,182,212,0.5)" : "none",
            }}
          />
          <span
            style={{
              fontSize: 11, fontFamily: "system-ui, sans-serif",
              color: watcherRunning ? "#a1a1aa" : "#71717a",
            }}
          >
            {watcherRunning ? t("topbar.watching") : t("topbar.idle")}
          </span>
        </div>
      </div>
    </div>
  );
}
