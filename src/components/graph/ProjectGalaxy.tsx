// ProjectGalaxy — 3D Force Graph Galaxy + Obsidian-style settings panel
// react-force-graph-3d + UnrealBloomPass + directional particles

import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import ForceGraph3D, { type ForceGraphMethods } from "react-force-graph-3d";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { useScanGraph } from "@/hooks/useObservatory";
import { SettingsPanel } from "./SettingsPanel";
import type { FileNode, FileEdge } from "@/lib/types";
import { FolderOpen, File, Hash, Clock } from "lucide-react";

// ═══════════════════════════ Colors ═══════════════════════════
const EXT_COLORS: Record<string, string> = {
  ts: "#5b8def", tsx: "#6b9df0", js: "#56b6c2", jsx: "#66c6d2",
  rs: "#e07050", md: "#c084fc", json: "#d4b040", toml: "#d4b040",
  yaml: "#d4b040", yml: "#d4b040", css: "#50b070", scss: "#60c080",
  html: "#e89050", py: "#40b8d0", c: "#8899aa", h: "#8899aa",
  cpp: "#8899aa", go: "#60b0d0",
};
const DEFAULT_FILE = "#8ba0c0";
const DIR_CYAN = "#00e5ff";
const DIR_PURPLE = "#b44cff";
const ROOT_W = "#ffffff";

// ═══════════════════════════ Data transform ═══════════════════
interface FGNode {
  id: string; name: string; path: string; type: "root" | "dir" | "file";
  color: string; val: number; extension?: string; size?: number;
}
interface FGLink { source: string; target: string; }

function toFGData(nodes: FileNode[], edges: FileEdge[]) {
  const targeted = new Set(edges.map(e => e.target));
  const root = nodes.find(n => !targeted.has(n.id));
  const depth = new Map<string, number>();
  if (root) {
    depth.set(root.id, 0);
    const children = new Map<string, string[]>();
    for (const e of edges) {
      const l = children.get(e.source) || [];
      l.push(e.target); children.set(e.source, l);
    }
    const q = [root.id];
    while (q.length) {
      const c = q.shift()!;
      for (const ch of children.get(c) || []) {
        if (!depth.has(ch)) { depth.set(ch, (depth.get(c) || 0) + 1); q.push(ch); }
      }
    }
  }
  return {
    nodes: nodes.map(n => {
      const isRoot = n.id === root?.id;
      const d = depth.get(n.id) ?? 99;
      return {
        id: n.id, name: n.label, path: n.path,
        type: isRoot ? "root" : n.kind === "dir" ? "dir" : "file",
        color: isRoot ? ROOT_W : n.kind === "dir" ? (d === 1 ? DIR_CYAN : DIR_PURPLE) : (EXT_COLORS[n.extension?.toLowerCase() ?? ""] || DEFAULT_FILE),
        val: isRoot ? 12 : n.kind === "dir" ? (d === 1 ? 6 : 4) : 2,
        extension: n.extension, size: n.size,
      } as FGNode;
    }),
    links: edges.map(e => ({ source: e.source, target: e.target }) as FGLink),
  };
}

// ═══════════════════════════ Bloom injection ═══════════════════
function useBloom(fgRef: React.RefObject<ForceGraphMethods | undefined>, strength: number) {
  useEffect(() => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const fg = fgRef.current as any;
      if (!fg) return;
      const r = fg.renderer?.();
      const s = fg.scene?.();
      const c = fg.camera?.();
      if (!r || !s || !c) return;
      if ((r as any).__bloom) { clearInterval(interval); return; }
      (r as any).__bloom = true;
      const cmp = new EffectComposer(r);
      cmp.addPass(new RenderPass(s, c));
      const bp = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
      bp.threshold = 0.08; bp.strength = strength; bp.radius = 0.8;
      cmp.addPass(bp);
      const orig = r.render.bind(r);
      r.render = () => cmp.render();
      clearInterval(interval);
      // Store composer for strength updates
      (r as any).__bloomComposer = cmp;
      (r as any).__bloomPass = bp;
      if (attempts > 10) clearInterval(interval);
    }, 300);
    return () => clearInterval(interval);
  }, [fgRef, strength]);
}

// ═══════════════════════════ Component ═══════════════════════
interface GalaxySettings {
  nodeSize: number;
  edgeOpacity: number;
  bloomStrength: number;
  chargeStrength: number;
  linkDistance: number;
  linkStrength: number;
  centerGravity: number;
}

const DEFAULTS: GalaxySettings = {
  nodeSize: 1, edgeOpacity: 0.15, bloomStrength: 1.5,
  chargeStrength: -150, linkDistance: 20, linkStrength: 0.3, centerGravity: 0.1,
};

interface Props {
  projectPath: string;
  fullscreen?: boolean;
}

export default function ProjectGalaxy({ projectPath, fullscreen = false }: Props) {
  const fgRef = useRef<ForceGraphMethods>();
  const { graph, loading, refresh } = useScanGraph(projectPath);
  const [selected, setSelected] = useState<FGNode | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [settings, setSettings] = useState<GalaxySettings>(DEFAULTS);
  const [dim, setDim] = useState({ w: window.innerWidth, h: window.innerHeight });

  useBloom(fgRef, settings.bloomStrength);

  useEffect(() => {
    const onR = () => setDim({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  const data = useMemo(() => graph ? toFGData(graph.nodes, graph.edges) : { nodes: [], links: [] }, [graph]);

  // 3D node object
  const nodeObj = useCallback((node: any) => {
    const n = node as FGNode;
    const g = new THREE.Group();
    const r = n.type === "root" ? 1.4 : n.type === "dir" ? 0.6 : 0.25;
    const segs = n.type === "file" ? 8 : 24;
    const s = r * settings.nodeSize;

    // Main sphere
    const geo = new THREE.SphereGeometry(s, segs, segs);
    const mat = new THREE.MeshStandardMaterial({
      color: n.color, emissive: n.color,
      emissiveIntensity: n.type === "root" ? 2.5 : n.type === "dir" ? 1.2 : 0.7,
      roughness: 0.25, metalness: 0.1,
    });
    g.add(new THREE.Mesh(geo, mat));

    // Ring for dirs
    if (n.type !== "file") {
      const rg = new THREE.RingGeometry(s * 1.6, s * 2.3, 64);
      const rm = new THREE.MeshBasicMaterial({ color: n.color, side: THREE.DoubleSide, transparent: true, opacity: 0.12 });
      g.add(new THREE.Mesh(rg, rm));
    }
    return g;
  }, [settings.nodeSize]);

  // Blazing starfield background
  const bgStars = useMemo(() => {
    const count = 15000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 20 + Math.random() * 180;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      pos[i * 3 + 2] = r * Math.cos(ph);
      const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.35, 0.25 + Math.random() * 0.25, 0.5 + Math.random() * 0.5);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return geo;
  }, []);

  const nodeCount = data.nodes.length;
  const dirCount = data.nodes.filter(n => n.type !== "file").length;

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "#05050f" }}>
      {/* ── ForceGraph3D ── */}
      {!loading && data.nodes.length > 0 ? (
        <ForceGraph3D
          ref={fgRef}
          graphData={data}
          width={dim.w - (fullscreen ? 0 : 200) - (panelOpen ? 280 : 0)}
          height={dim.h - 48}
          backgroundColor="#05050f"
          showNavInfo={false}
          nodeThreeObject={nodeObj}
          nodeVal={(n: any) => (n as FGNode).val}
          linkWidth={0.3}
          linkColor={() => `rgba(100,80,200,${settings.edgeOpacity})`}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.003}
          linkDirectionalParticleWidth={1.2}
          linkDirectionalParticleColor={() => "#8880ff"}
          d3VelocityDecay={0.3}
          d3AlphaDecay={0.015}
          cooldownTicks={250}
          d3Force={(engine: any) => {
            const d3 = (window as any).d3 || (ForceGraph3D as any).d3;
            if (!d3) return;
            if (engine.force) {
              engine.force("charge", d3.forceManyBody?.()?.strength(settings.chargeStrength));
              engine.force("link", d3.forceLink?.()?.distance(settings.linkDistance)?.strength(settings.linkStrength));
              engine.force("center", d3.forceCenter?.()?.strength(settings.centerGravity));
            }
          }}
          onNodeClick={(n: any) => setSelected(n as FGNode)}
          onBackgroundClick={() => setSelected(null)}
          enableNodeDrag={true}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: "#8070a0", fontSize: 13 }}>
          {loading ? <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "rgba(100,96,255,0.15)", borderTopColor: "#8880ff" }} /> : "No project data"}
        </div>
      )}

      {/* ── Overlays ── */}
      <div className="absolute top-6 left-8 pointer-events-none select-none">
        <h1 className="text-2xl font-extrabold tracking-[0.12em]" style={{ color: "#e8e0f0", textShadow: "0 0 40px rgba(136,128,255,0.4)" }}>PROJECT GALAXY</h1>
        <p style={{ color: "#8070a0", fontSize: 12, marginTop: 4 }}>{nodeCount > 0 ? `${dirCount} planets · ${nodeCount - dirCount} stars · ${data.links.length} orbits` : "Awaiting…"}</p>
      </div>

      {/* Sortcut button */}
      <button onClick={() => setPanelOpen(v => !v)} className="absolute top-6 right-6 z-30 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(8,4,24,0.7)", border: "1px solid rgba(100,96,255,0.15)", color: "#8070a0" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>

      <button onClick={refresh} className="absolute bottom-6 right-6 z-20 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(8,4,24,0.6)", border: "1px solid rgba(100,96,255,0.15)", color: "#8070a0" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
      </button>

      {/* ── Settings Panel ── */}
      <SettingsPanel open={panelOpen} onClose={() => setPanelOpen(false)} settings={settings} onChange={setSettings} />

      {/* ── Selected node info ── */}
      {selected && (
        <div className="absolute top-20 right-14 w-72 z-20 rounded-xl p-5" style={{ background: "rgba(8,4,24,0.95)", border: "1px solid rgba(100,96,255,0.2)", backdropFilter: "blur(20px)" }}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              {selected.type !== "file" ? <FolderOpen size={18} color="#00e5ff" /> : <File size={18} color="#8880ff" />}
              <span className="text-sm font-semibold" style={{ color: "#e8e0f0" }}>{selected.name}</span>
            </div>
            <button onClick={() => setSelected(null)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8070a0" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <div className="space-y-1.5 text-xs" style={{ color: "#8070a0" }}>
            <p className="break-all">{selected.path}</p>
            <div className="flex gap-4 mt-2">
              <span className="flex items-center gap-1"><Hash size={10} /> {selected.type}</span>
              {selected.size != null && selected.size > 0 && <span className="flex items-center gap-1"><Clock size={10} /> {selected.size < 1024 ? `${selected.size}B` : `${(selected.size / 1024).toFixed(1)}KB`}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
