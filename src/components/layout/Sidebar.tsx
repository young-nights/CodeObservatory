// Sidebar — 100% inline styles, dual theme, framer-motion width animation

import { motion } from "framer-motion";
import { Telescope, LayoutDashboard, GitBranch, Share2, PanelRight } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "react-i18next";

const NAV = [
  { id: "dashboard", label: "nav.dashboard", icon: LayoutDashboard },
  { id: "timeline", label: "nav.timeline", icon: GitBranch },
  { id: "graph", label: "nav.graph", icon: Share2 },
] as const;

interface SidebarProps {
  activeTab: string;
  onTabChange: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ activeTab, onTabChange, collapsed, onToggle }: SidebarProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const isDark = theme === "dark";

  const s = {
    bg: isDark ? "#0c0c10" : "#fafafa",
    border: isDark ? "#1c1c24" : "#e5e7eb",
    text: isDark ? "#e4e4e7" : "#18181b",
    textDim: isDark ? "#52525b" : "#9ca3af",
    textMuted: isDark ? "#71717a" : "#6b7280",
    textActive: isDark ? "#e4e4e7" : "#111827",
    activeBg: isDark ? "rgba(6,182,212,0.08)" : "rgba(6,182,212,0.1)",
    activeIcon: "#06b6d4",
    iconDim: isDark ? "#52525b" : "#9ca3af",
    hoverBg: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)",
    hoverText: isDark ? "#a1a1aa" : "#4b5563",
    version: isDark ? "#3f3f46" : "#d1d5db",
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 0 : 200 }}
      transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
      style={{
        display: "flex", flexDirection: "column", height: "100%",
        overflow: "hidden", flexShrink: 0,
        background: s.bg,
        borderRight: collapsed ? "none" : `1px solid ${s.border}`,
      }}
    >
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px", height: 44, flexShrink: 0, borderBottom: `1px solid ${s.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 7, background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
          <Telescope size={13} color="white" strokeWidth={2.5} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: s.text, fontFamily: "system-ui, sans-serif", whiteSpace: "nowrap" }}>
          {t("sidebar.brand")}
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "6px 6px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                height: 34, padding: "0 10px", borderRadius: 6,
                textAlign: "left", width: "100%", border: "none",
                cursor: "pointer", position: "relative",
                fontSize: 13, fontWeight: 500,
                color: active ? s.textActive : s.textMuted,
                background: active ? s.activeBg : "transparent",
                fontFamily: "system-ui, sans-serif",
                transition: "all 0.12s ease",
              }}
              onMouseEnter={(e) => {
                if (!active) { e.currentTarget.style.color = s.hoverText; e.currentTarget.style.background = s.hoverBg; }
              }}
              onMouseLeave={(e) => {
                if (!active) { e.currentTarget.style.color = s.textMuted; e.currentTarget.style.background = "transparent"; }
              }}
            >
              {active && (
                <span style={{ position: "absolute", left: 0, top: 7, bottom: 7, width: 2, borderRadius: "0 2px 2px 0", background: s.activeIcon }} />
              )}
              <Icon size={14} color={active ? s.activeIcon : s.iconDim} />
              <span style={{ whiteSpace: "nowrap" }}>{t(item.label)}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: 36, flexShrink: 0, borderTop: `1px solid ${s.border}` }}>
        <span style={{ fontSize: 10, color: s.version, fontFamily: "system-ui, sans-serif", whiteSpace: "nowrap" }}>
          {t("sidebar.version")}
        </span>
        <button onClick={onToggle} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 4, color: s.iconDim, border: "none", background: "transparent", cursor: "pointer" }}>
          <PanelRight size={13} />
        </button>
      </div>
    </motion.aside>
  );
}
