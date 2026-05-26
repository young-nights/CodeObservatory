// GraphPage — Deep Space Galaxy container
// Tag panel (left) + 3D Galaxy + Bottom bar + Inspector (right)

import { useState, useCallback, useContext, useMemo } from "react";
import { RefreshCw, Maximize2, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useScanGraph } from "@/hooks/useObservatory";
import { CosmicGalaxy, type LayoutNode } from "@/components/graph/CosmicGalaxy";
import { Inspector } from "@/components/graph/Inspector";
import { SidebarContext } from "@/components/layout/AppShell";

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
  const { graph, loading, refresh } = useScanGraph(projectPath);

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Tag panel collapse
  const [tagsCollapsed, setTagsCollapsed] = useState(false);

  // Inspector selection
  const [selectedNode, setSelectedNode] = useState<LayoutNode | null>(null);

  // Camera reset trigger
  const [resetKey, setResetKey] = useState(0);

  // Extract top-level dirs from graph for tag panel
  const topDirs = useMemo<TopDir[]>(() => {
    if (!graph) return [];
    const dirNodes = graph.nodes.filter((n) => n.kind === "dir");
    return dirNodes
      .map((d) => {
        const childCount = graph.nodes.filter(
          (n) => n.kind === "file" && graph.edges.some((e) => e.source === d.id && e.target === n.id),
        ).length;
        return {
          id: d.id,
          label: d.label,
          count: childCount,
          position: [0, 0, 0] as [number, number, number],
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [graph]);

  const handleFit = useCallback(() => setResetKey((k) => k + 1), []);

  const handleRescan = useCallback(() => refresh(), [refresh]);

  const handleNodeSelect = useCallback((node: LayoutNode | null) => {
    setSelectedNode(node);
  }, []);

  const handleCloseInspector = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Stats
  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;

  return (
    <div className="flex flex-col h-full relative" style={{ background: "var(--cosmic-bg)" }}>
      {/* ══════ Search bar (center top) ══════ */}
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
          background: "rgba(4, 2, 24, 0.7)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(136, 128, 255, 0.1)",
        }}
      >
        <Search size={12} style={{ color: "var(--cosmic-text-dim)", flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Search files or directories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: 180,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--cosmic-text-dim)",
            fontSize: 12,
            lineHeight: "24px",
          }}
          className="placeholder:text-white/10"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "rgba(136, 128, 255, 0.1)",
              border: "none",
              color: "var(--cosmic-text-dim)",
              cursor: "pointer",
            }}
          >
            <X size={10} />
          </button>
        )}
      </div>

      {/* ══════ Left Tag Panel (directories) ══════ */}
      {!tagsCollapsed ? (
        <div className="co-cosmic-tag-panel">
          <button
            onClick={() => setTagsCollapsed(true)}
            className="co-galaxy-tags-collapse-btn"
            title="Collapse panel"
          >
            <ChevronLeft size={12} />
          </button>
          <div className="co-cosmic-tag-card">
            <h3 className="co-cosmic-tag-title">Directories</h3>
            <div className="co-cosmic-tag-grid">
              {topDirs.length === 0 && (
                <span className="co-cosmic-tag-empty">Scanning…</span>
              )}
              {topDirs.map((dir) => (
                <button
                  key={dir.id}
                  className="co-cosmic-tag-btn"
                  title={dir.label}
                  onClick={() => {
                    /* fly-to would go here with a ref to CosmicGalaxy */
                  }}
                >
                  <span className="truncate">{dir.label}</span>
                  <span className="co-cosmic-tag-count">{dir.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setTagsCollapsed(false)}
          className="co-galaxy-tags-expand"
          title="Expand directories"
        >
          <ChevronRight size={14} />
        </button>
      )}

      {/* ══════ Action buttons (top right) ══════ */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: selectedNode ? 292 : 12,
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
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: 9999,
            border: "1px solid rgba(136, 128, 255, 0.1)",
            background: "rgba(4, 2, 24, 0.6)",
            color: "var(--cosmic-text-dim)",
            cursor: "pointer",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <Maximize2 size={14} />
        </button>
        <button
          onClick={handleRescan}
          disabled={loading}
          title="Rescan project"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: 9999,
            border: "1px solid rgba(136, 128, 255, 0.1)",
            background: "rgba(4, 2, 24, 0.6)",
            color: "var(--cosmic-text-dim)",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.4 : 1,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ══════ 3D Galaxy ══════ */}
      <div style={{ flex: 1, position: "relative", minHeight: 0, overflow: "hidden" }}>
        <CosmicGalaxy
          key={resetKey}
          graph={graph}
          fullscreen={collapsed}
          onNodeSelect={handleNodeSelect}
        />
      </div>

      {/* ══════ Bottom Info Bar ══════ */}
      {graph && (
        <div
          className="co-cosmic-bottom-bar"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: selectedNode ? 280 : 0,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 16px",
            background: "rgba(4, 2, 24, 0.7)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            borderTop: "1px solid rgba(136, 128, 255, 0.08)",
            fontSize: 11,
            color: "var(--cosmic-text-dim)",
          }}
        >
          <span>
            <span style={{ color: "var(--cosmic-accent)", fontWeight: 500 }}>
              {nodeCount}
            </span>
            {" files · "}
            <span style={{ color: "var(--cosmic-accent)", fontWeight: 500 }}>
              {edgeCount}
            </span>
            {" connections"}
          </span>
          <span style={{ color: "var(--cosmic-text-dim)", opacity: 0.6 }}>
            Drag to rotate · Scroll to zoom · Hover for details · Click to inspect
          </span>
        </div>
      )}

      {/* ══════ Right Inspector ══════ */}
      {selectedNode && (
        <Inspector node={selectedNode} onClose={handleCloseInspector} />
      )}
    </div>
  );
}
