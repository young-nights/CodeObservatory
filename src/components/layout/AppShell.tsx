// App shell layout with sidebar navigation

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  GitBranch,
  Share2,
  FolderOpen,
  Activity,
} from "lucide-react";

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
}

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { id: "timeline", label: "Timeline", icon: <Activity size={18} /> },
  { id: "graph", label: "Graph", icon: <Share2 size={18} /> },
];

interface AppShellProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  projectName?: string;
  watcherRunning?: boolean;
  children: ReactNode;
}

export function AppShell({ activeTab, onTabChange, projectName, watcherRunning, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 border-r bg-card flex flex-col">
        {/* App branding */}
        <div className="h-14 flex items-center gap-2 px-4 border-b">
          <GitBranch className="text-primary" size={20} />
          <span className="font-semibold text-sm">CodeObservatory</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              disabled={item.disabled}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                activeTab === item.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                item.disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Bottom status */}
        {projectName && (
          <div className="p-3 border-t text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-2">
              <FolderOpen size={14} />
              <span className="truncate">{projectName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                "h-2 w-2 rounded-full",
                watcherRunning ? "bg-green-500" : "bg-gray-300"
              )} />
              {watcherRunning ? "Watching" : "Idle"}
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
