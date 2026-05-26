// Graph — Cosmic Galaxy · Three.js R3F 3D visualization
// Spiral galaxy layout with star nodes, bloom effects, and orbit controls

import { useState, useCallback, useMemo } from "react";
import { RefreshCw, Maximize2 } from "lucide-react";
import { useScanGraph } from "@/hooks/useObservatory";
import {
  GraphPanel,
  type ColorScheme,
} from "@/components/graph/GraphPanel";
import { CosmicGalaxy } from "@/components/graph/CosmicGalaxy";

interface GraphPageProps {
  projectPath: string;
}

export function GraphPage({ projectPath }: GraphPageProps) {
  const { graph: graphData, loading, refresh } = useScanGraph(projectPath);

  // ── Panel state ──
  const [panelOpen, setPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyChanged, setShowOnlyChanged] = useState(false);
  const [showOrphans, setShowOrphans] = useState(false);
  const [colorScheme, setColorScheme] = useState<ColorScheme>("filetype");
  const [nodeSizeVal, setNodeSizeVal] = useState(7);
  const [edgeThicknessVal, setEdgeThicknessVal] = useState(0.5);
  const [textOpacity, setTextOpacity] = useState(0);
  const [gravity, setGravity] = useState(5);
  const [repulsion, setRepulsion] = useState(10);
  const [attraction, setAttraction] = useState(3);
  const [edgeLength, setEdgeLength] = useState(5);

  // ── Filter stats (updated by CosmicGalaxy) ──
  const [visibleNodeCount, setVisibleNodeCount] = useState(0);
  const [visibleEdgeCount, setVisibleEdgeCount] = useState(0);

  // ── Camera reset key ──
  const [cameraResetKey, setCameraResetKey] = useState(0);

  // ── Total stats (before filtering) ──
  const totalNodeCount = graphData?.nodes.length ?? 0;
  const totalEdgeCount = graphData?.edges.length ?? 0;

  // ── Panel settings object (memoised to avoid object identity changes) ──
  const panelSettings = useMemo(() => ({
    nodeSize: nodeSizeVal,
    edgeThickness: edgeThicknessVal,
    gravity,
    repulsion,
    edgeLength,
  }), [nodeSizeVal, edgeThicknessVal, gravity, repulsion, edgeLength]);

  // ── Actions ──
  const handleFit = useCallback(() => {
    setCameraResetKey((k) => k + 1);
  }, []);

  const handleRescan = useCallback(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col h-full" style={{ background: "#000000" }}>
      {/* ── Toolbar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 40,
          padding: "0 12px",
          background: "rgba(255,255,255,0.03)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.5)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {graphData ? (
              <>
                <span style={{ color: "rgba(255,255,255,0.7)" }}>
                  {visibleNodeCount || totalNodeCount}
                </span>
                {" "}nodes{"  "}
                <span style={{ color: "rgba(255,255,255,0.7)" }}>
                  {visibleEdgeCount || totalEdgeCount}
                </span>
                {" "}edges
              </>
            ) : (
              "Waiting…"
            )}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button onClick={handleFit} title="Reset camera"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 26, height: 26, border: "none", borderRadius: 4,
              background: "transparent", color: "rgba(255,255,255,0.4)", cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
          >
            <Maximize2 size={13} />
          </button>
          <button onClick={handleRescan} disabled={loading} title="Rescan project"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 26, height: 26, border: "none", borderRadius: 4,
              background: "transparent", color: "rgba(255,255,255,0.4)",
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.3 : 1,
            }}
            onMouseEnter={(e) => {
              if (!loading) { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }
            }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div style={{ flex: 1, position: "relative", minHeight: 0, overflow: "hidden" }}>
        {/* Loading */}
        {loading && !graphData ? (
          <div
            style={{
              position: "absolute", inset: 0, zIndex: 10,
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 12,
              background: "#000008",
            }}
          >
            <div
              style={{
                width: 24, height: 24, borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.08)",
                borderTopColor: "rgba(255,255,255,0.5)",
                animation: "co-spin 0.7s linear infinite",
              }}
            />
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
              Scanning project…
            </p>
          </div>
        ) : graphData && graphData.nodes.length === 0 ? (
          <div
            style={{
              position: "absolute", inset: 0, zIndex: 10,
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", background: "#000008",
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>
              Empty Project
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
              This directory contains no files or folders.
            </p>
          </div>
        ) : !projectPath ? (
          <div
            style={{
              position: "absolute", inset: 0, zIndex: 10,
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", background: "#000008",
            }}
          >
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
              showOnlyChanged={showOnlyChanged}
              showOrphans={showOrphans}
              resetKey={cameraResetKey}
              onNodeCountChange={(n, e) => {
                setVisibleNodeCount(n);
                setVisibleEdgeCount(e);
              }}
            />

            <GraphPanel
              open={panelOpen}
              onToggle={() => setPanelOpen((v) => !v)}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              showOnlyChanged={showOnlyChanged}
              onShowOnlyChangedChange={setShowOnlyChanged}
              showOrphans={showOrphans}
              onShowOrphansChange={setShowOrphans}
              colorScheme={colorScheme}
              onColorSchemeChange={setColorScheme}
              nodeSize={nodeSizeVal}
              onNodeSizeChange={setNodeSizeVal}
              edgeThickness={edgeThicknessVal}
              onEdgeThicknessChange={setEdgeThicknessVal}
              textOpacity={textOpacity}
              onTextOpacityChange={setTextOpacity}
              gravity={gravity}
              onGravityChange={setGravity}
              repulsion={repulsion}
              onRepulsionChange={setRepulsion}
              attraction={attraction}
              onAttractionChange={setAttraction}
              edgeLength={edgeLength}
              onEdgeLengthChange={setEdgeLength}
              nodeCount={visibleNodeCount || totalNodeCount}
              edgeCount={visibleEdgeCount || totalEdgeCount}
              onAnimate={handleFit}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
