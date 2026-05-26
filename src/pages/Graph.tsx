// Graph — Precision Instrument core visualization
// OKLCH node colors · 0.3px edges · neighborhood highlight dimming
// No gradient · no texture · no neon

import { useEffect, useRef, useCallback, useState } from "react";
import cytoscape, { type Core, type EventObject } from "cytoscape";
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

function getNodeSize(node: FileNode): number {
  return node.kind === "dir" ? 12 : 8;
}

function formatSize(bytes?: number): string {
  if (bytes == null || bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface GraphPageProps {
  projectPath: string;
}

type LayoutName = "cose" | "breadthfirst";
const LABEL_ZOOM_THRESHOLD = 1.5;

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
  const [labelsVisible, setLabelsVisible] = useState(false);

  const initCytoscape = useCallback(
    (data: GraphData) => {
      if (!containerRef.current) return;

      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }

      const elements: cytoscape.ElementDefinition[] = [
        ...data.nodes.map((n: FileNode) => ({
          data: {
            id: n.id,
            label: n.label,
            path: n.path,
            kind: n.kind,
            extension: n.extension,
            size: n.size,
            modified: n.modified,
            color: getNodeColor(n),
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
          // ── Nodes: 12px dir / 8px file, opacity 0.7 ──
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
              "font-family": "'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
              "z-index": 10,
              "transition-property": "background-opacity, text-opacity, width, height",
              "transition-duration": 200,
            },
          },
          // Selected: opacity 1, neighborhood highlight
          {
            selector: "node:selected",
            style: {
              "background-opacity": 1,
              width: "mapData(nodeSize, 8, 12, 12, 18)",
              height: "mapData(nodeSize, 8, 12, 12, 18)",
              "z-index": 9999,
            },
          },
          // Dimmed: opacity 0.04
          {
            selector: "node.dimmed",
            style: {
              opacity: 0.04,
            },
          },
          {
            selector: "node.highlighted",
            style: {
              opacity: 1,
              "background-opacity": 0.9,
            },
          },
          // Labels on (zoom > 1.5×)
          {
            selector: "node.labels-on",
            style: {
              "text-opacity": 0.7,
            },
          },
          // ── Edges: 0.3px, 5% opacity white ──
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
            style: {
              opacity: 0,
            },
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
          animate: true,
          animationDuration: 800,
          animationEasing: "ease-out",
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

      // Zoom-based label toggle
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

      // Tooltip on hover
      cy.on("mouseover", "node", (evt: EventObject) => {
        const node = evt.target;
        const pos = node.renderedPosition();
        const containerPos = containerRef.current?.getBoundingClientRect();
        if (!containerPos) return;

        const d = node.data();
        const k = d.kind ?? "file";
        const sz = formatSize(d.size as number | undefined);
        setTooltip({
          visible: true,
          x: pos.x + containerPos.left + 10,
          y: pos.y + containerPos.top - 50,
          label: d.label as string,
          path: d.path as string,
          kind: k === "dir" ? "Directory" : "File",
          size: sz,
        });
      });

      cy.on("mouseout", "node", () => {
        setTooltip((prev) => ({ ...prev, visible: false }));
      });

      // Click: 1-degree neighborhood highlight → rest dim to 0.04
      cy.on("tap", "node", (evt: EventObject) => {
        const target = evt.target;
        const neighbourhood = target
          .closedNeighborhood()
          .add(target.connectedEdges());

        cy.elements().addClass("dimmed");
        neighbourhood.removeClass("dimmed").addClass("highlighted");
      });

      // Click background → reset
      cy.on("tap", (evt: EventObject) => {
        if (evt.target === cy) {
          cy.elements().removeClass("dimmed").removeClass("highlighted");
        }
      });

      cyRef.current = cy;
    },
    [],
  );

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
  }, [graph, initCytoscape]);

  const handleLayoutChange = useCallback((name: LayoutName) => {
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
  }, []);

  const handleFit = useCallback(() => {
    cyRef.current?.fit(undefined, 50);
  }, []);

  const edgeCount = graph?.edges.length ?? 0;
  const dirCount =
    graph?.nodes.filter((n) => n.kind === "dir").length ?? 0;
  const fileCount =
    graph?.nodes.filter((n) => n.kind === "file").length ?? 0;

  return (
    <div className="flex flex-col h-full co-graph-bg">
      {/* ── Toolbar: 40px, icon buttons left-aligned ── */}
      <div className="co-graph-toolbar">
        {/* Left: badges (dir/file/edge counts) */}
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
        </div>

        {/* Right: icon-only buttons */}
        <div className="co-graph-toolbar-right">
          {/* Layout toggle */}
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

        {/* Tooltip — solid color, no glass */}
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
