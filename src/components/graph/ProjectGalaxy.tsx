// ProjectGalaxy — Immersive 3D Galaxy Visualization
// react-force-graph-3d + Three.js custom nodes + Bloom post-processing
// Integration: reads from Rust scan_directory via @/hooks/useObservatory

import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import ForceGraph3D, { type ForceGraphMethods, type NodeObject } from "react-force-graph-3d";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { useScanGraph } from "@/hooks/useObservatory";
import type { FileNode, FileEdge } from "@/lib/types";
import { FolderOpen, File, Hash, Clock, X } from "lucide-react";

// ══════════════════════════════════════════════════
// Colors — hex only
// ══════════════════════════════════════════════════
const EXT_COLORS: Record<string, string> = {
  ts: "#5b8def", tsx: "#6b9df0", js: "#56b6c2", jsx: "#66c6d2",
  rs: "#e07050", md: "#c084fc",
  json: "#d4b040", toml: "#d4b040", yaml: "#d4b040", yml: "#d4b040",
  css: "#50b070", scss: "#60c080", html: "#e89050",
  py: "#40b8d0", c: "#8899aa", h: "#8899aa", cpp: "#8899aa", go: "#60b0d0",
};
const DEFAULT_COLOR = "#8ba0c0";
const DIR_COLOR_CYAN = "#00e5ff";
const DIR_COLOR_PURPLE = "#b44cff";
const ROOT_COLOR = "#ffffff";

// ══════════════════════════════════════════════════
// Data Transform
// ══════════════════════════════════════════════════
interface FGNode {
  id: string;
  name: string;
  path: string;
  type: "root" | "dir" | "file";
  color: string;
  val: number;
  extension?: string;
  size?: number;
}

interface FGLink {
  source: string;
  target: string;
}

function toFGData(nodes: FileNode[], edges: FileEdge[]) {
  const targeted = new Set(edges.map((e) => e.target));
  const root = nodes.find((n) => !targeted.has(n.id));
  const depth = new Map<string, number>();
  if (root) {
    depth.set(root.id, 0);
    const children = new Map<string, string[]>();
    for (const e of edges) {
      const list = children.get(e.source) || [];
      list.push(e.target);
      children.set(e.source, list);
    }
    const q = [root.id];
    while (q.length) {
      const cur = q.shift()!;
      for (const c of children.get(cur) || []) {
        if (!depth.has(c)) { depth.set(c, (depth.get(cur) || 0) + 1); q.push(c); }
      }
    }
  }

  const fgNodes: FGNode[] = nodes.map((n) => {
    const isRoot = n.id === root?.id;
    const d = depth.get(n.id) ?? 99;
    const isDir = n.kind === "dir";
    return {
      id: n.id,
      name: n.label,
      path: n.path,
      type: isRoot ? "root" : isDir ? "dir" : "file",
      color: isRoot ? ROOT_COLOR
        : isDir ? (d === 1 ? DIR_COLOR_CYAN : DIR_COLOR_PURPLE)
        : EXT_COLORS[n.extension?.toLowerCase() ?? ""] || DEFAULT_COLOR,
      val: isRoot ? 12 : isDir ? (d === 1 ? 6 : 4) : 2,
      extension: n.extension,
      size: n.size,
    };
  });

  const fgLinks: FGLink[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
  }));

  return { nodes: fgNodes, links: fgLinks };
}

// ══════════════════════════════════════════════════
// Bloom Setup — attaches to ForceGraph3D's internal renderer
// ══════════════════════════════════════════════════
function useBloom(fgRef: React.RefObject<ForceGraphMethods | undefined>) {
  useEffect(() => {
    const interval = setInterval(() => {
      const fg = fgRef.current as any;
      if (!fg) return;
      const renderer = fg.renderer?.();
      const scene = fg.scene?.();
      const camera = fg.camera?.();
      if (!renderer || !scene || !camera) return;

      if ((renderer as any).__bloomApplied) { clearInterval(interval); return; }
      (renderer as any).__bloomApplied = true;

      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.5, 0.4, 0.85
      );
      bloom.threshold = 0.1;
      bloom.strength = 1.8;
      bloom.radius = 0.8;
      composer.addPass(bloom);

      const origRender = renderer.render.bind(renderer);
      renderer.render = () => composer.render();
      clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [fgRef]);
}

// ══════════════════════════════════════════════════
// Info Popup
// ══════════════════════════════════════════════════
function InfoPanel({ node, onClose }: { node: FGNode; onClose: () => void }) {
  const isDir = node.type === "dir" || node.type === "root";
  return (
    <div className="absolute top-20 right-6 w-72 z-30 rounded-xl p-5"
      style={{ background: "rgba(8,4,24,0.95)", border: "1px solid rgba(100,96,255,0.2)", backdropFilter: "blur(20px)" }}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          {isDir ? <FolderOpen size={18} color="#00e5ff" /> : <File size={18} color="#8880ff" />}
          <span className="text-sm font-semibold" style={{ color: "#e8e0f0" }}>{node.name}</span>
        </div>
        <button onClick={onClose}><X size={14} color="#8070a0" /></button>
      </div>
      <div className="space-y-1.5 text-xs" style={{ color: "#8070a0" }}>
        <p className="break-all">{node.path}</p>
        <div className="flex gap-4 mt-2">
          <span className="flex items-center gap-1"><Hash size={10} /> {node.type}</span>
          {node.size != null && node.size > 0 && (
            <span className="flex items-center gap-1"><Clock size={10} /> {node.size < 1024 ? `${node.size}B` : `${(node.size / 1024).toFixed(1)}KB`}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════
interface ProjectGalaxyProps {
  projectPath: string;
  fullscreen?: boolean;
}

export default function ProjectGalaxy({ projectPath, fullscreen = false }: ProjectGalaxyProps) {
  const fgRef = useRef<ForceGraphMethods>();
  const { graph, loading, refresh } = useScanGraph(projectPath);
  const [selected, setSelected] = useState<FGNode | null>(null);
  const [dimensions, setDimensions] = useState({ w: window.innerWidth, h: window.innerHeight });

  // Attach Bloom to ForceGraph3D's renderer
  useBloom(fgRef);

  useEffect(() => {
    const onResize = () => setDimensions({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const fgData = useMemo(
    () => (graph ? toFGData(graph.nodes, graph.edges) : { nodes: [], links: [] }),
    [graph]
  );

  const nodeCount = fgData.nodes.length;
  const dirCount = fgData.nodes.filter((n) => n.type !== "file").length;

  // Custom 3D node object
  const nodeThreeObject = useCallback((node: any) => {
    const n = node as FGNode;
    const group = new THREE.Group();
    const r = n.type === "root" ? 1.5 : n.type === "dir" ? 0.7 : 0.3;
    const segs = n.type === "file" ? 8 : 24;

    // Main sphere
    const geo = new THREE.SphereGeometry(r, segs, segs);
    const mat = new THREE.MeshStandardMaterial({
      color: n.color,
      emissive: n.color,
      emissiveIntensity: n.type === "root" ? 2.5 : n.type === "dir" ? 1.0 : 0.6,
      roughness: 0.25,
      metalness: 0.15,
    });
    group.add(new THREE.Mesh(geo, mat));

    // Glow ring for directories
    if (n.type !== "file") {
      const ringGeo = new THREE.RingGeometry(r * 1.5, r * 2.2, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: n.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.15,
      });
      group.add(new THREE.Mesh(ringGeo, ringMat));
    }

    return group;
  }, []);

  // Swirling star particles background
  const BackgroundStars = useMemo(() => {
    const count = 3000;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 30 + Math.random() * 120;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.3, 0.4, 0.3 + Math.random() * 0.5);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "#000011" }}>
      {/* ── ForceGraph3D ── */}
      {!loading && fgData.nodes.length > 0 ? (
        <ForceGraph3D
          ref={fgRef}
          graphData={fgData}
          width={dimensions.w - (fullscreen ? 0 : 200)}
          height={dimensions.h - 48}
          backgroundColor="#000011"
          showNavInfo={false}
          // Node
          nodeThreeObject={nodeThreeObject}
          nodeVal={(n: any) => (n as FGNode).val}
          // Link
          linkWidth={0.3}
          linkColor={() => "rgba(100,80,200,0.15)"}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleWidth={1.5}
          linkDirectionalParticleColor={() => "#8880ff"}
          // Force
          d3VelocityDecay={0.3}
          d3AlphaDecay={0.02}
          cooldownTicks={300}
          // Interaction
          onNodeClick={(n: any) => setSelected(n as FGNode)}
          onBackgroundClick={() => setSelected(null)}
          // Fog
          enableNodeDrag={true}
          // Extra scene objects
          extraRenderers={[]}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full">
          {loading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: "rgba(100,96,255,0.15)", borderTopColor: "#8880ff" }} />
              <p style={{ color: "#8070a0", fontSize: 13 }}>Scanning galaxy...</p>
            </div>
          ) : (
            <p style={{ color: "#8070a0", fontSize: 13 }}>No project data</p>
          )}
        </div>
      )}

      {/* ── Overlays ── */}
      <div className="absolute top-6 left-8 pointer-events-none select-none">
        <h1 className="text-2xl font-extrabold tracking-[0.12em]"
          style={{ color: "#e8e0f0", textShadow: "0 0 40px rgba(136,128,255,0.4)", fontFamily: "system-ui, sans-serif" }}>
          PROJECT GALAXY
        </h1>
        <p style={{ color: "#8070a0", fontSize: 12, marginTop: 4 }}>
          {nodeCount > 0 ? `${dirCount} planets · ${nodeCount - dirCount} stars · ${fgData.links.length} orbits` : "Awaiting project..."}
        </p>
      </div>

      {selected && <InfoPanel node={selected} onClose={() => setSelected(null)} />}

      <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
        <div className="flex items-center gap-5 px-5 py-2 rounded-full text-xs"
          style={{ background: "rgba(8,4,24,0.7)", border: "1px solid rgba(100,96,255,0.12)", color: "#8070a0", backdropFilter: "blur(12px)" }}>
          <span>{nodeCount} nodes</span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span>{fgData.links.length} edges</span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span>Drag · Scroll · Click to inspect</span>
        </div>
      </div>

      <button onClick={refresh}
        className="absolute top-6 right-6 z-20 w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ background: "rgba(8,4,24,0.6)", border: "1px solid rgba(100,96,255,0.15)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8070a0" strokeWidth="2">
          <path d="M1 4v6h6M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      </button>
    </div>
  );
}
