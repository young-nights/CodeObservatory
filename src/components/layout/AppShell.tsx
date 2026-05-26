// AppShell — Cursor/Linear/Arc style minimal shell
// Sidebar (200px ↔ 0px) + TopBar (48px) + main content
// framer-motion AnimatePresence for page transitions
// Exports SidebarContext for child components

import { type ReactNode, createContext, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export const SidebarContext = createContext<{ collapsed: boolean }>({ collapsed: false });

const STORAGE_KEY = "co-sidebar";

function getInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
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

  const toggle = useCallback(() => {
    setCollapsed((v) => {
      const n = !v;
      try { localStorage.setItem(STORAGE_KEY, n ? "1" : "0"); } catch { /* ignore */ }
      return n;
    });
  }, []);

  return (
    <SidebarContext.Provider value={{ collapsed }}>
      <div className="flex h-screen overflow-hidden" style={{ background: "#09090b" }}>
        <Sidebar
          activeTab={activeTab}
          onTabChange={onTabChange}
          collapsed={collapsed}
          onToggle={toggle}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <TopBar
            projectName={projectName}
            watcherRunning={watcherRunning}
            collapsed={collapsed}
            onExpandSidebar={() => setCollapsed(false)}
          />

          <main className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
