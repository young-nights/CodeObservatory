// AppLayout — Precision Instrument main layout
// Sidebar (200px) + TopBar (44px) + Content
// Obsidian-style collapsible sidebar with localStorage persistence

import { type ReactNode, useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

const STORAGE_KEY = "code-observatory-sidebar-collapsed";

function getInitialCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "true";
  } catch {
    return false;
  }
}

interface AppLayoutProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  projectName?: string;
  watcherRunning?: boolean;
  children: ReactNode;
}

export function AppLayout({
  activeTab,
  onTabChange,
  projectName,
  watcherRunning,
  children,
}: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // localStorage unavailable — ignore
      }
      return next;
    });
  }, []);

  const handleExpand = useCallback(() => {
    setCollapsed(false);
    try {
      localStorage.setItem(STORAGE_KEY, "false");
    } catch {
      // ignore
    }
  }, []);

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--co-bg)" }}
    >
      {/* Sidebar — 200px precision navigation */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        collapsed={collapsed}
        onToggle={handleToggle}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          projectName={projectName}
          watcherRunning={watcherRunning}
          collapsed={collapsed}
          onExpand={handleExpand}
        />

        <main className="flex-1 overflow-hidden">
          <div
            key={activeTab}
            className="co-animate-fade-in h-full overflow-auto"
            style={{ scrollbarColor: "var(--co-border) transparent" }}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
