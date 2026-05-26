// Graph — Galaxy Burst · ForceAtlas2 + Sigma.js WebGL
// All nodes visible at once, force-directed layout radiates from center
// Obsidian-style right panel for appearance, force, search & filters

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import Sigma from "sigma";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { useScanGraph } from "@/hooks/useObservatory";

import { RefreshCw, Maximize2 } from "lucide-react";
import { GraphPanel, type ColorScheme } from "@/components/graph/GraphPanel";

// ── Color system: warm → dir / cool → file ──
const DIR_COLOR_ROOT = "#ffffff";
const DIR_COLOR_L1 = "#ffd700";
const DIR_COLOR_DEEP = "#ff8c42";
const FILE_COLOR_DEFAULT = "#a0a0c0";

const EXT_COLORS: Record<string, string> = {
  ts: "#00bfff", tsx: "#00bfff",
  js: "#5dade2", jsx: "#5dade2",
  rs: "#9370db", md: "#7b68ee",
  json: "#6495ed", toml: "#6495ed",
  yaml: "#6495ed", yml: "#6495ed",
  css: "#48d1cc", scss: "#48d1cc",
  html: "#1e90ff", py: "#00ced1",
  c: "#87ceeb", h: "#87ceeb",
  cpp: "#87ceeb", hpp: "#87ceeb",
  go: "#5f9ea0",
};

// Directory-depth palette (warm → cool gradient)
const DEPTH_PALETTE = [
  "#ffffff", "#ffd700", "#ffae42", "#ff8c42",
  "#ff7f50", "#da70d6", "#9370db", "#6495ed",
  "#5dade2", "#48d1cc", "#20b2aa", "#3cb371",
];

// Time-based palette (recent → old)
const TIME_PALETTE_COLD = "#5dade2";
const TIME_PALETTE_HOT = "#ff6347";

const EDGE_COLORS = [
  "rgba(255,215,0,0.12)",
  "rgba(255,140,66,0.08)",
  "rgba(0,191,255,0.04)",
];

const SIZE_ROOT = 32;
const SIZE_DIR_L1 = 16;
const SIZE_DIR_DEEP = 10;
const SIZE_FILE = 6;

// ── Helpers ──

function computeColor(
  kind: string | null,
  depth: number,
  ext: string | undefined,
  modified: string | undefined,
  modifiedMin: number,
  modifiedMax: number,
  scheme: ColorScheme,
): string {
  if (kind !== "file") {
    if (scheme === "directory" || scheme === "filetype") {
      if (depth === 0) return DIR_COLOR_ROOT;
      if (depth === 1) return DIR_COLOR_L1;
      return DIR_COLOR_DEEP;
    }
    // time scheme for dirs — use depth-based fallback
    const idx = Math.min(depth, DEPTH_PALETTE.length - 1);
    return DEPTH_PALETTE[idx];
  }

  // file coloring
  switch (scheme) {
    case "filetype":
      if (ext) return EXT_COLORS[ext.toLowerCase()] ?? FILE_COLOR_DEFAULT;
      return FILE_COLOR_DEFAULT;
    case "directory":
      return DEPTH_PALETTE[Math.min(depth, DEPTH_PALETTE.length - 1)];
    case "time":
      if (modified && modifiedMax > modifiedMin) {
        const ts = new Date(modified).getTime();
        const t = (ts - modifiedMin) / (modifiedMax - modifiedMin);
        // Hot (recent) → cold (old)
        return lerpColor(TIME_PALETTE_HOT, TIME_PALETTE_COLD, t);
      }
      return FILE_COLOR_DEFAULT;
    default:
      return FILE_COLOR_DEFAULT;
  }
}

function lerpColor(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
  const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
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
  const graphRef = useRef<Graph | null>(null);

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

  const [layoutDone, setLayoutDone] = useState(false);
  const [layoutTick, setLayoutTick] = useState(0);

  const [tooltip, setTooltip] = useState<{
    visible: boolean; x: number; y: number;
    label: string; path: string; kind: string; size: string;
  }>({ visible: false, x: 0, y: 0, label: "", path: "", kind: "", size: "" });

  // ── Refs for values accessed inside Sigma reducers (updated every frame) ──
  const searchQueryRef = useRef(searchQuery);
  const showOnlyChangedRef = useRef(showOnlyChanged);
  const showOrphansRef = useRef(showOrphans);
  const colorSchemeRef = useRef(colorScheme);
  const nodeSizeValRef = useRef(nodeSizeVal);
  const edgeThicknessValRef = useRef(edgeThicknessVal);
  const textOpacityRef = useRef(textOpacity);

  useEffect(() => { searchQueryRef.current = searchQuery; }, [searchQuery]);
  useEffect(() => { showOnlyChangedRef.current = showOnlyChanged; }, [showOnlyChanged]);
  useEffect(() => { showOrphansRef.current = showOrphans; }, [showOrphans]);
  useEffect(() => { colorSchemeRef.current = colorScheme; }, [colorScheme]);
  useEffect(() => { nodeSizeValRef.current = nodeSizeVal; }, [nodeSizeVal]);
  useEffect(() => { edgeThicknessValRef.current = edgeThicknessVal; }, [edgeThicknessVal]);
  useEffect(() => { textOpacityRef.current = textOpacity; }, [textOpacity]);

  // ── Compute modified time range for time-based coloring ──
  const modifiedRange = useMemo(() => {
    if (!graphData) return { min: 0, max: 0 };
    let min = Infinity, max = -Infinity;
    for (const n of graphData.nodes) {
      if (n.modified) {
        const ts = new Date(n.modified).getTime();
        if (ts < min) min = ts;
        if (ts > max) max = ts;
      }
    }
    return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
  }, [graphData]);

  // ── Build internal graphology graph (structure only, no layout) ──
  const internalGraph = useMemo(() => {
    if (!graphData) return null;

    const g = new Graph({ multi: false, type: "directed", allowSelfLoops: false });
    graphRef.current = g;

    // Find root & build child map
    const targeted = new Set(graphData.edges.map((e) => e.target));
    const rootId = graphData.nodes.find((n) => !targeted.has(n.id))?.id;
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

    // Build edge set for orphan detection
    const allEdges = new Set<string>();
    for (const e of graphData.edges) {
      allEdges.add(e.source);
      allEdges.add(e.target);
    }

    // Add all nodes with random initial scatter around center
    for (const n of graphData.nodes) {
      const depth = depths.get(n.id) ?? 1;
      const color = computeColor(
        n.kind ?? null, depth, n.extension,
        n.modified, modifiedRange.min, modifiedRange.max,
        colorScheme,
      );
      const nSize = getNodeSize(n.kind ?? null, depth);
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
        nodeSize: nSize,
        extension: n.extension,
        size: n.size,
        changeCount: n.changeCount ?? 0,
        isOrphan: !allEdges.has(n.id),
        modified: n.modified,
      });
    }

    // Add all edges
    for (const e of graphData.edges) {
      if (g.hasNode(e.source) && g.hasNode(e.target)) {
        g.addEdgeWithKey(e.id, e.source, e.target, {});
      }
    }

    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData]);

  // ── Sync graphRef ──
  useEffect(() => {
    graphRef.current = internalGraph;
  }, [internalGraph]);

  // Derived counts (pre-filter)
  const totalNodeCount = internalGraph?.order ?? 0;
  const totalEdgeCount = internalGraph?.size ?? 0;

  // ── Visible counts (post-filter for stats display) ──
  const [visibleNodeCount, setVisibleNodeCount] = useState(totalNodeCount);
  const [visibleEdgeCount, setVisibleEdgeCount] = useState(totalEdgeCount);

  // ── SVG filter IDs (for unique per-instance defs) ──
  const filterCountRef = useRef(0);

  // ── Run forceAtlas2 layout ──
  const runLayout = useCallback((g: Graph, params: { grav: number; rep: number; att: number; edgeLen: number }) => {
    try {
      forceAtlas2.assign(g, {
        iterations: 300,
        settings: {
          gravity: params.grav,
          scalingRatio: params.rep / 5,
          slowDown: Math.max(1, 21 - params.edgeLen),
          barnesHutOptimize: true,
          strongGravityMode: true,
          outboundAttractionDistribution: true,
          edgeWeightInfluence: params.att / 10,
        },
      });
    } catch (err) {
      console.error("[Graph] ForceAtlas2 failed:", err);
    }
  }, []);

  // ── Update node colors when color scheme changes ──
  useEffect(() => {
    const g = graphRef.current;
    if (!g || !graphData) return;
    g.forEachNode((node, attrs) => {
      const depth = (attrs.depth as number) ?? 1;
      const ext = attrs.extension as string | undefined;
      const kind = attrs.kind as string | null;
      const modified = attrs.modified as string | undefined;
      const color = computeColor(
        kind, depth, ext,
        modified, modifiedRange.min, modifiedRange.max,
        colorScheme,
      );
      g.setNodeAttribute(node, "color", color);
    });
    sigmaRef.current?.refresh();
  }, [colorScheme, graphData, modifiedRange]);

  // ── Re-run forceAtlas2 when force params change ──
  useEffect(() => {
    const g = graphRef.current;
    if (!g || !graphData || layoutTick === 0) return;
    if (layoutTick === -1) return; // skip initial

    // Only re-run if not the initial layout
    runLayout(g, { grav: gravity, rep: repulsion, att: attraction, edgeLen: edgeLength });

    // Recompute edge color tiers
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

    sigmaRef.current?.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutTick]);

  // ── Animation replay: reset positions + re-layout ──
  const handleAnimate = useCallback(() => {
    const g = graphRef.current;
    if (!g) return;
    setLayoutDone(false);
    // Reset all node positions to random scatter
    g.forEachNode((node) => {
      const scatterR = 30 + Math.random() * 180;
      const scatterA = Math.random() * 2 * Math.PI;
      g.setNodeAttribute(node, "x", scatterR * Math.cos(scatterA));
      g.setNodeAttribute(node, "y", scatterR * Math.sin(scatterA));
    });
    sigmaRef.current?.refresh();
    // Delay layout a tick so reset renders first
    setTimeout(() => {
      runLayout(g, { grav: gravity, rep: repulsion, att: attraction, edgeLen: edgeLength });
      sigmaRef.current?.refresh();
      // Recompute edge colors
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
      sigmaRef.current?.refresh();
      setLayoutDone(true);
    }, 50);
  }, [gravity, repulsion, attraction, edgeLength, runLayout]);

  // ── Sigma init ──
  useEffect(() => {
    const g = graphRef.current;
    if (!g || !containerRef.current) return;

    // Cleanup previous instance
    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }
    highlightedNodeRef.current = null;
    filterCountRef.current += 1;

    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      console.warn("[Graph] Zero-dimension container, skipping Sigma init");
      return;
    }

    // Run initial layout
    runLayout(g, { grav: gravity, rep: repulsion, att: attraction, edgeLen: edgeLength });

    // Compute edge color tiers
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

    // Filter tracking — rebuild each tick via nodeReducer
    const visibleNodes = new Set<string>();

    let s: Sigma;
    try {
      s = new Sigma(g, containerRef.current, {
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
          const q = searchQueryRef.current.toLowerCase().trim();
          const path = (d.path as string) || "";
          const label = (d.label as string) || "";
          const changeCount = (d.changeCount as number) || 0;
          const isOrphan = (d.isOrphan as boolean) || false;
          const kind = d.kind as string | null;
          const isHL = highlightedNodeRef.current === _node;

          // Filter logic
          const matchesSearch = !q || path.toLowerCase().includes(q) || label.toLowerCase().includes(q);
          const passesChanged = !showOnlyChangedRef.current || changeCount > 0;
          const passesOrphan = !showOrphansRef.current || isOrphan;

          if (!matchesSearch || !passesChanged || !passesOrphan) {
            return { label: "", size: 0, color: "transparent" };
          }

          visibleNodes.add(_node);

          const baseSize = (d.nodeSize as number) || 6;
          const sizeMultiplier = nodeSizeValRef.current / SIZE_FILE;
          const scaledSize = kind !== "file"
            ? (d.nodeSize as number) || 10
            : Math.max(3, baseSize * sizeMultiplier);

          return {
            label: "",
            size: isHL ? scaledSize * 1.8 : scaledSize,
            color: isHL ? "#ffffff" : ((d.color as string) || "#a0a0c0"),
          };
        },

        edgeReducer: (_edge, data) => {
          const tier = (data as { colorTier?: number }).colorTier ?? 0;
          const thickness = edgeThicknessValRef.current;
          return {
            color: EDGE_COLORS[tier] ?? EDGE_COLORS[0],
            size: thickness,
          };
        },
      });
    } catch (err: any) {
      console.error("[Graph] Sigma init failed:", err);
      return;
    }

    // Periodic filter stats update
    const statsInterval = setInterval(() => {
      setVisibleNodeCount(visibleNodes.size);
      // Count visible edges by checking connected nodes
      let eCount = 0;
      g.forEachEdge((_e, _a, source, target) => {
        if (visibleNodes.has(source) || visibleNodes.has(target)) eCount++;
      });
      setVisibleEdgeCount(eCount);
      visibleNodes.clear();
    }, 500);

    // Tooltip on hover
    s.on("enterNode", ({ node }) => {
      try {
        const nd = g.getNodeAttributes(node) as Record<string, unknown>;
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

    s.on("clickNode", ({ node }) => {
      highlightedNodeRef.current = highlightedNodeRef.current === node ? null : node;
      s.refresh();
    });

    s.on("clickStage", () => {
      if (highlightedNodeRef.current !== null) {
        highlightedNodeRef.current = null;
        s.refresh();
      }
    });

    // Node drag
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
      if (!draggedNode || !g) return;
      const crect = containerRef.current?.getBoundingClientRect();
      if (!crect) return;
      const mouseX = event.x - crect.left;
      const mouseY = event.y - crect.top;
      if (Math.abs(mouseX - dragStartX) < 2 && Math.abs(mouseY - dragStartY) < 2) return;
      const pos = s.viewportToGraph({ x: mouseX, y: mouseY });
      g.setNodeAttribute(draggedNode, "x", pos.x);
      g.setNodeAttribute(draggedNode, "y", pos.y);
      s.refresh();
    });

    const stopDrag = () => { draggedNode = null; };
    s.on("upNode", stopDrag);
    s.on("upStage", stopDrag);

    // Fit to screen on first render
    setTimeout(() => {
      s.getCamera().animatedReset({ duration: 400 });
      setLayoutDone(true);
    }, 150);

    sigmaRef.current = s;

    return () => {
      clearInterval(statsInterval);
      s.kill();
      sigmaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                <span style={{ color: "rgba(255,255,255,0.7)" }}>{visibleNodeCount}</span> nodes{"  "}
                <span style={{ color: "rgba(255,255,255,0.7)" }}>{visibleEdgeCount}</span> edges
              </>
            ) : (
              "Computing layout…"
            )}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button onClick={handleFit} title="Fit to screen"
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
        {loading && !graphData ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.08)", borderTopColor: "rgba(255,255,255,0.5)", animation: "co-spin 0.7s linear infinite" }} />
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Scanning project...</p>
          </div>
        ) : graphData && graphData.nodes.length === 0 ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>Empty Project</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>This directory contains no files or folders.</p>
          </div>
        ) : !projectPath ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>No Project</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>Open a project to visualize its galaxy graph.</p>
          </div>
        ) : (
          <>
            <div ref={containerRef} style={{ position: "absolute", inset: 0, zIndex: 1 }} />

            {/* Control panel */}
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
              onNodeSizeChange={(v) => { setNodeSizeVal(v); sigmaRef.current?.refresh(); }}
              edgeThickness={edgeThicknessVal}
              onEdgeThicknessChange={(v) => { setEdgeThicknessVal(v); sigmaRef.current?.refresh(); }}
              textOpacity={textOpacity}
              onTextOpacityChange={(v) => { setTextOpacity(v); sigmaRef.current?.refresh(); }}
              gravity={gravity}
              onGravityChange={(v) => { setGravity(v); setLayoutTick((t) => t + 1); }}
              repulsion={repulsion}
              onRepulsionChange={(v) => { setRepulsion(v); setLayoutTick((t) => t + 1); }}
              attraction={attraction}
              onAttractionChange={(v) => { setAttraction(v); setLayoutTick((t) => t + 1); }}
              edgeLength={edgeLength}
              onEdgeLengthChange={(v) => { setEdgeLength(v); setLayoutTick((t) => t + 1); }}
              nodeCount={visibleNodeCount}
              edgeCount={visibleEdgeCount}
              onAnimate={handleAnimate}
            />
          </>
        )}

        {/* Tooltip */}
        {tooltip.visible && (
          <div style={{ position: "absolute", zIndex: 50, left: tooltip.x, top: tooltip.y, padding: "6px 10px", borderRadius: 4, background: "rgba(20,20,30,0.92)", border: "1px solid rgba(255,255,255,0.08)", pointerEvents: "none", maxWidth: 300, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{tooltip.label}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", display: "flex", gap: 4, marginTop: 1 }}>
              <span>{tooltip.kind}</span>
              {tooltip.size && <span>· {tooltip.size}</span>}
            </div>
            <div style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{tooltip.path}</div>
          </div>
        )}
      </div>
    </div>
  );
}
