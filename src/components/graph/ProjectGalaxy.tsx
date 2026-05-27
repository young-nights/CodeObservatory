// ProjectGalaxy — Main galaxy visualization component
// Orchestrates data fetching, layout computation, and rendering
// Delegates layout to galaxyLayout.ts, rendering to GalaxyScene.tsx

import { useMemo, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { useScanGraph } from "@/hooks/useObservatory";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "react-i18next";
import { SettingsPanel, type GalaxySettings } from "./SettingsPanel";
import { getColorScheme } from "@/lib/galaxyColors";
import { computeGalaxyLayout } from "@/lib/galaxyLayout";
import { GalaxyScene } from "./GalaxyScene";
import { FolderOpen, File, Hash, Clock } from "lucide-react";

// ══════════════════════════════════════════════════════════
// DEFAULT SETTINGS
// ══════════════════════════════════════════════════════════
const DEFS: GalaxySettings = {
  nodeSize: 1.2,
  edgeOpacity: 0.12,
  bloomStrength: 0.5,
  chargeStrength: -80,
  linkDistance: 15,
  linkStrength: 0.4,
  centerGravity: 0.1,
  armCount: 5,
  galaxyScale: 1.0,
  armCurvature: 0.6,
  colorPreset: "cosmic",
};

// ══════════════════════════════════════════════════════════
// ERROR BOUNDARY
// ══════════════════════════════════════════════════════════
import { Component, type ReactNode } from "react";
class ErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error) { console.error("[Galaxy Error]", error); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: "center" }}>
          <p style={{ color: "#ff6b6b", fontSize: 16, fontWeight: 600 }}>Galaxy Error</p>
          <p style={{ color: "#8070a0", fontSize: 13, marginTop: 8 }}>{this.state.error?.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════
interface Props {
  projectPath: string;
  fullscreen?: boolean;
}

export default function ProjectGalaxy({ projectPath, fullscreen = false }: Props) {
  const { graph, loading, refresh } = useScanGraph(projectPath);
  const { theme } = useTheme();
  const { t } = useTranslation();
  const isDark = theme === "dark";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [settings, setSettings] = useState<GalaxySettings>(DEFS);
  const [dim, setDim] = useState({ w: window.innerWidth, h: window.innerHeight });

  // Color scheme from theme + preset
  const clr = getColorScheme(isDark, settings.colorPreset);

  // Loading timeout
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => setLoadTimedOut(true), 15000);
      return () => clearTimeout(t);
    }
    setLoadTimedOut(false);
  }, [loading]);

  // Resize listener
  useEffect(() => {
    const onR = () => setDim({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  // Compute layout
  const layout = useMemo(() => {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      return { nodes: [], edges: [], nodeArm: new Map() };
    }
    const validNodes = graph.nodes.filter(n => n && typeof n.id === 'string');
    const validNodeIds = new Set(validNodes.map(n => n.id));
    const validEdges = graph.edges.filter(e =>
      e && typeof e.source === 'string' && typeof e.target === 'string' &&
      validNodeIds.has(e.source) && validNodeIds.has(e.target)
    );
    if (validNodes.length === 0) {
      return { nodes: [], edges: [], nodeArm: new Map() };
    }
    return computeGalaxyLayout(validNodes, validEdges, clr, settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, isDark, settings.colorPreset, settings.armCount, settings.galaxyScale, settings.armCurvature, settings.linkDistance, settings.linkStrength, settings.centerGravity, settings.chargeStrength]);

  // Selected node data
  const selectedNode = useMemo(
    () => layout.nodes.find((n) => n.id === selectedId) ?? null,
    [layout.nodes, selectedId],
  );

  const cnt = layout.nodes.length;
  const pc = layout.nodes.filter((n) => n.type === "planet").length;
  const sc = layout.nodes.filter((n) => n.type === "star").length;
  const canvasW = dim.w - (fullscreen ? 0 : 200) - (panelOpen ? 280 : 0);

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: clr.bg }}>
      {/* 3D Canvas or loading state */}
      {!loading && layout.nodes.length > 0 ? (
        <ErrorBoundary fallback={<div style={{ padding: 40, color: "#ff6b6b" }}>Galaxy rendering failed.</div>}>
          <Canvas
            key={`galaxy-${graph?.nodes?.length}-${settings.armCount}`}
            camera={{ position: [0, 0, 200], fov: 50, near: 0.1, far: 1000 }}
            gl={{ antialias: true, alpha: false }}
            style={{ width: canvasW, height: dim.h - 48 }}
            onPointerMissed={() => setSelectedId(null)}
          >
            <GalaxyScene
              layout={layout}
              settings={settings}
              clr={clr}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </Canvas>
        </ErrorBoundary>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: clr.ui.muted, fontSize: 13 }}>
          {loading ? (
            <>
              <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: isDark ? "rgba(100,96,255,0.15)" : "rgba(0,0,0,0.1)", borderTopColor: isDark ? "#8880ff" : "#6366f1" }} />
              <p>{loadTimedOut ? "Still scanning... large project?" : t("app.scanning")}</p>
            </>
          ) : (
            <>
              <p style={{ fontWeight: 600 }}>{t("app.noData")}</p>
              <p style={{ fontSize: 12, opacity: 0.6 }}>Project: {projectPath}</p>
            </>
          )}
        </div>
      )}

      {/* Title overlay */}
      <div className="absolute top-6 left-8 pointer-events-none select-none">
        <h1 className="text-2xl font-extrabold tracking-[0.12em]" style={{ color: clr.ui.text, textShadow: isDark ? "0 0 40px rgba(136,128,255,0.4)" : "none" }}>
          {t("app.title")}
        </h1>
        <p style={{ color: clr.ui.dim, fontSize: 12, marginTop: 4 }}>
          {cnt > 0 ? `${pc} planets · ${sc} stars · ${layout.edges.length} orbits` : t("app.awaiting")}
        </p>
      </div>

      {/* Settings button */}
      <button onClick={() => setPanelOpen((v) => !v)} className="absolute top-6 right-6 z-30 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: clr.ui.card, border: `1px solid ${clr.ui.border}`, color: clr.ui.dim }} title="Settings">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
      </button>

      {/* Refresh button */}
      <button onClick={refresh} className="absolute bottom-6 right-6 z-20 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: clr.ui.card, border: `1px solid ${clr.ui.border}`, color: clr.ui.dim }} title="Rescan">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" /></svg>
      </button>

      {/* Settings panel */}
      <SettingsPanel open={panelOpen} onClose={() => setPanelOpen(false)} settings={settings} onChange={setSettings} layoutMode="force" />

      {/* Selected node info card */}
      {selectedNode && (
        <div className="absolute top-20 right-14 w-72 z-20 rounded-xl p-5" style={{ background: clr.ui.card, border: `1px solid ${clr.ui.border}`, backdropFilter: "blur(20px)" }}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              {selectedNode.type !== "star" && selectedNode.type !== "dust" ? <FolderOpen size={18} color={clr.dir1} /> : <File size={18} color={clr.ui.dim} />}
              <span className="text-sm font-semibold" style={{ color: clr.ui.text }}>{selectedNode.label}</span>
            </div>
            <button onClick={() => setSelectedId(null)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={clr.ui.muted} strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div className="space-y-1.5 text-xs" style={{ color: clr.ui.muted }}>
            <p className="break-all">{selectedNode.path}</p>
            <div className="flex gap-4 mt-2">
              <span className="flex items-center gap-1"><Hash size={10} />{selectedNode.type}</span>
              {selectedNode.size != null && selectedNode.size > 0 && (
                <span className="flex items-center gap-1"><Clock size={10} />{selectedNode.size < 1024 ? `${selectedNode.size}B` : `${(selectedNode.size / 1024).toFixed(1)}KB`}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* HUD overlay */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.85))", padding: "24px 32px 16px", pointerEvents: "none", zIndex: 15 }}>
        {selectedNode ? (
          <div style={{ display: "flex", gap: 16, alignItems: "center", color: "#e0e7ff", fontSize: 13 }}>
            <span style={{ color: selectedNode.color || "#e0e7ff" }}>●</span>
            <span style={{ fontWeight: 600 }}>{selectedNode.label}</span>
            <span style={{ color: "#a1a1aa", fontSize: 11 }}>{selectedNode.type}</span>
            {selectedNode.path && <span style={{ color: "#71717a", fontSize: 11 }}>{selectedNode.path}</span>}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 32, color: "#a1a1aa", fontSize: 12 }}>
            <span>● {cnt} Nodes</span>
            <span>● {layout.edges.length} Connections</span>
            <span>OrbitControls: drag/zoom</span>
          </div>
        )}
      </div>
    </div>
  );
}
