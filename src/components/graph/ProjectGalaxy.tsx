// ProjectGalaxy — 3D Force Graph Galaxy + Obsidian-style settings panel
// react-force-graph-3d + UnrealBloomPass + directional particles
// Full dark/light theme support via useTheme()

import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import ForceGraph3D, { type ForceGraphMethods } from "react-force-graph-3d";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { useScanGraph } from "@/hooks/useObservatory";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "react-i18next";
import { SettingsPanel } from "./SettingsPanel";
import type { FileNode, FileEdge } from "@/lib/types";
import { FolderOpen, File, Hash, Clock, Maximize2 } from "lucide-react";

// ═══════════ Colors — dual theme ═══════════
const C = {
  dark: {
    bg: "#05050f", file: { ts: "#67e8f9", tsx: "#67e8f9", js: "#67e8f9", jsx: "#67e8f9", rs: "#e879f9", md: "#e879f9", json: "#facc15", toml: "#facc15", yaml: "#facc15", css: "#4ade80", scss: "#4ade80", html: "#fb923c", py: "#2dd4bf", c: "#94a3b8", h: "#94a3b8", cpp: "#94a3b8", go: "#60b0d0" } as Record<string, string>,
    defaultFile: "#c4b5fd", dirCyan: "#67e8f9", dirPurple: "#e879f9", root: "#ffffff",
    edge: "#6366f1", particle: "#a5b4fc",
    ui: { bg: "#08080c", card: "rgba(8,4,20,0.97)", border: "rgba(99,102,241,0.12)", text: "#e0e7ff", dim: "#a1a1aa", muted: "#71717a" },
  },
  light: {
    bg: "#f8fafc", file: { ts: "#0284c7", tsx: "#0369a1", js: "#0284c7", jsx: "#0369a1", rs: "#7c3aed", md: "#7c3aed", json: "#ca8a04", toml: "#ca8a04", yaml: "#ca8a04", css: "#16a34a", scss: "#15803d", html: "#ea580c", py: "#0d9488", c: "#64748b", h: "#64748b", cpp: "#64748b", go: "#0891b2" } as Record<string, string>,
    defaultFile: "#6d28d9", dirCyan: "#0284c8", dirPurple: "#7c3aed", root: "#1e1b4b",
    edge: "#64748b", particle: "#6366f1",
    ui: { bg: "#ffffff", card: "rgba(255,255,255,0.95)", border: "rgba(0,0,0,0.08)", text: "#1e293b", dim: "#64748b", muted: "#94a3b8" },
  },
};

// ═══════════ Data transform ═══════════
interface FGNode { id: string; name: string; path: string; type: "root"|"dir"|"file"; color: string; val: number; extension?: string; size?: number; }
interface FGLink { source: string; target: string; }

function toFGData(nodes: FileNode[], edges: FileEdge[], isDark: boolean) {
  const clr = isDark ? C.dark : C.light;
  const targeted = new Set(edges.map(e => e.target));
  const root = nodes.find(n => !targeted.has(n.id));
  const depth = new Map<string, number>();
  if (root) {
    depth.set(root.id, 0);
    const kids = new Map<string, string[]>();
    for (const e of edges) { const l = kids.get(e.source) || []; l.push(e.target); kids.set(e.source, l); }
    const q = [root.id];
    while (q.length) { const c = q.shift()!; for (const ch of kids.get(c) || []) { if (!depth.has(ch)) { depth.set(ch, (depth.get(c)||0)+1); q.push(ch); } } }
  }
  return {
    nodes: nodes.map(n => {
      const isR = n.id === root?.id; const d = depth.get(n.id) ?? 99; const ex = n.extension?.toLowerCase() ?? "";
      return { id: n.id, name: n.label, path: n.path, type: isR ? "root" : n.kind === "dir" ? "dir" : "file", color: isR ? clr.root : n.kind === "dir" ? (d===1 ? clr.dirCyan : clr.dirPurple) : (clr.file[ex] || clr.defaultFile), val: isR ? 16 : n.kind === "dir" ? (d===1 ? 8 : 5) : 3, extension: n.extension, size: n.size } as FGNode;
    }),
    links: edges.map(e => ({ source: e.source, target: e.target } as FGLink)),
  };
}

// ═══════════ Bloom injection ═══════════
function useBloom(fgRef: React.RefObject<ForceGraphMethods|undefined>, strength: number) {
  useEffect(() => {
    const iv = setInterval(() => {
      const fg = fgRef.current as any; if (!fg) return;
      const r = fg.renderer?.(), s = fg.scene?.(), c = fg.camera?.();
      if (!r||!s||!c) return;
      if ((r as any).__bloom) { clearInterval(iv); return; }
      (r as any).__bloom = true;
      const cmp = new EffectComposer(r); cmp.addPass(new RenderPass(s, c));
      const bp = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
      bp.threshold = 0.03; bp.strength = strength; bp.radius = 1.0; cmp.addPass(bp);
      const orig = r.render.bind(r); r.render = () => cmp.render();
      (r as any).__bloomCmp = cmp; (r as any).__bloomPass = bp;
      clearInterval(iv);
    }, 300);
    return () => clearInterval(iv);
  }, [fgRef, strength]);
}

// ═══════════ Main ═══════════
interface GalaxySettings { nodeSize: number; edgeOpacity: number; bloomStrength: number; chargeStrength: number; linkDistance: number; linkStrength: number; centerGravity: number; }
const DEFS: GalaxySettings = { nodeSize:0.8, edgeOpacity:0.10, bloomStrength:2.5, chargeStrength:-200, linkDistance:8, linkStrength:0.5, centerGravity:0.5 };

interface Props { projectPath: string; fullscreen?: boolean; }

export default function ProjectGalaxy({ projectPath, fullscreen = false }: Props) {
  const fgRef = useRef<ForceGraphMethods>();
  const { graph, loading, refresh } = useScanGraph(projectPath);
  const { theme } = useTheme();
  const { t } = useTranslation();
  const isDark = theme === "dark";
  const clr = isDark ? C.dark : C.light;

  const [selected, setSelected] = useState<FGNode|null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [settings, setSettings] = useState<GalaxySettings>(DEFS);
  const [dim, setDim] = useState({ w: window.innerWidth, h: window.innerHeight });

  useBloom(fgRef, settings.bloomStrength);

  // Loading timeout — if scan takes >15s, show something
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => setLoadTimedOut(true), 15000);
      return () => clearTimeout(t);
    } else {
      setLoadTimedOut(false);
    }
  }, [loading]);

  // ── Dynamic bounds + camera (computed after data)

  useEffect(() => { const onR = () => setDim({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener("resize", onR); return () => window.removeEventListener("resize", onR); }, []);

  const data = useMemo(() => graph ? toFGData(graph.nodes, graph.edges, isDark) : { nodes:[], links:[] }, [graph, isDark]);

  // Initial camera: ForceGraph3D handles this via zoomToFit on first load
  const camPos = useMemo(() => ({ x: 0, y: 8, z: 30 }), []);

  // Reset view
  const handleReset = useCallback(() => {
    const fg: any = fgRef.current;
    if (!fg) return;
    const cam = fg.camera();
    if (!cam) return;
    fg.zoomToFit?.(600, 80);
  }, []);

  // Auto-refocus only when force params change (not bloom/nodeSize)
  useEffect(() => {
    const fg: any = fgRef.current;
    if (!fg || !data.nodes.length) return;
    const t = setTimeout(() => fg.zoomToFit?.(400, 60), 600);
    return () => clearTimeout(t);
    // Only depend on force-affecting params, not bloom/nodeSize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.chargeStrength, settings.linkDistance, settings.linkStrength, settings.centerGravity, data.nodes.length]);

  // 3D node
  const nodeObj = useCallback((node: any) => {
    const n = node as FGNode; const g = new THREE.Group();
    const r = n.type === "root" ? 1.2 : n.type === "dir" ? 0.4 : 0.15;
    const s = r * settings.nodeSize; const segs = n.type === "file" ? 8 : 24;
    const geo = new THREE.SphereGeometry(s, segs, segs);
    const mat = new THREE.MeshStandardMaterial({ color: n.color, emissive: n.color, emissiveIntensity: n.type === "root" ? 4.0 : n.type === "dir" ? 1.8 : 1.0, roughness: 0.15, metalness: 0.03, toneMapped: false });
    g.add(new THREE.Mesh(geo, mat));
    // Bigger, brighter ring for dirs
    if (n.type !== "file") {
      const rg = new THREE.RingGeometry(s*1.5, s*2.5, 64);
      g.add(new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: n.color, side: THREE.DoubleSide, transparent: true, opacity: 0.2 })));
    }
    // Root gets mega glow aura — light explosion effect
    if (n.type === "root") {
      const a1 = new THREE.RingGeometry(s*2, s*4, 64);
      g.add(new THREE.Mesh(a1, new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false })));
      const a2 = new THREE.RingGeometry(s*3.5, s*6, 64);
      g.add(new THREE.Mesh(a2, new THREE.MeshBasicMaterial({ color: "#a5b4fc", side: THREE.DoubleSide, transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending, depthWrite: false })));
    }
    return g;
  }, [settings.nodeSize]);

  // Starfield
  const bgStars = useMemo(() => {
    const cnt = 15000; const geo = new THREE.BufferGeometry(); const pos = new Float32Array(cnt*3); const col = new Float32Array(cnt*3);
    const h = isDark ? [0.55, 0.35] : [0.6, 0.3], sl = isDark ? [0.25, 0.25] : [0.3, 0.3], ll = isDark ? [0.5, 0.5] : [0.2, 0.3];
    for (let i = 0; i < cnt; i++) {
      const rr = 20 + Math.random() * 180, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i*3] = rr * Math.sin(ph) * Math.cos(th); pos[i*3+1] = rr * Math.sin(ph) * Math.sin(th); pos[i*3+2] = rr * Math.cos(ph);
      const c = new THREE.Color().setHSL(h[0]+Math.random()*h[1], sl[0]+Math.random()*sl[1], ll[0]+Math.random()*ll[1]);
      col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return geo;
  }, [isDark]);

  const cnt = data.nodes.length, dc = data.nodes.filter(n => n.type !== "file").length;

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: clr.bg }}>
      {!loading && data.nodes.length > 0 ? (
        <ForceGraph3D ref={fgRef} graphData={data}
          width={dim.w - (fullscreen ? 0 : 200) - (panelOpen ? 280 : 0)} height={dim.h - 48}
          backgroundColor={clr.bg} showNavInfo={false}
          cameraPosition={camPos}
          nodeThreeObject={nodeObj} nodeVal={(n:any) => (n as FGNode).val}
          linkWidth={0.2} linkColor={(link: any) => {
            // Gradient from center: warmer near root, cooler at edges
            const depth = link.source?.depth ?? link.target?.depth ?? 99;
            if (depth <= 1) return `rgba(${isDark ? "255,255,255" : "120,120,200"},${settings.edgeOpacity})`;
            if (depth <= 2) return `rgba(${isDark ? "200,180,255" : "99,102,241"},${settings.edgeOpacity * 0.8})`;
            return `rgba(${isDark ? "136,128,255" : "80,90,220"},${settings.edgeOpacity * 0.5})`;
          }}
          linkDirectionalParticles={4} linkDirectionalParticleSpeed={0.002} linkDirectionalParticleWidth={2}
          linkDirectionalParticleColor={() => isDark ? "#c4b5fd" : "#818cf8"}
          d3VelocityDecay={0.3} d3AlphaDecay={0.015} cooldownTicks={250}
          d3Force={(engine:any)=>{const d3=(window as any).d3;if(!d3)return;if(engine.force){engine.force("charge",d3.forceManyBody?.()?.strength(settings.chargeStrength));engine.force("link",d3.forceLink?.()?.distance(settings.linkDistance)?.strength(settings.linkStrength));engine.force("center",d3.forceCenter?.()?.strength(settings.centerGravity));}}}
          onNodeClick={(n:any)=>setSelected(n as FGNode)} onBackgroundClick={()=>setSelected(null)} enableNodeDrag />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: clr.ui.muted, fontSize: 13 }}>
          {loading ? (
            <>
              <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: isDark?"rgba(100,96,255,0.15)":"rgba(0,0,0,0.1)", borderTopColor: isDark?"#8880ff":"#6366f1" }} />
              <p>{loadTimedOut ? "Still scanning... large project?" : t("app.scanning")}</p>
            </>
          ) : (
            <>
              <p style={{ fontWeight: 600 }}>{t("app.noData")}</p>
              <p style={{ fontSize: 12, opacity: 0.6 }}>Project: {projectPath}</p>
            </>
          )}
        </div>
      )}
      {/* Title */}
      <div className="absolute top-6 left-8 pointer-events-none select-none">
        <h1 className="text-2xl font-extrabold tracking-[0.12em]" style={{ color: clr.ui.text, textShadow: isDark?"0 0 40px rgba(136,128,255,0.4)":"none" }}>{t("app.title")}</h1>
        <p style={{ color: clr.ui.dim, fontSize:12, marginTop:4 }}>{cnt>0?`${dc} planets · ${cnt-dc} stars · ${data.links.length} orbits`:t("app.awaiting")}</p>
      </div>
      {/* Buttons */}
      <button onClick={()=>setPanelOpen(v=>!v)} className="absolute top-6 right-6 z-30 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: clr.ui.card, border: `1px solid ${clr.ui.border}`, color: clr.ui.dim }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
      <button onClick={handleReset} className="absolute bottom-6 right-16 z-20 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: clr.ui.card, border: `1px solid ${clr.ui.border}`, color: clr.ui.dim }}
        title="Reset view">
        <Maximize2 size={14} />
      </button>
      <button onClick={refresh} className="absolute bottom-6 right-6 z-20 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: clr.ui.card, border: `1px solid ${clr.ui.border}`, color: clr.ui.dim }}
        title="Rescan">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
      </button>
      {/* Settings */}
      <SettingsPanel open={panelOpen} onClose={()=>setPanelOpen(false)} settings={settings} onChange={setSettings} />
      {/* Selected node */}
      {selected && (
        <div className="absolute top-20 right-14 w-72 z-20 rounded-xl p-5" style={{ background: clr.ui.card, border: `1px solid ${clr.ui.border}`, backdropFilter: "blur(20px)" }}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              {selected.type!=="file"?<FolderOpen size={18} color={clr.dirCyan}/>:<File size={18} color={clr.ui.dim}/>}
              <span className="text-sm font-semibold" style={{ color: clr.ui.text }}>{selected.name}</span>
            </div>
            <button onClick={()=>setSelected(null)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={clr.ui.muted} strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <div className="space-y-1.5 text-xs" style={{ color: clr.ui.muted }}>
            <p className="break-all">{selected.path}</p>
            <div className="flex gap-4 mt-2"><span className="flex items-center gap-1"><Hash size={10}/>{selected.type}</span>{selected.size!=null&&selected.size>0&&<span className="flex items-center gap-1"><Clock size={10}/>{selected.size<1024?`${selected.size}B`:`${(selected.size/1024).toFixed(1)}KB`}</span>}</div>
          </div>
        </div>
      )}
    </div>
  );
}
