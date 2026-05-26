// Graph page — Cosmic galaxy file relationship visualization
// Dark nebula theme with glowing nodes and star-field background.

import { useEffect, useRef, useCallback, useState } from "react";
import cytoscape, { type Core, type EventObject } from "cytoscape";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useScanGraph } from "@/hooks/useObservatory";
import type { GraphData, FileNode, FileEdge } from "@/lib/types";
import {
  Share2,
  RefreshCw,
  Maximize2,
  GitBranch,
  Network,
  Circle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Cosmic nebula color palette — color by file type
// ---------------------------------------------------------------------------
const COSMIC_COLORS: Record<string, string> = {
  dir: "#fbbf24", // amber/gold — stellar cores
  ts: "#60a5fa", // blue — TypeScript
  tsx: "#60a5fa",
  rs: "#fb923c", // orange — Rust
  json: "#facc15", // yellow — Config
  toml: "#facc15",
  yaml: "#facc15",
  yml: "#facc15",
  md: "#c084fc", // purple — Markdown
  css: "#34d399", // green — Style
  html: "#34d399",
  scss: "#34d399",
  c: "#94a3b8", // gray — C/C++
  h: "#94a3b8",
  cpp: "#94a3b8",
  hpp: "#94a3b8",
  py: "#2dd4bf", // teal — Python
  default: "#e2e8f0", // silver — other
};

function getCosmicColor(node: FileNode): string {
  if (node.kind === "dir") return COSMIC_COLORS.dir;
  const ext =
    node.extension ?? node.path.split(".").pop()?.toLowerCase() ?? "";
  return COSMIC_COLORS[ext] || COSMIC_COLORS.default;
}

function getNodeSize(node: FileNode): number {
  return node.kind === "dir" ? 24 : 16;
}

function formatSize(bytes?: number): string {
  if (bytes == null || bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface GraphPageProps {
  projectPath: string;
}

type LayoutName = "cose" | "breadthfirst";

export function GraphPage({ projectPath }: GraphPageProps) {
  const { graph, loading, refresh } = useScanGraph(projectPath);
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
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

  // Build Cytoscape elements from GraphData
  const initCytoscape = useCallback(
    (data: GraphData) => {
      if (!containerRef.current) return;

      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }

      const totalNodes = data.nodes.length;
      const hideLabels = totalNodes > 1000;
      const autoLayout: LayoutName = totalNodes > 500 ? "breadthfirst" : "cose";

      // Auto-select layout for large graphs
      if (autoLayout !== layoutName) {
        setLayoutName(autoLayout);
      }

      const elements: cytoscape.ElementDefinition[] = [
        ...data.nodes.map((n: FileNode) => ({
          data: {
            id: n.id,
            // Hide labels on non-directory nodes when graph is huge
            label: hideLabels && n.kind !== "dir" ? "" : n.label,
            path: n.path,
            kind: n.kind,
            extension: n.extension,
            size: n.size,
            modified: n.modified,
            color: getCosmicColor(n),
            nodeSize: getNodeSize(n),
          },
        })),
        ...data.edges.map((e: FileEdge) => ({
          data: {
            id: e.id,
            source: e.source,
            target: e.target,
          },
        })),
      ];

      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: [
          // --- Nodes ---
          {
            selector: "node",
            style: {
              "background-color": "data(color)",
              "background-opacity": 0.92,
              width: "data(nodeSize)",
              height: "data(nodeSize)",
              label: "data(label)",
              "font-size": "9px",
              "text-valign": "bottom",
              "text-halign": "center",
              "text-margin-y": 6,
              color: "data(color)",
              "text-opacity": 0.8,
              "font-family": "'Inter', 'Segoe UI', system-ui, sans-serif",
              // border to create a subtle ring
              "border-width": 1.5,
              "border-color": "data(color)",
              "border-opacity": 0.35,
            },
          },
          {
            selector: "node:selected",
            style: {
              "border-width": 3,
              "border-opacity": 0.9,
              "border-color": "#fff",
              "z-index": 9999,
              // scale up on selection
              width: "mapData(nodeSize, 16, 24, 22, 36)",
              height: "mapData(nodeSize, 16, 24, 22, 36)",
            },
          },
          {
            // Dim non-neighbours when a node is selected
            selector: "node.dimmed",
            style: {
              opacity: 0.12,
              "text-opacity": 0,
            },
          },
          {
            // Highlight direct neighbours
            selector: "node.highlighted",
            style: {
              opacity: 1,
              "border-color": "#fff",
              "border-opacity": 0.7,
              "border-width": 2,
            },
          },
          // --- Edges ---
          {
            selector: "edge",
            style: {
              width: 0.5,
              "line-color": "rgba(100, 116, 139, 0.12)",
              "curve-style": "bezier",
              "target-arrow-shape": "none",
            },
          },
          {
            selector: "edge.dimmed",
            style: {
              opacity: 0,
            },
          },
          {
            selector: "edge.highlighted",
            style: {
              "line-color": "rgba(255, 255, 255, 0.3)",
              width: 1,
              opacity: 0.9,
            },
          },
        ],
        layout: {
          name: autoLayout,
          ...(autoLayout === "cose"
            ? {
                animate: false,
                nodeRepulsion: () => 4000,
                idealEdgeLength: () => 80,
                gravity: 0.3,
                numIter: 500,
              }
            : {
                directed: false,
                spacingFactor: 1.2,
              }),
        },
        wheelSensitivity: 0.25,
        minZoom: 0.15,
        maxZoom: 4,
      });

      // ---- Tooltip on mouseover ----
      cy.on("mouseover", "node", (evt: EventObject) => {
        const node = evt.target;
        const pos = node.renderedPosition();
        const containerPos = containerRef.current?.getBoundingClientRect();
        if (!containerPos) return;

        const data = node.data();
        const k = data.kind ?? "file";
        const sz = formatSize(data.size as number | undefined);
        setTooltip({
          visible: true,
          x: pos.x + containerPos.left + 12,
          y: pos.y + containerPos.top - 60,
          label: data.label as string,
          path: data.path as string,
          kind: k === "dir" ? "📁 Directory" : "📄 File",
          size: sz,
        });
      });

      cy.on("mouseout", "node", () => {
        setTooltip((prev) => ({ ...prev, visible: false }));
      });

      // ---- Click: highlight neighbours ----
      cy.on("tap", "node", (evt: EventObject) => {
        const target = evt.target;
        const neighbourhood = target
          .closedNeighborhood()
          .add(target.connectedEdges());

        cy.elements().addClass("dimmed");
        neighbourhood.removeClass("dimmed").addClass("highlighted");

        // Flash the target node
        target
          .removeClass("dimmed")
          .addClass("highlighted")
          .animate({
            style: { "border-color": "#fff", "border-width": 5 },
            duration: 200,
          })
          .animate({
            style: { "border-color": "#fff", "border-width": 3 },
            duration: 200,
          });
      });

      cy.on("tap", (evt: EventObject) => {
        if (evt.target === cy) {
          // Clicked background — clear highlights
          cy.elements().removeClass("dimmed").removeClass("highlighted");
        }
      });

      // ---- Double-click: log details (extension point) ----
      cy.on("dblclick", "node", (evt: EventObject) => {
        const data = evt.target.data();
        console.log("[Graph] Double-clicked node:", {
          label: data.label,
          path: data.path,
          kind: data.kind,
          size: data.size,
          modified: data.modified,
        });
      });

      cyRef.current = cy;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Re-initialize only when graph data changes (not on layout switch)
  useEffect(() => {
    if (graph && graph.nodes.length > 0) {
      initCytoscape(graph);
    }
    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // Apply layout change without full re-init (no cytoscape rebuild)
  const handleLayoutChange = useCallback(
    (name: LayoutName) => {
      setLayoutName(name);
      if (!cyRef.current) return;
      cyRef.current
        .layout({
          name,
          ...(name === "cose"
            ? {
                animate: true,
                nodeRepulsion: () => 4000,
                idealEdgeLength: () => 80,
                gravity: 0.3,
                numIter: 500,
              }
            : {
                directed: false,
                spacingFactor: 1.2,
                animate: true,
              }),
        })
        .run();
    },
    [],
  );

  const handleFit = useCallback(() => {
    cyRef.current?.fit(undefined, 50);
  }, []);

  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;
  const dirCount = graph?.nodes.filter((n) => n.kind === "dir").length ?? 0;
  const fileCount = graph?.nodes.filter((n) => n.kind === "file").length ?? 0;

  return (
    <div className="co-page co-cosmic-graph-page flex flex-col">
      {/* ── Toolbar ── */}
      <div className="co-graph-toolbar co-cosmic-toolbar flex items-center justify-between px-5 py-2.5">
        <div className="flex items-center gap-3">
          <div className="co-cosmic-brand-icon">
            <Share2 size={16} />
          </div>
          <h2 className="text-sm font-semibold tracking-wide text-white/85">
            Cosmic File Graph
          </h2>
          {graph && (
            <div className="flex items-center gap-1.5 ml-2">
              <span className="co-cosmic-badge">
                <Circle size={8} fill="#fbbf24" stroke="none" />
                {dirCount} dirs
              </span>
              <span className="co-cosmic-badge">
                <Circle size={8} fill="#e2e8f0" stroke="none" />
                {fileCount} files
              </span>
              <span className="co-cosmic-badge">
                {edgeCount} edges
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Layout toggle */}
          <div className="co-cosmic-layout-toggle">
            <button
              className={`co-cosmic-layout-btn ${layoutName === "cose" ? "active" : ""}`}
              onClick={() => handleLayoutChange("cose")}
              title="Force-directed layout (cose)"
            >
              <Network size={13} />
            </button>
            <button
              className={`co-cosmic-layout-btn ${layoutName === "breadthfirst" ? "active" : ""}`}
              onClick={() => handleLayoutChange("breadthfirst")}
              title="Hierarchy layout (breadthfirst)"
            >
              <GitBranch size={13} />
            </button>
          </div>
          {/* Fit */}
          <button
            className="co-cosmic-icon-btn"
            onClick={handleFit}
            title="Fit to screen"
          >
            <Maximize2 size={14} />
          </button>
          {/* Refresh */}
          <button
            className="co-cosmic-icon-btn"
            onClick={refresh}
            disabled={loading}
            title="Re-scan project directory"
          >
            <RefreshCw
              size={14}
              className={loading ? "animate-spin" : ""}
            />
          </button>
        </div>
      </div>

      {/* ── Large graph warning ── */}
      {nodeCount > 1000 && (
        <div className="co-cosmic-warning-banner flex items-center gap-2 px-5 py-1.5 text-xs text-amber-300/80 bg-amber-950/20 border-b border-amber-500/15">
          <span>⚠️</span>
          <span>
            Large graph ({nodeCount.toLocaleString()} nodes). Non-directory labels hidden for performance.
            {layoutName === "cose" && " Consider switching to hierarchy layout."}
          </span>
          {layoutName === "cose" && (
            <button
              className="ml-auto underline text-amber-300 hover:text-amber-200"
              onClick={() => handleLayoutChange("breadthfirst")}
            >
              Switch to hierarchy
            </button>
          )}
        </div>
      )}
      {nodeCount > 500 && nodeCount <= 1000 && (
        <div className="co-cosmic-warning-banner flex items-center gap-2 px-5 py-1.5 text-xs text-sky-300/70 bg-sky-950/15 border-b border-sky-500/10">
          <span>ℹ️</span>
          <span>
            {nodeCount.toLocaleString()} nodes detected. Auto-selected hierarchy layout for better performance.
          </span>
        </div>
      )}

      {/* ── Graph Canvas ── */}
      <div className="co-cosmic-canvas-wrapper">
        {/* Star-field background layer */}
        <div className="co-cosmic-starfield" />

        {loading && !graph ? (
          <div className="co-cosmic-loading">
            <div className="co-cosmic-loading-spinner" />
            <p className="co-cosmic-loading-text">Scanning the nebula…</p>
          </div>
        ) : graph && graph.nodes.length === 0 ? (
          <div className="co-cosmic-empty">
            <Share2 size={40} className="opacity-15 mb-4" />
            <p className="co-cosmic-empty-title">Empty Space</p>
            <p className="co-cosmic-empty-desc">
              This directory contains no files or folders — a void waiting for stars.
            </p>
          </div>
        ) : !projectPath ? (
          <div className="co-cosmic-empty">
            <Share2 size={40} className="opacity-15 mb-4" />
            <p className="co-cosmic-empty-title">No Project Selected</p>
            <p className="co-cosmic-empty-desc">
              Open a project to reveal its cosmic file constellation.
            </p>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="co-cosmic-cy-container"
          />
        )}

        {/* Tooltip */}
        {tooltip.visible && (
          <div
            className="co-cosmic-tooltip"
            style={{
              left: tooltip.x,
              top: tooltip.y,
            }}
          >
            <div className="co-cosmic-tooltip-label">{tooltip.label}</div>
            <div className="co-cosmic-tooltip-meta">
              <span>{tooltip.kind}</span>
              {tooltip.size && <span>· {tooltip.size}</span>}
            </div>
            <div className="co-cosmic-tooltip-path">{tooltip.path}</div>
          </div>
        )}
      </div>
    </div>
  );
}
