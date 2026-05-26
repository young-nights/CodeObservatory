// Graph page — Cytoscape.js file relationship visualization
// co-theme design system. Layout/spacing: Tailwind. Colors/effects: co-* CSS.
// No framer-motion; animated with co-animate-* CSS classes.

import { useEffect, useRef, useCallback } from "react";
import cytoscape, { type Core } from "cytoscape";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGraph } from "@/hooks/useObservatory";
import type { GraphData, FileNode, FileEdge } from "@/lib/types";
import { Share2, RefreshCw } from "lucide-react";

interface GraphPageProps {
  projectPath: string;
}

// Dark-theme node colors by extension
const NODE_COLORS: Record<string, string> = {
  ts: "#60a5fa",
  tsx: "#67e8f9",
  js: "#facc15",
  jsx: "#67e8f9",
  css: "#38bdf8",
  html: "#fb923c",
  json: "#a3a3a3",
  md: "#818cf8",
  rs: "#f59e0b",
  toml: "#f97316",
  py: "#4ade80",
  go: "#2dd4bf",
  default: "#6b7280",
};

function getNodeColor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return NODE_COLORS[ext] || NODE_COLORS.default;
}

export function GraphPage({ projectPath }: GraphPageProps) {
  const { graph, loading, refresh } = useGraph(projectPath);
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  const initCytoscape = useCallback((data: GraphData) => {
    if (!containerRef.current) return;

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const elements: cytoscape.ElementDefinition[] = [
      ...data.nodes.map((n: FileNode) => ({
        data: {
          id: n.id,
          label: n.label,
          path: n.path,
          changeCount: n.changeCount,
          color: getNodeColor(n.path),
        },
      })),
      ...data.edges.map((e: FileEdge) => ({
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          weight: e.weight,
          label: e.label,
        },
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            label: "data(label)",
            "font-size": "10px",
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 5,
            color: "#9ca3af",
            width: "mapData(changeCount, 1, 20, 18, 40)",
            height: "mapData(changeCount, 1, 20, 18, 40)",
            "border-width": 2,
            "border-color": "#1e293b",
            "border-opacity": 0.8,
            "background-opacity": 0.9,
            "font-family": "Inter, sans-serif",
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-color": "#818cf8",
            "border-width": 3,
            "border-opacity": 1,
          },
        },
        {
          selector: "edge",
          style: {
            width: "mapData(weight, 1, 10, 0.5, 2.5)",
            "line-color": "#334155",
            "target-arrow-color": "#475569",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": "8px",
            color: "#475569",
            "font-family": "Inter, sans-serif",
            "text-background-opacity": 1,
            "text-background-color": "#0f172a",
            "text-background-padding": "2px",
            "text-background-shape": "roundrectangle",
          },
        },
        {
          selector: "edge:selected",
          style: {
            "line-color": "#818cf8",
            "target-arrow-color": "#818cf8",
            width: 3,
          },
        },
      ],
      layout: {
        name: "cose",
        animate: false,
        nodeRepulsion: () => 4000,
        idealEdgeLength: () => 120,
        gravity: 0.25,
      },
      wheelSensitivity: 0.3,
      minZoom: 0.3,
      maxZoom: 3,
    });

    cyRef.current = cy;
  }, []);

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

  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;

  return (
    <div className="co-page flex flex-col p-6 space-y-4">
      {/* Toolbar */}
      <div className="co-graph-toolbar co-animate-fade-in flex items-center justify-between rounded-lg">
        <div className="flex items-center gap-3">
          <Share2 size={22} color="var(--co-accent)" />
          <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--co-text)" }}>
            File Relationship Graph
          </h2>
          {graph && (
            <div className="flex items-center gap-2 ml-2">
              <span className="co-badge co-badge-secondary text-[10px] font-normal">
                {nodeCount} nodes
              </span>
              <span className="co-badge co-badge-secondary text-[10px] font-normal">
                {edgeCount} edges
              </span>
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw
            size={14}
            className={loading ? "animate-spin" : ""}
          />
          Refresh
        </Button>
      </div>

      {/* Graph canvas */}
      <div className="co-animate-fade-in flex-1" style={{ minHeight: 0 }}>
        <Card className="h-full overflow-hidden">
          <CardContent className="p-0 h-full">
            {loading && !graph ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <RefreshCw
                  size={24}
                  color="var(--co-text-muted)"
                  className="animate-spin"
                />
                <p style={{ color: "var(--co-text-muted)" }} className="text-sm">
                  Building graph...
                </p>
              </div>
            ) : graph && graph.nodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <Share2
                  size={36}
                  color="var(--co-text-dim)"
                  className="mb-3 opacity-30"
                />
                <p style={{ color: "var(--co-text-muted)" }} className="text-sm font-medium">
                  No graph data available
                </p>
                <p style={{ color: "var(--co-text-dim)" }} className="text-xs mt-1">
                  File changes will generate graph relationships
                </p>
              </div>
            ) : (
              <div
                ref={containerRef}
                className="co-graph-container"
                style={{ minHeight: "500px" }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
