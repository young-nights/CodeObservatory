// ProjectGalaxy — 3D Galaxy Graph with R3F Canvas + Custom d3-force-3d
// Replaces ForceGraph3D for full control over rendering + force pipeline
// Uses: @react-three/fiber, drei, postprocessing, d3-force-3d

import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
} from "d3-force-3d";
import { useScanGraph } from "@/hooks/useObservatory";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "react-i18next";
import { SettingsPanel } from "./SettingsPanel";
import type { FileNode, FileEdge } from "@/lib/types";
import { FolderOpen, File, Hash, Clock, Maximize2 } from "lucide-react";

// ═══════════ Colors — dual theme ═══════════
const C = {
  dark: {
    bg: "#05050f",
    file: {
      ts: "#67e8f9", tsx: "#67e8f9", js: "#67e8f9", jsx: "#67e8f9",
      rs: "#e879f9", md: "#e879f9", json: "#facc15", toml: "#facc15",
      yaml: "#facc15", css: "#4ade80", scss: "#4ade80", html: "#fb923c",
      py: "#2dd4bf", c: "#94a3b8", h: "#94a3b8", cpp: "#94a3b8", go: "#60b0d0",
    } as Record<string, string>,
    defaultFile: "#c4b5fd",
    dirCyan: "#67e8f9",
    dirPurple: "#e879f9",
    root: "#ffffff",
    edge: "#6366f1",
    particle: "#a5b4fc",
    ui: {
      bg: "#08080c", card: "rgba(8,4,20,0.97)", border: "rgba(99,102,241,0.12)",
      text: "#e0e7ff", dim: "#a1a1aa", muted: "#71717a",
    },
  },
  light: {
    bg: "#f8fafc",
    file: {
      ts: "#0284c7", tsx: "#0369a1", js: "#0284c7", jsx: "#0369a1",
      rs: "#7c3aed", md: "#7c3aed", json: "#ca8a04", toml: "#ca8a04",
      yaml: "#ca8a04", css: "#16a34a", scss: "#15803d", html: "#ea580c",
      py: "#0d9488", c: "#64748b", h: "#64748b", cpp: "#64748b", go: "#0891b2",
    } as Record<string, string>,
    defaultFile: "#6d28d9",
    dirCyan: "#0284c8",
    dirPurple: "#7c3aed",
    root: "#1e1b4b",
    edge: "#64748b",
    particle: "#6366f1",
    ui: {
      bg: "#ffffff", card: "rgba(255,255,255,0.95)", border: "rgba(0,0,0,0.08)",
      text: "#1e293b", dim: "#64748b", muted: "#94a3b8",
    },
  },
};

// ═══════════ Types ═══════════
interface FGNode {
  id: string; name: string; path: string; type: "root" | "dir" | "file";
  color: string; val: number; extension?: string; size?: number;
}
interface FGLink { source: string; target: string; }
interface SimNode extends FGNode { x: number; y: number; z: number; vx: number; vy: number; vz: number; }
interface GalaxySettings {
  nodeSize: number; edgeOpacity: number; bloomStrength: number;
  chargeStrength: number; linkDistance: number; linkStrength: number; centerGravity: number;
}
const DEFS: GalaxySettings = {
  nodeSize: 0.8, edgeOpacity: 0.10, bloomStrength: 2.5,
  chargeStrength: -200, linkDistance: 8, linkStrength: 0.5, centerGravity: 0.5,
};

// ═══════════ Data transform ═══════════
function toFGData(nodes: FileNode[], edges: FileEdge[], isDark: boolean) {
  const clr = isDark ? C.dark : C.light;
  const targeted = new Set(edges.map((e) => e.target));
  const root = nodes.find((n) => !targeted.has(n.id));
  const depth = new Map<string, number>();
  if (root) {
    depth.set(root.id, 0);
    const kids = new Map<string, string[]>();
    for (const e of edges) {
      const l = kids.get(e.source) || [];
      l.push(e.target);
      kids.set(e.source, l);
    }
    const q = [root.id];
    while (q.length) {
      const c = q.shift()!;
      for (const ch of kids.get(c) || []) {
        if (!depth.has(ch)) { depth.set(ch, (depth.get(c) || 0) + 1); q.push(ch); }
      }
    }
  }
  return {
    nodes: nodes.map((n) => {
      const isR = n.id === root?.id;
      const d = depth.get(n.id) ?? 99;
      const ex = n.extension?.toLowerCase() ?? "";
      return {
        id: n.id, name: n.label, path: n.path,
        type: (isR ? "root" : n.kind === "dir" ? "dir" : "file") as FGNode["type"],
        color: isR
          ? clr.root
          : n.kind === "dir"
            ? (d === 1 ? clr.dirCyan : clr.dirPurple)
            : (clr.file[ex] || clr.defaultFile),
        val: isR ? 16 : n.kind === "dir" ? (d === 1 ? 8 : 5) : 3,
        extension: n.extension,
        size: n.size,
      } as FGNode;
    }),
    links: edges.map((e) => ({ source: e.source, target: e.target } as FGLink)),
  };
}

// ═══════════ Galaxy Force Scene (rendered inside <Canvas>) ═══════════
interface GalaxySceneProps {
  data: { nodes: FGNode[]; links: FGLink[] };
  settings: GalaxySettings;
  isDark: boolean;
  onNodeClick: (node: FGNode | null) => void;
  resetKey: number;
}

function GalaxyForceScene({ data, settings, isDark, onNodeClick, resetKey }: GalaxySceneProps) {
  const clr = isDark ? C.dark : C.light;
  const { camera } = useThree();

  // ── Refs for Three.js objects ──
  const controlsRef = useRef<any>(null);
  const cyanInstancedRef = useRef<THREE.InstancedMesh>(null);
  const purpleInstancedRef = useRef<THREE.InstancedMesh>(null);
  const filePointsRef = useRef<THREE.Points>(null);
  const edgesRef = useRef<THREE.LineSegments>(null);
  const rootGroupRef = useRef<THREE.Group>(null);

  // ── Categorize nodes ──
  const { rootNode, dirNodes, fileNodes } = useMemo(() => {
    const r = data.nodes.find((n) => n.type === "root");
    return {
      rootNode: r,
      dirNodes: data.nodes.filter((n) => n.type === "dir"),
      fileNodes: data.nodes.filter((n) => n.type === "file"),
    };
  }, [data.nodes]);

  const cyanDirs = useMemo(() => dirNodes.filter((n) => n.val >= 8), [dirNodes]);
  const purpleDirs = useMemo(() => dirNodes.filter((n) => n.val < 8), [dirNodes]);

  // Map: instancedMesh instance index → original dirNodes index
  const { cyanToDirIdx, purpleToDirIdx } = useMemo(() => {
    const c: number[] = [], p: number[] = [];
    dirNodes.forEach((n, i) => { if (n.val >= 8) c.push(i); else p.push(i); });
    return { cyanToDirIdx: c, purpleToDirIdx: p };
  }, [dirNodes]);

  // ── Shared geometries + materials ──
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 24, 24), []);
  const cyanMat = useMemo(() => new THREE.MeshStandardMaterial({
    roughness: 0.15, metalness: 0.03, toneMapped: false,
  }), []);
  const purpleMat = useMemo(() => new THREE.MeshStandardMaterial({
    roughness: 0.15, metalness: 0.03, toneMapped: false,
  }), []);

  // Update material colors when theme changes
  useEffect(() => {
    cyanMat.color.set(clr.dirCyan);
    cyanMat.emissive.set(clr.dirCyan);
    cyanMat.emissiveIntensity = 1.8;
  }, [clr.dirCyan, cyanMat]);
  useEffect(() => {
    purpleMat.color.set(clr.dirPurple);
    purpleMat.emissive.set(clr.dirPurple);
    purpleMat.emissiveIntensity = 1.8;
  }, [clr.dirPurple, purpleMat]);

  // File Points geometry (populated with colors from start)
  const filePointsGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(fileNodes.length * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(fileNodes.length * 3), 3));
    const colArr = geo.attributes.color.array as Float32Array;
    fileNodes.forEach((n, i) => {
      const c = new THREE.Color(n.color);
      colArr[i * 3] = c.r; colArr[i * 3 + 1] = c.g; colArr[i * 3 + 2] = c.b;
    });
    return geo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileNodes.length]);

  // Edge geometry
  const edgeGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(
      new Float32Array(data.links.length * 6), // 2 vertices × 3 coords
      3,
    ));
    return geo;
  }, [data.links.length]);

  // ── Force simulation nodes (stable via ref + useMemo) ──
  const simNodesRef = useRef<SimNode[]>([]);
  useMemo(() => {
    if (data.nodes.length === 0) { simNodesRef.current = []; return; }
    simNodesRef.current = data.nodes.map((n) => ({
      ...n,
      x: (Math.random() - 0.5) * 20,
      y: (Math.random() - 0.5) * 20,
      z: (Math.random() - 0.5) * 20,
      vx: 0, vy: 0, vz: 0,
    }));
  }, [data.nodes]);

  // ── Run d3-force-3d simulation ──
  useEffect(() => {
    const sn = simNodesRef.current;
    if (sn.length === 0) return;

    const simLinks = data.links.map((l) => ({ source: l.source, target: l.target }));
    const dummy = new THREE.Object3D();

    const sim: any = forceSimulation(sn)
      .force("charge", forceManyBody().strength(settings.chargeStrength))
      .force("link", forceLink(simLinks)
        .id((d: any) => d.id)
        .distance(settings.linkDistance)
        .strength(settings.linkStrength))
      .force("center", forceCenter(0, 0, 0).strength(settings.centerGravity))
      .on("tick", () => {
        const ciRef = cyanInstancedRef.current;
        const piRef = purpleInstancedRef.current;
        const pts = filePointsRef.current;
        const es = edgesRef.current;
        const rg = rootGroupRef.current;
        const sz = settings.nodeSize;

        // Dir nodes: distribute across two InstancedMeshes by depth
        if ((ciRef || piRef) && dirNodes.length > 0) {
          let ci = 0, pi = 0;
          for (const node of sn) {
            if (node.type !== "dir") continue;
            const s = (node.val / 8) * sz;
            dummy.position.set(node.x, node.y, node.z);
            dummy.scale.setScalar(s);
            dummy.updateMatrix();
            if (node.val >= 8 && ciRef && ci < ciRef.count) {
              ciRef.setMatrixAt(ci++, dummy.matrix);
            } else if (node.val < 8 && piRef && pi < piRef.count) {
              piRef.setMatrixAt(pi++, dummy.matrix);
            }
          }
          if (ciRef) ciRef.instanceMatrix.needsUpdate = true;
          if (piRef) piRef.instanceMatrix.needsUpdate = true;
        }

        // File Points
        if (pts && fileNodes.length > 0) {
          const posArr = pts.geometry.attributes.position.array as Float32Array;
          let fi = 0;
          for (const node of sn) {
            if (node.type !== "file") continue;
            posArr[fi * 3] = node.x;
            posArr[fi * 3 + 1] = node.y;
            posArr[fi * 3 + 2] = node.z;
            fi++;
          }
          pts.geometry.attributes.position.needsUpdate = true;
        }

        // Root group position
        if (rg) {
          const rn = sn.find((n) => n.type === "root");
          if (rn) rg.position.set(rn.x, rn.y, rn.z);
        }

        // Edges
        if (es && data.links.length > 0) {
          const arr = es.geometry.attributes.position.array as Float32Array;
          const nodeMap = new Map(sn.map((n) => [n.id, n]));
          for (let i = 0; i < data.links.length; i++) {
            const link = data.links[i];
            const src = nodeMap.get(link.source);
            const tgt = nodeMap.get(link.target);
            if (src && tgt) {
              arr[i * 6] = src.x;
              arr[i * 6 + 1] = src.y;
              arr[i * 6 + 2] = src.z;
              arr[i * 6 + 3] = tgt.x;
              arr[i * 6 + 4] = tgt.y;
              arr[i * 6 + 5] = tgt.z;
            }
          }
          es.geometry.attributes.position.needsUpdate = true;
        }
      });

    sim.alpha(1).restart();
    const t = setTimeout(() => sim.stop(), 8000);
    return () => { sim.stop(); clearTimeout(t); };
  }, [
    data.links, settings.chargeStrength, settings.linkDistance,
    settings.linkStrength, settings.centerGravity, settings.nodeSize,
    dirNodes.length, fileNodes.length,
  ]);

  // ── Camera reset ──
  useEffect(() => {
    if (resetKey === 0) return;
    camera.position.set(0, 8, 30);
    camera.lookAt(0, 0, 0);
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, [resetKey, camera]);

  // ── Render scene ──
  return (
    <>
      {/* Background Stars */}
      <Stars radius={120} depth={200} count={4000} factor={4} saturation={0} fade speed={0.1} />

      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <pointLight
        position={[0, 0, 0]}
        intensity={isDark ? 5 : 3}
        color="#ffffff"
        distance={100}
        decay={2}
      />

      {/* OrbitControls */}
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.1}
        autoRotate
        autoRotateSpeed={0.3}
      />

      {/* Root node + glow aura */}
      {rootNode && (
        <group ref={rootGroupRef}>
          <mesh
            onClick={(e) => { e.stopPropagation(); onNodeClick(rootNode); }}
          >
            <sphereGeometry args={[0.8, 64, 64]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive="#ffffff"
              emissiveIntensity={5}
              toneMapped={false}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[2.5, 32, 32]} />
            <meshBasicMaterial
              color="#a5b4fc"
              transparent
              opacity={0.06}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {/* Dir nodes — cyan (depth 1) */}
      {cyanDirs.length > 0 && (
        <instancedMesh
          ref={cyanInstancedRef}
          args={[sphereGeo, cyanMat, cyanDirs.length]}
          onClick={(e: any) => {
            e.stopPropagation();
            const idx = cyanToDirIdx[e.instanceId];
            if (idx !== undefined) onNodeClick(dirNodes[idx]);
          }}
        />
      )}

      {/* Dir nodes — purple (depth ≥2) */}
      {purpleDirs.length > 0 && (
        <instancedMesh
          ref={purpleInstancedRef}
          args={[sphereGeo, purpleMat, purpleDirs.length]}
          onClick={(e: any) => {
            e.stopPropagation();
            const idx = purpleToDirIdx[e.instanceId];
            if (idx !== undefined) onNodeClick(dirNodes[idx]);
          }}
        />
      )}

      {/* File nodes — Points with additive blending + vertex colors */}
      {fileNodes.length > 0 && (
        <points
          ref={filePointsRef}
          geometry={filePointsGeo}
          onClick={(e: any) => {
            e.stopPropagation();
            const idx = e.index;
            if (idx !== undefined && idx < fileNodes.length) onNodeClick(fileNodes[idx]);
          }}
        >
          <pointsMaterial
            size={0.15 * settings.nodeSize}
            vertexColors
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </points>
      )}

      {/* Edges — LineSegments with additive blending */}
      {data.links.length > 0 && (
        <lineSegments ref={edgesRef} geometry={edgeGeo}>
          <lineBasicMaterial
            color={clr.edge}
            transparent
            opacity={settings.edgeOpacity * 1.5}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      )}

      {/* Post-processing Bloom */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.03}
          intensity={settings.bloomStrength}
          luminanceSmoothing={1}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}

// ═══════════ Main ═══════════
interface Props { projectPath: string; fullscreen?: boolean; }

export default function ProjectGalaxy({ projectPath, fullscreen = false }: Props) {
  const { graph, loading, refresh } = useScanGraph(projectPath);
  const { theme } = useTheme();
  const { t } = useTranslation();
  const isDark = theme === "dark";
  const clr = isDark ? C.dark : C.light;

  const [selected, setSelected] = useState<FGNode | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [settings, setSettings] = useState<GalaxySettings>(DEFS);
  const [dim, setDim] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [resetKey, setResetKey] = useState(0);

  // Loading timeout
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => setLoadTimedOut(true), 15000);
      return () => clearTimeout(t);
    } else {
      setLoadTimedOut(false);
    }
  }, [loading]);

  // Window resize
  useEffect(() => {
    const onR = () => setDim({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  const data = useMemo(
    () => (graph ? toFGData(graph.nodes, graph.edges, isDark) : { nodes: [] as FGNode[], links: [] as FGLink[] }),
    [graph, isDark],
  );

  const cnt = data.nodes.length;
  const dc = data.nodes.filter((n) => n.type !== "file").length;

  const handleReset = useCallback(() => setResetKey((k) => k + 1), []);

  const canvasW = dim.w - (fullscreen ? 0 : 200) - (panelOpen ? 280 : 0);
  const canvasH = dim.h - 48;

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: clr.bg }}>
      {!loading && data.nodes.length > 0 ? (
        <div style={{ width: canvasW, height: canvasH }}>
          <Canvas
            camera={{ position: [0, 8, 30], fov: 60 }}
            gl={{
              antialias: true,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.2,
            }}
            style={{ background: clr.bg }}
            onPointerMissed={() => setSelected(null)}
          >
            <GalaxyForceScene
              data={data}
              settings={settings}
              isDark={isDark}
              onNodeClick={(node) => setSelected(node)}
              resetKey={resetKey}
            />
          </Canvas>
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center h-full gap-4"
          style={{ color: clr.ui.muted, fontSize: 13 }}
        >
          {loading ? (
            <>
              <div
                className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
                style={{
                  borderColor: isDark ? "rgba(100,96,255,0.15)" : "rgba(0,0,0,0.1)",
                  borderTopColor: isDark ? "#8880ff" : "#6366f1",
                }}
              />
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
        <h1
          className="text-2xl font-extrabold tracking-[0.12em]"
          style={{
            color: clr.ui.text,
            textShadow: isDark ? "0 0 40px rgba(136,128,255,0.4)" : "none",
          }}
        >
          {t("app.title")}
        </h1>
        <p style={{ color: clr.ui.dim, fontSize: 12, marginTop: 4 }}>
          {cnt > 0
            ? `${dc} planets · ${cnt - dc} stars · ${data.links.length} orbits`
            : t("app.awaiting")}
        </p>
      </div>

      {/* Settings gear button */}
      <button
        onClick={() => setPanelOpen((v) => !v)}
        className="absolute top-6 right-6 z-30 w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ background: clr.ui.card, border: `1px solid ${clr.ui.border}`, color: clr.ui.dim }}
        aria-label="Settings"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {/* Reset camera */}
      <button
        onClick={handleReset}
        className="absolute bottom-6 right-16 z-20 w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ background: clr.ui.card, border: `1px solid ${clr.ui.border}`, color: clr.ui.dim }}
        title="Reset view"
        aria-label="Reset view"
      >
        <Maximize2 size={14} />
      </button>

      {/* Rescan */}
      <button
        onClick={refresh}
        className="absolute bottom-6 right-6 z-20 w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ background: clr.ui.card, border: `1px solid ${clr.ui.border}`, color: clr.ui.dim }}
        title="Rescan"
        aria-label="Rescan"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 4v6h6M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      </button>

      {/* Settings Panel */}
      <SettingsPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        settings={settings}
        onChange={setSettings}
      />

      {/* Selected node info card */}
      {selected && (
        <div
          className="absolute top-20 right-14 w-72 z-20 rounded-xl p-5"
          style={{
            background: clr.ui.card,
            border: `1px solid ${clr.ui.border}`,
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              {selected.type !== "file"
                ? <FolderOpen size={18} color={clr.dirCyan} />
                : <File size={18} color={clr.ui.dim} />}
              <span className="text-sm font-semibold" style={{ color: clr.ui.text }}>
                {selected.name}
              </span>
            </div>
            <button onClick={() => setSelected(null)} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={clr.ui.muted} strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="space-y-1.5 text-xs" style={{ color: clr.ui.muted }}>
            <p className="break-all">{selected.path}</p>
            <div className="flex gap-4 mt-2">
              <span className="flex items-center gap-1">
                <Hash size={10} />{selected.type}
              </span>
              {selected.size != null && selected.size > 0 && (
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {selected.size < 1024
                    ? `${selected.size}B`
                    : `${(selected.size / 1024).toFixed(1)}KB`}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
