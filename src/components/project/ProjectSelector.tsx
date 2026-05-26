// Project selector component — first screen when no project is open
// Android Studio-inspired two-column layout with custom CSS theme
// All colors via plain CSS classes (theme.css) to avoid cross-OS Tailwind issues

import { useState } from "react";
import {
  FolderOpen,
  Plus,
  Loader2,
  Telescope,
  ChevronRight,
  FolderSearch,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectConfig } from "@/lib/types";
import "@/styles/theme.css";

interface ProjectSelectorProps {
  recentProjects: ProjectConfig[];
  isInitializing: boolean;
  onOpenProject: (path?: string) => void;
  onSelectRecent: (path: string) => void;
}

type NavItem = "projects" | "settings";

function formatLastOpened(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function ProjectSelector({
  recentProjects,
  isInitializing,
  onOpenProject,
  onSelectRecent,
}: ProjectSelectorProps) {
  const [activeNav, setActiveNav] = useState<NavItem>("projects");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div className="flex h-screen co-bg-main">
      {/* ════════════════════════════════════════════
          Left Sidebar
          ════════════════════════════════════════════ */}
      <aside className="w-[220px] shrink-0 flex flex-col co-sidebar">
        {/* Branding */}
        <div className="flex items-center gap-2.5 px-5 py-5 co-sidebar-brand">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg co-logo-badge">
            <Telescope color="white" size={16} strokeWidth={2} />
          </div>
          <span className="text-sm co-sidebar-text">CodeObservatory</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 space-y-0.5">
          <button
            onClick={() => setActiveNav("projects")}
            className={cn(
              "w-full flex items-center gap-3 px-5 py-2.5 text-sm relative",
              activeNav === "projects" ? "co-nav-item-active" : "co-nav-item",
            )}
          >
            {activeNav === "projects" && <span className="co-nav-indicator" />}
            <FolderOpen
              size={16}
              className="shrink-0"
              color={activeNav === "projects" ? "#818cf8" : "#475569"}
            />
            Projects
          </button>

          <button
            onClick={() => setActiveNav("settings")}
            className={cn(
              "w-full flex items-center gap-3 px-5 py-2.5 text-sm relative",
              activeNav === "settings" ? "co-nav-item-active" : "co-nav-item",
            )}
          >
            {activeNav === "settings" && <span className="co-nav-indicator" />}
            <Settings
              size={16}
              className="shrink-0"
              color={activeNav === "settings" ? "#818cf8" : "#475569"}
            />
            Settings
          </button>
        </nav>

        {/* Version */}
        <div className="px-5 py-3 co-sidebar-footer">
          <span className="text-xs co-text-dim select-none">v0.1.0</span>
        </div>
      </aside>

      {/* ════════════════════════════════════════════
          Right Content Area
          ════════════════════════════════════════════ */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-10 pt-8 pb-4">
          <h1 className="co-header-title">
            {activeNav === "projects" ? "Projects" : "Settings"}
          </h1>

          {activeNav === "projects" && (
            <button
              className="co-btn-primary"
              onClick={() => onOpenProject()}
              disabled={isInitializing}
            >
              {isInitializing ? (
                <>
                  <Loader2 className="animate-spin" size={14} />
                  Initializing...
                </>
              ) : (
                <>
                  <Plus size={14} />
                  Open Project Directory
                </>
              )}
            </button>
          )}
        </div>

        <div className="px-10">
          <hr className="co-divider" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-10 py-6">
          {activeNav === "projects" && (
            <>
              {recentProjects.length > 0 ? (
                <div className="space-y-1.5 max-w-3xl">
                  {/* Section header */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className="co-project-count-badge">
                      {recentProjects.length}
                    </span>
                    <span className="co-section-label">Recent Projects</span>
                  </div>

                  {/* Project list */}
                  {recentProjects.map((proj, i) => (
                    <div
                      key={proj.path}
                      onClick={() => onSelectRecent(proj.path)}
                      onMouseEnter={() => setHoveredIndex(i)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      className={cn(
                        "co-card",
                        "flex items-center gap-4 px-5 py-4 text-left",
                        hoveredIndex === i &&
                          "border-[rgba(99,102,241,0.15)] bg-[rgba(99,102,241,0.08)]",
                      )}
                    >
                      {/* Folder icon */}
                      <div
                        className={cn(
                          "flex items-center justify-center w-10 h-10 shrink-0 co-card-folder-icon",
                          hoveredIndex === i &&
                            "bg-[rgba(99,102,241,0.2)]",
                        )}
                      >
                        <FolderOpen
                          size={18}
                          color={hoveredIndex === i ? "#a5b4fc" : "#818cf8"}
                        />
                      </div>

                      {/* Project info */}
                      <div className="min-w-0 flex-1">
                        <div className="co-card-title truncate">
                          {proj.name}
                        </div>
                        <div className="co-card-path truncate mt-0.5">
                          {proj.path}
                        </div>
                      </div>

                      {/* Timestamp */}
                      <span className="co-card-time shrink-0">
                        {formatLastOpened(proj.lastOpened)}
                      </span>

                      {/* Chevron */}
                      <ChevronRight
                        size={16}
                        className={cn(
                          "shrink-0 transition-all duration-200",
                          hoveredIndex === i
                            ? "co-text-accent translate-x-0.5"
                            : "co-text-dim",
                        )}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                /* Empty state */
                <div className="flex flex-col items-center justify-center h-full max-w-xs mx-auto text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 co-empty-icon">
                    <FolderSearch
                      size={36}
                      color="#64748b"
                      strokeWidth={1.5}
                    />
                  </div>
                  <p className="co-empty-text">
                    选择你的第一个项目开始追踪代码变更
                  </p>
                </div>
              )}
            </>
          )}

          {/* Settings panel */}
          {activeNav === "settings" && (
            <div className="flex flex-col items-center justify-center h-full max-w-xs mx-auto text-center gap-4">
              <Settings size={48} color="#475569" strokeWidth={1} />
              <p className="co-settings-placeholder-text">
                Settings coming soon
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
