// Sidebar — Cursor-style minimal sidebar
// 200px expanded, 0px collapsed (fully hidden)
// Cyan (#06b6d4) active indicator, dark zinc palette
// System font (Inter fallback), no serif

import { motion } from "framer-motion";
import { Telescope, LayoutDashboard, Activity, Share2, Settings, PanelRight } from "lucide-react";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "timeline", label: "Timeline", icon: Activity },
  { id: "graph", label: "Graph", icon: Share2 },
];

const CYAN = "#06b6d4";

export function Sidebar({ activeTab, onTabChange, collapsed, onToggle }: SidebarProps) {
  return (
    <motion.aside
      animate={{ width: collapsed ? 0 : 200 }}
      transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
      className="flex flex-col h-screen shrink-0 overflow-hidden"
      style={{ background: "#0c0c0e", borderRight: "1px solid #1a1a1e" }}
    >
      {/* Brand */}
      <div
        className="flex items-center gap-3 shrink-0 whitespace-nowrap"
        style={{ padding: "16px 16px 12px" }}
      >
        <div
          className="flex items-center justify-center rounded-md shrink-0"
          style={{
            width: 28,
            height: 28,
            background: CYAN,
            color: "#09090b",
          }}
        >
          <Telescope size={16} strokeWidth={2} />
        </div>
        <span
          className="font-semibold tracking-tight"
          style={{ fontSize: 15, color: "#e4e4e7" }}
        >
          CodeObservatory
        </span>
      </div>

      {/* Separator */}
      <div
        className="shrink-0 mx-3 opacity-60"
        style={{ height: 1, background: "#1a1a1e" }}
      />

      {/* Navigation */}
      <nav
        className="flex-1 flex flex-col shrink-0"
        style={{ padding: "8px 8px", gap: 2 }}
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className="flex items-center gap-3 w-full rounded-md transition-colors duration-150"
              style={{
                height: 36,
                padding: "0 12px",
                fontSize: 13,
                color: isActive ? "#e4e4e7" : "#71717a",
                background: isActive ? "rgba(6,182,212,0.06)" : "transparent",
                borderLeft: isActive ? `2px solid ${CYAN}` : "2px solid transparent",
                fontWeight: isActive ? 500 : 400,
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "#e4e4e7";
                  e.currentTarget.style.background = "rgba(6,182,212,0.04)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "#71717a";
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
              <span className="whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className="flex items-center justify-between shrink-0 whitespace-nowrap"
        style={{
          padding: "12px 12px",
          borderTop: "1px solid #1a1a1e",
          fontSize: 12,
          color: "#71717a",
        }}
      >
        <div className="flex items-center gap-3">
          <Settings
            size={14}
            style={{ color: "#52525b", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#a1a1aa"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#52525b"; }}
          />
          <span style={{ fontSize: 11 }}>v0.1.0</span>
        </div>
        <button
          onClick={onToggle}
          className="flex items-center justify-center rounded-md transition-colors duration-150"
          style={{
            width: 26,
            height: 26,
            border: "none",
            background: "none",
            color: "#52525b",
            cursor: "pointer",
          }}
          title="Collapse sidebar"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#a1a1aa";
            e.currentTarget.style.background = "rgba(6,182,212,0.06)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#52525b";
            e.currentTarget.style.background = "none";
          }}
        >
          <PanelRight size={14} />
        </button>
      </div>
    </motion.aside>
  );
}
