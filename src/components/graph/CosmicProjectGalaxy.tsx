// CosmicProjectGalaxy — ForceGraph3D + Bloom + Starfield + Full Interaction
// Step 1-6: Node colors/size, Link colors, Bloom, Click fly-to, Starfield, Force layout

import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import * as api from "@/lib/api";
import type { GraphData } from "@/lib/types";
import { X } from "lucide-react";

// ══════════════════════════════════════════════════
// Color Palette — rich, diverse, high-contrast
// ══════════════════════════════════════════════════
const COLORS = {
  bg: "#000011",
  // Directory colors (warm gold/yellow family)
  dirRoot: "#ffe070",     // project root — bright warm gold
  dirToplevel: "#ffc040",  // top-level dirs
  dirDeep: "#e0a030",      // deep dirs
  // Source code (cool cyan/teal family)
  ts: "#40d0ff", tsx: "#50c0ff", js: "#40e0a0", jsx: "#50d0b0",
  rs: "#ff7050", py: "#50c0e0", go: "#40b0d0", java: "#e0a040",
  c: "#90b0d0", cpp: "#90b0d0", h: "#90b0d0", hpp: "#90b0d0",
  vue: "#40d090", svelte: "#ff5030", kt: "#9060ff", swift: "#ff7040",
  rb: "#e05040", lua: "#5090d0", php: "#8070c0",
  // Document (bright white/cream)
  md: "#f0f0ff", mdx: "#e8e8ff", rst: "#e0e0f0", txt: "#d0d0e0",
  // Config/data (orange/green/purple)
  json: "#f0c050", toml: "#e0b040", yaml: "#d0a060", yml: "#d0a060",
  css: "#50c080", scss: "#60d090", html: "#e08050", xml: "#c07050",
  svg: "#d09060",
  default: "#a0b0c0",
  // Edges
  edgeDir: "#6080b0",    // directory connections
  edgeFile: "#406090",   // file connections
  edgeRoot: "#c0a050",   // root connections
};

function getNodeColor(node: any): string {
  if (node.kind === "dir") {
    if (node.depth === 0) return COLORS.dirRoot;
    if (node.depth === 1) return COLORS.dirToplevel;
    return COLORS.dirDeep;
  }
  const ext = (node.extension || "").toLowerCase();
  return (COLORS as any)[ext] || COLORS.default;
}

function getNodeColorHex(node: any): THREE.Color {
  return new THREE.Color(getNodeColor(node));
}

// ══════════════════════════════════════════════════
// Starfield — 2-layer dynamic twinkling
// ══════════════════════════════════════════════════
function createStarfieldLayer(count: number, radius: number, sizeBase: number, opacity: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = radius * (0.3 + Math.random() * 0.7);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    size: sizeBase,
    color: "#c0d8ff",
    transparent: true,
    opacity,
    sizeAttenuation: true,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

function createStarfield(): THREE.Group {
  const group = new THREE.Group();
  group.add(createStarfieldLayer(5000, 250, 0.3, 0.4));  // far, small, dim
  group.add(createStarfieldLayer(3000, 150, 0.6, 0.6));  // near, larger, brighter
  return group;
}

// ══════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════
interface CosmicProjectGalaxyProps {
  projectPaths: string[];
  fullscreen?: boolean;
}

export default function CosmicProjectGalaxy({ projectPaths }: CosmicProjectGalaxyProps) {
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const fgRef = useRef<any>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const starfieldAdded = useRef(false);

  // ── Scan projects and merge ──
  useEffect(() => {
    if (!projectPaths || projectPaths.length === 0) { setGraphData(null); return; }
    let cancelled = false;
    async function load() {
      setLoading(true);
      const allNodes: any[] = [];
      const allLinks: any[] = [];
      const nodeIdSet = new Set<string>();

      for (let pi = 0; pi < projectPaths.length; pi++) {
        const pp = projectPaths[pi];
        try {
          const data: GraphData = await api.scanDirectory(pp);
          const pName = pp.split(/[\\/]/).pop() || `p${pi}`;
          const angle = (2 * Math.PI * pi) / projectPaths.length;
          const cr = 20 * Math.sqrt(projectPaths.length);
          const cx = cr * Math.cos(angle), cz = cr * Math.sin(angle);

          for (const n of data.nodes) {
            const nid = `${pp}::${n.id}`;
            if (nodeIdSet.has(nid)) continue;
            nodeIdSet.add(nid);
            const depth = n.path.split(/[\\/]/).length - pp.split(/[\\/]/).length;
            allNodes.push({
              id: nid, label: n.label, path: n.path, kind: n.kind,
              extension: n.extension, size: n.size, projectName: pName,
              projectPath: pp, depth,
              x: cx + (Math.random() - 0.5) * 12,
              y: (Math.random() - 0.5) * 12,
              z: cz + (Math.random() - 0.5) * 12,
            });
          }
          for (const e of data.edges) {
            const s = `${pp}::${e.source}`, t = `${pp}::${e.target}`;
            if (nodeIdSet.has(s) && nodeIdSet.has(t)) allLinks.push({ source: s, target: t });
          }
        } catch (err) { console.error(`Scan ${pp} failed:`, err); }
      }
      if (!cancelled) { setGraphData({ nodes: allNodes, links: allLinks }); setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [projectPaths]);

  // ── Degree map + adjacency for highlight ──
  const { degreeMap, adjacencyMap } = useMemo(() => {
    const deg = new Map<string, number>();
    const adj = new Map<string, Set<string>>();
    if (!graphData) return { degreeMap: deg, adjacencyMap: adj };
    for (const l of graphData.links) {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      deg.set(s, (deg.get(s) || 0) + 1);
      deg.set(t, (deg.get(t) || 0) + 1);
      if (!adj.has(s)) adj.set(s, new Set());
      if (!adj.has(t)) adj.set(t, new Set());
      adj.get(s)!.add(t);
      adj.get(t)!.add(s);
    }
    return { degreeMap: deg, adjacencyMap: adj };
  }, [graphData]);

  // ── Setup bloom + starfield ──
  useEffect(() => {
    if (!fgRef.current) return;
    const fg = fgRef.current;
    if (!starfieldAdded.current) {
      const scene = fg.scene();
      if (scene) { scene.add(createStarfield()); starfieldAdded.current = true; }
    }
    if (!composerRef.current) {
      const r = fg.renderer?.(), s = fg.scene?.(), c = fg.camera?.();
      if (r && s && c) {
        const comp = new EffectComposer(r);
        comp.addPass(new RenderPass(s, c));
        comp.addPass(new UnrealBloomPass(
          new THREE.Vector2(window.innerWidth, window.innerHeight),
          2.2, 0.8, 0.15  // strong bloom for star-burst effect
        ));
        composerRef.current = comp;
      }
    }
    fg.cameraPosition({ x: 0, y: 80, z: 140 });
  }, [graphData]);

  // ── Node click: fly-to + info card ──
  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node);
    if (fgRef.current) {
      fgRef.current.cameraPosition(
        { x: node.x * 1.5, y: node.y * 1.5 + 20, z: node.z * 1.5 + 30 },
        { x: node.x, y: node.y, z: node.z },
        1500
      );
    }
  }, []);

  // ── Node hover: show label + highlight ──
  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node ? node.id : null);
  }, []);

  // ── Node label ──
  const nodeLabel = useCallback((node: any) => {
    return `<div style="background:rgba(8,4,32,0.9);padding:4px 8px;border-radius:4px;color:#e0d8f0;font-size:12px;white-space:nowrap;">${node.label}</div>`;
  }, []);

  // ── Link color: gradient-like by source node color ──
  const linkColor = useCallback((link: any) => {
    const src = typeof link.source === "object" ? link.source : null;
    if (src) return getNodeColor(src);
    return COLORS.edgeFile;
  }, []);

  // ── Link width: thinner for files, thicker for dirs ──
  const linkWidth = useCallback((link: any) => {
    const src = typeof link.source === "object" ? link.source : null;
    if (src?.kind === "dir") return 0.8;
    return 0.3;
  }, []);

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="relative w-full h-full" style={{ background: COLORS.bg }}>
        <div className="flex flex-col items-center justify-center h-full">
          {loading ? (
            <>
              <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mb-4"
                style={{ borderColor: "rgba(100,96,255,0.2)", borderTopColor: "#8880ff" }} />
              <p style={{ color: "#8070a0", fontSize: 13 }}>Scanning galaxy...</p>
            </>
          ) : (
            <p style={{ color: "#8070a0", fontSize: 13 }}>No data available</p>
          )}
        </div>
      </div>
    );
  }

  const nodeCount = graphData.nodes.length;
  const edgeCount = graphData.links.length;
  const dirCount = graphData.nodes.filter((n) => n.kind === "dir").length;
  const fileCount = nodeCount - dirCount;

  return (
    <div className="relative w-full h-full" style={{ background: COLORS.bg }}>
      {/* ── 3D Force Graph ── */}
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        backgroundColor={COLORS.bg}
        width={typeof window !== "undefined" ? window.innerWidth : 1200}
        height={typeof window !== "undefined" ? window.innerHeight : 800}
        showNavInfo={false}
        // ── Node: size by degree with big range ──
        nodeVal={(node: any) => {
          const deg = degreeMap.get(node.id) || 0;
          const base = node.kind === "dir" ? 5 : 2;
          return base + deg * 0.6; // big degree → big node
        }}
        nodeColor={(node: any) => getNodeColor(node)}
        nodeOpacity={0.95}
        nodeResolution={24}
        nodeLabel={nodeLabel}
        nodeThreeObject={(node: any) => {
          const deg = degreeMap.get(node.id) || 0;
          const isDir = node.kind === "dir";
          const isRoot = node.depth === 0;
          const baseSize = isRoot ? 4 : isDir ? 2.2 : 1.0;
          const size = baseSize + deg * 0.25;
          const color = getNodeColorHex(node);
          const isHovered = hoveredNode === node.id;
          const isConnected = hoveredNode ? adjacencyMap.get(hoveredNode)?.has(node.id) : false;
          const dimmed = hoveredNode && !isHovered && !isConnected;

          const group = new THREE.Group();

          // Core sphere
          const geo = new THREE.SphereGeometry(size, 24, 24);
          const mat = new THREE.MeshStandardMaterial({
            color: dimmed ? new THREE.Color(getNodeColor(node)).multiplyScalar(0.3) : color,
            emissive: dimmed ? new THREE.Color("#000000") : color,
            emissiveIntensity: isRoot ? 4 : isDir ? 2.5 : isHovered ? 2.5 : 1.5,
            roughness: 0.1,
            metalness: 0.1,
            transparent: true,
            opacity: dimmed ? 0.3 : 0.95,
            toneMapped: false,
          });
          group.add(new THREE.Mesh(geo, mat));

          // Glow sphere (outer halo)
          if (!dimmed) {
            const glowSize = isRoot ? size * 4 : isDir ? size * 3 : size * 2.5;
            const glowGeo = new THREE.SphereGeometry(glowSize, 16, 16);
            const glowMat = new THREE.MeshBasicMaterial({
              color,
              transparent: true,
              opacity: isRoot ? 0.25 : isDir ? 0.12 : isHovered ? 0.15 : 0.06,
              side: THREE.BackSide,
              toneMapped: false,
            });
            group.add(new THREE.Mesh(glowGeo, glowMat));
          }

          return group;
        }}
        nodeThreeObjectExtend={false}
        // ── Links: colorful, thin, organic ──
        linkColor={linkColor}
        linkOpacity={0.25}
        linkWidth={linkWidth}
        linkCurvature={0.08}
        linkResolution={6}
        linkDirectionalParticles={(link: any) => {
          const src = typeof link.source === "object" ? link.source : null;
          return src?.kind === "dir" ? 2 : 0;
        }}
        linkDirectionalParticleWidth={0.5}
        linkDirectionalParticleColor={linkColor}
        // ── Force engine: explosive center + loose spread ──
        d3AlphaDecay={0.015}
        d3VelocityDecay={0.25}
        warmupTicks={80}
        cooldownTicks={150}
        cooldownTime={8000}
        // ── Interaction ──
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onBackgroundClick={() => { setSelectedNode(null); }}
      />

      {/* ── Title Overlay ── */}
      <div className="absolute top-6 left-8 z-10 select-none pointer-events-none"
        style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <h1 className="text-2xl font-extrabold tracking-[0.15em]"
          style={{ color: "#e8e0f0", textShadow: "0 0 40px rgba(200,180,100,0.3)" }}>
          {new Set(graphData.nodes.map((n: any) => n.projectPath)).size > 1
            ? "GALAXY CLUSTER" : "PROJECT GALAXY"}
        </h1>
        <p style={{ color: "#8070a0", fontSize: 12, marginTop: 2 }}>
          {nodeCount > 0 ? `${dirCount} planets · ${fileCount} stars · ${edgeCount} orbits` : "Awaiting project..."}
        </p>
      </div>

      {/* ── Node Info Card ── */}
      {selectedNode && (
        <div className="absolute top-20 right-6 w-80 rounded-xl p-5 z-20 animate-in fade-in slide-in-from-right-4"
          style={{
            background: "rgba(8,4,32,0.95)",
            border: "1px solid rgba(100,96,255,0.25)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-base font-bold truncate" style={{ color: "#f0e8ff" }}>
              {selectedNode.label}
            </span>
            <button onClick={() => setSelectedNode(null)}
              className="p-1 rounded hover:bg-white/10 flex-shrink-0 ml-2">
              <X size={14} color="#8070a0" />
            </button>
          </div>
          <p className="break-all text-xs mb-3" style={{ color: "#8070a0" }}>
            {selectedNode.path}
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: getNodeColor(selectedNode) + "20", color: getNodeColor(selectedNode) }}>
              {selectedNode.kind === "dir" ? "📁 Directory" : `📄 .${selectedNode.extension || "file"}`}
            </span>
            {selectedNode.size != null && selectedNode.size > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs"
                style={{ background: "rgba(100,96,255,0.1)", color: "#8070a0" }}>
                {selectedNode.size < 1024 ? `${selectedNode.size}B` : `${(selectedNode.size / 1024).toFixed(1)}KB`}
              </span>
            )}
          </div>
          <div className="flex gap-4 text-xs" style={{ color: "#6050a0" }}>
            <span>🔗 {(adjacencyMap.get(selectedNode.id)?.size || 0)} connections</span>
            <span>📁 {selectedNode.projectName}</span>
          </div>
        </div>
      )}

      {/* ── Bottom Bar ── */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10 pointer-events-none">
        <div className="flex items-center gap-6 px-5 py-2 rounded-full text-xs"
          style={{
            background: "rgba(8,4,32,0.7)", border: "1px solid rgba(100,96,255,0.15)",
            color: "#8070a0", backdropFilter: "blur(12px)",
          }}>
          <span>{nodeCount} nodes</span>
          <span style={{ color: "rgba(128,112,160,0.4)" }}>|</span>
          <span>{edgeCount} edges</span>
          <span style={{ color: "rgba(128,112,160,0.4)" }}>|</span>
          <span>Drag · Scroll · Click stars</span>
        </div>
      </div>
    </div>
  );
}
