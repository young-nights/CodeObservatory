// Sidebar — 200px precision navigation
// Design: Precision Instrument · OKLCH · serif brand · 2px accent indicator

import { cn } from "@/lib/utils";
import {
  Telescope,
  LayoutDashboard,
  Activity,
  Share2,
} from "lucide-react";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  collapsed?: boolean;
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={14} /> },
  { id: "timeline", label: "Timeline", icon: <Activity size={14} /> },
  { id: "graph", label: "Graph", icon: <Share2 size={14} /> },
];

export function Sidebar({
  activeTab,
  onTabChange,
  collapsed = false,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "co-sidebar flex flex-col h-screen relative shrink-0 transition-all",
        collapsed ? "w-[56px]" : "w-[200px]"
      )}
      style={{ transitionDuration: "var(--co-duration-normal)" }}
    >
      {/* Brand — serif 18px Georgia -0.01em */}
      <div className="co-sidebar-brand shrink-0">
        <div className="co-sidebar-brand-icon">
          <Telescope size={16} strokeWidth={2} />
        </div>
        {!collapsed && (
          <span className="co-sidebar-brand-text co-animate-fade-in">
            CodeObservatory
          </span>
        )}
      </div>

      {/* Separator */}
      <div className="co-sidebar-separator" />

      {/* Navigation — 13px, padding 8px 14px, 2px gap */}
      <nav className="co-sidebar-nav">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <div key={item.id} className="relative">
              <button
                onClick={() => onTabChange(item.id)}
                className={cn(
                  "co-nav-item",
                  isActive && "co-nav-item-active",
                  collapsed && "justify-center px-0"
                )}
                title={collapsed ? item.label : undefined}
              >
                {isActive && <span className="co-nav-indicator" />}
                <span className={cn(isActive && "relative z-10")}>{item.icon}</span>
                {!collapsed && (
                  <span className={cn(isActive && "relative z-10")}>
                    {item.label}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </nav>

      {/* Footer — version 10px, right aligned */}
      <div className="co-sidebar-footer shrink-0">
        <div
          className={cn(
            "co-sidebar-version",
            collapsed && "text-center"
          )}
        >
          v0.1.0
        </div>
      </div>
    </aside>
  );
}
