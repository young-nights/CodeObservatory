// ProjectSelector — Precision Instrument
// No glassmorphism · color hierarchy · outline buttons · underline hover

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
  const { theme, setTheme } = useTheme();

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--co-bg)" }}
    >
      {/* ── Sidebar: 200px ── */}
      <aside className="co-sidebar co-animate-fade-in-left shrink-0 flex flex-col">
        {/* Brand — serif */}
        <div className="co-sidebar-brand">
          <div className="co-sidebar-brand-icon">
            <Telescope size={15} strokeWidth={2} />
          </div>
          <span className="co-sidebar-brand-text">CodeObservatory</span>
        </div>

        {/* Separator */}
        <div className="co-sidebar-separator" />

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

      {/* ── Main Content ── */}
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

        <hr className="co-separator" style={{ margin: "0 var(--co-space-6)" }} />

        {/* Content area */}
        <div
          className="flex-1 overflow-y-auto"
          style={{
            padding: "var(--co-space-5) var(--co-space-6)",
            scrollbarColor: "var(--co-border) transparent",
          }}
        >
          {activeNav === "projects" && (
            <div className="co-animate-fade-in">
              {recentProjects.length > 0 ? (
                <div style={{ maxWidth: 640 }}>
                  {/* Section label — 10px uppercase */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--co-space-2)",
                      marginBottom: "var(--co-space-3)",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 20,
                        height: 20,
                        borderRadius: 4,
                        fontSize: "var(--co-font-size-2xs)",
                        fontWeight: "var(--co-font-weight-semibold)",
                        background: "var(--co-accent-subtle)",
                        color: "var(--co-accent-text)",
                      }}
                    >
                      {recentProjects.length}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--co-font-size-2xs)",
                        fontWeight: "var(--co-font-weight-semibold)",
                        textTransform: "uppercase",
                        letterSpacing: "var(--co-letter-spacing-label)",
                        color: "var(--co-text-muted)",
                      }}
                    >
                      Recent Projects
                    </span>
                  </div>

                  {/* Project list — hover translateX(2px) */}
                  <div
                    className="co-stagger"
                    style={{ display: "flex", flexDirection: "column", gap: "var(--co-space-2)" }}
                  >
                    {recentProjects.map((proj) => (
                      <button
                        key={proj.path}
                        onClick={() => onSelectRecent(proj.path)}
                        className="co-project-card"
                      >
                        <div className="co-project-icon">
                          <FolderOpen
                            size={18}
                            style={{ color: "var(--co-text-muted)" }}
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
                <div
                  className="co-animate-fade-in co-empty-state"
                  style={{ height: "auto", paddingTop: "var(--co-space-10)" }}
                >
                  <div className="co-empty-icon">
                    <FolderSearch
                      size={28}
                      strokeWidth={1.5}
                      style={{ color: "var(--co-text-muted)" }}
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
            <div className="co-animate-fade-in" style={{ maxWidth: 420 }}>
              <div className="co-card" style={{ marginTop: "var(--co-space-2)" }}>
                <div className="co-card-header">
                  <h3 className="co-card-title">Appearance</h3>
                  <p className="co-card-desc">Choose your preferred theme</p>
                </div>
                <div className="co-card-content">
                  <div
                    style={{
                      display: "inline-flex",
                      borderRadius: "var(--co-radius-sm)",
                      border: "1px solid var(--co-border)",
                      padding: 3,
                      background: "var(--co-bg-sidebar)",
                    }}
                  >
                    <button
                      onClick={() => setTheme("dark")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--co-space-2)",
                        padding: "6px 14px",
                        borderRadius: "var(--co-radius-sm)",
                        fontSize: "var(--co-font-size-sm)",
                        fontWeight: "var(--co-font-weight-medium)",
                        border: "none",
                        cursor: "pointer",
                        background:
                          theme === "dark" ? "var(--co-accent)" : "transparent",
                        color:
                          theme === "dark"
                            ? "oklch(100% 0 0)"
                            : "var(--co-text-muted)",
                        transition: "background var(--co-duration-fast) var(--co-ease-out)",
                      }}
                    >
                      <Moon size={14} />
                      Dark
                    </button>
                    <button
                      onClick={() => setTheme("light")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--co-space-2)",
                        padding: "6px 14px",
                        borderRadius: "var(--co-radius-sm)",
                        fontSize: "var(--co-font-size-sm)",
                        fontWeight: "var(--co-font-weight-medium)",
                        border: "none",
                        cursor: "pointer",
                        background:
                          theme === "light"
                            ? "var(--co-accent)"
                            : "transparent",
                        color:
                          theme === "light"
                            ? "oklch(100% 0 0)"
                            : "var(--co-text-muted)",
                        transition: "background var(--co-duration-fast) var(--co-ease-out)",
                      }}
                    >
                      <Sun size={14} />
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
