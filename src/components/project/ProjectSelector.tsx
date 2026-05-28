// ProjectSelector — Theme-aware, inline styles, proper hierarchy
// Android Studio-style two-column: left nav + right content
// Multi-project checkbox selection for galaxy clusters

import { useState } from "react";
import { FolderOpen, Plus, Loader2, Telescope, ChevronRight, FolderSearch, Settings, Moon, Sun, Check } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "react-i18next";
import type { ProjectConfig } from "@/lib/types";

interface Props {
  recentProjects: ProjectConfig[];
  isInitializing: boolean;
  onOpenProject: (path?: string) => void;
  onSelectRecent: (path: string) => void;
  selectedProjects: string[];
  onToggleProject: (path: string) => void;
  onSelectAll: (paths: string[]) => void;
}

type NavItem = "projects" | "settings";

function fmtTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function ProjectSelector({ recentProjects, isInitializing, onOpenProject, onSelectRecent, selectedProjects, onToggleProject, onSelectAll }: Props) {
  const [nav, setNav] = useState<NavItem>("projects");
  const [hovered, setHovered] = useState<number | null>(null);
  const { theme, toggle } = useTheme();
  const { t } = useTranslation();
  const isDark = theme === "dark";

  const allSelected = recentProjects.length > 0 && recentProjects.every((p) => selectedProjects.includes(p.path));

  const c = {
    bg: isDark ? "#08080c" : "#f5f5f7",
    sidebarBg: isDark ? "#0c0c10" : "#fafafa",
    sidebarBorder: isDark ? "#1c1c24" : "#e5e7eb",
    text: isDark ? "#fafafa" : "#18181b",
    textDim: isDark ? "#a1a1aa" : "#71717a",
    textMuted: isDark ? "#71717a" : "#9ca3af",
    accent: "#06b6d4",
    accentBg: isDark ? "rgba(6,182,212,0.08)" : "rgba(6,182,212,0.1)",
    hoverBg: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)",
    navText: isDark ? "#a1a1aa" : "#6b7280",
    navActive: isDark ? "#fafafa" : "#111827",
    cardBg: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
    cardBorder: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
    cardHoverBg: isDark ? "rgba(6,182,212,0.06)" : "rgba(6,182,212,0.08)",
    btnGrad: "linear-gradient(135deg, #06b6d4, #8b5cf6)",
    version: isDark ? "#3f3f46" : "#d1d5db",
    checkBg: isDark ? "rgba(6,182,212,0.15)" : "rgba(6,182,212,0.12)",
    checkBorder: "#06b6d4",
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: c.bg }}>
      {/* ── Left sidebar ── */}
      <aside style={{ width: 200, display: "flex", flexDirection: "column", flexShrink: 0, background: c.sidebarBg, borderRight: `1px solid ${c.sidebarBorder}` }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px", height: 52, borderBottom: `1px solid ${c.sidebarBorder}` }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: c.btnGrad, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Telescope size={14} color="white" strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: c.text, fontFamily: "system-ui, sans-serif" }}>CodeObservatory</span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "6px 6px", display: "flex", flexDirection: "column", gap: 2 }}>
          {([{ id: "projects", icon: FolderOpen, label: "Projects" }, { id: "settings", icon: Settings, label: "Settings" }] as const).map(item => {
            const Icon = item.icon;
            const active = nav === item.id;
            return (
              <button key={item.id} onClick={() => setNav(item.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, height: 34, padding: "0 10px", borderRadius: 6, border: "none", cursor: "pointer", position: "relative", fontSize: 13, fontWeight: 500, textAlign: "left" as const, width: "100%", color: active ? c.navActive : c.navText, background: active ? c.accentBg : "transparent", fontFamily: "system-ui, sans-serif", transition: "all 0.12s ease" }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.color = c.textDim; e.currentTarget.style.background = c.hoverBg; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.color = c.navText; e.currentTarget.style.background = "transparent"; } }}
              >
                {active && <span style={{ position: "absolute", left: 0, top: 7, bottom: 7, width: 2, borderRadius: "0 2px 2px 0", background: c.accent }} />}
                <Icon size={14} color={active ? c.accent : isDark ? "#52525b" : "#9ca3af"} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: 40, borderTop: `1px solid ${c.sidebarBorder}` }}>
          <span style={{ fontSize: 10, color: c.version, fontFamily: "system-ui, sans-serif" }}>v0.1.0</span>
          <button onClick={toggle}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 6, border: "none", cursor: "pointer", background: "transparent", color: isDark ? "#71717a" : "#9ca3af", transition: "all 0.12s ease" }}
            onMouseEnter={e => { e.currentTarget.style.color = isDark ? "#a1a1aa" : "#4b5563"; e.currentTarget.style.background = c.hoverBg; }}
            onMouseLeave={e => { e.currentTarget.style.color = isDark ? "#71717a" : "#9ca3af"; e.currentTarget.style.background = "transparent"; }}
          >
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
      </aside>

      {/* ── Right content ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "28px 32px 16px" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: c.text, fontFamily: "system-ui, sans-serif", letterSpacing: "-0.02em" }}>
            {nav === "projects" ? "Projects" : "Settings"}
          </h1>
          {nav === "projects" && (
            <button onClick={() => onOpenProject()} disabled={isInitializing}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 9, border: "none", cursor: isInitializing ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, color: "white", background: c.btnGrad, opacity: isInitializing ? 0.5 : 1, transition: "all 0.15s ease", fontFamily: "system-ui, sans-serif" }}
              onMouseEnter={e => { if (!isInitializing) e.currentTarget.style.opacity = "0.85"; }}
              onMouseLeave={e => { if (!isInitializing) e.currentTarget.style.opacity = "1"; }}
            >
              {isInitializing ? <><Loader2 size={13} className="animate-spin" /> {t("project.initializing")}</> : <><Plus size={13} /> {t("project.openProject")}</>}
            </button>
          )}
        </div>

        <div style={{ padding: "0 32px" }}><hr style={{ border: "none", borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }} /></div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 32px 32px" }}>
          {nav === "projects" && (
            recentProjects.length > 0 ? (
              <div style={{ maxWidth: 700 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 5, fontSize: 11, fontWeight: 700, background: c.accentBg, color: c.accent }}>
                    {recentProjects.length}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {t("project.recentProjects")}
                  </span>
                  <span style={{ flex: 1 }} />
                  <button
                    onClick={() => onSelectAll(allSelected ? [] : recentProjects.map((p) => p.path))}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, background: "transparent", color: c.textMuted, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "system-ui, sans-serif", transition: "all 0.12s ease" }}
                    onMouseEnter={e => { e.currentTarget.style.color = c.text; e.currentTarget.style.background = c.hoverBg; }}
                    onMouseLeave={e => { e.currentTarget.style.color = c.textMuted; e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${allSelected ? c.checkBorder : isDark ? "#52525b" : "#d1d5db"}`, background: allSelected ? c.checkBg : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s ease" }}>
                      {allSelected && <Check size={10} color={c.accent} strokeWidth={3} />}
                    </div>
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                </div>

                {recentProjects.map((proj, i) => {
                  const isSelected = selectedProjects.includes(proj.path);
                  return (
                    <div key={proj.path}
                      onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 10, cursor: "pointer", marginBottom: 4, border: `1px solid ${hovered === i ? (isDark ? "rgba(6,182,212,0.2)" : "rgba(6,182,212,0.15)") : "transparent"}`, background: hovered === i ? c.cardHoverBg : c.cardBg, transition: "all 0.12s ease" }}
                    >
                      {/* Checkbox */}
                      <div
                        onClick={(e) => { e.stopPropagation(); onToggleProject(proj.path); }}
                        style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${isSelected ? c.checkBorder : isDark ? "#52525b" : "#d1d5db"}`, background: isSelected ? c.checkBg : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all 0.12s ease" }}
                      >
                        {isSelected && <Check size={12} color={c.accent} strokeWidth={3} />}
                      </div>

                      {/* Folder icon — click to open single project */}
                      <div onClick={() => onSelectRecent(proj.path)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 9, background: hovered === i ? "rgba(6,182,212,0.15)" : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"), flexShrink: 0, transition: "background 0.12s ease" }}>
                        <FolderOpen size={16} color={hovered === i ? "#06b6d4" : isDark ? "#a1a1aa" : "#71717a"} />
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }} onClick={() => onSelectRecent(proj.path)}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proj.name}</div>
                        <div style={{ fontSize: 12, color: c.textMuted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proj.path}</div>
                      </div>

                      <span style={{ fontSize: 12, color: isDark ? "#71717a" : "#9ca3af", flexShrink: 0, fontVariantNumeric: "tabular-nums" as const }}>{fmtTime(proj.lastOpened)}</span>
                      <ChevronRight size={14} color={hovered === i ? c.accent : (isDark ? "#52525b" : "#d1d5db")} style={{ flexShrink: 0, transition: "all 0.12s ease", transform: hovered === i ? "translateX(2px)" : "none" }} />
                    </div>
                  );
                })}

                {selectedProjects.length > 0 && (
                  <div style={{ marginTop: 12, fontSize: 12, color: c.textMuted, fontFamily: "system-ui, sans-serif" }}>
                    {selectedProjects.length} project{selectedProjects.length !== 1 ? "s" : ""} selected for galaxy cluster view
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", maxWidth: 320, margin: "0 auto", textAlign: "center" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 72, height: 72, borderRadius: 16, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, marginBottom: 16 }}>
                  <FolderSearch size={32} color={isDark ? "#71717a" : "#9ca3af"} strokeWidth={1.5} />
                </div>
                <p style={{ fontSize: 14, color: c.textMuted, lineHeight: 1.6 }}>{t("project.selectFirst")}</p>
              </div>
            )
          )}
          {nav === "settings" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
              <Settings size={44} color={isDark ? "#52525b" : "#d1d5db"} strokeWidth={1} />
              <p style={{ fontSize: 14, color: c.textMuted }}>Settings coming soon</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
