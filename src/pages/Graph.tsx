// Graph page — Obsidian-style file relationship visualization
// Dark minimal background with dot nodes and fine connections.

import { useEffect, useRef, useCallback, useState } from "react";
import cytoscape, { type Core, type EventObject } from "cytoscape";
import { useScanGraph } from "@/hooks/useObservatory";
import type { GraphData, FileNode, FileEdge } from "@/lib/types";
import {
  RefreshCw,
  Maximize2,
  GitBranch,
  Network,
  Circle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Obsidian-style muted colour palette
// ---------------------------------------------------------------------------
const OBSIDIAN_COLORS: Record<string, string> = {
  dir: "#daa520",
  ts: "#4a9eff",
  tsx: "#4a9eff",
  rs: "#e06c75",
  json: "#e5c07b",
  toml: "#e5c07b",
  yaml: "#e5c07b",
  yml: "#e5c07b",
  md: "#c678dd",
  css: "#98c379",
  html: "#98c379",
  scss: "#98c379",
  c: "#abb2bf",
  h: "#abb2bf",
  cpp: "#abb2bf",
  hpp: "#abb2bf",
  py: "#56b6c2",
  default: "#5c6370",
};

function getObsidianColor(node: FileNode): string {
  if (node.kind === "dir") return OBSIDIAN_COLORS.dir;
  const ext =
    node.extension ?? node.path.split(".").pop()?.toLowerCase() ?? "";
  return OBSIDIAN_COLORS[ext] || OBSIDIAN_COLORS.default;
}

function getNodeSize(node: FileNode): number {
  return node.kind === "dir" ? 14 : 10;
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
            color: getObsidianColor(n),
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
              "background-opacity": 0.75,
              width: "data(nodeSize)",
              height: "data(nodeSize)",
              // Outer glow via text-outline
              "text-outline-color": "data(color)",
              "text-outline-width": 2,
              "text-outline-opacity": 0.35,
              label: "data(label)",
              "font-size": "8px",
              "text-valign": "bottom",
              "text-halign": "center",
              "text-margin-y": 5,
              color: "data(color)",
              "text-opacity": 0,
              "font-family":
                "'Inter', 'Segoe UI', system-ui, sans-serif",
              "z-index": 10,
              "transition-property":
                "background-opacity, text-opacity, width, height",
              "transition-duration": 150,
              "transition-timing-function": "ease-out",
            },
          },
          {
            selector: "node:selected",
            style: {
              "background-opacity": 1,
              width: "mapData(nodeSize, 10, 14, 14, 20)",
              height: "mapData(nodeSize, 10, 14, 14, 20)",
              "text-outline-opacity": 0.6,
              "z-index": 9999,
            },
          },
          // Dim non-neighbours
          {
            selector: "node.dimmed",
            style: {
              opacity: 0.05,
            },
          },
          {
            selector: "node.highlighted",
            style: {
              opacity: 1,
              "background-opacity": 0.9,
              "text-outline-opacity": 0.5,
            },
          },
          // Labels-on class (applied when zoom > 1.5×)
          {
            selector: "node.labels-on",
            style: {
              "text-opacity": 0.75,
            },
          },
          // --- Edges ---
          {
            selector: "edge",
            style: {
              width: 0.4,
              "line-color": "rgba(255,255,255,0.06)",
              "curve-style": "bezier",
              "target-arrow-shape": "none",
              "z-index": 0,
              "transition-property": "line-color, width, opacity",
              "transition-duration": 150,
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
              "line-color": "rgba(255,255,255,0.2)",
              width: 0.6,
              opacity: 1,
            },
          },
        ],
        layout: {
          name: "cose",
          animate: true,
          animationDuration: 800,
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

      // ---- Zoom-based label toggle ----
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

      // ---- Tooltip on hover ----
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
          x: pos.x + containerPos.left + 12,
          y: pos.y + containerPos.top - 60,
          label: d.label as string,
          path: d.path as string,
          kind: k === "dir" ? "📁 Directory" : "📄 File",
          size: sz,
        });
      });

      cy.on("mouseout", "node", () => {
        setTooltip((prev) => ({ ...prev, visible: false }));
      });

      // ---- Click: 1-degree neighbourhood highlight ----
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  const handleLayoutChange = useCallback((name: LayoutName) => {
    setLayoutName(name);
    if (!cyRef.current) return;
    cyRef.current
      .elements()
      .removeClass("dimmed")
      .removeClass("highlighted");
    cyRef.current
      .layout({
        name,
        ...(name === "cose"
          ? {
              animate: true,
              animationDuration: 600,
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
            }),
      })
      .run();
  }, []);

  const handleFit = useCallback(() => {
    cyRef.current?.fit(undefined, 50);
  }, []);

  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;
  const dirCount =
    graph?.nodes.filter((n) => n.kind === "dir").length ?? 0;
  const fileCount =
    graph?.nodes.filter((n) => n.kind === "file").length ?? 0;

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "#0f0f0f" }}
    >
      {/* ── Toolbar ── */}
      <div className="co-obsidian-toolbar flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="co-obsidian-badge">
            <Circle size={6} fill="#daa520" stroke="none" />
            {dirCount}
          </span>
          <span className="co-obsidian-badge">
            <Circle size={6} fill="#4a9eff" stroke="none" />
            {fileCount}
          </span>
          <span className="co-obsidian-badge">{edgeCount} edges</span>
          {labelsVisible && (
            <span
              className="co-obsidian-badge"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              labels on
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <div className="co-obsidian-layout-toggle">
            <button
              className={`co-obsidian-layout-btn ${layoutName === "cose" ? "active" : ""}`}
              onClick={() => handleLayoutChange("cose")}
              title="Force-directed layout"
            >
              <Network size={12} />
            </button>
            <button
              className={`co-obsidian-layout-btn ${layoutName === "breadthfirst" ? "active" : ""}`}
              onClick={() => handleLayoutChange("breadthfirst")}
              title="Hierarchy layout"
            >
              <GitBranch size={12} />
            </button>
          </div>
          <button
            className="co-obsidian-icon-btn"
            onClick={handleFit}
            title="Fit to screen"
          >
            <Maximize2 size={13} />
          </button>
          <button
            className="co-obsidian-icon-btn"
            onClick={refresh}
            disabled={loading}
            title="Re-scan project directory"
          >
            <RefreshCw
              size={13}
              className={loading ? "animate-spin" : ""}
            />
          </button>
        </div>
      </div>

      {/* ── Graph Canvas ── */}
      <div className="co-obsidian-canvas-wrapper">
        {loading && !graph ? (
          <div className="co-obsidian-loading">
            <div className="co-obsidian-loading-spinner" />
            <p className="co-obsidian-loading-text">
              Scanning files…
            </p>
          </div>
        ) : graph && graph.nodes.length === 0 ? (
          <div className="co-obsidian-empty">
            <p className="co-obsidian-empty-title">Empty</p>
            <p className="co-obsidian-empty-desc">
              This directory contains no files or folders.
            </p>
          </div>
        ) : !projectPath ? (
          <div className="co-obsidian-empty">
            <p className="co-obsidian-empty-title">No Project</p>
            <p className="co-obsidian-empty-desc">
              Open a project to visualize its file graph.
            </p>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="co-obsidian-cy-container"
          />
        )}

        {/* ── Tooltip ── */}
        {tooltip.visible && (
          <div
            className="co-obsidian-tooltip"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="co-obsidian-tooltip-label">
              {tooltip.label}
            </div>
            <div className="co-obsidian-tooltip-meta">
              <span>{tooltip.kind}</span>
              {tooltip.size && <span>· {tooltip.size}</span>}
            </div>
            <div className="co-obsidian-tooltip-path">
              {tooltip.path}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
