// Graph — 星河图谱 · Precision Instrument core visualization
// Sigma.js WebGL renderer + solarLayout radial concentric rings
// Star (Root) → Planet (top dir) → Moon (subdir) → Satellite (file) → Dust (change)
// OKLCH color space · exponential easing · expand/collapse progressive reveal

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import Sigma from "sigma";
import Graph from "graphology";
import { useScanGraph } from "@/hooks/useObservatory";
import type { FileNode, ChangeRecord } from "@/lib/types";
import * as api from "@/lib/api";
import {
  computeSolarLayout,
  computeDustPositions,
  getEdgeRing,
  RING_NAMES,
} from "@/lib/solarLayout";
import { RefreshCw, Maximize2, Home, ChevronDown, ChevronUp } from "lucide-react";

// ── OKLCH Node Colors ──
const NODE_COLORS = {
  star: "oklch(75% 0.18 85)",
  planet: "oklch(63% 0.12 250)",
  moon: "oklch(58% 0.08 250)",
  dust: "oklch(70% 0.05 85 / 0.6)",
  default: "oklch(55% 0.02 260)",
} as const;

// Extension → OKLCH color for file/satellite nodes
const EXT_COLORS: Record<string, string> = {
  ts: "oklch(62% 0.16 250)",
  tsx: "oklch(64% 0.16 250)",
  js: "oklch(60% 0.14 195)",
  jsx: "oklch(62% 0.14 195)",
  rs: "oklch(58% 0.17 20)",
  md: "oklch(58% 0.11 300)",
  json: "oklch(65% 0.12 95)",
  toml: "oklch(65% 0.12 95)",
  yaml: "oklch(65% 0.12 95)",
  yml: "oklch(65% 0.12 95)",
  css: "oklch(58% 0.12 155)",
  scss: "oklch(58% 0.12 155)",
  html: "oklch(58% 0.12 30)",
  py: "oklch(58% 0.1 195)",
  c: "oklch(55% 0.14 200)",
  h: "oklch(55% 0.14 200)",
  cpp: "oklch(55% 0.14 200)",
  hpp: "oklch(55% 0.14 200)",
  go: "oklch(55% 0.13 180)",
};

// ── Node Sizes ──
const NODE_SIZES = {
  star: 18,
  planet: 10,
  moon: 7,
  satellite: 5,
  dust: 3,
} as const;

// ── Edge orbit colors & thickness ──
const ORBIT_COLOR = "oklch(100% 0 0 / 0.04)";
const EDGE_THICKNESS: Record<number, number> = {
  1: 0.5,   // Star → Planet
  2: 0.3,   // Planet → Moon / File
  3: 0.2,   // File → Dust
};

const LABEL_ZOOM_THRESHOLD = 2.0;

// ── Helpers ──

function getFileColor(ext?: string): string {
  if (!ext) return NODE_COLORS.default;
  return EXT_COLORS[ext.toLowerCase()] ?? NODE_COLORS.default;
}

function getNodeTypeByRing(ring: number): FileNode["nodeType"] {
  return (RING_NAMES[ring] as FileNode["nodeType"]) ?? "satellite";
}

function formatSize(bytes?: number): string {
  if (bytes == null || bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatChangeKind(kind: string): string {
  switch (kind) {
    case "created": return "✚";
    case "modified": return "✎";
    case "deleted": return "✕";
    default: return kind;
  }
}

function shortTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso.slice(0, 5);
  }
}

// ── GraphNode extended attributes ──
interface GraphNodeAttr {
  x: number;
  y: number;
  label: string;
  path: string;
  kind: "dir" | "file" | null;
  ring: number;
  nodeType: FileNode["nodeType"];
  color: string;
  nodeSize: number;
  hasChildren: boolean;
  hidden: boolean;
  // for file nodes: cached extension, size
  extension?: string;
  size?: number;
  // for dust nodes
  changeKind?: string;
  changeTimestamp?: string;
  changeSummary?: string;
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

  // Persistent refs for expand/collapse state
  const expandedDirsRef = useRef<Set<string>>(new Set());
  const expandedFilesRef = useRef<Set<string>>(new Set());
  const dustCacheRef = useRef<Map<string, ChangeRecord[]>>(new Map());

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
  const [initError, setInitError] = useState<string | null>(null);

  // ── Compute solar layout ──
  const layout = useMemo(
    () => (graphData ? computeSolarLayout(graphData.nodes, graphData.edges, projectPath) : null),
    [graphData, projectPath],
  );

  // Derived counts
  const nodeMap = useMemo(
    () => new Map((graphData?.nodes ?? []).map((n) => [n.id, n])),
    [graphData],
  );
  const starCount = layout ? 1 : 0;
  const planetCount = layout
    ? [...layout.ringMap.values()].filter((r) => r === 1).length
    : 0;
  const moonCount = layout
    ? [...layout.ringMap.values()].filter((r) => r === 2).length
    : 0;
  const fileCount = layout
    ? [...layout.ringMap.values()].filter((r) => r === 3).length
    : 0;

  // ── Expand one directory: add its direct file children to the graph ──
  const expandDir = useCallback(
    (dirId: string) => {
      const g = graphRef.current;
      const s = sigmaRef.current;
      if (!g || !s || !layout) return;

      const children = layout.childMap.get(dirId);
      if (!children || children.length === 0) return;

      for (const childId of children) {
        const nd = nodeMap.get(childId);
        const childRing = layout.ringMap.get(childId);
        if (!nd || childRing == null) continue;
        if (childRing !== 3) continue; // only add satellite (file) nodes

        const pos = layout.positions.get(childId);

        // If already in graph (e.g. added by previous expand), just unhide
        if (g.hasNode(childId)) {
          try { g.setNodeAttribute(childId, "hidden", false); } catch { /* node may have been removed */ }
          continue;
        }

        const parentPos = g.getNodeAttributes(dirId) as Record<string, unknown>;
        const childX = pos?.x ?? ((parentPos.x as number) + (Math.random() - 0.5) * 200);
        const childY = pos?.y ?? ((parentPos.y as number) + (Math.random() - 0.5) * 200);
        const color = getFileColor(nd.extension);

        g.addNode(childId, {
          x: childX,
          y: childY,
          label: nd.label,
          path: nd.path,
          kind: nd.kind ?? null,
          ring: childRing,
          nodeType: "satellite",
          color,
          nodeSize: NODE_SIZES.satellite,
          hasChildren: false,
          hidden: false,
          extension: nd.extension,
          size: nd.size,
        });

        // Add edge from parent to this file
        const edgeRing = getEdgeRing(layout.ringMap.get(dirId) ?? 1, childRing);
        const edgeId = `${dirId}→${childId}`;
        if (!g.hasEdge(edgeId)) {
          g.addEdgeWithKey(edgeId, dirId, childId, { edgeRing });
        }
      }

      expandedDirsRef.current.add(dirId);
      s.refresh();
    },
    [layout, nodeMap],
  );

  // ── Collapse one directory: remove its file children ──
  const collapseDir = useCallback(
    (dirId: string) => {
      const g = graphRef.current;
      const s = sigmaRef.current;
      if (!g || !s || !layout) return;

      const children = layout.childMap.get(dirId);
      if (!children) return;

      for (const childId of children) {
        const childRing = layout.ringMap.get(childId);
        if (childRing !== 3) continue;

        // Also collapse any expanded dust for this file
        if (expandedFilesRef.current.has(childId)) {
          collapseFile(childId);
        }

        if (g.hasNode(childId)) {
          g.dropNode(childId);
        }
      }

      expandedDirsRef.current.delete(dirId);
      s.refresh();
    },
    [layout],
  );

  // ── Expand one file: fetch changelog, create dust nodes ──
  const expandFile = useCallback(
    async (fileId: string) => {
      const g = graphRef.current;
      const s = sigmaRef.current;
      if (!g || !s || !layout) return;

      if (expandedFilesRef.current.has(fileId)) return;

      const fileNode = nodeMap.get(fileId);
      if (!fileNode) return;

      let changes: ChangeRecord[];
      // Check cache first
      const cached = dustCacheRef.current.get(fileId);
      if (cached) {
        changes = cached;
      } else {
        try {
          changes = await api.getFileChanges(projectPath, fileNode.path);
          dustCacheRef.current.set(fileId, changes);
        } catch {
          console.warn("Failed to fetch changes for", fileNode.path);
          return;
        }
      }

      if (changes.length === 0) {
        expandedFilesRef.current.add(fileId); // mark expanded even if empty
        return;
      }

      const sector = layout.sectorMap.get(fileId) ?? { start: 0, end: 2 * Math.PI };
      const dustIds = changes.map((c) => `dust-${c.id}`);
      const dustPositions = computeDustPositions(dustIds, sector.start, sector.end);

      for (let i = 0; i < changes.length; i++) {
        const c = changes[i];
        const dId = `dust-${c.id}`;
        if (g.hasNode(dId)) continue;

        const pos = dustPositions.get(dId);
        if (!pos) continue;

        g.addNode(dId, {
          x: pos.x,
          y: pos.y,
          label: `${formatChangeKind(c.kind)} ${shortTimestamp(c.timestamp)}`,
          path: c.filePath,
          kind: null,
          ring: 4,
          nodeType: "dust",
          color: NODE_COLORS.dust,
          nodeSize: NODE_SIZES.dust,
          hasChildren: false,
          hidden: false,
          changeKind: c.kind,
          changeTimestamp: c.timestamp,
          changeSummary: c.summary,
        });

        // Edge from file to dust
        const edgeId = `${fileId}→${dId}`;
        if (!g.hasEdge(edgeId)) {
          g.addEdgeWithKey(edgeId, fileId, dId, { edgeRing: 3 });
        }
      }

      expandedFilesRef.current.add(fileId);
      s.refresh();
    },
    [layout, nodeMap, projectPath],
  );

  // ── Collapse one file: remove dust nodes ──
  const collapseFile = useCallback(
    (fileId: string) => {
      const g = graphRef.current;
      const s = sigmaRef.current;
      if (!g || !s) return;

      const dustPrefix = `dust-`;
      const toRemove: string[] = [];
      g.forEachNode((nodeId) => {
        if (nodeId.startsWith(dustPrefix)) {
          // Check if this dust is connected to fileId
          const edges = g.edges(nodeId);
          for (const e of edges) {
            const src = g.source(e);
            const tgt = g.target(e);
            if (src === fileId || tgt === fileId) {
              toRemove.push(nodeId);
              break;
            }
          }
        }
      });

      for (const nid of toRemove) {
        g.dropNode(nid);
      }

      expandedFilesRef.current.delete(fileId);
      s.refresh();
    },
    [],
  );

  // ── Expand / Collapse all ──
  const handleExpandAll = useCallback(() => {
    if (!layout) return;
    for (const [nodeId, ring] of layout.ringMap) {
      if ((ring === 1 || ring === 2) && (layout.childMap.get(nodeId)?.length ?? 0) > 0) {
        expandDir(nodeId);
      }
    }
  }, [layout, expandDir]);

  const handleCollapseAll = useCallback(() => {
    // Collapse files first (removes dust), then dirs
    const filesToCollapse = new Set(expandedFilesRef.current);
    for (const fid of filesToCollapse) collapseFile(fid);

    const dirsToCollapse = new Set(expandedDirsRef.current);
    for (const did of dirsToCollapse) collapseDir(did);
  }, [collapseDir, collapseFile]);

  // ── Main init effect ──
  useEffect(() => {
    if (!layout || !containerRef.current || !graphData) return;

    // Cleanup
    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }

    expandedDirsRef.current = new Set();
    expandedFilesRef.current = new Set();
    dustCacheRef.current = new Map();

    const g = new Graph({
      multi: false,
      type: "directed",
      allowSelfLoops: false,
    });

    // Add Star + Planet + Moon nodes (rings 0-2)
    for (const [nodeId, pos] of layout.positions) {
      const nd = nodeMap.get(nodeId);
      if (!nd) continue;
      const ring = layout.ringMap.get(nodeId) ?? 0;
      if (ring > 2) continue; // skip files & dust initially

      const nodeType = getNodeTypeByRing(ring);
      const color =
        ring === 0
          ? NODE_COLORS.star
          : ring === 1
            ? NODE_COLORS.planet
            : NODE_COLORS.moon;
      const size =
        ring === 0
          ? NODE_SIZES.star
          : ring === 1
            ? NODE_SIZES.planet
            : NODE_SIZES.moon;
      const hasKids = (layout.childMap.get(nodeId)?.length ?? 0) > 0;

      g.addNode(nodeId, {
        x: pos.x,
        y: pos.y,
        label: nd.label,
        path: nd.path,
        kind: nd.kind ?? null,
        ring,
        nodeType,
        color,
        nodeSize: size,
        hasChildren: hasKids,
        hidden: false,
      });
    }

    // Add edges for visible nodes (both endpoints visible)
    for (const e of graphData.edges) {
      if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue;
      const sRing = layout.ringMap.get(e.source) ?? 0;
      const tRing = layout.ringMap.get(e.target) ?? 0;
      const er = getEdgeRing(sRing, tRing);
      g.addEdgeWithKey(e.id, e.source, e.target, { edgeRing: er });
    }

    // ── Validate all nodes have positions ──
    let missingPositions = 0;
    g.forEachNode((node) => {
      const attrs = g.getNodeAttributes(node) as Record<string, unknown>;
      if (typeof attrs.x !== "number" || typeof attrs.y !== "number" || isNaN(attrs.x) || isNaN(attrs.y)) {
        missingPositions++;
        g.setNodeAttribute(node, "x", 0);
        g.setNodeAttribute(node, "y", 0);
        console.warn("[Graph] Node missing position, defaulting to (0,0):", node, attrs);
      }
    });
    if (missingPositions > 0) {
      console.warn(`[Graph] ${missingPositions} nodes had missing positions, fixed`);
    }

    // ── Container size guard ──
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      console.warn("[Graph] Container has zero dimensions, skipping Sigma init");
      setInitError("Container has zero dimensions — is the canvas visible?");
      graphRef.current = g; // keep graphology ref for cleanup
      return;
    }

    // ── Sigma WebGL renderer ──
    let s: Sigma;
    try {
      s = new Sigma(g, containerRef.current, {
        allowInvalidContainer: true,
        stagePadding: 40,
      renderLabels: false,
      renderEdgeLabels: false,
      enableEdgeEvents: false,
      labelFont: "Georgia, system-ui, sans-serif",
      labelSize: 9,
      labelDensity: 0.25,
      labelRenderedSizeThreshold: 3,
      minCameraRatio: 0.02,
      maxCameraRatio: 14,
      defaultNodeColor: "#555",
      defaultEdgeColor: ORBIT_COLOR,
      autoRescale: true,
      autoCenter: true,

      nodeReducer: (_node, data) => {
        const nd = data as unknown as GraphNodeAttr;
        return {
          label: "",
          size: nd.nodeSize || 5,
          color: nd.color || "#666",
        };
      },

      edgeReducer: (_edge, data) => {
        const edgeRing = (data as { edgeRing?: number }).edgeRing ?? 2;
        return {
          size: EDGE_THICKNESS[edgeRing] ?? 0.3,
          color: ORBIT_COLOR,
        };
      },
    });
    } catch (err: any) {
      console.error("[Graph] Sigma init failed:", err);
      setInitError(err?.message ?? "Unknown Sigma initialization error");
      graphRef.current = g;
      return;
    }

    // ── Events ──

    // Label visibility toggle on zoom
    const updateLabelVisibility = () => {
      const ratio = s.getCamera().getState().ratio;
      if (ratio > LABEL_ZOOM_THRESHOLD) {
        if (!s.getSetting("renderLabels")) {
          try { s.setSetting("renderLabels", true); } catch { /* ok */ }
          setLabelsVisible(true);
        }
      } else {
        if (s.getSetting("renderLabels")) {
          try { s.setSetting("renderLabels", false); } catch { /* ok */ }
          setLabelsVisible(false);
        }
      }
    };
    s.on("wheelStage", updateLabelVisibility);
    s.on("moveBody", updateLabelVisibility);

    // Tooltip
    s.on("enterNode", ({ node }) => {
      try {
        const nd = g.getNodeAttributes(node) as unknown as GraphNodeAttr;
        const pos = s.graphToViewport({ x: nd.x as number ?? 0, y: nd.y as number ?? 0 });
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        let kindLabel = "";
        const nt = nd.nodeType;
        if (nt === "star") kindLabel = "Project Root";
        else if (nt === "planet") {
          kindLabel = nd.hasChildren ? "Directory · click to explore" : "Directory";
        } else if (nt === "moon") {
          kindLabel = nd.hasChildren ? "Sub-directory · click to explore" : "Sub-directory";
        } else if (nt === "satellite") {
          kindLabel = "File · double-click for diff";
          if (expandedFilesRef.current.has(node)) kindLabel += " · dust visible";
        } else if (nt === "dust") {
          kindLabel = nd.changeKind
            ? `Change · ${nd.changeKind} @ ${shortTimestamp(nd.changeTimestamp ?? "")}`
            : "Change record";
        }

        setTooltip({
          visible: true,
          x: pos.x + rect.left + 14,
          y: pos.y + rect.top - 48,
          label: nd.label,
          path: nd.path,
          kind: kindLabel,
          size: nt === "satellite" ? formatSize(nd.size) : "",
        });
      } catch { /* node may have been removed */ }
    });

    s.on("leaveNode", () => {
      setTooltip((prev) => ({ ...prev, visible: false }));
    });

    // ── Click: expand planet/moon or show dust for satellite ──
    s.on("clickNode", ({ node }) => {
      try {
        const nd = g.getNodeAttributes(node) as unknown as GraphNodeAttr;
        const ring = nd.ring;

        if (ring === 1 || ring === 2) {
          // Planet or Moon → toggle expand
          if (expandedDirsRef.current.has(node)) {
            collapseDir(node);
          } else {
            expandDir(node);
            // Animate camera to zoom on this planet
            const x = nd.x as number ?? 0;
            const y = nd.y as number ?? 0;
            s.getCamera().animate({ x, y, ratio: 0.8 }, { duration: 400 });
          }
        } else if (ring === 3) {
          // Satellite → toggle dust
          if (expandedFilesRef.current.has(node)) {
            collapseFile(node);
          } else {
            expandFile(node);
          }
        }
      } catch { /* node may have been removed */ }
    });

    // ── Double-click: collapse or diff preview ──
    s.on("doubleClickNode", ({ node }) => {
      try {
        const nd = g.getNodeAttributes(node) as unknown as GraphNodeAttr;
        const ring = nd.ring;

        if (ring === 1 || ring === 2) {
          if (expandedDirsRef.current.has(node)) {
            collapseDir(node);
          }
        } else if (ring === 3) {
          // Double-click file → log path for diff (placeholder)
          console.log("[CodeObservatory] Diff view reserved for:", nd.path);
          if (expandedFilesRef.current.has(node)) {
            collapseFile(node);
          }
        }
      } catch { /* ok */ }
    });

    // ── Click stage → reset camera to root ──
    s.on("clickStage", () => {
      // No-op; user can use Root button
    });

    // Fit to screen
    setTimeout(() => s.getCamera().animatedReset({ duration: 300 }), 100);

    sigmaRef.current = s;
    graphRef.current = g;

    return () => {
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  // ── Toolbar handlers ──
  const handleFit = useCallback(() => {
    sigmaRef.current?.getCamera().animatedReset({ duration: 300 });
  }, []);

  const handleRoot = useCallback(() => {
    const s = sigmaRef.current;
    if (!s) return;
    s.getCamera().animate({ x: 0, y: 0, ratio: 1 }, { duration: 500 });
  }, []);

  return (
    <div className="flex flex-col h-full co-graph-bg">
      {/* ── Toolbar ── */}
      <div className="co-graph-toolbar">
        <div className="co-graph-toolbar-left">
          {/* Star count */}
          <span className="co-graph-badge co-graph-badge-star">
            <svg width="8" height="8" viewBox="0 0 8 8">
              <circle cx="4" cy="4" r="3.5" fill={NODE_COLORS.star} />
            </svg>
            {starCount}
          </span>
          {/* Planet count */}
          <span className="co-graph-badge co-graph-badge-planet">
            <svg width="7" height="7" viewBox="0 0 7 7">
              <circle cx="3.5" cy="3.5" r="3" fill={NODE_COLORS.planet} />
            </svg>
            {planetCount}
          </span>
          {/* Moon count */}
          <span className="co-graph-badge co-graph-badge-moon">
            <svg width="5" height="5" viewBox="0 0 5 5">
              <circle cx="2.5" cy="2.5" r="2" fill={NODE_COLORS.moon} />
            </svg>
            {moonCount}
          </span>
          {/* File count */}
          <span className="co-graph-badge">{fileCount} files</span>
          {/* Expanded count */}
          {expandedDirsRef.current.size > 0 && (
            <span className="co-graph-badge" style={{ color: "var(--co-accent-text)" }}>
              {expandedDirsRef.current.size} expanded
            </span>
          )}
          {labelsVisible && (
            <span className="co-graph-badge" style={{ color: "var(--co-text-muted)" }}>
              labels
            </span>
          )}
        </div>

        <div className="co-graph-toolbar-right">
          <button
            className="co-graph-icon-btn"
            onClick={handleExpandAll}
            title="Expand all directories (show files)"
          >
            <ChevronDown size={14} />
          </button>
          <button
            className="co-graph-icon-btn"
            onClick={handleCollapseAll}
            title="Collapse all (hide files & dust)"
          >
            <ChevronUp size={14} />
          </button>
          <button className="co-graph-icon-btn" onClick={handleRoot} title="Return to root (Star)">
            <Home size={13} />
          </button>
          <button className="co-graph-icon-btn" onClick={handleFit} title="Fit to screen">
            <Maximize2 size={13} />
          </button>
          <button className="co-graph-icon-btn" onClick={refresh} disabled={loading} title="Rescan project">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className="co-graph-canvas-wrapper">
        {loading && !graphData ? (
          <div className="co-graph-loading">
            <div className="co-graph-loading-spinner" />
            <p className="co-graph-loading-text">Scanning project...</p>
          </div>
        ) : graphData && graphData.nodes.length === 0 ? (
          <div className="co-graph-empty">
            <p className="co-graph-empty-title">Empty Project</p>
            <p className="co-graph-empty-desc">
              This directory contains no files or folders.
            </p>
          </div>
        ) : initError ? (
          <div className="co-graph-empty">
            <p className="co-graph-empty-title">Graph Initialization Error</p>
            <p className="co-graph-empty-desc">{initError}</p>
          </div>
        ) : !projectPath ? (
          <div className="co-graph-empty">
            <p className="co-graph-empty-title">No Project</p>
            <p className="co-graph-empty-desc">
              Open a project to visualize its galaxy graph.
            </p>
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
