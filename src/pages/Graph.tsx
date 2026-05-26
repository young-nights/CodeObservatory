// Graph — Precision Instrument core visualization
// OKLCH node colors · 0.3px edges · neighborhood highlight dimming
// Progressive rendering: dir nodes initial, file nodes on expand/collapse
// No gradient · no texture · no neon

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import cytoscape, {
  type Core,
  type EventObject,
  type ElementDefinition,
} from "cytoscape";
import { useScanGraph } from "@/hooks/useObservatory";
import type { GraphData, FileNode, FileEdge } from "@/lib/types";
import {
  RefreshCw,
  Maximize2,
  GitBranch,
  Network,
} from "lucide-react";

// ── Node colors in OKLCH ──
const NODE_COLORS: Record<string, string> = {
  dir: "oklch(70% 0.15 85)",
  ts: "oklch(65% 0.15 255)",
  tsx: "oklch(65% 0.15 255)",
  js: "oklch(65% 0.15 255)",
  jsx: "oklch(65% 0.15 255)",
  rs: "oklch(60% 0.18 20)",
  md: "oklch(60% 0.12 300)",
  json: "oklch(70% 0.15 85)",
  toml: "oklch(70% 0.15 85)",
  yaml: "oklch(70% 0.15 85)",
  yml: "oklch(70% 0.15 85)",
  css: "oklch(65% 0.15 255)",
  html: "oklch(65% 0.15 255)",
  scss: "oklch(65% 0.15 255)",
  c: "oklch(50% 0.05 260)",
  h: "oklch(50% 0.05 260)",
  cpp: "oklch(50% 0.05 260)",
  hpp: "oklch(50% 0.05 260)",
  py: "oklch(65% 0.15 255)",
  default: "oklch(50% 0.05 260)",
};

function getNodeColor(node: FileNode): string {
  if (node.kind === "dir") return NODE_COLORS.dir;
  const ext =
    node.extension ?? node.path.split(".").pop()?.toLowerCase() ?? "";
  return NODE_COLORS[ext] || NODE_COLORS.default;
}

function getNodeSize(kind: string, hasChildren: boolean): number {
  if (kind === "dir") {
    return hasChildren ? 14 : 10;
  }
  return 8;
}

function formatSize(bytes?: number): string {
  if (bytes == null || bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Thresholds ──
const LABEL_ZOOM_THRESHOLD = 2.0; // Increased from 1.5 for perf
const LARGE_GRAPH_NODES = 300; // Hide labels above this count
const VERY_LARGE_GRAPH = 800; // Force dir-only above this
const HUGE_GRAPH = 1500; // Show warning

// ── Graph Layers Pre-processing ──
interface GraphLayers {
  dirElements: ElementDefinition[];
  childMap: Map<string, { fileNodes: ElementDefinition[]; fileEdges: ElementDefinition[] }>;
  parentMap: Map<string, string>; // dirId → parentDirId
  totalNodeCount: number;
  hasChildrenSet: Set<string>;
  truncatedDirs: Set<string>;
}

function buildGraphLayers(data: GraphData): GraphLayers {
  const nodeMap = new Map<string, FileNode>();
  const dirElements: ElementDefinition[] = [];
  const childMap = new Map<
    string,
    { fileNodes: ElementDefinition[]; fileEdges: ElementDefinition[] }
  >();
  const parentMap = new Map<string, string>();
  const hasChildrenSet = new Set<string>();
  const truncatedDirs = new Set<string>();

  // Build node lookup
  for (const n of data.nodes) {
    nodeMap.set(n.id, n);
    if (n.truncated) truncatedDirs.add(n.id);
  }

  // First pass: identify which dirs have children (from edges)
  for (const e of data.edges) {
    hasChildrenSet.add(e.source);
    parentMap.set(e.target, e.source);
  }

  // Add dir nodes to initial elements
  for (const n of data.nodes) {
    if (n.kind !== "dir") continue;
    const hasKids = hasChildrenSet.has(n.id);
    const isTruncated = truncatedDirs.has(n.id);
    dirElements.push({
      data: {
        id: n.id,
        label: n.label,
        path: n.path,
        kind: "dir",
        color: NODE_COLORS.dir,
        nodeSize: getNodeSize("dir", hasKids),
        hasChildren: hasKids,
        truncated: isTruncated,
      },
      classes: isTruncated ? "truncated" : "",
    });
    childMap.set(n.id, { fileNodes: [], fileEdges: [] });
  }

  // Classify edges
  for (const e of data.edges) {
    const targetNode = nodeMap.get(e.target);
    if (!targetNode) continue;

    if (targetNode.kind === "dir") {
      // Dir→dir edge: always visible
      dirElements.push({
        data: { id: e.id, source: e.source, target: e.target },
      });
    } else {
      // Dir→file edge: hidden until parent dir is expanded
      const bucket = childMap.get(e.source);
      if (bucket) {
        bucket.fileEdges.push({
          data: { id: e.id, source: e.source, target: e.target },
        });
      }
    }
  }

  // Add file nodes to childMap (keyed by parent dir)
  for (const n of data.nodes) {
    if (n.kind !== "file") continue;
    const parentId = parentMap.get(n.id);
    if (!parentId) continue;
    const bucket = childMap.get(parentId);
    if (!bucket) continue;
    bucket.fileNodes.push({
      data: {
        id: n.id,
        label: n.label,
        path: n.path,
        kind: "file",
        extension: n.extension,
        size: n.size,
        modified: n.modified,
        color: getNodeColor(n),
        nodeSize: getNodeSize("file", false),
      },
    });
  }

  return {
    dirElements,
    childMap,
    parentMap,
    totalNodeCount: data.nodes.length,
    hasChildrenSet,
    truncatedDirs,
  };
}

function isDescendant(
  childId: string,
  ancestorId: string,
  parentMap: Map<string, string>,
): boolean {
  let current: string | undefined = childId;
  while (current) {
    if (current === ancestorId) return true;
    current = parentMap.get(current);
    if (!current) return false;
  }
  return false;
}

// ── Component ──
interface GraphPageProps {
  projectPath: string;
}

type LayoutName = "cose" | "breadthfirst";

export function GraphPage({ projectPath }: GraphPageProps) {
  const { graph, loading, refresh } = useScanGraph(projectPath);
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const expandedDirsRef = useRef<Set<string>>(new Set());
  const addedNodesRef = useRef<Map<string, string[]>>(new Map());
  const addedEdgesRef = useRef<Map<string, string[]>>(new Map());
  const parentMapRef = useRef<Map<string, string>>(new Map());
  const childMapRef = useRef<Map<string, { fileNodes: ElementDefinition[]; fileEdges: ElementDefinition[] }>>(new Map());
  const totalNodeCountRef = useRef(0);
  const toggleExpandRef = useRef<(dirId: string) => void>(() => {});
  const labelsVisibleRef = useRef(false);

  const [layoutName, setLayoutName] = useState<LayoutName>("cose");
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

  // Pre-process graph into layers
  const layers = useMemo(
    () => (graph ? buildGraphLayers(graph) : null),
    [graph],
  );

  const isHugeGraph = (layers?.totalNodeCount ?? 0) > HUGE_GRAPH;
  const isVeryLarge = (layers?.totalNodeCount ?? 0) > VERY_LARGE_GRAPH;
  const hideLabels = (layers?.totalNodeCount ?? 0) > LARGE_GRAPH_NODES;

  // Keep ref in sync with state for event handlers
  labelsVisibleRef.current = labelsVisible;

  // ── Expand/Collapse helpers ──
  const collapseOne = useCallback((dirId: string) => {
    const cy = cyRef.current;
    if (!cy) return;

    const nIds = addedNodesRef.current.get(dirId);
    const eIds = addedEdgesRef.current.get(dirId);

    const toRemove: string[] = [...(nIds ?? []), ...(eIds ?? [])];
    if (toRemove.length === 0) {
      expandedDirsRef.current.delete(dirId);
      return;
    }

    const els = cy.collection();
    for (const id of toRemove) {
      const el = cy.getElementById(id);
      if (el.length) els.merge(el);
    }

    cy.batch(() => {
      cy.remove(els);
    });

    addedNodesRef.current.delete(dirId);
    addedEdgesRef.current.delete(dirId);
    expandedDirsRef.current.delete(dirId);
  }, []);

  const collapseRecursive = useCallback(
    (dirId: string) => {
      const pm = parentMapRef.current;
      const descendants: string[] = [];
      for (const expandedId of expandedDirsRef.current) {
        if (expandedId !== dirId && isDescendant(expandedId, dirId, pm)) {
          descendants.push(expandedId);
        }
      }
      // Collapse deepest first
      for (const descId of descendants) {
        collapseOne(descId);
      }
      collapseOne(dirId);
    },
    [collapseOne],
  );

  const expandOne = useCallback((dirId: string) => {
    const cy = cyRef.current;
    if (!cy) return;
    const children = childMapRef.current.get(dirId);
    if (!children || (children.fileNodes.length === 0 && children.fileEdges.length === 0)) return;

    if (expandedDirsRef.current.has(dirId)) return;

    const newNodes: string[] = [];
    const newEdges: string[] = [];

    cy.batch(() => {
      const added = cy.add([...children.fileNodes, ...children.fileEdges]);
      added.forEach((el) => {
        if (el.isNode()) newNodes.push(el.id());
        else newEdges.push(el.id());
      });

      // Position file nodes in a circle around the parent dir
      const parentPos = cy.getElementById(dirId).position();
      const count = children.fileNodes.length;
      const addedNodes = added.nodes();
      addedNodes.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / Math.max(count, 1);
        const ring = Math.floor(i / 12);
        const radius = 100 + ring * 40;
        n.position({
          x: parentPos.x + radius * Math.cos(angle),
          y: parentPos.y + radius * Math.sin(angle),
        });
      });

      // Sync label state for newly added nodes
      if (labelsVisibleRef.current) {
        addedNodes.addClass("labels-on");
      }
    });

    addedNodesRef.current.set(dirId, newNodes);
    addedEdgesRef.current.set(dirId, newEdges);
    expandedDirsRef.current.add(dirId);
  }, []);

  const toggleExpand = useCallback(
    (dirId: string) => {
      if (expandedDirsRef.current.has(dirId)) {
        collapseRecursive(dirId);
      } else {
        expandOne(dirId);
      }
    },
    [collapseRecursive, expandOne],
  );

  // Keep stable ref for cytoscape event handlers
  toggleExpandRef.current = toggleExpand;

  // ── Cytoscape init (re-runs when graph data changes) ──
  useEffect(() => {
    if (!layers || !containerRef.current) return;

    // Cleanup previous instance
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    expandedDirsRef.current = new Set();
    addedNodesRef.current = new Map();
    addedEdgesRef.current = new Map();
    parentMapRef.current = layers.parentMap;
    childMapRef.current = layers.childMap;
    totalNodeCountRef.current = layers.totalNodeCount;

    const { dirElements } = layers;

    const cy = cytoscape({
      container: containerRef.current,
      elements: dirElements,
      pixelRatio: 1, // Half-res on retina for huge perf win
      style: [
        // ── Nodes ──
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            "background-opacity": 0.7,
            width: "data(nodeSize)",
            height: "data(nodeSize)",
            label: "data(label)",
            "font-size": "7px",
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 4,
            color: "data(color)",
            "text-opacity": 0,
            "font-family":
              "'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
            "z-index": 10,
            "transition-property":
              "background-opacity, text-opacity, width, height",
            "transition-duration": 200,
          },
        },
        // Selected
        {
          selector: "node:selected",
          style: {
            "background-opacity": 1,
            width: "mapData(nodeSize, 8, 14, 12, 20)",
            height: "mapData(nodeSize, 8, 14, 12, 20)",
            "z-index": 9999,
          },
        },
        // Dimmed
        {
          selector: "node.dimmed",
          style: { opacity: 0.04 },
        },
        {
          selector: "node.highlighted",
          style: {
            opacity: 1,
            "background-opacity": 0.9,
          },
        },
        // Labels on (zoom past threshold)
        {
          selector: "node.labels-on",
          style: {
            "text-opacity": 0.7,
          },
        },
        // Truncated dir nodes → dashed border
        {
          selector: "node.truncated",
          style: {
            "border-style": "dashed",
            "border-width": 1.5,
            "border-color": "data(color)",
            "border-opacity": 0.5,
          },
        },
        // ── Edges ──
        {
          selector: "edge",
          style: {
            width: 0.3,
            "line-color": "oklch(100% 0 0 / 0.05)",
            "curve-style": "bezier",
            "target-arrow-shape": "none",
            "z-index": 0,
            "transition-property": "line-color, width, opacity",
            "transition-duration": 200,
          },
        },
        {
          selector: "edge.dimmed",
          style: { opacity: 0 },
        },
        {
          selector: "edge.highlighted",
          style: {
            "line-color": "oklch(100% 0 0 / 0.15)",
            width: 0.5,
            opacity: 1,
          },
        },
      ],
      layout: {
        name: "cose",
        animate: false, // Skip animation for initial render
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 120,
        gravity: 0.15,
        numIter: 800,
        randomize: false,
      },
      wheelSensitivity: 0.2,
      minZoom: 0.1,
      maxZoom: 5,
    });

    // ── Zoom-based label toggle ──
    cy.on("zoom", () => {
      const z = cy.zoom();
      const next = z > LABEL_ZOOM_THRESHOLD;
      setLabelsVisible((prev) => {
        if (next !== prev) {
          if (next) cy.nodes().addClass("labels-on");
          else cy.nodes().removeClass("labels-on");
        }
        return next;
      });
    });

    // ── Tooltip on hover ──
    cy.on("mouseover", "node", (evt: EventObject) => {
      const node = evt.target;
      const pos = node.renderedPosition();
      const containerPos = containerRef.current?.getBoundingClientRect();
      if (!containerPos) return;

      const d = node.data();
      const k = d.kind ?? "file";
      const sz = formatSize(d.size as number | undefined);
      const truncated = d.truncated as boolean | undefined;
      const hasKids = d.hasChildren as boolean | undefined;
      const expanded = expandedDirsRef.current.has(node.id());

      let kindLabel = k === "dir" ? "Directory" : "File";
      if (k === "dir" && truncated) {
        kindLabel += " (truncated)";
      }
      if (k === "dir" && hasKids && expanded) {
        kindLabel += " · expanded";
      } else if (k === "dir" && hasKids && !expanded) {
        kindLabel += " · double-click to expand";
      }

      setTooltip({
        visible: true,
        x: pos.x + containerPos.left + 10,
        y: pos.y + containerPos.top - 50,
        label: d.label as string,
        path: d.path as string,
        kind: kindLabel,
        size: sz,
      });
    });

    cy.on("mouseout", "node", () => {
      setTooltip((prev) => ({ ...prev, visible: false }));
    });

    // ── Single-click: 1-degree neighborhood highlight ──
    cy.on("tap", "node", (evt: EventObject) => {
      const target = evt.target;
      const neighbourhood = target
        .closedNeighborhood()
        .add(target.connectedEdges());

      cy.elements().addClass("dimmed");
      neighbourhood.removeClass("dimmed").addClass("highlighted");
    });

    cy.on("tap", (evt: EventObject) => {
      if (evt.target === cy) {
        cy.elements().removeClass("dimmed").removeClass("highlighted");
      }
    });

    // ── Double-click: expand/collapse dir nodes ──
    cy.on("dbltap", "node", (evt: EventObject) => {
      const node = evt.target;
      if (node.data("kind") !== "dir") return;
      toggleExpandRef.current(node.id());
    });

    // ── Initial fit ──
    cy.ready(() => {
      cy.fit(undefined, 50);
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [layers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Layout toggle (user-initiated, animate: true) ──
  const handleLayoutChange = useCallback(
    (name: LayoutName) => {
      setLayoutName(name);
      if (!cyRef.current) return;
      cyRef.current.elements().removeClass("dimmed").removeClass("highlighted");
      cyRef.current
        .layout({
          name,
          ...(name === "cose"
            ? {
                animate: true,
                animationDuration: 600,
                animationEasing: "ease-out",
                nodeRepulsion: () => 8000,
                idealEdgeLength: () => 120,
                gravity: 0.15,
                numIter: 800,
              }
            : {
                directed: false,
                spacingFactor: 1.2,
                animate: true,
                animationDuration: 400,
                animationEasing: "ease-out",
              }),
        })
        .run();
    },
    [],
  );

  const handleFit = useCallback(() => {
    cyRef.current?.fit(undefined, 50);
  }, []);

  // ── Derived counts ──
  const totalCount = layers?.totalNodeCount ?? 0;
  const dirCount = graph?.nodes.filter((n) => n.kind === "dir").length ?? 0;
  const fileCount = graph?.nodes.filter((n) => n.kind === "file").length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;

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
            <span
              className="co-graph-badge"
              style={{ color: "var(--co-text-muted)" }}
            >
              labels
            </span>
          )}
          {isVeryLarge && (
            <span
              className="co-graph-badge"
              style={{ color: "oklch(60% 0.18 20)" }}
              title="Directory-only mode for performance"
            >
              dir-only
            </span>
          )}
        </div>

        <div className="co-graph-toolbar-right">
          <div className="co-graph-layout-toggle">
            <button
              className={`co-graph-layout-btn ${layoutName === "cose" ? "co-graph-layout-btn-active" : ""}`}
              onClick={() => handleLayoutChange("cose")}
              title="Force-directed"
            >
              <Network size={12} />
            </button>
            <button
              className={`co-graph-layout-btn ${layoutName === "breadthfirst" ? "co-graph-layout-btn-active" : ""}`}
              onClick={() => handleLayoutChange("breadthfirst")}
              title="Hierarchy"
            >
              <GitBranch size={12} />
            </button>
          </div>
          <button
            className="co-graph-icon-btn"
            onClick={handleFit}
            title="Fit"
          >
            <Maximize2 size={13} />
          </button>
          <button
            className="co-graph-icon-btn"
            onClick={refresh}
            disabled={loading}
            title="Rescan"
          >
            <RefreshCw
              size={13}
              className={loading ? "animate-spin" : ""}
            />
          </button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className="co-graph-canvas-wrapper">
        {/* Large graph warning */}
        {isHugeGraph && (
          <div className="co-graph-warning">
            <span>
              ⚠ {totalCount} nodes — very large project.
              Directory-only view active.
              Double-click dirs to inspect specific subtrees.
              Consider narrowing the project scope.
            </span>
          </div>
        )}

        {loading && !graph ? (
          <div className="co-graph-loading">
            <div className="co-graph-loading-spinner" />
            <p className="co-graph-loading-text">Scanning files...</p>
          </div>
        ) : graph && graph.nodes.length === 0 ? (
          <div className="co-graph-empty">
            <p className="co-graph-empty-title">Empty</p>
            <p className="co-graph-empty-desc">
              This directory contains no files or folders.
            </p>
          </div>
        ) : !projectPath ? (
          <div className="co-graph-empty">
            <p className="co-graph-empty-title">No Project</p>
            <p className="co-graph-empty-desc">
              Open a project to visualize its file graph.
            </p>
          </div>
        ) : (
          <div ref={containerRef} className="co-graph-cy-container" />
        )}

        {/* Tooltip */}
        {tooltip.visible && (
          <div
            className="co-graph-tooltip"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
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
