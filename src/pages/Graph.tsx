// Graph — Precision Instrument core visualization
// Sigma.js WebGL renderer + graphology data graph
// OKLCH node colors · 0.3px edges · progressive expand/collapse
// N-body force simulation for layout

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import Sigma from "sigma";
import Graph from "graphology";
import type { Attributes } from "graphology-types";
import { useScanGraph } from "@/hooks/useObservatory";
import type { GraphData, FileNode } from "@/lib/types";
import { RefreshCw, Maximize2, Zap } from "lucide-react";
import { createForceSimulation } from "@/lib/forceSimulation";

// ── Node colors in OKLCH ──
const NODE_COLORS: Record<string, string> = {
  dir: "oklch(70% 0.15 85)",
  ts: "oklch(60% 0.16 250)",
  tsx: "oklch(60% 0.16 250)",
  js: "oklch(60% 0.16 250)",
  jsx: "oklch(60% 0.16 250)",
  rs: "oklch(58% 0.17 20)",
  md: "oklch(58% 0.11 300)",
  json: "oklch(65% 0.12 95)",
  toml: "oklch(65% 0.12 95)",
  yaml: "oklch(65% 0.12 95)",
  yml: "oklch(65% 0.12 95)",
  css: "oklch(58% 0.12 155)",
  html: "oklch(58% 0.12 155)",
  scss: "oklch(58% 0.12 155)",
  c: "oklch(55% 0.02 260)",
  h: "oklch(55% 0.02 260)",
  cpp: "oklch(55% 0.02 260)",
  hpp: "oklch(55% 0.02 260)",
  py: "oklch(58% 0.1 195)",
  default: "oklch(55% 0.02 260)",
};

function getNodeColor(node: FileNode): string {
  if (node.kind === "dir") return NODE_COLORS.dir;
  const ext =
    node.extension ?? node.path.split(".").pop()?.toLowerCase() ?? "";
  return NODE_COLORS[ext] || NODE_COLORS.default;
}

function getNodeSize(kind: string, hasChildren: boolean): number {
  return kind === "dir" ? (hasChildren ? 5 : 4) : 3;
}

function formatSize(bytes?: number): string {
  if (bytes == null || bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Thresholds ──
const LABEL_ZOOM_THRESHOLD = 2.0;
const FORCE_MAX_ITER = 300;
const FORCE_LOCAL_ITER = 60;

// ── Graph Layers Pre-processing ──
interface NodeDef {
  id: string;
  label: string;
  path: string;
  kind: "dir" | "file";
  extension?: string;
  size?: number;
  modified?: string;
  color: string;
  nodeSize: number;
  hasChildren: boolean;
  truncated: boolean;
}

interface EdgeDef {
  id: string;
  source: string;
  target: string;
}

interface GraphLayers {
  dirNodes: NodeDef[];
  dirEdges: EdgeDef[];
  childMap: Map<string, { fileNodes: NodeDef[]; fileEdges: EdgeDef[] }>;
  parentMap: Map<string, string>;
  totalNodeCount: number;
  truncatedDirs: Set<string>;
}

function buildGraphLayers(data: GraphData): GraphLayers {
  const nodeMap = new Map<string, FileNode>();
  const hasChildrenSet = new Set<string>();
  const parentMap = new Map<string, string>();
  const truncatedDirs = new Set<string>();
  const dirNodes: NodeDef[] = [];
  const dirEdges: EdgeDef[] = [];
  const childMap = new Map<
    string,
    { fileNodes: NodeDef[]; fileEdges: EdgeDef[] }
  >();

  for (const n of data.nodes) {
    nodeMap.set(n.id, n);
    if (n.truncated) truncatedDirs.add(n.id);
  }

  for (const e of data.edges) {
    hasChildrenSet.add(e.source);
    parentMap.set(e.target, e.source);
  }

  // Dir nodes → initial elements
  for (const n of data.nodes) {
    if (n.kind !== "dir") continue;
    const hasKids = hasChildrenSet.has(n.id);
    dirNodes.push({
      id: n.id,
      label: n.label,
      path: n.path,
      kind: "dir",
      color: NODE_COLORS.dir,
      nodeSize: getNodeSize("dir", hasKids),
      hasChildren: hasKids,
      truncated: truncatedDirs.has(n.id),
    });
    childMap.set(n.id, { fileNodes: [], fileEdges: [] });
  }

  // Classify edges
  for (const e of data.edges) {
    const targetNode = nodeMap.get(e.target);
    if (!targetNode) continue;
    if (targetNode.kind === "dir") {
      dirEdges.push({ id: e.id, source: e.source, target: e.target });
    } else {
      const bucket = childMap.get(e.source);
      if (bucket) {
        bucket.fileEdges.push({ id: e.id, source: e.source, target: e.target });
      }
    }
  }

  // File nodes → childMap
  for (const n of data.nodes) {
    if (n.kind !== "file") continue;
    const parentId = parentMap.get(n.id);
    if (!parentId) continue;
    const bucket = childMap.get(parentId);
    if (!bucket) continue;
    bucket.fileNodes.push({
      id: n.id,
      label: n.label,
      path: n.path,
      kind: "file",
      extension: n.extension,
      size: n.size,
      modified: n.modified,
      color: getNodeColor(n),
      nodeSize: getNodeSize("file", false),
      hasChildren: false,
      truncated: false,
    });
  }

  return { dirNodes, dirEdges, childMap, parentMap, totalNodeCount: data.nodes.length, truncatedDirs };
}

// ── Graphology node attributes ──
interface NodeAttr extends Attributes {
  label: string;
  path: string;
  kind: "dir" | "file";
  extension: string | null;
  nodeSize: number;
  color: string;
  hasChildren: boolean;
  truncated: boolean;
  hidden: boolean;
  forceLabel: boolean;
}

// ── Component ──
interface GraphPageProps {
  projectPath: string;
}

export function GraphPage({ projectPath }: GraphPageProps) {
  const { graph: graphData, loading, refresh } = useScanGraph(projectPath);
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const forceRef = useRef<ReturnType<typeof createForceSimulation> | null>(null);
  const forceRafRef = useRef<number>(0);
  const expandedDirsRef = useRef<Set<string>>(new Set());
  const childMapRef = useRef<Map<string, { fileNodes: NodeDef[]; fileEdges: EdgeDef[] }>>(new Map());
  const highlightRef = useRef<{ neighbors: Set<string> } | null>(null);

  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    label: string;
    path: string;
    kind: string;
    size: string;
  }>({ visible: false, x: 0, y: 0, label: "", path: "", kind: "", size: "" });
  const [labelsVisible, setLabelsVisible] = useState(false);

  // Pre-process layers
  const layers = useMemo(
    () => (graphData ? buildGraphLayers(graphData) : null),
    [graphData],
  );

  const totalCount = layers?.totalNodeCount ?? 0;
  const dirCount = graphData?.nodes.filter((n) => n.kind === "dir").length ?? 0;
  const fileCount = graphData?.nodes.filter((n) => n.kind === "file").length ?? 0;
  const edgeCount = graphData?.edges.length ?? 0;
  const isVeryLarge = totalCount > 800;
  const isHuge = totalCount > 1500;

  // ── Kill running force sim ──
  const killForce = useCallback(() => {
    if (forceRafRef.current) {
      cancelAnimationFrame(forceRafRef.current);
      forceRafRef.current = 0;
    }
    if (forceRef.current) {
      forceRef.current.stop();
      forceRef.current = null;
    }
  }, []);

  // ── Start force sim + sigma refresh loop ──
  const startForce = useCallback(
    (g: Graph, maxIter: number, opts?: { repulsion?: number; attraction?: number; gravity?: number; damping?: number }) => {
      killForce();
      const ctrl = createForceSimulation(g, {
        repulsion: opts?.repulsion ?? 5000,
        attraction: opts?.attraction ?? 0.005,
        gravity: opts?.gravity ?? 0.01,
        damping: opts?.damping ?? 0.85,
        maxIterations: maxIter,
        onEnd: () => {
          sigmaRef.current?.refresh();
        },
      });
      forceRef.current = ctrl;
      ctrl.start();

      // Refresh sigma each animation frame while force runs
      const loop = () => {
        if (!ctrl.isRunning()) {
          forceRafRef.current = 0;
          return;
        }
        sigmaRef.current?.refresh();
        forceRafRef.current = requestAnimationFrame(loop);
      };
      forceRafRef.current = requestAnimationFrame(loop);
    },
    [killForce],
  );

  // ── Collapse one dir ──
  const collapseDir = useCallback(
    (dirId: string, g: Graph) => {
      const children = childMapRef.current.get(dirId);
      if (!children) return;

      for (const fn of children.fileNodes) {
        if (g.hasNode(fn.id)) g.dropNode(fn.id);
      }
      for (const fe of children.fileEdges) {
        if (g.hasEdge(fe.id)) g.dropEdge(fe.id);
      }
      expandedDirsRef.current.delete(dirId);
    },
    [],
  );

  // ── Expand one dir ──
  const expandDir = useCallback(
    (dirId: string, g: Graph, s: Sigma) => {
      const children = childMapRef.current.get(dirId);
      if (!children || (children.fileNodes.length === 0 && children.fileEdges.length === 0)) return;
      if (expandedDirsRef.current.has(dirId)) return;

      const px = (g.getNodeAttribute(dirId, "x") as number) || 0;
      const py = (g.getNodeAttribute(dirId, "y") as number) || 0;
      const count = children.fileNodes.length;

      for (let i = 0; i < count; i++) {
        const fn = children.fileNodes[i];
        const angle = (2 * Math.PI * i) / Math.max(count, 1);
        const ring = Math.floor(i / 12);
        const radius = 80 + ring * 35;
        g.addNode(fn.id, {
          x: px + radius * Math.cos(angle),
          y: py + radius * Math.sin(angle),
          label: fn.label,
          path: fn.path,
          kind: fn.kind,
          extension: fn.extension ?? null,
          nodeSize: fn.nodeSize,
          color: fn.color,
          hasChildren: false,
          truncated: false,
          hidden: false,
          forceLabel: false,
        });
      }

      for (const fe of children.fileEdges) {
        if (g.hasNode(fe.source) && g.hasNode(fe.target)) {
          g.addEdgeWithKey(fe.id, fe.source, fe.target);
        }
      }

      expandedDirsRef.current.add(dirId);
      s.refresh();
    },
    [],
  );

  // ── Main init effect ──
  useEffect(() => {
    if (!layers || !containerRef.current) return;

    // Cleanup
    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }
    killForce();

    expandedDirsRef.current = new Set();
    childMapRef.current = layers.childMap;
    highlightRef.current = null;

    // Create graphology graph
    const g = new Graph({
      multi: false,
      type: "directed",
      allowSelfLoops: false,
    });

    // Add dir nodes with random initial positions
    const w = containerRef.current.clientWidth || 800;
    const h = containerRef.current.clientHeight || 600;
    const spread = Math.min(w, h) * 0.35;

    for (const n of layers.dirNodes) {
      g.addNode(n.id, {
        x: Math.random() * spread * 2 - spread,
        y: Math.random() * spread * 2 - spread,
        label: n.label,
        path: n.path,
        kind: n.kind,
        extension: null,
        nodeSize: n.nodeSize,
        color: n.color,
        hasChildren: n.hasChildren,
        truncated: n.truncated,
        hidden: false,
        forceLabel: false,
      });
    }

    // Add dir→dir edges
    for (const e of layers.dirEdges) {
      if (g.hasNode(e.source) && g.hasNode(e.target)) {
        g.addEdgeWithKey(e.id, e.source, e.target);
      }
    }

    // Create Sigma WebGL renderer (Sigma v3 auto-detects WebGL)
    const s = new Sigma(g, containerRef.current, {
      allowInvalidContainer: true,
      stagePadding: 30,
      renderLabels: false,
      renderEdgeLabels: false,
      enableEdgeEvents: false,
      labelFont: "Georgia, system-ui, sans-serif",
      labelSize: 9,
      labelDensity: 0.3,
      labelRenderedSizeThreshold: 4,
      minCameraRatio: 0.05,
      maxCameraRatio: 8,
      // Prefer color from node attributes
      defaultNodeColor: "#555",
      defaultEdgeColor: "rgba(255,255,255,0.05)",
      minEdgeThickness: 0.3,
      autoRescale: true,
      autoCenter: true,
      // Node reducer: derive display from attributes
      nodeReducer: (_node, data) => {
        const nd = data as NodeAttr;
        let color = nd.color;
        let size = nd.nodeSize;

        // Highlight dimming
        if (highlightRef.current && !highlightRef.current.neighbors.has(_node)) {
          color = "oklch(6% 0.002 260)";
          size = size * 0.3;
        }

        return {
          label: nd.hidden ? "" : "",
          size,
          color,
          forceLabel: nd.forceLabel || false,
          type: "circle",
        };
      },
      edgeReducer: (_edge, data) => {
        const ea = data as Attributes;
        return {
          size: 0.3,
          color: ea.color || "rgba(255,255,255,0.05)",
          forceLabel: false,
          type: "line",
        };
      },
    });

    // ── Event bindings ──

    // Zoom/pan → show/hide labels based on zoom ratio
    const updateLabelVisibility = () => {
      const ratio = s.getCamera().getState().ratio;
      if (ratio > LABEL_ZOOM_THRESHOLD) {
        if (!s.getSetting("renderLabels")) {
          s.setSetting("renderLabels", true);
          setLabelsVisible(true);
        }
      } else {
        if (s.getSetting("renderLabels")) {
          s.setSetting("renderLabels", false);
          setLabelsVisible(false);
        }
      }
    };
    s.on("wheelStage", updateLabelVisibility);
    s.on("moveBody", updateLabelVisibility);

    // Tooltip
    s.on("enterNode", ({ node }) => {
      const nd = g.getNodeAttributes(node) as NodeAttr;
      const pos = s.graphToViewport({ x: nd.x, y: nd.y });
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      let kindLabel = nd.kind === "dir" ? "Directory" : "File";
      if (nd.truncated) kindLabel += " (truncated)";
      if (nd.kind === "dir" && nd.hasChildren) {
        kindLabel += expandedDirsRef.current.has(node) ? " · expanded" : " · click to expand";
      }
      setTooltip({
        visible: true,
        x: pos.x + rect.left + 12,
        y: pos.y + rect.top - 48,
        label: nd.label,
        path: nd.path,
        kind: kindLabel,
        size: formatSize(nd.size as number | undefined),
      });
    });

    s.on("leaveNode", () => {
      setTooltip((prev) => ({ ...prev, visible: false }));
    });

    // Click node → neighborhood highlight
    s.on("clickNode", ({ node }) => {
      const neighbors = new Set<string>();
      neighbors.add(node);
      g.forEachNeighbor(node, (n: string) => neighbors.add(n));
      highlightRef.current = { neighbors };
      s.refresh();
    });

    // Click stage → clear highlight
    s.on("clickStage", () => {
      if (highlightRef.current) {
        highlightRef.current = null;
        s.refresh();
      }
    });

    // Double-click → expand/collapse dir
    s.on("doubleClickNode", ({ node }) => {
      const nd = g.getNodeAttributes(node) as NodeAttr;
      if (nd.kind !== "dir" || !nd.hasChildren) return;

      if (expandedDirsRef.current.has(node)) {
        collapseDir(node, g);
        s.refresh();
      } else {
        expandDir(node, g, s);
        // Small local force sim to settle new nodes
        startForce(g, FORCE_LOCAL_ITER, {
          repulsion: 2000,
          attraction: 0.01,
          gravity: 0.02,
          damping: 0.8,
        });
      }
    });

    // Fit to screen on load
    setTimeout(() => s.getCamera().animatedReset({ duration: 300 }), 100);

    sigmaRef.current = s;
    graphRef.current = g;

    // Start force simulation for initial layout
    startForce(g, FORCE_MAX_ITER);

    return () => {
      killForce();
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
    };
  }, [layers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toolbar handlers ──
  const handleFit = useCallback(() => {
    sigmaRef.current?.getCamera().animatedReset({ duration: 300 });
  }, []);

  const handleForceRestart = useCallback(() => {
    const g = graphRef.current;
    if (!g || g.order === 0) return;
    killForce();

    // Randomize positions
    const w = containerRef.current?.clientWidth ?? 800;
    const h = containerRef.current?.clientHeight ?? 600;
    const spread = Math.min(w, h) * 0.3;
    g.forEachNode((node) => {
      g.setNodeAttribute(node, "x", Math.random() * spread * 2 - spread);
      g.setNodeAttribute(node, "y", Math.random() * spread * 2 - spread);
    });
    sigmaRef.current?.refresh();
    startForce(g, FORCE_MAX_ITER);
  }, [killForce, startForce]);

  return (
    <div className="flex flex-col h-full co-graph-bg">
      {/* ── Toolbar ── */}
      <div className="co-graph-toolbar">
        <div className="co-graph-toolbar-left">
          <span className="co-graph-badge">
            <svg width="6" height="6" viewBox="0 0 6 6">
              <circle cx="3" cy="3" r="3" fill={NODE_COLORS.dir} />
            </svg>
            {dirCount}
          </span>
          <span className="co-graph-badge">
            <svg width="6" height="6" viewBox="0 0 6 6">
              <circle cx="3" cy="3" r="3" fill={NODE_COLORS.ts} />
            </svg>
            {fileCount}
          </span>
          <span className="co-graph-badge">{edgeCount} edges</span>
          {labelsVisible && (
            <span className="co-graph-badge" style={{ color: "var(--co-text-muted)" }}>
              labels
            </span>
          )}
          {isVeryLarge && (
            <span className="co-graph-badge" style={{ color: "oklch(60% 0.18 20)" }} title="Large graph — dir-only">
              dir-only
            </span>
          )}
        </div>

        <div className="co-graph-toolbar-right">
          <button className="co-graph-icon-btn" onClick={handleForceRestart} title="Restart force layout">
            <Zap size={13} />
          </button>
          <button className="co-graph-icon-btn" onClick={handleFit} title="Fit to screen">
            <Maximize2 size={13} />
          </button>
          <button className="co-graph-icon-btn" onClick={refresh} disabled={loading} title="Rescan">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className="co-graph-canvas-wrapper">
        {isHuge && (
          <div className="co-graph-warning">
            <span>
              ⚠ {totalCount} nodes — very large project. Directory-only view active.
            </span>
          </div>
        )}

        {loading && !graphData ? (
          <div className="co-graph-loading">
            <div className="co-graph-loading-spinner" />
            <p className="co-graph-loading-text">Scanning files...</p>
          </div>
        ) : graphData && graphData.nodes.length === 0 ? (
          <div className="co-graph-empty">
            <p className="co-graph-empty-title">Empty</p>
            <p className="co-graph-empty-desc">This directory contains no files or folders.</p>
          </div>
        ) : !projectPath ? (
          <div className="co-graph-empty">
            <p className="co-graph-empty-title">No Project</p>
            <p className="co-graph-empty-desc">Open a project to visualize its file graph.</p>
          </div>
        ) : (
          <div ref={containerRef} className="co-graph-sigma-container" />
        )}

        {/* Tooltip */}
        {tooltip.visible && (
          <div className="co-graph-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
            <div className="co-graph-tooltip-label">{tooltip.label}</div>
            <div className="co-graph-tooltip-meta">
              <span>{tooltip.kind}</span>
              {tooltip.size && <span>· {tooltip.size}</span>}
            </div>
            <div className="co-graph-tooltip-path">{tooltip.path}</div>
          </div>
        )}
      </div>
    </div>
  );
}
