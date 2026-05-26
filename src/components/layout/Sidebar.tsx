// Sidebar — Sci-fi cyberpunk navigation
// 200px expanded, 0px collapsed with framer-motion

import { motion } from "framer-motion";
import {
  Telescope,
  LayoutDashboard,
  GitBranch,
  Share2,
  PanelRight,
} from "lucide-react";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "timeline", label: "Timeline", icon: GitBranch },
  { id: "graph", label: "Graph", icon: Share2 },
] as const;

interface SidebarProps {
  activeTab: string;
  onTabChange: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ activeTab, onTabChange, collapsed, onToggle }: SidebarProps) {
  return (
    <motion.aside
      animate={{ width: collapsed ? 0 : 200 }}
      transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
      className="flex flex-col shrink-0 overflow-hidden h-full"
      style={{
        background: "#0c0c10",
        borderRight: collapsed ? "none" : "1px solid #1c1c24",
      }}
    >
      {/* Brand */}
      <div
        className="flex items-center gap-2.5 px-4 h-12 shrink-0"
        style={{ borderBottom: "1px solid #1c1c24" }}
      >
        <div
          className="flex items-center justify-center w-7 h-7 rounded-lg"
          style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
        >
          <Telescope size={14} color="white" strokeWidth={2.5} />
        </div>
        <span
          className="text-sm font-semibold tracking-tight whitespace-nowrap"
          style={{ color: "#e4e4e7", fontFamily: "system-ui, sans-serif" }}
        >
          CodeObservatory
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className="w-full flex items-center gap-2.5 h-9 px-2.5 rounded-md text-left transition-colors relative"
              style={{
                color: active ? "#e4e4e7" : "#71717a",
                background: active ? "rgba(6,182,212,0.08)" : "transparent",
                fontSize: 13,
                fontWeight: 500,
                fontFamily: "system-ui, sans-serif",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.color = "#a1a1aa";
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.color = "#71717a";
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {/* Active indicator bar */}
              {active && (
                <span
                  className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full"
                  style={{ background: "#06b6d4" }}
                />
              )}
              <Icon size={15} color={active ? "#06b6d4" : "#52525b"} />
              <span className="whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 h-10 shrink-0"
        style={{ borderTop: "1px solid #1c1c24" }}
      >
        <span className="text-xs whitespace-nowrap" style={{ color: "#3f3f46", fontFamily: "system-ui, sans-serif" }}>
          v0.1.0
        </span>
        <button
          onClick={onToggle}
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
          <PanelRight size={14} />
        </button>
      </div>
    </motion.aside>
  );
}
