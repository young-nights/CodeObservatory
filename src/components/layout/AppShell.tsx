// AppShell — Sci-fi layout shell with framer-motion page transitions
// Cursor + Arc + Linear inspired minimal design

import { type ReactNode, createContext, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/hooks/useTheme";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export const SidebarContext = createContext({ collapsed: false });

const STORAGE_KEY = "co-sidebar-collapsed";

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
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  });

  const { theme } = useTheme();
  const isDark = theme === "dark";
  const shellBg = isDark ? "#08080c" : "#f5f5f7";
  const mainBg = isDark ? "#000011" : "#f0f0f5";

  const handleToggle = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  return (
    <SidebarContext.Provider value={{ collapsed }}>
      <div className="flex h-screen overflow-hidden" style={{ background: shellBg }}>
        <Sidebar
          activeTab={activeTab}
          onTabChange={onTabChange}
          collapsed={collapsed}
          onToggle={handleToggle}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar
            projectName={projectName}
            watcherRunning={watcherRunning}
            collapsed={collapsed}
            onExpand={() => setCollapsed(false)}
          />
          <main className="flex-1 overflow-hidden" style={{ background: mainBg }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, scale: 0.995 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.995 }}
                transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
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
