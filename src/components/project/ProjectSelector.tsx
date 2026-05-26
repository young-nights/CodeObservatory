// Project selector — Linear-inspired co-theme
// Layout/spacing: Tailwind. Colors/effects: co-* CSS classes.

import { useState } from "react";
import {
  FolderOpen,
  Plus,
  Loader2,
  Telescope,
  ChevronRight,
  FolderSearch,
  Settings,
  Moon,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import type { ProjectConfig } from "@/lib/types";

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
  const { theme, setTheme } = useTheme();

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--co-bg)" }}
    >
      {/* ════════════════════════════════════════════
          Left Sidebar — 190px
          ════════════════════════════════════════════ */}
      <aside className="co-sidebar co-animate-fade-in-left relative w-[190px] shrink-0 flex flex-col">
        {/* Branding */}
        <div className="co-sidebar-brand">
          <div className="co-sidebar-brand-icon">
            <Telescope size={15} strokeWidth={2} color="white" />
          </div>
          <span className="co-sidebar-brand-text">CodeObservatory</span>
        </div>

        {/* Navigation */}
        <nav className="co-sidebar-nav">
          <button
            onClick={() => setActiveNav("projects")}
            className={cn(
              "co-nav-item",
              activeNav === "projects" && "co-nav-item-active"
            )}
          >
            {activeNav === "projects" && <span className="co-nav-indicator" />}
            <FolderOpen size={14} className="shrink-0" />
            Projects
          </button>

          <button
            onClick={() => setActiveNav("settings")}
            className={cn(
              "co-nav-item",
              activeNav === "settings" && "co-nav-item-active"
            )}
          >
            {activeNav === "settings" && <span className="co-nav-indicator" />}
            <Settings size={14} className="shrink-0" />
            Settings
          </button>
        </nav>

        {/* Version */}
        <div className="co-sidebar-footer">
          <span className="co-sidebar-version">v0.1.0</span>
        </div>
      </aside>

      {/* ════════════════════════════════════════════
          Right Content Area
          ════════════════════════════════════════════ */}
      <main className="co-animate-fade-in flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="co-section-header">
          <h1 className="co-section-title">
            {activeNav === "projects" ? "Projects" : "Settings"}
          </h1>

          {activeNav === "projects" && (
            <button
              onClick={() => onOpenProject()}
              disabled={isInitializing}
              className="co-project-open-btn"
            >
              {isInitializing ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Initializing...
                </>
              ) : (
                <>
                  <Plus size={13} />
                  Open
                </>
              )}
            </button>
          )}
        </div>

        <hr className="co-separator mx-7" />

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto px-7 py-5"
          style={{
            scrollbarColor: "var(--co-border-light) transparent",
          }}
        >
          {activeNav === "projects" && (
            <div className="co-animate-fade-in">
              {recentProjects.length > 0 ? (
                <div className="max-w-3xl">
                  {/* Section header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="co-badge co-badge-secondary h-5 w-5 flex items-center justify-center p-0 text-[10px] font-bold">
                      {recentProjects.length}
                    </span>
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--co-text-muted)" }}
                    >
                      Recent Projects
                    </span>
                  </div>

                  {/* Project list */}
                  <div className="co-stagger space-y-1">
                    {recentProjects.map((proj, i) => (
                      <button
                        key={proj.path}
                        onClick={() => onSelectRecent(proj.path)}
                        onMouseEnter={() => setHoveredIndex(i)}
                        onMouseLeave={() => setHoveredIndex(null)}
                        className={cn(
                          "co-project-card",
                          hoveredIndex === i && "co-project-card-active"
                        )}
                      >
                        <div className="co-project-icon">
                          <FolderOpen
                            size={18}
                            color={
                              hoveredIndex === i
                                ? "var(--co-accent)"
                                : "var(--co-text-muted)"
                            }
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="co-project-name truncate">
                            {proj.name}
                          </p>
                          <p className="co-project-path truncate">
                            {proj.path}
                          </p>
                        </div>

                        <span className="co-project-time">
                          {formatLastOpened(proj.lastOpened)}
                        </span>

                        <ChevronRight
                          size={14}
                          className="co-project-chevron"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Empty state */
                <div className="co-animate-fade-in co-empty-state">
                  <div className="co-empty-icon">
                    <FolderSearch
                      size={32}
                      color="var(--co-text-muted)"
                      strokeWidth={1.5}
                    />
                  </div>
                  <p className="co-empty-text">
                    Select your first project to start tracking code changes
                  </p>
                </div>
              )}
            </div>
          )}

          {activeNav === "settings" && (
            <div className="co-animate-fade-in py-5 max-w-lg">
              <div className="co-card">
                <div className="co-card-header">
                  <h3 className="co-card-title">Appearance</h3>
                  <p className="co-card-desc">
                    Choose your preferred theme
                  </p>
                </div>
                <div className="co-card-content">
                  <div
                    className="inline-flex rounded-md border p-0.5"
                    style={{
                      borderColor: "var(--co-border)",
                      background: "var(--co-bg-sidebar)",
                    }}
                  >
                    <button
                      onClick={() => setTheme("dark")}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-all",
                        theme === "dark"
                          ? "text-white"
                          : "text-[var(--co-text-muted)] hover:text-[var(--co-text)]"
                      )}
                      style={
                        theme === "dark"
                          ? { background: "var(--co-accent)" }
                          : { background: "transparent" }
                      }
                    >
                      <Moon size={15} />
                      Dark
                    </button>
                    <button
                      onClick={() => setTheme("light")}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-all",
                        theme === "light"
                          ? "text-white"
                          : "text-[var(--co-text-muted)] hover:text-[var(--co-text)]"
                      )}
                      style={
                        theme === "light"
                          ? { background: "var(--co-accent)" }
                          : { background: "transparent" }
                      }
                    >
                      <Sun size={15} />
                      Light
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
