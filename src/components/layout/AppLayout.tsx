// AppLayout — Precision Instrument main layout
// Sidebar (200px) + TopBar (44px) + Content

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
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--co-bg)" }}
    >
      {/* Sidebar — 200px precision navigation */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar projectName={projectName} watcherRunning={watcherRunning} />

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
