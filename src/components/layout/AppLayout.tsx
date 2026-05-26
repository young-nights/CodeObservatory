// AppLayout — main application wrapper with Sidebar + TopBar + Content
// No framer-motion; uses co-animate-fade-in CSS animation instead.

import { type ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

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
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--co-bg)" }}>
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        projectName={projectName}
      />

      {/* Main area: TopBar + Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar projectName={projectName} watcherRunning={watcherRunning} />

        {/* Page content with simple fade-in animation */}
        <main className="flex-1 overflow-hidden">
          <div
            key={activeTab}
            className="co-animate-fade-in h-full overflow-auto"
            style={{ scrollbarColor: "var(--co-border-light) transparent" }}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
