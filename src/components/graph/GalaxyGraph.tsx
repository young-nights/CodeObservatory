// GalaxyGraph — Pure 2D Canvas force-directed knowledge graph
// Uses d3-force-3d (2D mode) + Canvas 2D for rendering
// Visual: deep space background + star points + nebula gradients + colored nodes with glow

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
} from "d3-force-3d";
import * as api from "@/lib/api";
import type { GraphData, FileNode, FileEdge } from "@/lib/types";
import { useTheme } from "@/hooks/useTheme";

// ══════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════
interface GalaxyNode extends FileNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  degree: number;
  color: string;
  radius: number;
}

interface GalaxyEdge {
  source: string | GalaxyNode;
  target: string | GalaxyNode;
  color: string;
}

interface GalaxyGraphProps {
  projectPaths: string[];
  fullscreen?: boolean;
}

// ══════════════════════════════════════════════════
// Color system
// ══════════════════════════════════════════════════
const COLORS: Record<string, string> = {
  _dir_root: "#ffe070",
  _dir_1: "#ffd040",
  _dir_2: "#e8b030",
  _dir_def: "#d0a020",
  ts: "#00e5ff",
  tsx: "#00d4ee",
  js: "#40e0d0",
  jsx: "#50d0c0",
  rs: "#ff6050",
  py: "#00bcd4",
  go: "#00acc1",
  java: "#ff8f00",
  c: "#78909c",
  cpp: "#78909c",
  h: "#90a4ae",
  hpp: "#90a4ae",
  vue: "#4caf50",
  svelte: "#ff3d00",
  kt: "#7c4dff",
  swift: "#ff6e40",
  md: "#ffffff",
  mdx: "#f0f0ff",
  css: "#66bb6a",
  scss: "#81c784",
  html: "#ff7043",
  xml: "#ff8a65",
  json: "#ffd54f",
  toml: "#ffca28",
  yaml: "#ffc107",
  yml: "#ffb300",
  _default: "#b0bec5",
};

function getNodeColor(node: FileNode, projectPaths: string[]): string {
  if (node.kind === "dir") {
    const depth = node.path.split(/[\\/]/).length -
      (projectPaths.find((p) => node.path.startsWith(p)) ?? projectPaths[0]).split(/[\\/]/).length;
    if (depth <= 0) return COLORS._dir_root;
    if (depth === 1) return COLORS._dir_1;
    if (depth === 2) return COLORS._dir_2;
    return COLORS._dir_def;
  }
  const ext = (node.extension ?? "").toLowerCase();
  return COLORS[ext] ?? COLORS._default;
}

function nodeRadius(degree: number, maxDegree: number): number {
  return 4 + Math.pow(degree / Math.max(maxDegree, 1), 0.5) * 21;
}

// ══════════════════════════════════════════════════
// Star cache (generated once, rendered every frame)
// ══════════════════════════════════════════════════
let starCache: { x: number; y: number; r: number; a: number }[] | null = null;
function getStars(): typeof starCache extends null ? never : NonNullable<typeof starCache> {
  if (!starCache) {
    starCache = Array.from({ length: 300 }, () => ({
      x: Math.random() * 2000,
      y: Math.random() * 2000,
      r: 0.3 + Math.random() * 1,
      a: 0.3 + Math.random() * 0.7,
    }));
  }
  return starCache;
}

// ══════════════════════════════════════════════════
// Canvas drawing helpers
// ══════════════════════════════════════════════════

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Deep space gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#000814");
  grad.addColorStop(0.5, "#000d1a");
  grad.addColorStop(1, "#000814");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Nebulae — multiple low-opacity radial gradients
  const nebulae = [
    { x: w * 0.3, y: h * 0.4, r: w * 0.3, color: "rgba(20,40,80,0.12)" },
    { x: w * 0.7, y: h * 0.3, r: w * 0.25, color: "rgba(40,10,60,0.08)" },
    { x: w * 0.5, y: h * 0.7, r: w * 0.35, color: "rgba(10,30,50,0.1)" },
  ];
  for (const n of nebulae) {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, n.color);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawStars(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const stars = getStars();
  ctx.fillStyle = "#c8d8ff";
  for (const s of stars) {
    ctx.globalAlpha = s.a;
    ctx.beginPath();
    ctx.arc(s.x % w, s.y % h, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawEdges(
  ctx: CanvasRenderingContext2D,
  edges: GalaxyEdge[],
  transform: { x: number; y: number; k: number },
  hoveredId: string | null,
) {
  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  for (const edge of edges) {
    const s = typeof edge.source === "object" ? edge.source : null;
    const t = typeof edge.target === "object" ? edge.target : null;
    if (!s || !t) continue;

    const isHighlighted =
      hoveredId !== null && (s.id === hoveredId || t.id === hoveredId);
    ctx.globalAlpha = isHighlighted ? 0.6 : 0.15;
    ctx.strokeStyle = edge.color || s.color || "#4060a0";
    ctx.lineWidth = isHighlighted ? 1.5 / transform.k : 0.8 / transform.k;

    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawNodes(
  ctx: CanvasRenderingContext2D,
  nodes: GalaxyNode[],
  edges: GalaxyEdge[],
  transform: { x: number; y: number; k: number },
  hoveredId: string | null,
  selectedId: string | null,
) {
  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  // Build adjacency set for connected-node detection
  const connectedToHovered = new Set<string>();
  if (hoveredId) {
    for (const e of edges) {
      const sId = typeof e.source === "object" ? e.source.id : e.source;
      const tId = typeof e.target === "object" ? e.target.id : e.target;
      if (sId === hoveredId) connectedToHovered.add(tId);
      if (tId === hoveredId) connectedToHovered.add(sId);
    }
  }

  // Sort by degree (small first, so large nodes paint on top)
  const sorted = [...nodes].sort((a, b) => a.degree - b.degree);

  for (const node of sorted) {
    const isHovered = node.id === hoveredId;
    const isSelected = node.id === selectedId;
    const isConnected = hoveredId !== null && connectedToHovered.has(node.id);
    const dimmed = hoveredId !== null && !isHovered && !isConnected;

    const r = node.radius;
    const x = node.x;
    const y = node.y;

    ctx.globalAlpha = dimmed ? 0.15 : 1;

    // Outer glow
    const glowRadius = r * 2.5;
    const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, glowRadius);
    glow.addColorStop(0, node.color + "40");
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Body circle with radial gradient (center bright, edge dark)
    const bodyGrad = ctx.createRadialGradient(
      x - r * 0.2,
      y - r * 0.2,
      0,
      x,
      y,
      r,
    );
    bodyGrad.addColorStop(0, "#ffffff");
    bodyGrad.addColorStop(0.3, node.color);
    bodyGrad.addColorStop(1, node.color + "aa");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Selected / hovered border ring
    if (isSelected || isHovered) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 / transform.k;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, r + 3 / transform.k, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Text label (large nodes or hovered node)
    if ((r > 12 || isHovered) && !dimmed) {
      ctx.globalAlpha = isHovered ? 1 : 0.7;
      ctx.fillStyle = "#e0e7ff";
      ctx.font = `${Math.max(10, 11 / transform.k)}px 'PingFang SC', 'Segoe UI', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(node.label, x, y + r + 14 / transform.k);
    }
  }

  ctx.restore();
}

// ══════════════════════════════════════════════════
// D3 Force Simulation (2D via d3-force-3d with numDimensions=2)
// ══════════════════════════════════════════════════
function createSimulation(
  nodes: GalaxyNode[],
  edges: GalaxyEdge[],
  width: number,
  height: number,
) {
  return forceSimulation<GalaxyNode, GalaxyEdge>(nodes, 2)
    .force(
      "link",
      forceLink<GalaxyNode, GalaxyEdge>(edges)
        .id((d) => d.id)
        .distance(80),
    )
    .force(
      "charge",
      forceManyBody<GalaxyNode>().strength(-200).distanceMax(400),
    )
    .force("center", forceCenter<GalaxyNode>(width / 2, height / 2))
    .force(
      "collide",
      forceCollide<GalaxyNode>().radius((d) => d.radius + 2),
    )
    .force(
      "x",
      forceX<GalaxyNode>(width / 2).strength(0.03),
    )
    .force(
      "y",
      forceY<GalaxyNode>(height / 2).strength(0.03),
    )
    .alphaDecay(0.02)
    .velocityDecay(0.3);
}

// ══════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════
export default function GalaxyGraph({ projectPaths }: GalaxyGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GalaxyNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Mutable state ref — used by canvas animation loop (avoids stale closures)
  const stateRef = useRef<{
    nodes: GalaxyNode[];
    edges: GalaxyEdge[];
    sim: any;
    transform: { x: number; y: number; k: number };
    hoveredId: string | null;
    selectedId: string | null;
    animFrame: number;
    dragNode: GalaxyNode | null;
    isPanning: boolean;
    panStart: { x: number; y: number; tx: number; ty: number } | null;
    disposed: boolean;
  }>({
    nodes: [],
    edges: [],
    sim: null,
    transform: { x: 0, y: 0, k: 1 },
    hoveredId: null,
    selectedId: null,
    animFrame: 0,
    dragNode: null,
    isPanning: false,
    panStart: null,
    disposed: false,
  });

  // Keep selectedId in sync
  useEffect(() => {
    stateRef.current.selectedId = selectedNode?.id ?? null;
  }, [selectedNode]);

  // ── Resize canvas to container ──
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);
    return { w, h };
  }, []);

  // ── Screen → World coordinate conversion ──
  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const t = stateRef.current.transform;
      return {
        x: (sx - t.x) / t.k,
        y: (sy - t.y) / t.k,
      };
    },
    [],
  );

  // ── Find node at world position ──
  const findNodeAt = useCallback(
    (wx: number, wy: number): GalaxyNode | null => {
      // Iterate in reverse (top-painted nodes first)
      const nodes = stateRef.current.nodes;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const dx = n.x - wx;
        const dy = n.y - wy;
        if (dx * dx + dy * dy < n.radius * n.radius) return n;
      }
      return null;
    },
    [],
  );

  // ── Initialize graph from data ──
  const initGraph = useCallback(
    (
      allNodes: FileNode[],
      allEdges: FileEdge[],
      pp: string[],
    ): { nodes: GalaxyNode[]; edges: GalaxyEdge[] } => {
      // Build node map
      const nodeMap = new Map<string, FileNode>();
      for (const n of allNodes) nodeMap.set(n.id, n);

      // Compute degrees
      const deg = new Map<string, number>();
      for (const e of allEdges) {
        deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
        deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
      }

      const maxDeg = Math.max(1, ...deg.values());

      const nodes: GalaxyNode[] = allNodes.map((n) => {
        const d = deg.get(n.id) ?? 0;
        return {
          ...n,
          x: (Math.random() - 0.5) * 300,
          y: (Math.random() - 0.5) * 300,
          vx: 0,
          vy: 0,
          fx: null,
          fy: null,
          degree: d,
          color: getNodeColor(n, pp),
          radius: nodeRadius(d, maxDeg),
        };
      });

      const nodeSet = new Set(nodes.map((n) => n.id));

      const edges: GalaxyEdge[] = allEdges
        .filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target))
        .map((e) => {
          const srcNode = nodes.find((n) => n.id === e.source);
          return {
            source: e.source,
            target: e.target,
            color: srcNode?.color ?? "#4060a0",
          };
        });

      return { nodes, edges };
    },
    [],
  );

  // ── Main data loading effect ──
  useEffect(() => {
    if (!projectPaths?.length) return;

    let dead = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const allNodes: FileNode[] = [];
        const allEdges: FileEdge[] = [];
        const seen = new Set<string>();

        for (const pp of projectPaths) {
          const d: GraphData = await api.scanDirectory(pp);
          for (const n of d.nodes) {
            if (seen.has(n.id)) continue;
            seen.add(n.id);
            allNodes.push(n);
          }
          for (const e of d.edges) {
            allEdges.push(e);
          }
        }

        if (dead) return;

        const { nodes, edges } = initGraph(allNodes, allEdges, projectPaths);
        if (dead) return;

        const state = stateRef.current;

        // Stop old simulation
        if (state.sim) {
          state.sim.stop();
        }

        state.nodes = nodes;
        state.edges = edges;
        state.hoveredId = null;
        state.selectedId = null;
        state.dragNode = null;
        state.transform = { x: 0, y: 0, k: 1 };

        // Size the canvas
        const dims = resizeCanvas();
        const w = dims?.w ?? 800;
        const h = dims?.h ?? 600;

        // Start new simulation
        const sim = createSimulation(nodes, edges, w, h);
        state.sim = sim;

        setLoading(false);
      } catch (err) {
        if (!dead) {
          setError(
            err instanceof Error ? err.message : "Failed to load graph data",
          );
          setLoading(false);
        }
      }
    })();

    return () => {
      dead = true;
      const state = stateRef.current;
      if (state.sim) {
        state.sim.stop();
        state.sim = null;
      }
      state.disposed = true;
      if (state.animFrame) {
        cancelAnimationFrame(state.animFrame);
      }
    };
  }, [projectPaths, initGraph, resizeCanvas]);

  // ── Canvas animation loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state = stateRef.current;
    state.disposed = false;

    function animate() {
      if (state.disposed) return;
      const c = container;
      const context = ctx;
      if (!c || !context) return;

      const dims = resizeCanvas();
      const w = dims?.w ?? c.clientWidth;
      const h = dims?.h ?? c.clientHeight;

      // Clear
      context.clearRect(0, 0, w, h);

      // Background
      drawBackground(context, w, h);
      drawStars(context, w, h);

      // Edges
      drawEdges(context, state.edges, state.transform, state.hoveredId);

      // Nodes
      drawNodes(
        context,
        state.nodes,
        state.edges,
        state.transform,
        state.hoveredId,
        state.selectedId,
      );

      state.animFrame = requestAnimationFrame(animate);
    }

    state.animFrame = requestAnimationFrame(animate);

    return () => {
      state.disposed = true;
      cancelAnimationFrame(state.animFrame);
    };
  }, [resizeCanvas]);

  // ── Mouse / wheel event handlers ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const state = stateRef.current;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newK = Math.max(0.1, Math.min(5, state.transform.k * delta));
      const mx = e.offsetX;
      const my = e.offsetY;
      state.transform.x = mx - (mx - state.transform.x) * (newK / state.transform.k);
      state.transform.y = my - (my - state.transform.y) * (newK / state.transform.k);
      state.transform.k = newK;
    }

    function onMouseDown(e: MouseEvent) {
      const { x, y } = screenToWorld(e.offsetX, e.offsetY);
      const node = findNodeAt(x, y);
      if (node) {
        state.dragNode = node;
        node.fx = node.x;
        node.fy = node.y;
        state.sim?.alphaTarget(0.3).restart();
      } else {
        // Pan
        state.isPanning = true;
        state.panStart = {
          x: e.offsetX,
          y: e.offsetY,
          tx: state.transform.x,
          ty: state.transform.y,
        };
      }
    }

    function onMouseMove(e: MouseEvent) {
      // Drag node
      if (state.dragNode) {
        const { x, y } = screenToWorld(e.offsetX, e.offsetY);
        state.dragNode.fx = x;
        state.dragNode.fy = y;
        return;
      }

      // Pan
      if (state.isPanning && state.panStart) {
        state.transform.x = state.panStart.tx + (e.offsetX - state.panStart.x);
        state.transform.y = state.panStart.ty + (e.offsetY - state.panStart.y);
        return;
      }

      // Hover detection
      const { x, y } = screenToWorld(e.offsetX, e.offsetY);
      let found: string | null = null;
      for (const node of state.nodes) {
        const dx = node.x - x;
        const dy = node.y - y;
        if (dx * dx + dy * dy < (node.radius + 2) * (node.radius + 2)) {
          found = node.id;
          break;
        }
      }
      state.hoveredId = found;
      if (canvas) canvas.style.cursor = found ? "pointer" : state.isPanning ? "grabbing" : "grab";
    }

    function onMouseUp(_e: MouseEvent) {
      if (state.dragNode) {
        state.dragNode.fx = null;
        state.dragNode.fy = null;
        state.dragNode = null;
        state.sim?.alphaTarget(0);
      }
      state.isPanning = false;
      state.panStart = null;
    }

    function onClick(e: MouseEvent) {
      const { x, y } = screenToWorld(e.offsetX, e.offsetY);
      const node = findNodeAt(x, y);
      if (node) {
        const found = state.nodes.find((n) => n.id === node.id) ?? null;
        setSelectedNode(found);
      } else {
        setSelectedNode(null);
      }
    }

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("click", onClick);

    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("click", onClick);
    };
  }, [screenToWorld, findNodeAt]);

  // ── Derived data for UI ──
  const nodes = stateRef.current.nodes;
  const edges = stateRef.current.edges;
  const nodeCount = nodes.length;
  const edgeCount = edges.length;

  const categories = useMemo(() => {
    const catMap = new Map<string, { name: string; color: string; count: number }>();
    for (const n of nodes) {
      const key =
        n.kind === "dir"
          ? "directory"
          : (n.extension ?? "").toLowerCase() || "other";
      const existing = catMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        catMap.set(key, { name: key, color: n.color, count: 1 });
      }
    }
    return Array.from(catMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [nodes]);

  const filteredCategories = activeCategory
    ? categories.filter((c) => c.name === activeCategory)
    : categories;

  // Adjacency for detail card
  const adj = useMemo(() => {
    const a = new Map<string, Set<string>>();
    for (const e of edges) {
      const sId = typeof e.source === "object" ? e.source.id : e.source;
      const tId = typeof e.target === "object" ? e.target.id : e.target;
      if (!a.has(sId)) a.set(sId, new Set());
      a.get(sId)!.add(tId);
      if (!a.has(tId)) a.set(tId, new Set());
      a.get(tId)!.add(sId);
    }
    return a;
  }, [edges]);

  // ── Filter by category ──
  const handleCategoryFilter = useCallback(
    (catName: string) => {
      setActiveCategory((prev) => (prev === catName ? null : catName));
    },
    [],
  );

  const bgColor = theme === "light" ? "#f0f0f8" : "#000011";

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: bgColor,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0 }}
      />

      {/* Loading overlay */}
      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 30,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "2px solid rgba(100,96,255,0.2)",
              borderTopColor: "#8880ff",
              animation: "spin 1s linear infinite",
              marginBottom: 16,
            }}
          />
          <p style={{ color: "#8070a0", fontSize: 13 }}>Scanning galaxy...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 30,
            pointerEvents: "none",
          }}
        >
          <p style={{ color: "#ff6b6b", fontSize: 14, fontWeight: 600 }}>
            Graph Error
          </p>
          <p style={{ color: "#8070a0", fontSize: 12, marginTop: 6 }}>{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && nodeCount === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 30,
            pointerEvents: "none",
          }}
        >
          <p style={{ color: "#8070a0", fontSize: 13 }}>No data available</p>
        </div>
      )}

      {/* Title */}
      {nodeCount > 0 && (
        <div
          style={{
            position: "absolute",
            top: 24,
            left: 32,
            zIndex: 10,
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          <h1
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: theme === "light" ? "#1a102e" : "#e0f0ff",
              letterSpacing: "0.1em",
              fontFamily: "'Segoe UI', system-ui, sans-serif",
              textShadow:
                theme === "light"
                  ? "none"
                  : "0 0 30px rgba(150,150,255,0.2)",
              margin: 0,
            }}
          >
            {projectPaths.length > 1 ? "GALAXY CLUSTER" : "PROJECT GALAXY"}
          </h1>
          <p
            style={{
              fontSize: 12,
              color: theme === "light" ? "#6050a0" : "#607090",
              marginTop: 2,
            }}
          >
            {nodeCount} nodes · {edgeCount} connections
          </p>
        </div>
      )}

      {/* Search bar */}
      {nodeCount > 0 && (
        <div
          style={{
            position: "absolute",
            top: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
          }}
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes..."
            style={{
              width: 220,
              padding: "6px 14px",
              borderRadius: 20,
              border: `1px solid ${theme === "light" ? "rgba(100,96,255,0.15)" : "rgba(100,96,255,0.25)"}`,
              background:
                theme === "light"
                  ? "rgba(255,255,255,0.9)"
                  : "rgba(8,4,32,0.8)",
              color: theme === "light" ? "#1a102e" : "#e0e7ff",
              fontSize: 13,
              outline: "none",
              backdropFilter: "blur(8px)",
            }}
          />
        </div>
      )}

      {/* Category filter */}
      {nodeCount > 0 && filteredCategories.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 72,
            left: 16,
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {filteredCategories.map((cat) => (
            <button
              key={cat.name}
              onClick={() => handleCategoryFilter(cat.name)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 8px",
                borderRadius: 6,
                border:
                  activeCategory === cat.name
                    ? `1px solid ${cat.color}`
                    : "1px solid transparent",
                background:
                  activeCategory === cat.name
                    ? `${cat.color}20`
                    : theme === "light"
                      ? "rgba(255,255,255,0.6)"
                      : "rgba(8,4,32,0.6)",
                color: theme === "light" ? "#1a102e" : "#c0c8e0",
                fontSize: 11,
                cursor: "pointer",
                transition: "all 0.15s",
                backdropFilter: "blur(8px)",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: cat.color,
                  flexShrink: 0,
                }}
              />
              <span>{cat.name}</span>
              <span style={{ opacity: 0.5 }}>{cat.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Detail card */}
      {selectedNode && (
        <div
          style={{
            position: "absolute",
            top: 80,
            right: 24,
            width: 300,
            borderRadius: 12,
            padding: 20,
            zIndex: 20,
            background:
              theme === "light"
                ? "rgba(255,255,255,0.95)"
                : "rgba(8,4,32,0.95)",
            border: `1px solid ${theme === "light" ? "rgba(100,96,255,0.15)" : "rgba(100,96,255,0.25)"}`,
            backdropFilter: "blur(12px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: theme === "light" ? "#1a102e" : "#f0e8ff",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {selectedNode.label}
            </span>
            <button
              onClick={() => setSelectedNode(null)}
              style={{
                padding: 4,
                borderRadius: 4,
                border: "none",
                background: "transparent",
                color: "#8070a0",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                flexShrink: 0,
                marginLeft: 8,
              }}
            >
              ✕
            </button>
          </div>
          <p
            style={{
              wordBreak: "break-all",
              fontSize: 11,
              color: "#8070a0",
              marginBottom: 12,
              marginTop: 0,
            }}
          >
            {selectedNode.path}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <span
              style={{
                padding: "2px 10px",
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 500,
                background: `${selectedNode.color}30`,
                color: selectedNode.color,
              }}
            >
              {selectedNode.kind === "dir"
                ? "📁 Directory"
                : `📄 .${selectedNode.extension || "file"}`}
            </span>
            {selectedNode.size != null && selectedNode.size > 0 && (
              <span
                style={{
                  padding: "2px 10px",
                  borderRadius: 12,
                  fontSize: 11,
                  background: "rgba(100,96,255,0.1)",
                  color: "#8070a0",
                }}
              >
                {selectedNode.size < 1024
                  ? `${selectedNode.size}B`
                  : `${(selectedNode.size / 1024).toFixed(1)}KB`}
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              gap: 16,
              fontSize: 11,
              color: "#6050a0",
            }}
          >
            <span>🔗 {adj.get(selectedNode.id)?.size || 0} connections</span>
            <span>📐 degree {selectedNode.degree}</span>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      {nodeCount > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 24,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              padding: "8px 20px",
              borderRadius: 24,
              fontSize: 11,
              background:
                theme === "light"
                  ? "rgba(255,255,255,0.7)"
                  : "rgba(8,4,32,0.7)",
              border: `1px solid ${theme === "light" ? "rgba(100,96,255,0.1)" : "rgba(100,96,255,0.15)"}`,
              color: theme === "light" ? "#6050a0" : "#8070a0",
              backdropFilter: "blur(12px)",
            }}
          >
            <span>{nodeCount} nodes</span>
            <span style={{ color: "rgba(128,112,160,0.4)" }}>|</span>
            <span>{edgeCount} edges</span>
            <span style={{ color: "rgba(128,112,160,0.4)" }}>|</span>
            <span>Drag · Scroll · Click</span>
          </div>
        </div>
      )}
    </div>
  );
}
