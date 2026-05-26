// Graph — Galaxy Burst · ForceAtlas2 + Sigma.js WebGL
// All nodes visible at once, force-directed layout radiates from center
// Warm colors for directories, cool colors for files, pure black background

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import Sigma from "sigma";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { useScanGraph } from "@/hooks/useObservatory";

import { RefreshCw, Maximize2 } from "lucide-react";

// ── Color system: warm → dir / cool → file ──
const DIR_COLOR_ROOT = "#ffffff"; // 中心恒星 — 纯白
const DIR_COLOR_L1 = "#ffd700"; // 一级目录 — 金色
const DIR_COLOR_DEEP = "#ff8c42"; // 深级目录 — 橙色
const FILE_COLOR_DEFAULT = "#a0a0c0"; // 其他文件 — 淡紫灰

const EXT_COLORS: Record<string, string> = {
  ts: "#00bfff",
  tsx: "#00bfff",
  js: "#5dade2",
  jsx: "#5dade2",
  rs: "#9370db",
  md: "#7b68ee",
  json: "#6495ed",
  toml: "#6495ed",
  yaml: "#6495ed",
  yml: "#6495ed",
  css: "#48d1cc",
  scss: "#48d1cc",
  html: "#1e90ff",
  py: "#00ced1",
  c: "#87ceeb",
  h: "#87ceeb",
  cpp: "#87ceeb",
  hpp: "#87ceeb",
  go: "#5f9ea0",
};

// ── Edge colors: near → far graduated ──
const EDGE_COLORS = [
  "rgba(255,215,0,0.12)", // 近中心 — 金色调
  "rgba(255,140,66,0.08)", // 中层 — 橙色调
  "rgba(0,191,255,0.04)", // 外层 — 蓝调
];

// ── Node sizes: burst pattern (center large, outward smaller) ──
const SIZE_ROOT = 32;
const SIZE_DIR_L1 = 16;
const SIZE_DIR_DEEP = 10;
const SIZE_FILE = 6;

// ── Helpers ──

function getNodeColor(kind: string | null, depth: number, ext?: string): string {
  if (kind !== "file") {
    // directory
    if (depth === 0) return DIR_COLOR_ROOT;
    if (depth === 1) return DIR_COLOR_L1;
    return DIR_COLOR_DEEP;
  }
  // file
  if (ext) return EXT_COLORS[ext.toLowerCase()] ?? FILE_COLOR_DEFAULT;
  return FILE_COLOR_DEFAULT;
}

function getNodeSize(kind: string | null, depth: number): number {
  if (kind !== "file") {
    if (depth === 0) return SIZE_ROOT;
    if (depth === 1) return SIZE_DIR_L1;
    return SIZE_DIR_DEEP;
  }
  return SIZE_FILE;
}

function formatSize(bytes?: number): string {
  if (bytes == null || bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Component ──

interface GraphPageProps {
  projectPath: string;
}

export function GraphPage({ projectPath }: GraphPageProps) {
  const { graph: graphData, loading, refresh } = useScanGraph(projectPath);
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const highlightedNodeRef = useRef<string | null>(null);

  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    label: string;
    path: string;
    kind: string;
    size: string;
  }>({ visible: false, x: 0, y: 0, label: "", path: "", kind: "", size: "" });

  const [layoutDone, setLayoutDone] = useState(false);

  // ── Build internal graphology graph + forceAtlas2 layout ──
  const internalGraph = useMemo(() => {
    if (!graphData) return null;
    setLayoutDone(false);

    const g = new Graph({ multi: false, type: "directed", allowSelfLoops: false });

    // Find root & build child map
    const targeted = new Set(graphData.edges.map((e) => e.target));
    let rootId = graphData.nodes.find((n) => !targeted.has(n.id))?.id;
    const childMap = new Map<string, string[]>();
    for (const e of graphData.edges) {
      const arr = childMap.get(e.source) || [];
      arr.push(e.target);
      childMap.set(e.source, arr);
    }

    // BFS depth from root
    const depths = new Map<string, number>();
    if (rootId) {
      const queue = [rootId];
      depths.set(rootId, 0);
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const d = depths.get(cur)!;
        for (const child of childMap.get(cur) || []) {
          if (!depths.has(child)) {
            depths.set(child, d + 1);
            queue.push(child);
          }
        }
      }
    }

    // Add all nodes with random initial scatter around center
    for (const n of graphData.nodes) {
      const depth = depths.get(n.id) ?? 1;
      const color = getNodeColor(n.kind ?? null, depth, n.extension);
      const nodeSize = getNodeSize(n.kind ?? null, depth);
      const scatterR = 30 + Math.random() * 180;
      const scatterA = Math.random() * 2 * Math.PI;

      g.addNode(n.id, {
        x: scatterR * Math.cos(scatterA),
        y: scatterR * Math.sin(scatterA),
        label: n.label,
        path: n.path,
        kind: n.kind ?? null,
        depth,
        color,
        nodeSize,
        extension: n.extension,
        size: n.size,
      });
    }

    // Add all edges
    for (const e of graphData.edges) {
      if (g.hasNode(e.source) && g.hasNode(e.target)) {
        g.addEdgeWithKey(e.id, e.source, e.target, {});
      }
    }

    // ── Run ForceAtlas2 ──
    try {
      forceAtlas2.assign(g, {
        iterations: 300,
        settings: {
          gravity: 5,
          scalingRatio: 1.5,
          slowDown: 3,
          barnesHutOptimize: true,
          strongGravityMode: true,
          outboundAttractionDistribution: true,
        },
      });
    } catch (err) {
      console.error("[Graph] ForceAtlas2 failed:", err);
      // Continue with random positions
    }

    // ── Assign edge color tiers based on midpoint distance from center ──
    const dists: number[] = [];
    g.forEachEdge((_e, _a, s, t) => {
      const sx = (g.getNodeAttribute(s, "x") as number) ?? 0;
      const sy = (g.getNodeAttribute(s, "y") as number) ?? 0;
      const tx = (g.getNodeAttribute(t, "x") as number) ?? 0;
      const ty = (g.getNodeAttribute(t, "y") as number) ?? 0;
      dists.push(Math.sqrt(((sx + tx) / 2) ** 2 + ((sy + ty) / 2) ** 2));
    });
    dists.sort((a, b) => a - b);
    const t1 = dists[Math.floor(dists.length * 0.33)] ?? 0;
    const t2 = dists[Math.floor(dists.length * 0.66)] ?? 0;

    g.forEachEdge((e, _a, s, t) => {
      const sx = (g.getNodeAttribute(s, "x") as number) ?? 0;
      const sy = (g.getNodeAttribute(s, "y") as number) ?? 0;
      const tx = (g.getNodeAttribute(t, "x") as number) ?? 0;
      const ty = (g.getNodeAttribute(t, "y") as number) ?? 0;
      const midDist = Math.sqrt(((sx + tx) / 2) ** 2 + ((sy + ty) / 2) ** 2);
      g.setEdgeAttribute(e, "colorTier", midDist <= t1 ? 0 : midDist <= t2 ? 1 : 2);
    });

    return g;
  }, [graphData]);

  // Derived counts
  const nodeCount = internalGraph?.order ?? 0;
  const edgeCount = internalGraph?.size ?? 0;

  // ── Sigma init ──
  useEffect(() => {
    if (!internalGraph || !containerRef.current) return;

    // Cleanup previous instance
    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }
    highlightedNodeRef.current = null;

    // Container size guard
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      console.warn("[Graph] Zero-dimension container, skipping Sigma init");
      return;
    }

    let s: Sigma;
    try {
      s = new Sigma(internalGraph, containerRef.current, {
        allowInvalidContainer: true,
        renderLabels: false,
        renderEdgeLabels: false,
        enableEdgeEvents: false,
        labelFont: "system-ui, sans-serif",
        labelSize: 10,
        labelRenderedSizeThreshold: 6,
        minCameraRatio: 0.02,
        maxCameraRatio: 14,
        defaultNodeColor: "#a0a0c0",
        defaultEdgeColor: EDGE_COLORS[0],
        autoRescale: true,
        autoCenter: true,

        nodeReducer: (_node, data) => {
          const d = data as Record<string, unknown>;
          const isHL = highlightedNodeRef.current === _node;
          return {
            label: "",
            size: isHL ? ((d.nodeSize as number) || 6) * 1.8 : ((d.nodeSize as number) || 6),
            color: isHL ? "#ffffff" : ((d.color as string) || "#a0a0c0"),
          };
        },

        edgeReducer: (_edge, data) => {
          const tier = (data as { colorTier?: number }).colorTier ?? 0;
          return {
            color: EDGE_COLORS[tier] ?? EDGE_COLORS[0],
            size: 0.3,
          };
        },
      });
    } catch (err: any) {
      console.error("[Graph] Sigma init failed:", err);
      return;
    }

    // ── Tooltip on hover ──
    s.on("enterNode", ({ node }) => {
      try {
        const nd = internalGraph.getNodeAttributes(node) as Record<string, unknown>;
        const nx = (nd.x as number) ?? 0;
        const ny = (nd.y as number) ?? 0;
        const pos = s.graphToViewport({ x: nx, y: ny });
        const crect = containerRef.current?.getBoundingClientRect();
        if (!crect) return;

        const kindLabel = nd.kind === "file"
          ? `File${nd.extension ? ` .${nd.extension}` : ""}`
          : `Directory`;

        setTooltip({
          visible: true,
          x: pos.x + crect.left + 14,
          y: pos.y + crect.top - 48,
          label: (nd.label as string) || "",
          path: (nd.path as string) || "",
          kind: kindLabel,
          size: nd.kind === "file" ? formatSize(nd.size as number | undefined) : "",
        });
      } catch { /* node removed */ }
    });

    s.on("leaveNode", () => {
      setTooltip((prev) => ({ ...prev, visible: false }));
    });

    // ── Click node → highlight ──
    s.on("clickNode", ({ node }) => {
      if (highlightedNodeRef.current === node) {
        highlightedNodeRef.current = null;
      } else {
        highlightedNodeRef.current = node;
      }
      s.refresh();
    });

    // ── Click stage → clear highlight ──
    s.on("clickStage", () => {
      if (highlightedNodeRef.current !== null) {
        highlightedNodeRef.current = null;
        s.refresh();
      }
    });

    // ── Node drag (forceatlas2-compatible) ──
    let draggedNode: string | null = null;
    let dragStartX = 0;
    let dragStartY = 0;

    s.on("downNode", ({ node, event }) => {
      draggedNode = node;
      const crect = containerRef.current?.getBoundingClientRect();
      if (crect) {
        dragStartX = event.x - crect.left;
        dragStartY = event.y - crect.top;
      }
    });

    s.on("moveBody", ({ event }) => {
      if (!draggedNode || !internalGraph) return;
      const crect = containerRef.current?.getBoundingClientRect();
      if (!crect) return;
      const mouseX = event.x - crect.left;
      const mouseY = event.y - crect.top;
      if (Math.abs(mouseX - dragStartX) < 2 && Math.abs(mouseY - dragStartY) < 2) return;

      const pos = s.viewportToGraph({ x: mouseX, y: mouseY });
      internalGraph.setNodeAttribute(draggedNode, "x", pos.x);
      internalGraph.setNodeAttribute(draggedNode, "y", pos.y);
      s.refresh();
    });

    const stopDrag = () => {
      draggedNode = null;
    };
    s.on("upNode", stopDrag);
    s.on("upStage", stopDrag);

    // Fit to screen on first render
    setTimeout(() => {
      s.getCamera().animatedReset({ duration: 400 });
      setLayoutDone(true);
    }, 150);

    sigmaRef.current = s;

    return () => {
      s.kill();
      sigmaRef.current = null;
    };
  }, [internalGraph]);

  // ── Toolbar handlers ──
  const handleFit = useCallback(() => {
    sigmaRef.current?.getCamera().animatedReset({ duration: 300 });
  }, []);

  const handleRescan = useCallback(() => {
    highlightedNodeRef.current = null;
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
        {/* Left: node / edge counts */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.5)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {layoutDone ? (
              <>
                <span style={{ color: "rgba(255,255,255,0.7)" }}>{nodeCount}</span> nodes{"  "}
                <span style={{ color: "rgba(255,255,255,0.7)" }}>{edgeCount}</span> edges
              </>
            ) : (
              "Computing layout…"
            )}
          </span>
        </div>

        {/* Right: Fit / Rescan */}
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button
            onClick={handleFit}
            title="Fit to screen"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              border: "none",
              borderRadius: 4,
              background: "transparent",
              color: "rgba(255,255,255,0.4)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              e.currentTarget.style.color = "rgba(255,255,255,0.7)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "rgba(255,255,255,0.4)";
            }}
          >
            <Maximize2 size={13} />
          </button>
          <button
            onClick={handleRescan}
            disabled={loading}
            title="Rescan project"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              border: "none",
              borderRadius: 4,
              background: "transparent",
              color: "rgba(255,255,255,0.4)",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.3 : 1,
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                e.currentTarget.style.color = "rgba(255,255,255,0.7)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "rgba(255,255,255,0.4)";
            }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div style={{ flex: 1, position: "relative", minHeight: 0, overflow: "hidden" }}>
        {loading && !graphData ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.08)",
                borderTopColor: "rgba(255,255,255,0.5)",
                animation: "co-spin 0.7s linear infinite",
              }}
            />
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Scanning project...</p>
          </div>
        ) : graphData && graphData.nodes.length === 0 ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
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
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>
              No Project
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
              Open a project to visualize its galaxy graph.
            </p>
          </div>
        ) : (
          <div
            ref={containerRef}
            style={{ position: "absolute", inset: 0, zIndex: 1 }}
          />
        )}

        {/* Tooltip */}
        {tooltip.visible && (
          <div
            style={{
              position: "absolute",
              zIndex: 50,
              left: tooltip.x,
              top: tooltip.y,
              padding: "6px 10px",
              borderRadius: 4,
              background: "rgba(20,20,30,0.92)",
              border: "1px solid rgba(255,255,255,0.08)",
              pointerEvents: "none",
              maxWidth: 300,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
              {tooltip.label}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.4)",
                display: "flex",
                gap: 4,
                marginTop: 1,
              }}
            >
              <span>{tooltip.kind}</span>
              {tooltip.size && <span>· {tooltip.size}</span>}
            </div>
            <div
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.25)",
                marginTop: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {tooltip.path}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
