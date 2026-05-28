// CosmicProjectGalaxy — ForceGraph3D + Extreme Bloom + Rich Colors
// Target: https://meet-blog.buyixiao.xyz/ — dense multi-color galaxy explosion

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
// Color System — maximum diversity
// ══════════════════════════════════════════════════
const NODE_COLORS: Record<string, string> = {
  // Directories — warm gold family (varied by depth)
  "_dir_root": "#ffe070",
  "_dir_1": "#ffd040",
  "_dir_2": "#e8b030",
  "_dir_default": "#d0a020",
  // Source code — cool cyan/teal
  "ts": "#00e5ff", "tsx": "#00d4ee", "js": "#40e0d0", "jsx": "#50d0c0",
  "rs": "#ff6050", "py": "#00bcd4", "go": "#00acc1", "java": "#ff8f00",
  "c": "#78909c", "cpp": "#78909c", "h": "#90a4ae", "hpp": "#90a4ae",
  "vue": "#4caf50", "svelte": "#ff3d00", "kt": "#7c4dff", "swift": "#ff6e40",
  "rb": "#e53935", "lua": "#5c6bc0", "php": "#7e57c2",
  // Documents — bright white/cream
  "md": "#ffffff", "mdx": "#f5f5ff", "rst": "#e8e8f0", "txt": "#d0d0e0",
  // Styles — green family
  "css": "#66bb6a", "scss": "#81c784", "less": "#a5d6a7", "sass": "#69f0ae",
  // Markup
  "html": "#ff7043", "xml": "#ff8a65", "svg": "#ffab91",
  // Config/data — orange/yellow
  "json": "#ffd54f", "toml": "#ffca28", "yaml": "#ffc107", "yml": "#ffb300",
  // Default
  "_default": "#b0bec5",
};

function getNodeColor(node: any): string {
  if (node.kind === "dir") {
    if (node.depth === 0) return NODE_COLORS["_dir_root"];
    if (node.depth === 1) return NODE_COLORS["_dir_1"];
    if (node.depth === 2) return NODE_COLORS["_dir_2"];
    return NODE_COLORS["_dir_default"];
  }
  const ext = (node.extension || "").toLowerCase();
  return NODE_COLORS[ext] || NODE_COLORS["_default"];
}

// ══════════════════════════════════════════════════
// Starfield — multi-layer depth
// ══════════════════════════════════════════════════
function createStarfield(): THREE.Group {
  const group = new THREE.Group();
  const layers = [
    { count: 4000, radius: 300, size: 0.2, opacity: 0.3 },   // far dim
    { count: 3000, radius: 200, size: 0.5, opacity: 0.5 },   // mid
    { count: 2000, radius: 120, size: 0.8, opacity: 0.7 },   // near bright
  ];
  for (const { count, radius, size, opacity } of layers) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const θ = Math.random() * Math.PI * 2;
      const φ = Math.acos(2 * Math.random() - 1);
      const r = radius * (0.3 + Math.random() * 0.7);
      pos[i * 3] = r * Math.sin(φ) * Math.cos(θ);
      pos[i * 3 + 1] = r * Math.sin(φ) * Math.sin(θ);
      pos[i * 3 + 2] = r * Math.cos(φ);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const colors = ["#c8d8ff", "#d0e0ff", "#e0e8ff"];
    group.add(new THREE.Points(geo, new THREE.PointsMaterial({
      size, color: colors[Math.floor(Math.random() * colors.length)],
      transparent: true, opacity, sizeAttenuation: true, depthWrite: false,
    })));
  }
  return group;
}

// ══════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════
interface Props { projectPaths: string[]; fullscreen?: boolean; }

export default function CosmicProjectGalaxy({ projectPaths }: Props) {
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const fgRef = useRef<any>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const sfAdded = useRef(false);

  // ── Scan + merge ──
  useEffect(() => {
    if (!projectPaths?.length) { setGraphData(null); return; }
    let dead = false;
    (async () => {
      setLoading(true);
      const nodes: any[] = [], links: any[] = [];
      const seen = new Set<string>();
      for (let pi = 0; pi < projectPaths.length; pi++) {
        const pp = projectPaths[pi];
        try {
          const d: GraphData = await api.scanDirectory(pp);
          const ang = (2 * Math.PI * pi) / projectPaths.length;
          const R = 20 * Math.sqrt(projectPaths.length);
          const cx = R * Math.cos(ang), cz = R * Math.sin(ang);
          for (const n of d.nodes) {
            const id = `${pp}::${n.id}`;
            if (seen.has(id)) continue; seen.add(id);
            nodes.push({
              id, label: n.label, path: n.path, kind: n.kind,
              extension: n.extension, size: n.size,
              projectName: pp.split(/[\\/]/).pop(), projectPath: pp,
              depth: n.path.split(/[\\/]/).length - pp.split(/[\\/]/).length,
              x: cx + (Math.random() - 0.5) * 14,
              y: (Math.random() - 0.5) * 14,
              z: cz + (Math.random() - 0.5) * 14,
            });
          }
          for (const e of d.edges) {
            const s = `${pp}::${e.source}`, t = `${pp}::${e.target}`;
            if (seen.has(s) && seen.has(t)) links.push({ source: s, target: t });
          }
        } catch (e) { console.error(e); }
      }
      if (!dead) { setGraphData({ nodes, links }); setLoading(false); }
    })();
    return () => { dead = true; };
  }, [projectPaths]);

  // ── Degree + adjacency ──
  const { deg, adj } = useMemo(() => {
    const d = new Map<string, number>(), a = new Map<string, Set<string>>();
    if (!graphData) return { deg: d, adj: a };
    for (const l of graphData.links) {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      d.set(s, (d.get(s) || 0) + 1);
      d.set(t, (d.get(t) || 0) + 1);
      if (!a.has(s)) a.set(s, new Set());
      if (!a.has(t)) a.set(t, new Set());
      a.get(s)!.add(t); a.get(t)!.add(s);
    }
    return { deg: d, adj: a };
  }, [graphData]);

  // ── Scene setup ──
  useEffect(() => {
    if (!fgRef.current) return;
    const fg = fgRef.current;
    if (!sfAdded.current) {
      const sc = fg.scene?.();
      if (sc) { sc.add(createStarfield()); sfAdded.current = true; }
    }
    if (!composerRef.current) {
      const r = fg.renderer?.(), s = fg.scene?.(), c = fg.camera?.();
      if (r && s && c) {
        const comp = new EffectComposer(r);
        comp.addPass(new RenderPass(s, c));
        comp.addPass(new UnrealBloomPass(
          new THREE.Vector2(window.innerWidth, window.innerHeight),
          2.5,   // strength — very strong for star-burst
          1.0,   // radius — wide glow
          0.08   // threshold — catch most nodes
        ));
        composerRef.current = comp;
      }
    }
    fg.cameraPosition({ x: 0, y: 80, z: 150 });
  }, [graphData]);

  // ── Interaction ──
  const onNodeClick = useCallback((node: any) => {
    setSelectedNode(node);
    fgRef.current?.cameraPosition(
      { x: node.x * 1.5, y: node.y * 1.5 + 20, z: node.z * 1.5 + 30 },
      { x: node.x, y: node.y, z: node.z }, 1500
    );
  }, []);

  const onNodeHover = useCallback((n: any) => setHoveredNode(n?.id ?? null), []);

  const nodeLabel = useCallback((n: any) =>
    `<div style="background:rgba(8,4,32,0.92);padding:4px 10px;border-radius:6px;color:#f0e8ff;font-size:12px;white-space:nowrap;border:1px solid rgba(100,96,255,0.3)">${n.label}</div>`, []);

  if (!graphData?.nodes.length) {
    return (
      <div className="relative w-full h-full" style={{ background: "#000011" }}>
        <div className="flex flex-col items-center justify-center h-full">
          {loading && <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mb-4" style={{ borderColor: "rgba(100,96,255,0.2)", borderTopColor: "#8880ff" }} />}
          <p style={{ color: "#8070a0", fontSize: 13 }}>{loading ? "Scanning galaxy..." : "No data available"}</p>
        </div>
      </div>
    );
  }

  const nc = graphData.nodes.length, ec = graphData.links.length;
  const dc = graphData.nodes.filter(n => n.kind === "dir").length;

  return (
    <div className="relative w-full h-full" style={{ background: "#000011" }}>
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        backgroundColor="#000011"
        width={window.innerWidth}
        height={window.innerHeight}
        showNavInfo={false}
        // ── Node: big size range + rich colors ──
        nodeVal={(n: any) => {
          const d = deg.get(n.id) || 0;
          return (n.kind === "dir" ? 5 : 2) + d * 0.8; // BIG range
        }}
        nodeColor={(n: any) => getNodeColor(n)}
        nodeOpacity={0.95}
        nodeResolution={24}
        nodeLabel={nodeLabel}
        nodeThreeObject={(node: any) => {
          const d = deg.get(node.id) || 0;
          const isDir = node.kind === "dir";
          const isRoot = node.depth === 0;
          // Size: root 5, dir 3, file 1.2, + degree scaling
          const sz = (isRoot ? 5 : isDir ? 3 : 1.2) + d * 0.35;
          const col = new THREE.Color(getNodeColor(node));
          const isHov = hoveredNode === node.id;
          const isConnected = hoveredNode ? adj.get(hoveredNode)?.has(node.id) : false;
          const dimmed = hoveredNode && !isHov && !isConnected;

          const g = new THREE.Group();

          // Core sphere — bright, emissive
          const coreMat = new THREE.MeshStandardMaterial({
            color: dimmed ? col.clone().multiplyScalar(0.2) : col,
            emissive: dimmed ? new THREE.Color(0) : col,
            emissiveIntensity: isRoot ? 5 : isDir ? 3 : isHov ? 3.5 : 1.8,
            roughness: 0.08,
            metalness: 0.15,
            transparent: true,
            opacity: dimmed ? 0.2 : 0.95,
            toneMapped: false,
          });
          g.add(new THREE.Mesh(new THREE.SphereGeometry(sz, 24, 24), coreMat));

          // Outer glow — big halo
          if (!dimmed) {
            const gs = isRoot ? sz * 5 : isDir ? sz * 3.5 : sz * 2.5;
            g.add(new THREE.Mesh(
              new THREE.SphereGeometry(gs, 16, 16),
              new THREE.MeshBasicMaterial({
                color: col, transparent: true,
                opacity: isRoot ? 0.3 : isDir ? 0.15 : isHov ? 0.2 : 0.06,
                side: THREE.BackSide, toneMapped: false,
              })
            ));
          }
          return g;
        }}
        nodeThreeObjectExtend={false}
        // ── Links: colorful, thin ──
        linkColor={(l: any) => {
          const s = typeof l.source === "object" ? l.source : null;
          return s ? getNodeColor(s) : "#6080b0";
        }}
        linkOpacity={0.2}
        linkWidth={(l: any) => {
          const s = typeof l.source === "object" ? l.source : null;
          return s?.kind === "dir" ? 1.0 : 0.4;
        }}
        linkCurvature={0.1}
        linkResolution={6}
        linkDirectionalParticles={(l: any) => {
          const s = typeof l.source === "object" ? l.source : null;
          return s?.kind === "dir" ? 3 : 0;
        }}
        linkDirectionalParticleWidth={0.6}
        linkDirectionalParticleSpeed={0.004}
        linkDirectionalParticleColor={(l: any) => {
          const s = typeof l.source === "object" ? l.source : null;
          return s ? getNodeColor(s) : "#80b0ff";
        }}
        // ── Force ──
        d3AlphaDecay={0.012}
        d3VelocityDecay={0.2}
        warmupTicks={60}
        cooldownTicks={100}
        cooldownTime={10000}
        // ── Events ──
        onNodeClick={onNodeClick}
        onNodeHover={onNodeHover}
        onBackgroundClick={() => setSelectedNode(null)}
      />

      {/* Title */}
      <div className="absolute top-6 left-8 z-10 select-none pointer-events-none" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <h1 className="text-2xl font-extrabold tracking-[0.15em]" style={{ color: "#e8e0f0", textShadow: "0 0 40px rgba(200,180,100,0.3)" }}>
          {new Set(graphData.nodes.map((n: any) => n.projectPath)).size > 1 ? "GALAXY CLUSTER" : "PROJECT GALAXY"}
        </h1>
        <p style={{ color: "#8070a0", fontSize: 12, marginTop: 2 }}>{dc} planets · {nc - dc} stars · {ec} orbits</p>
      </div>

      {/* Info Card */}
      {selectedNode && (
        <div className="absolute top-20 right-6 w-80 rounded-xl p-5 z-20"
          style={{ background: "rgba(8,4,32,0.95)", border: "1px solid rgba(100,96,255,0.25)", backdropFilter: "blur(12px)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-base font-bold truncate" style={{ color: "#f0e8ff" }}>{selectedNode.label}</span>
            <button onClick={() => setSelectedNode(null)} className="p-1 rounded hover:bg-white/10 ml-2 flex-shrink-0"><X size={14} color="#8070a0" /></button>
          </div>
          <p className="break-all text-xs mb-3" style={{ color: "#8070a0" }}>{selectedNode.path}</p>
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: getNodeColor(selectedNode) + "30", color: getNodeColor(selectedNode) }}>
              {selectedNode.kind === "dir" ? "📁 Directory" : `📄 .${selectedNode.extension || "file"}`}
            </span>
            {selectedNode.size > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: "rgba(100,96,255,0.1)", color: "#8070a0" }}>
                {selectedNode.size < 1024 ? `${selectedNode.size}B` : `${(selectedNode.size / 1024).toFixed(1)}KB`}
              </span>
            )}
          </div>
          <div className="flex gap-4 text-xs" style={{ color: "#6050a0" }}>
            <span>🔗 {adj.get(selectedNode.id)?.size || 0} connections</span>
          </div>
        </div>
      )}

      {/* Bottom Bar */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10 pointer-events-none">
        <div className="flex items-center gap-6 px-5 py-2 rounded-full text-xs"
          style={{ background: "rgba(8,4,32,0.7)", border: "1px solid rgba(100,96,255,0.15)", color: "#8070a0", backdropFilter: "blur(12px)" }}>
          <span>{nc} nodes</span><span style={{ color: "rgba(128,112,160,0.4)" }}>|</span>
          <span>{ec} edges</span><span style={{ color: "rgba(128,112,160,0.4)" }}>|</span>
          <span>Drag · Scroll · Click stars</span>
        </div>
      </div>
    </div>
  );
}
