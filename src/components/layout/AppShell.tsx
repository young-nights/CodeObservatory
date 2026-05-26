// AppShell — 100% inline styles, zero Tailwind
// Guaranteed rendering on Windows with dark/light theme support

import { type ReactNode, createContext, useState, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export const SidebarContext = createContext({ collapsed: false });

const KEY = "co-sidebar-collapsed";

interface AppShellProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  projectName?: string;
  watcherRunning?: boolean;
  children: ReactNode;
}

export function AppShell({ activeTab, onTabChange, projectName, watcherRunning, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  });
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const handleToggle = useCallback(() => {
    setCollapsed((v) => { const n = !v; try { localStorage.setItem(KEY, n ? "1" : "0"); } catch {} return n; });
  }, []);

  return (
    <SidebarContext.Provider value={{ collapsed }}>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: isDark ? "#08080c" : "#f5f5f7" }}>
        <Sidebar activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} onToggle={handleToggle} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <TopBar projectName={projectName} watcherRunning={watcherRunning} collapsed={collapsed} onExpand={() => setCollapsed(false)} />
          <main style={{ flex: 1, overflow: "hidden", background: isDark ? "#05050f" : "#f0f0f5" }}>
            <div style={{ height: "100%" }}>
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
