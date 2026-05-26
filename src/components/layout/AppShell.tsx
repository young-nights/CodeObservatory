// AppShell — Deep Space Galaxy layout shell
// Sidebar (200/48px) + TopBar (44px) + main content
// Exports SidebarContext for child components

import { type ReactNode, createContext, useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export const SidebarContext = createContext<{ collapsed: boolean }>({ collapsed: false });

const STORAGE_KEY = "code-observatory-sidebar-collapsed";

function getInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

interface AppShellProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  projectName?: string;
  watcherRunning?: boolean;
  children: ReactNode;
}

export function AppShell({
  activeTab,
  onTabChange,
  projectName,
  watcherRunning,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const handleExpand = useCallback(() => {
    setCollapsed(false);
    try { localStorage.setItem(STORAGE_KEY, "false"); } catch { /* ignore */ }
  }, []);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--cosmic-bg)" }}>
      {/* Sidebar — 200/48px dual mode */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        collapsed={collapsed}
        onToggle={handleToggle}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          projectName={projectName}
          watcherRunning={watcherRunning}
          collapsed={collapsed}
          onExpand={handleExpand}
        />

        <SidebarContext.Provider value={{ collapsed }}>
          <main className="flex-1 overflow-hidden relative">
            {children}
          </main>
        </SidebarContext.Provider>
      </div>
    </div>
  );
}
