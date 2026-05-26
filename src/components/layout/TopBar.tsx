// TopBar — Sci-fi minimal top bar
// 44px, clean, watcher status indicator

import { PanelLeft, ChevronRight, FolderOpen, Sun, Moon, Globe } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "react-i18next";

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
  const { theme, toggle } = useTheme();
  const { t, i18n } = useTranslation();
  const isDark = theme === "dark";

  const bg = isDark ? "#0c0c10" : "#fafafa";
  const border = isDark ? "1px solid #1c1c24" : "1px solid rgba(0,0,0,0.08)";
  const textDim = isDark ? "#52525b" : "#a1a1aa";
  const textMuted = isDark ? "#71717a" : "#52525b";
  const textSecondary = isDark ? "#a1a1aa" : "#3f3f46";
  const textPrimary = isDark ? "#d4d4d8" : "#18181b";
  const textPlaceholder = isDark ? "#52525b" : "#a1a1aa";
  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const chevronColor = isDark ? "#3f3f46" : "#d4d4d8";
  const idleDot = isDark ? "#3f3f46" : "#d4d4d8";

  return (
    <div
      className="flex items-center h-11 px-4 shrink-0 justify-between"
      style={{ background: bg, borderBottom: border }}
    >
      {/* Left section */}
      <div className="flex items-center gap-2 min-w-0">
        {collapsed && (
          <button
            onClick={onExpand}
            className="flex items-center justify-center w-6 h-6 rounded transition-colors"
            style={{ color: textDim }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = textSecondary;
              e.currentTarget.style.background = hoverBg;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = textDim;
              e.currentTarget.style.background = "transparent";
            }}
          >
            <PanelLeft size={15} />
          </button>
        )}

        {/* Breadcrumb */}
        {projectName ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <FolderOpen size={13} style={{ color: textDim, flexShrink: 0 }} />
            <ChevronRight size={10} style={{ color: chevronColor, flexShrink: 0 }} />
            <span
              className="text-sm font-medium truncate"
              style={{ color: textPrimary, fontFamily: "system-ui, sans-serif" }}
            >
              {projectName}
            </span>
          </div>
        ) : (
          <span className="text-sm" style={{ color: textPlaceholder, fontFamily: "system-ui, sans-serif" }}>
            CodeObservatory
          </span>
        )}
      </div>

      {/* Right section — Theme toggle + Lang toggle + Watcher status */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Language toggle */}
        <button
          onClick={() => i18n.changeLanguage(i18n.language === "en" ? "zh" : "en")}
          className="flex items-center justify-center w-7 h-6 rounded text-xs font-semibold transition-colors"
          title={t("topbar.toggleLang")}
          style={{ color: textDim, fontFamily: "system-ui, sans-serif" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = textSecondary;
            e.currentTarget.style.background = hoverBg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = textDim;
            e.currentTarget.style.background = "transparent";
          }}
        >
          {i18n.language === "en" ? "中" : "EN"}
        </button>
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="flex items-center justify-center w-6 h-6 rounded transition-colors"
          title={t("topbar.toggleTheme")}
          style={{ color: textDim }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = textSecondary;
            e.currentTarget.style.background = hoverBg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = textDim;
            e.currentTarget.style.background = "transparent";
          }}
        >
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {/* Watcher status */}
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background: watcherRunning ? "#06b6d4" : idleDot,
            boxShadow: watcherRunning ? "0 0 6px rgba(6,182,212,0.5)" : "none",
          }}
        />
        <span
          className="text-xs"
          style={{
            color: watcherRunning ? textMuted : idleDot,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {watcherRunning ? "Watching" : "Idle"}
        </span>
      </div>
    </div>
  );
}
