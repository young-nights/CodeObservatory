// KnowledgeGraph — 2D force-directed knowledge graph using Cytoscape.js
// Replaces 3D CosmicProjectGalaxy with a 2D force layout, category filters,
// search, hover-highlight, click detail card, and dark/light theme support.

import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import cytoscape, { type Core, type EventObject } from "cytoscape";
// @ts-expect-error — react-cytoscapejs has no bundled types
import CytoscapeComponent from "react-cytoscapejs";
import * as api from "@/lib/api";
import type { GraphData } from "@/lib/types";
import { useTheme } from "@/hooks/useTheme";
import { X, Search as SearchIcon, Folder, File, Link2, Circle } from "lucide-react";

// ══════════════════════════════════════════════════
// Color System (reuse from CosmicProjectGalaxy)
// ══════════════════════════════════════════════════
const COLORS: Record<string, string> = {
  "_dir_root": "#ffe070", "_dir_1": "#ffd040", "_dir_2": "#e8b030", "_dir_def": "#d0a020",
  "ts": "#00e5ff", "tsx": "#00d4ee", "js": "#40e0d0", "jsx": "#50d0c0",
  "rs": "#ff6050", "py": "#00bcd4", "go": "#00acc1", "java": "#ff8f00",
  "c": "#78909c", "cpp": "#78909c", "h": "#90a4ae", "hpp": "#90a4ae",
  "vue": "#4caf50", "svelte": "#ff3d00", "kt": "#7c4dff", "swift": "#ff6e40",
  "rb": "#e53935", "lua": "#5c6bc0", "php": "#7e57c2",
  "md": "#ffffff", "mdx": "#f0f0ff", "rst": "#e0e0f0", "txt": "#c8c8e0",
  "css": "#66bb6a", "scss": "#81c784", "less": "#a5d6a7",
  "html": "#ff7043", "xml": "#ff8a65", "svg": "#ffab91",
  "json": "#ffd54f", "toml": "#ffca28", "yaml": "#ffc107", "yml": "#ffb300",
  "_default": "#b0bec5",
};

function nodeColor(n: { kind?: string; extension?: string; depth?: number }): string {
  if (n.kind === "dir") {
    if (n.depth === 0) return COLORS["_dir_root"];
    if (n.depth === 1) return COLORS["_dir_1"];
    if (n.depth === 2) return COLORS["_dir_2"];
    return COLORS["_dir_def"];
  }
  return COLORS[(n.extension || "").toLowerCase()] || COLORS["_default"];
}

// ══════════════════════════════════════════════════
// Cytoscape Style
// ══════════════════════════════════════════════════
function makeStyle(isDark: boolean) {
  const textColor = isDark ? "#e0e7ff" : "#1a1a2e";
  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        "background-color": "data(color)",
        width: "mapData(degree, 0, 50, 10, 60)",
        height: "mapData(degree, 0, 50, 10, 60)",
        "font-size": "10px",
        color: textColor,
        "text-valign": "bottom" as const,
        "text-margin-y": 5,
        "border-width": 2,
        "border-color": "data(color)",
        "border-opacity": 0.5,
        "text-outline-color": isDark ? "#05050f" : "#f0f0f5",
        "text-outline-width": 2,
      },
    },
    {
      selector: "edge",
      style: {
        width: 0.8,
        "line-color": "data(color)",
        opacity: 0.25,
        "curve-style": "bezier" as const,
      },
    },
    {
      selector: "node:selected",
      style: {
        "border-width": 4,
        "border-color": isDark ? "#a0a0ff" : "#4040c0",
        "border-opacity": 1,
        "background-color": "data(color)",
        "font-weight": "bold" as const,
        "font-size": "12px",
      },
    },
    {
      selector: "node.highlighted",
      style: {
        "border-width": 3,
        "border-color": isDark ? "#c0c0ff" : "#5050d0",
        "border-opacity": 1,
        "z-index": 999,
      },
    },
    {
      selector: "node.dimmed",
      style: {
        opacity: 0.15,
      },
    },
    {
      selector: "edge.dimmed",
      style: {
        opacity: 0.03,
      },
    },
    {
      selector: "node.search-match",
      style: {
        "border-width": 3,
        "border-color": "#ffcc00",
        "border-opacity": 1,
        "z-index": 998,
      },
    },
  ];
}

// ══════════════════════════════════════════════════
// COSE Layout Config
// ══════════════════════════════════════════════════
const coseLayout = {
  name: "cose",
  animate: "end" as const,
  animationDuration: 800,
  animationEasing: "ease-out" as const,
  nodeRepulsion: () => 4500,
  idealEdgeLength: () => 100,
  edgeElasticity: () => 0.45,
  gravity: 0.25,
  numIter: 2500,
  initialTemp: 300,
  coolingFactor: 0.95,
  minTemp: 1.0,
  padding: 30,
};

// ══════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════
function formatSize(bytes?: number): string {
  if (!bytes || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ══════════════════════════════════════════════════
// Subcomponents
// ══════════════════════════════════════════════════

function CategoryFilter({
  categories,
  activeCategory,
  onSelect,
  isDark,
}: {
  categories: { name: string; count: number; color: string }[];
  activeCategory: string | null;
  onSelect: (cat: string | null) => void;
  isDark: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 80,
        left: 16,
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        maxHeight: "calc(100vh - 160px)",
        overflowY: "auto",
        scrollbarWidth: "thin",
      }}
    >
      {/* "All" button */}
      <button
        onClick={() => onSelect(null)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          borderRadius: 8,
          border: `1px solid ${!activeCategory ? (isDark ? "rgba(160,160,255,0.4)" : "rgba(64,64,192,0.4)") : "transparent"}`,
          background: !activeCategory
            ? isDark ? "rgba(160,160,255,0.15)" : "rgba(64,64,192,0.1)"
            : isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
          color: isDark ? "#e0e7ff" : "#1a1a2e",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          textAlign: "left",
          transition: "all 0.15s ease",
          backdropFilter: "blur(8px)",
        }}
      >
        <Circle size={8} style={{ color: isDark ? "#a0a0ff" : "#4040c0" }} />
        <span style={{ flex: 1 }}>All</span>
        <span style={{ opacity: 0.5, fontSize: 11 }}>{categories.reduce((s, c) => s + c.count, 0)}</span>
      </button>

      {categories.map((cat) => (
        <button
          key={cat.name}
          onClick={() => onSelect(activeCategory === cat.name ? null : cat.name)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            borderRadius: 8,
            border: `1px solid ${activeCategory === cat.name ? (isDark ? "rgba(160,160,255,0.4)" : "rgba(64,64,192,0.4)") : "transparent"}`,
            background: activeCategory === cat.name
              ? isDark ? "rgba(160,160,255,0.15)" : "rgba(64,64,192,0.1)"
              : isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
            color: isDark ? "#e0e7ff" : "#1a1a2e",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.15s ease",
            backdropFilter: "blur(8px)",
          }}
        >
          <Circle size={8} style={{ color: cat.color, fill: cat.color }} />
          <span style={{ flex: 1 }}>{cat.name}</span>
          <span style={{ opacity: 0.5, fontSize: 11 }}>{cat.count}</span>
        </button>
      ))}
    </div>
  );
}

function DetailCard({
  node,
  degree,
  onClose,
  isDark,
}: {
  node: cytoscape.NodeSingular | null;
  degree: number;
  onClose: () => void;
  isDark: boolean;
}) {
  if (!node) return null;
  const d = node.data();
  const color = d.color || COLORS["_default"];

  return (
    <div
      style={{
        position: "absolute",
        top: 80,
        right: 16,
        width: 300,
        zIndex: 30,
        borderRadius: 12,
        padding: 16,
        background: isDark ? "rgba(8,4,32,0.95)" : "rgba(255,255,255,0.95)",
        border: `1px solid ${isDark ? "rgba(100,96,255,0.25)" : "rgba(0,0,0,0.1)"}`,
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: isDark ? "#f0e8ff" : "#1a1a2e",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {d.label}
        </span>
        <button
          onClick={onClose}
          style={{
            padding: 4,
            borderRadius: 6,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: isDark ? "#8070a0" : "#666680",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={14} />
        </button>
      </div>

      <p
        style={{
          fontSize: 11,
          color: isDark ? "#8070a0" : "#666680",
          wordBreak: "break-all",
          marginBottom: 12,
          lineHeight: 1.4,
        }}
      >
        {d.path}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 10px",
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 600,
            background: color + "25",
            color: color,
          }}
        >
          {d.kind === "dir" ? <Folder size={10} /> : <File size={10} />}
          {d.kind === "dir" ? "Directory" : `.${d.extension || "file"}`}
        </span>
        {d.size > 0 && (
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 12,
              fontSize: 11,
              background: isDark ? "rgba(100,96,255,0.1)" : "rgba(64,64,192,0.08)",
              color: isDark ? "#8070a0" : "#666680",
            }}
          >
            {formatSize(d.size)}
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          fontSize: 11,
          color: isDark ? "#6050a0" : "#8888a0",
          paddingTop: 8,
          borderTop: `1px solid ${isDark ? "rgba(100,96,255,0.1)" : "rgba(0,0,0,0.06)"}`,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Link2 size={10} /> {degree} connections
        </span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════

interface Props {
  projectPaths: string[];
  fullscreen?: boolean;
}

export default function KnowledgeGraph({ projectPaths }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<cytoscape.NodeSingular | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const cyRef = useRef<Core | null>(null);

  // ── Scan + merge projects ──
  useEffect(() => {
    if (!projectPaths?.length) {
      setGraphData(null);
      return;
    }
    let dead = false;
    (async () => {
      setLoading(true);
      const allNodes: GraphData["nodes"] = [];
      const allEdges: GraphData["edges"] = [];
      const seen = new Set<string>();

      for (let pi = 0; pi < projectPaths.length; pi++) {
        const pp = projectPaths[pi];
        try {
          const d: GraphData = await api.scanDirectory(pp);
          for (const n of d.nodes) {
            const id = `${pp}::${n.id}`;
            if (seen.has(id)) continue;
            seen.add(id);
            allNodes.push({
              ...n,
              id,
              label: n.label,
              path: n.path,
              kind: n.kind,
              extension: n.extension,
              size: n.size,
            });
          }
          for (const e of d.edges) {
            const s = `${pp}::${e.source}`;
            const t = `${pp}::${e.target}`;
            if (seen.has(s) && seen.has(t)) {
              allEdges.push({ id: `${s}-${t}`, source: s, target: t });
            }
          }
        } catch (e) {
          console.error("[KnowledgeGraph] scan error:", e);
        }
      }

      if (!dead) {
        setGraphData({ nodes: allNodes, edges: allEdges });
        setLoading(false);
      }
    })();
    return () => { dead = true; };
  }, [projectPaths]);

  // ── Compute degree for each node ──
  const degreeMap = useMemo(() => {
    const m = new Map<string, number>();
    if (!graphData) return m;
    for (const e of graphData.edges) {
      m.set(e.source, (m.get(e.source) || 0) + 1);
      m.set(e.target, (m.get(e.target) || 0) + 1);
    }
    return m;
  }, [graphData]);

  // ── Compute adjacency (for hover highlight) ──
  const adjMap = useMemo(() => {
    const a = new Map<string, Set<string>>();
    if (!graphData) return a;
    for (const e of graphData.edges) {
      if (!a.has(e.source)) a.set(e.source, new Set());
      if (!a.has(e.target)) a.set(e.target, new Set());
      a.get(e.source)!.add(e.target);
      a.get(e.target)!.add(e.source);
    }
    return a;
  }, [graphData]);

  // ── Build categories from extensions/kinds ──
  const categories = useMemo(() => {
    if (!graphData) return [];
    const catMap = new Map<string, { count: number; color: string }>();
    for (const n of graphData.nodes) {
      let catName: string;
      if (n.kind === "dir") {
        catName = "Directories";
      } else if (n.extension) {
        catName = `.${n.extension}`;
      } else {
        catName = "Other";
      }
      const existing = catMap.get(catName);
      const color = nodeColor(n);
      if (existing) {
        existing.count++;
      } else {
        catMap.set(catName, { count: 1, color });
      }
    }
    return Array.from(catMap.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [graphData]);

  // ── Cytoscape elements ──
  const elements = useMemo(() => {
    if (!graphData) return [];
    const categorySet = activeCategory
      ? new Set(
          graphData.nodes
            .filter((n) => {
              if (activeCategory === "Directories") return n.kind === "dir";
              if (activeCategory === "Other") return n.kind !== "dir" && !n.extension;
              return n.extension && `.${n.extension}` === activeCategory;
            })
            .map((n) => n.id)
        )
      : null;

    const nodes = graphData.nodes.map((n) => {
      const degree = degreeMap.get(n.id) || 0;
      const depth = n.path.split(/[\\/]/).length - (projectPaths[0]?.split(/[\\/]/).length || 0);
      const color = nodeColor({ kind: n.kind, extension: n.extension, depth });
      const hidden = categorySet ? !categorySet.has(n.id) : false;
      return {
        data: {
          id: n.id,
          label: n.label,
          path: n.path,
          kind: n.kind,
          extension: n.extension,
          size: n.size,
          degree,
          color,
          hidden,
        },
      };
    });

    const edges = graphData.edges.map((e) => {
      const sourceNode = graphData.nodes.find((n) => n.id === e.source);
      const color = sourceNode ? nodeColor(sourceNode) : COLORS["_default"];
      return {
        data: {
          source: e.source,
          target: e.target,
          color,
        },
      };
    });

    return [...nodes, ...edges];
  }, [graphData, degreeMap, activeCategory, projectPaths]);

  // ── Cytoscape style ──
  const cyStyle = useMemo(() => makeStyle(isDark), [isDark]);

  // ── Search matching ──
  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim() || !graphData) return null;
    const q = searchQuery.toLowerCase();
    const ids = new Set<string>();
    for (const n of graphData.nodes) {
      if (
        n.label.toLowerCase().includes(q) ||
        n.path.toLowerCase().includes(q)
      ) {
        ids.add(n.id);
      }
    }
    return ids;
  }, [searchQuery, graphData]);

  // ── Apply search highlight via cy instance ──
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass("search-match");
    if (searchMatchIds && searchMatchIds.size > 0) {
      cy.nodes().forEach((n) => {
        if (searchMatchIds.has(n.id())) {
          n.addClass("search-match");
        }
      });
    }
  }, [searchMatchIds]);

  // ── Hover highlight logic ──
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.nodes().removeClass("highlighted dimmed");
    cy.edges().removeClass("dimmed");

    if (hoveredNodeId) {
      const neighbors = adjMap.get(hoveredNodeId) || new Set();
      cy.nodes().forEach((n) => {
        if (n.id() === hoveredNodeId || neighbors.has(n.id())) {
          n.addClass("highlighted");
        } else {
          n.addClass("dimmed");
        }
      });
      cy.edges().forEach((e) => {
        const src = typeof e.data("source") === "function" ? e.data("source") : e.source().id();
        const tgt = typeof e.data("target") === "function" ? e.data("target") : e.target().id();
        if (src === hoveredNodeId || tgt === hoveredNodeId) {
          // keep visible
        } else {
          e.addClass("dimmed");
        }
      });
    }
  }, [hoveredNodeId, adjMap]);

  // ── Cytoscape event handlers ──
  const onCyRef = useCallback(
    (cy: Core) => {
      cyRef.current = cy;

      cy.on("tap", "node", (evt: EventObject) => {
        const node = evt.target as cytoscape.NodeSingular;
        setSelectedNode(node);
      });

      cy.on("tap", (evt: EventObject) => {
        if (evt.target === cy) {
          setSelectedNode(null);
        }
      });

      cy.on("mouseover", "node", (evt: EventObject) => {
        setHoveredNodeId(evt.target.id());
      });

      cy.on("mouseout", "node", () => {
        setHoveredNodeId(null);
      });
    },
    []
  );

  // ── Node degree for detail card ──
  const selectedNodeDegree = useMemo(() => {
    if (!selectedNode) return 0;
    return degreeMap.get(selectedNode.id()) || 0;
  }, [selectedNode, degreeMap]);

  // ── Stats ──
  const nodeCount = graphData?.nodes.length || 0;
  const edgeCount = graphData?.edges.length || 0;

  // ── Empty / loading state ──
  if (!graphData?.nodes.length) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: isDark
            ? "linear-gradient(180deg, #05050f 0%, #0a0a1a 100%)"
            : "linear-gradient(180deg, #f0f0f5 0%, #e8e8ee 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {loading && (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: `2px solid ${isDark ? "rgba(100,96,255,0.2)" : "rgba(64,64,192,0.2)"}`,
              borderTopColor: isDark ? "#8880ff" : "#4040c0",
              animation: "spin 1s linear infinite",
              marginBottom: 16,
            }}
          />
        )}
        <p style={{ color: isDark ? "#8070a0" : "#666680", fontSize: 13 }}>
          {loading ? "Scanning project files..." : "No data available. Select projects to visualize."}
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: isDark
          ? "linear-gradient(180deg, #05050f 0%, #0a0a1a 100%)"
          : "linear-gradient(180deg, #f0f0f5 0%, #e8e8ee 100%)",
      }}
    >
      {/* Top: Title + Search */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          background: isDark
            ? "linear-gradient(180deg, rgba(5,5,15,0.9) 0%, rgba(5,5,15,0) 100%)"
            : "linear-gradient(180deg, rgba(240,240,245,0.9) 0%, rgba(240,240,245,0) 100%)",
          pointerEvents: "none",
        }}
      >
        {/* Title */}
        <div style={{ pointerEvents: "auto" }}>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: "0.12em",
              color: isDark ? "#e8e0f0" : "#1a1a2e",
              textShadow: isDark ? "0 0 30px rgba(150,150,255,0.2)" : "none",
              margin: 0,
            }}
          >
            {nodeCount > 1 ? "KNOWLEDGE GRAPH" : "KNOWLEDGE GRAPH"}
          </h1>
          <p style={{ color: isDark ? "#8070a0" : "#666680", fontSize: 12, margin: "2px 0 0" }}>
            {nodeCount} nodes · {edgeCount} connections
          </p>
        </div>

        {/* Search */}
        <div
          style={{
            position: "relative",
            width: 280,
            pointerEvents: "auto",
          }}
        >
          <SearchIcon
            size={14}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: isDark ? "#8070a0" : "#666680",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes..."
            style={{
              width: "100%",
              padding: "8px 12px 8px 34px",
              borderRadius: 10,
              border: `1px solid ${isDark ? "rgba(100,96,255,0.2)" : "rgba(0,0,0,0.1)"}`,
              background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              color: isDark ? "#e0e7ff" : "#1a1a2e",
              fontSize: 13,
              outline: "none",
              backdropFilter: "blur(8px)",
              transition: "border-color 0.15s ease",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = isDark ? "rgba(100,96,255,0.5)" : "rgba(64,64,192,0.4)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = isDark ? "rgba(100,96,255,0.2)" : "rgba(0,0,0,0.1)";
            }}
          />
        </div>
      </div>

      {/* Left: Category Filters */}
      <CategoryFilter
        categories={categories}
        activeCategory={activeCategory}
        onSelect={setActiveCategory}
        isDark={isDark}
      />

      {/* Center: Cytoscape Canvas */}
      <div style={{ position: "absolute", inset: 0 }}>
        <CytoscapeComponent
          elements={elements}
          style={{ width: "100%", height: "100%" }}
          stylesheet={cyStyle}
          layout={coseLayout}
          cy={onCyRef}
          minZoom={0.2}
          maxZoom={4}
          boxSelectionEnabled={false}
          wheelSensitivity={0.3}
        />
      </div>

      {/* Right: Detail Card */}
      <DetailCard
        node={selectedNode}
        degree={selectedNodeDegree}
        onClose={() => setSelectedNode(null)}
        isDark={isDark}
      />

      {/* Bottom: Stats bar */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
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
            gap: 20,
            padding: "6px 20px",
            borderRadius: 20,
            fontSize: 12,
            background: isDark ? "rgba(8,4,32,0.7)" : "rgba(255,255,255,0.7)",
            border: `1px solid ${isDark ? "rgba(100,96,255,0.15)" : "rgba(0,0,0,0.08)"}`,
            color: isDark ? "#8070a0" : "#666680",
            backdropFilter: "blur(12px)",
          }}
        >
          <span>{nodeCount} nodes</span>
          <span style={{ opacity: 0.3 }}>·</span>
          <span>{edgeCount} connections</span>
          <span style={{ opacity: 0.3 }}>·</span>
          <span>Drag · Scroll · Click</span>
        </div>
      </div>

      {/* Spin keyframe */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
