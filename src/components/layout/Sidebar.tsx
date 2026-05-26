// Sidebar navigation — co-theme design system
// Layout/spacing: Tailwind. Colors/effects: co-* CSS classes.

import { cn } from "@/lib/utils";
import {
  Telescope,
  LayoutDashboard,
  GitBranch,
  Share2,
  Settings,
  User,
  Activity,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  projectName?: string;
  collapsed?: boolean;
}

const navItems: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { id: "timeline", label: "Timeline", icon: <Activity size={18} /> },
  { id: "graph", label: "Graph", icon: <Share2 size={18} /> },
];

export function Sidebar({
  activeTab,
  onTabChange,
  projectName,
  collapsed = false,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "co-sidebar flex flex-col h-screen relative transition-all duration-300",
        collapsed ? "w-[60px]" : "w-[210px]"
      )}
    >
      {/* App branding */}
      <div className="co-sidebar-brand shrink-0">
        <div className="co-sidebar-brand-icon">
          <Telescope size={16} strokeWidth={2} color="white" />
        </div>
        {!collapsed && (
          <span className="co-sidebar-brand-text co-animate-fade-in">
            CodeObservatory
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="co-sidebar-nav">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <div key={item.id} className="relative">
              <button
                disabled={item.disabled}
                onClick={() => onTabChange(item.id)}
                className={cn(
                  "co-nav-item",
                  isActive && "co-nav-item-active",
                  item.disabled && "opacity-50 cursor-not-allowed",
                  collapsed && "justify-center px-0"
                )}
                title={collapsed ? item.label : undefined}
              >
                {isActive && <span className="co-nav-indicator" />}
                <span>{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </button>
            </div>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="co-sidebar-footer shrink-0">
        <div className={cn("space-y-2", collapsed && "px-0")}>
          {/* User area */}
          {!collapsed && (
            <div className="flex items-center gap-2.5 px-1">
              <div className="co-sidebar-avatar">
                <User size={12} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: "var(--co-text)" }}>
                  {projectName || "No Project"}
                </p>
                <p className="text-[10px]" style={{ color: "var(--co-text-muted)" }}>
                  Local
                </p>
              </div>
            </div>
          )}

          {/* Settings button */}
          <button
            className={cn(
              "w-full co-nav-item",
              collapsed && "justify-center px-0"
            )}
          >
            <Settings size={14} />
            {!collapsed && <span>Settings</span>}
          </button>

          {/* Version */}
          <div
            className={cn(
              "co-sidebar-version",
              collapsed ? "text-center" : "px-1"
            )}
          >
            v0.1.0
          </div>
        </div>
      </div>
    </aside>
  );
}
