// Graph — Cosmic Seed Universe · 3D visualization
// Full-screen when sidebar collapsed, bottom info bar, tag panel, search

import { useState, useCallback, useMemo, useContext } from "react";
import { RefreshCw, Maximize2, Search, X } from "lucide-react";
import { useScanGraph } from "@/hooks/useObservatory";
import { CosmicGalaxy, type CosmicGalaxyPanelSettings } from "@/components/graph/CosmicGalaxy";
import { SidebarContext } from "@/components/layout/AppLayout";

interface GraphPageProps {
  projectPath: string;
}

interface TopDir {
  id: string;
  label: string;
  count: number;
  position: [number, number, number];
}

export function GraphPage({ projectPath }: GraphPageProps) {
  const { collapsed } = useContext(SidebarContext);
  const { graph: graphData, loading, refresh } = useScanGraph(projectPath);

  // ── Graph settings ──
  const [nodeSizeVal] = useState(7);
  const [edgeThicknessVal] = useState(0.5);
  const [gravity] = useState(5);
  const [repulsion] = useState(10);
  const [edgeLength] = useState(5);

  // ── Filter state ──
  const [visibleNodeCount, setVisibleNodeCount] = useState(0);
  const [visibleEdgeCount, setVisibleEdgeCount] = useState(0);
  const [cameraResetKey, setCameraResetKey] = useState(0);

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState("");

  // ── Tag panel ──
  const [topDirs, setTopDirs] = useState<TopDir[]>([]);

  // ── Camera fly-to ──
  const [flyTarget, setFlyTarget] = useState<[number, number, number] | null>(null);

  // ── Total stats ──
  const totalNodeCount = graphData?.nodes.length ?? 0;
  const totalEdgeCount = graphData?.edges.length ?? 0;

  // ── Panel settings ──
  const panelSettings: CosmicGalaxyPanelSettings = useMemo(
    () => ({ nodeSize: nodeSizeVal, edgeThickness: edgeThicknessVal, gravity, repulsion, edgeLength }),
    [nodeSizeVal, edgeThicknessVal, gravity, repulsion, edgeLength],
  );

  // ── Actions ──
  const handleFit = useCallback(() => setCameraResetKey((k) => k + 1), []);

  const handleRescan = useCallback(() => refresh(), [refresh]);

  const handleFlyToNode = useCallback((dirId: string) => {
    const dir = topDirs.find((d) => d.id === dirId);
    if (dir) {
      setFlyTarget(dir.position);
    }
  }, [topDirs]);

  const displayNodes = visibleNodeCount || totalNodeCount;
  const displayEdges = visibleEdgeCount || totalEdgeCount;



  return (
    <div className="flex flex-col h-full" style={{ background: "#000000" }}>
      {/* ══════ Top Search Bar (glass) ══════ */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 6px 4px 14px",
          borderRadius: 9999,
          background: "rgba(255,255,255,0.06)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Search size={12} style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
        <input
          type="text"
          placeholder="搜索文件或目录…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: 180,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "rgba(255,255,255,0.7)",
            fontSize: 12,
            lineHeight: "24px",
          }}
          className="placeholder:text-white/20"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 20, height: 20, borderRadius: "50%",
              background: "rgba(255,255,255,0.1)", border: "none",
              color: "rgba(255,255,255,0.4)", cursor: "pointer",
            }}
          >
            <X size={10} />
          </button>
        )}
      </div>

      {/* ══════ Left Tag Panel (seeds) ══════ */}
      <div
        className="co-cosmic-tag-panel"
        style={{
          position: "absolute",
          left: 12,
          top: 48,
          zIndex: 25,
          width: 160,
        }}
      >
        <div className="co-cosmic-tag-card">
          <h3 className="co-cosmic-tag-title">种子目录</h3>
          <div className="co-cosmic-tag-grid">
            {topDirs.length === 0 && (
              <span className="co-cosmic-tag-empty">扫描中…</span>
            )}
            {topDirs.map((dir) => (
              <button
                key={dir.id}
                className="co-cosmic-tag-btn"
                onClick={() => handleFlyToNode(dir.id)}
                title={dir.label}
              >
                <span className="truncate">{dir.label}</span>
                <span className="co-cosmic-tag-count">{dir.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══════ Action buttons (top right) ══════ */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <button
          onClick={handleFit}
          title="Reset camera"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 30, height: 30, borderRadius: 9999,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)",
            cursor: "pointer",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.1)";
            e.currentTarget.style.color = "rgba(255,255,255,0.7)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            e.currentTarget.style.color = "rgba(255,255,255,0.4)";
          }}
        >
          <Maximize2 size={14} />
        </button>
        <button
          onClick={handleRescan}
          disabled={loading}
          title="Rescan project"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 30, height: 30, borderRadius: 9999,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.05)",
            color: "rgba(255,255,255,0.4)",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.3 : 1,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.background = "rgba(255,255,255,0.1)";
              e.currentTarget.style.color = "rgba(255,255,255,0.7)";
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              e.currentTarget.style.color = "rgba(255,255,255,0.4)";
            }
          }}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ══════ Canvas Area ══════ */}
      <div style={{ flex: 1, position: "relative", minHeight: 0, overflow: "hidden" }}>
        {/* Loading */}
        {loading && !graphData ? (
          <div className="co-cosmic-overlay" style={{ background: "#000008" }}>
            <div className="co-cosmic-spinner" />
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginTop: 12 }}>
              Scanning project…
            </p>
          </div>
        ) : graphData && graphData.nodes.length === 0 ? (
          <div className="co-cosmic-overlay" style={{ background: "#000008" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>
              Empty Project
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
              This directory contains no files or folders.
            </p>
          </div>
        ) : !projectPath ? (
          <div className="co-cosmic-overlay" style={{ background: "#000008" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>
              No Project
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
              Open a project to visualize its galaxy graph.
            </p>
          </div>
        ) : graphData ? (
          <>
            <CosmicGalaxy
              data={graphData}
              settings={panelSettings}
              searchQuery={searchQuery}
              showOnlyChanged={false}
              showOrphans={false}
              resetKey={cameraResetKey}
              onNodeCountChange={(n, e) => {
                setVisibleNodeCount(n);
                setVisibleEdgeCount(e);
              }}
              flyTarget={flyTarget}
              onFlyComplete={() => setFlyTarget(null)}
              onTopDirsChange={setTopDirs}
              collapsed={collapsed}
            />
          </>
        ) : null}
      </div>

      {/* ══════ Bottom Info Bar ══════ */}
      {graphData && (
        <div
          className="co-cosmic-bottom-bar"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 16px",
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            fontSize: 11,
            color: "rgba(255,255,255,0.35)",
          }}
        >
          <span>
            <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>{displayNodes}</span>
            {" 个文件 · "}
            <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>{displayEdges}</span>
            {" 条关联"}
          </span>
          <span style={{ color: "rgba(255,255,255,0.25)" }}>
            拖拽旋转 / 滚轮缩放 · 悬浮查看 · 点击详情
          </span>
        </div>
      )}
    </div>
  );
}
