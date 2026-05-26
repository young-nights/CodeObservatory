// Graph page - Cytoscape.js file relationship visualization

import { useEffect, useRef, useCallback } from "react";
import cytoscape, { type Core } from "cytoscape";
import { Card, CardContent, Button } from "@/components/ui/base";
import { useGraph } from "@/hooks/useObservatory";
import type { GraphData, FileNode, FileEdge } from "@/lib/types";
import { Share2, RefreshCw } from "lucide-react";

interface GraphPageProps {
  projectPath: string;
}

// Color palette for node categories
const NODE_COLORS: Record<string, string> = {
  ts: "#3178c6",
  tsx: "#61dafb",
  js: "#f7df1e",
  jsx: "#61dafb",
  css: "#1572b6",
  html: "#e34f26",
  json: "#5e5e5e",
  md: "#42a5f5",
  rs: "#dea584",
  toml: "#9c4221",
  default: "#9ca3af",
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

    // Destroy previous instance
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
            "text-margin-y": 4,
            color: "#374151",
            width: 24,
            height: 24,
            "border-width": 1,
            "border-color": "#e5e7eb",
          },
        },
        {
          selector: "edge",
          style: {
            width: "mapData(weight, 1, 10, 1, 4)",
            "line-color": "#d1d5db",
            "target-arrow-color": "#d1d5db",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": "8px",
            color: "#9ca3af",
          },
        },
      ],
      layout: {
        name: "cose",
        animate: false,
        nodeRepulsion: () => 4000,
        idealEdgeLength: () => 100,
      },
      wheelSensitivity: 0.3,
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
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

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">File Relationship Graph</h2>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      <Card className="flex-1">
        <CardContent className="p-0 h-full">
          {loading && !graph ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">Building graph...</p>
            </div>
          ) : graph && graph.nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Share2 size={32} className="mb-2 opacity-40" />
              <p>No graph data available</p>
              <p className="text-xs mt-1">File changes will generate graph relationships</p>
            </div>
          ) : (
            <div ref={containerRef} className="w-full h-full min-h-[500px]" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
