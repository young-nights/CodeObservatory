// ProjectGalaxy — Hierarchical Radial Arc Galaxy (R3F)
// Layout: Sun(root)→Planets(dirs)→Stars(files)→Dust(leaves)
// Arc edges + InstancedMesh + Points + Bloom post-processing
// Full dark/light theme support via useTheme()

import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { useScanGraph } from "@/hooks/useObservatory";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "react-i18next";
import { SettingsPanel, type GalaxySettings } from "./SettingsPanel";
import type { FileNode, FileEdge } from "@/lib/types";
import { FolderOpen, File, Hash, Clock } from "lucide-react";

// ══════════════════════════════════════════════════════════
// THEME COLORS
// ══════════════════════════════════════════════════════════
const C = {
  dark: {
    bg: "#05050f",
    file: { ts: "#67e8f9", tsx: "#67e8f9", js: "#67e8f9", jsx: "#67e8f9", rs: "#e879f9", md: "#e879f9", json: "#facc15", toml: "#facc15", yaml: "#facc15", css: "#4ade80", scss: "#4ade80", html: "#fb923c", py: "#2dd4bf", c: "#94a3b8", h: "#94a3b8", cpp: "#94a3b8", go: "#60b0d0" } as Record<string, string>,
    defaultFile: "#c4b5fd",
    dirCyan: "#67e8f9",
    dirPurple: "#e879f9",
    root: "#ffffff",
    dustColor: "#f0c060",
    edgeR1: "#6366f1",
    edgeR2: "#8b5cf6",
    edgeR3: "#d4b040",
    ui: { bg: "#08080c", card: "rgba(8,4,20,0.97)", border: "rgba(99,102,241,0.12)", text: "#e0e7ff", dim: "#a1a1aa", muted: "#71717a" },
  },
  light: {
    bg: "#f8fafc",
    file: { ts: "#0284c7", tsx: "#0369a1", js: "#0284c7", jsx: "#0369a1", rs: "#7c3aed", md: "#7c3aed", json: "#ca8a04", toml: "#ca8a04", yaml: "#ca8a04", css: "#16a34a", scss: "#15803d", html: "#ea580c", py: "#0d9488", c: "#64748b", h: "#64748b", cpp: "#64748b", go: "#0891b2" } as Record<string, string>,
    defaultFile: "#6d28d9",
    dirCyan: "#0284c8",
    dirPurple: "#7c3aed",
    root: "#1e1b4b",
    dustColor: "#b8860b",
    edgeR1: "#64748b",
    edgeR2: "#6366f1",
    edgeR3: "#ca8a04",
    ui: { bg: "#ffffff", card: "rgba(255,255,255,0.95)", border: "rgba(0,0,0,0.08)", text: "#1e293b", dim: "#64748b", muted: "#94a3b8" },
  },
};

// ══════════════════════════════════════════════════════════
// RADIAL LAYOUT TYPES
// ══════════════════════════════════════════════════════════
interface RadialNode {
  id: string;
  name: string;
  path: string;
  type: "root" | "planet" | "star" | "dust";
  color: string;
  radius: number;
  angle: number;
  x: number;
  y: number;
  z: number;
  extension?: string;
  size?: number;
  depth: number;
}

interface RadialEdge {
  from: RadialNode;
  to: RadialNode;
  color: string;
  ring: number; // 1=Root→Planet, 2=Planet→Star, 3=Star→Dust
}

// ══════════════════════════════════════════════════════════
// RING CONFIG
// ══════════════════════════════════════════════════════════
const RING_RADII = { planet: 80, star: 160, dust: 240 };

// ══════════════════════════════════════════════════════════
// LAYOUT COMPUTATION
// ══════════════════════════════════════════════════════════
function computeRadialLayout(
  nodes: FileNode[],
  edges: FileEdge[],
  isDark: boolean,
): { nodes: RadialNode[]; edges: RadialEdge[] } {
  const clr = isDark ? C.dark : C.light;

  // Find root (node with no incoming edges = no one's target)
  const targeted = new Set(edges.map((e) => e.target));
  const root = nodes.find((n) => !targeted.has(n.id));
  if (!root) return { nodes: [], edges: [] };

  // Build adjacency
  const children = new Map<string, string[]>();
  for (const e of edges) {
    const list = children.get(e.source) || [];
    list.push(e.target);
    children.set(e.source, list);
  }

  // BFS: assign depth and collect by depth
  const depthMap = new Map<string, number>();
  const nodesByDepth: Map<number, FileNode[]> = new Map();
  const parentMap = new Map<string, string>(); // child → parent
  const queue: string[] = [root.id];
  depthMap.set(root.id, 0);
  nodesByDepth.set(0, [root]);

  while (queue.length) {
    const cur = queue.shift()!;
    const curDepth = depthMap.get(cur)!;
    for (const ch of children.get(cur) || []) {
      if (!depthMap.has(ch)) {
        depthMap.set(ch, curDepth + 1);
        parentMap.set(ch, cur);
        const list = nodesByDepth.get(curDepth + 1) || [];
        list.push(nodes.find((n) => n.id === ch)!);
        nodesByDepth.set(curDepth + 1, list);
        queue.push(ch);
      }
    }
  }
  nodesByDepth.get(0)?.splice(0, nodesByDepth.get(0)!.length, root);

  // Build RadialNode lookup
  const radialNodes = new Map<string, RadialNode>();
  const resultNodes: RadialNode[] = [];

  // Place root at center
  const rootRN: RadialNode = {
    id: root.id,
    name: root.label,
    path: root.path,
    type: "root",
    color: clr.root,
    radius: 0,
    angle: 0,
    x: 0,
    y: 0,
    z: 0,
    depth: 0,
  };
  radialNodes.set(root.id, rootRN);
  resultNodes.push(rootRN);

  // Depth 1 → Planets (Ring 1, r=80)
  const depth1Nodes = nodesByDepth.get(1) || [];
  const d1Count = depth1Nodes.length || 1;
  depth1Nodes.forEach((node, i) => {
    const angle = (i / d1Count) * Math.PI * 2;
    const r = RING_RADII.planet;
    const jitter = 5;
    const z = (Math.random() - 0.5) * 8;
    const d = depthMap.get(node.id) ?? 1;
    const rn: RadialNode = {
      id: node.id, name: node.label, path: node.path,
      type: "planet", color: d === 1 ? clr.dirCyan : clr.dirPurple,
      radius: r, angle,
      x: Math.cos(angle) * r + (Math.random() - 0.5) * jitter,
      y: z,
      z: Math.sin(angle) * r + (Math.random() - 0.5) * jitter,
      depth: d,
    };
    radialNodes.set(node.id, rn);
    resultNodes.push(rn);
  });

  // Sector angles for depth-2 placement
  const depth2Nodes = nodesByDepth.get(2) || [];
  // Group depth-2 nodes by parent
  const depth2ByParent = new Map<string, FileNode[]>();
  for (const n of depth2Nodes) {
    const p = parentMap.get(n.id);
    if (p) {
      const list = depth2ByParent.get(p) || [];
      list.push(n);
      depth2ByParent.set(p, list);
    }
  }

  for (const [parentId, childrenNodes] of depth2ByParent) {
    const parentRN = radialNodes.get(parentId);
    if (!parentRN) continue;
    const parentAngle = parentRN.angle;
    const count = childrenNodes.length || 1;
    const sectorHalf = 0.35; // ~20° spread
    const sectorStart = parentAngle - sectorHalf;
    const sectorSize = sectorHalf * 2;

    childrenNodes.forEach((node, i) => {
      const angle = count === 1
        ? parentAngle
        : sectorStart + (i / (count - 1)) * sectorSize;
      const r = RING_RADII.star + (Math.random() - 0.5) * 20;
      const jitter = 5;
      const z = (Math.random() - 0.5) * 8;
      const ext = node.extension?.toLowerCase() ?? "";
      const rn: RadialNode = {
        id: node.id, name: node.label, path: node.path,
        type: "star",
        color: clr.file[ext] || clr.defaultFile,
        radius: r, angle,
        x: Math.cos(angle) * r + (Math.random() - 0.5) * jitter,
        y: z,
        z: Math.sin(angle) * r + (Math.random() - 0.5) * jitter,
        extension: node.extension, size: node.size,
        depth: 2,
      };
      radialNodes.set(node.id, rn);
      resultNodes.push(rn);
    });
  }

  // Depth 3+ → Dust (Ring 3, r=240)
  for (let d = 3; d <= 10; d++) {
    const layerNodes = nodesByDepth.get(d);
    if (!layerNodes || layerNodes.length === 0) break;

    for (const node of layerNodes) {
      const p = parentMap.get(node.id);
      const parentRN = p ? radialNodes.get(p) : undefined;
      const parentAngle = parentRN?.angle ?? Math.random() * Math.PI * 2;
      const spread = 0.15;
      const angle = parentAngle + (Math.random() - 0.5) * spread;
      const r = RING_RADII.dust + (Math.random() - 0.5) * 25;
      const z = (Math.random() - 0.5) * 8;
      const rn: RadialNode = {
        id: node.id, name: node.label, path: node.path,
        type: "dust",
        color: clr.dustColor,
        radius: r, angle,
        x: Math.cos(angle) * r, y: z, z: Math.sin(angle) * r,
        depth: d,
      };
      radialNodes.set(node.id, rn);
      resultNodes.push(rn);
    }
  }

  // Build edges
  const resultEdges: RadialEdge[] = [];
  for (const e of edges) {
    const from = radialNodes.get(e.source);
    const to = radialNodes.get(e.target);
    if (!from || !to) continue;
    const ring = from.depth === 0 ? 1 : from.depth === 1 ? 2 : 3;
    const edgeClr = ring === 1 ? clr.edgeR1 : ring === 2 ? clr.edgeR2 : clr.edgeR3;
    resultEdges.push({ from, to, color: edgeClr, ring });
  }

  return { nodes: resultNodes, edges: resultEdges };
}

// ══════════════════════════════════════════════════════════
// FLOW PARTICLES (animated dots along edges)
// ══════════════════════════════════════════════════════════
const MAX_FLOW_POINTS = 3000;

function FlowParticles({ edges }: { edges: RadialEdge[] }) {
  const ref = useRef<THREE.Points>(null);

  const { positions, colors, curves, ptsPerEdge } = useMemo(() => {
    if (edges.length === 0) return { positions: new Float32Array(0), colors: new Float32Array(0), curves: [] as THREE.QuadraticBezierCurve3[], ptsPerEdge: 0 };
    const totalPts = Math.min(edges.length * 20, MAX_FLOW_POINTS);
    const ppe = Math.max(1, Math.floor(totalPts / edges.length));
    const pos = new Float32Array(edges.length * ppe * 3);
    const cols = new Float32Array(edges.length * ppe * 3);
    const crvs: THREE.QuadraticBezierCurve3[] = [];

    let idx = 0;
    for (const edge of edges) {
      const from = new THREE.Vector3(edge.from.x, edge.from.y, edge.from.z);
      const to = new THREE.Vector3(edge.to.x, edge.to.y, edge.to.z);
      const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
      const pushAmount = 25;
      let control: THREE.Vector3;
      if (mid.length() > 0.01) {
        control = mid.clone().add(mid.clone().normalize().multiplyScalar(pushAmount));
      } else {
        control = new THREE.Vector3((from.x + to.x) / 2, (from.y + to.y) / 2 + 15, (from.z + to.z) / 2);
      }
      const curve = new THREE.QuadraticBezierCurve3(from, control, to);
      crvs.push(curve);

      const col = new THREE.Color(edge.color);
      for (let pi = 0; pi < ppe; pi++) {
        const t = pi / ppe;
        const pt = curve.getPoint(t);
        pos[idx * 3] = pt.x;
        pos[idx * 3 + 1] = pt.y;
        pos[idx * 3 + 2] = pt.z;
        cols[idx * 3] = col.r;
        cols[idx * 3 + 1] = col.g;
        cols[idx * 3 + 2] = col.b;
        idx++;
      }
    }

    return { positions: pos, colors: cols, curves: crvs, ptsPerEdge: ppe };
  }, [edges]);

  // Phase offsets: each particle starts at a random point along the curve
  const offsets = useRef<Float32Array>(new Float32Array());
  if (offsets.current.length !== curves.length * ptsPerEdge) {
    const o = new Float32Array(curves.length * ptsPerEdge);
    for (let i = 0; i < o.length; i++) o[i] = Math.random();
    offsets.current = o;
  }

  useFrame((_, delta) => {
    if (!ref.current || curves.length === 0) return;
    const posArr = ref.current.geometry.attributes.position.array as Float32Array;
    const off = offsets.current;
    const speed = 0.15;

    let idx = 0;
    for (const curve of curves) {
      for (let pi = 0; pi < ptsPerEdge; pi++) {
        off[idx] = (off[idx] + speed * delta) % 1;
        const t = off[idx];
        const pt = curve.getPoint(t);
        posArr[idx * 3] = pt.x;
        posArr[idx * 3 + 1] = pt.y;
        posArr[idx * 3 + 2] = pt.z;
        idx++;
      }
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  if (edges.length === 0) return null;

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        vertexColors
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ══════════════════════════════════════════════════════════
// RIBBON COLOR GRADIENT HELPER
// ══════════════════════════════════════════════════════════
function getRibbonGradientColor(depth: number): THREE.Color {
  const t = Math.min(Math.max(depth / 3, 0), 1);
  const stops = [
    { pos: 0, color: "#ffffff" },
    { pos: 1 / 3, color: "#6366f1" },
    { pos: 2 / 3, color: "#c084fc" },
    { pos: 1, color: "#facc15" },
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].pos && t <= stops[i + 1].pos) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const segT = hi.pos === lo.pos ? 0 : (t - lo.pos) / (hi.pos - lo.pos);
  return new THREE.Color(lo.color).lerp(new THREE.Color(hi.color), segT);
}

// ══════════════════════════════════════════════════════════
// RIBBON ARCS — TubeGeometry with parallel side bands
// ══════════════════════════════════════════════════════════
function RibbonArcs({ edges }: { edges: RadialEdge[] }) {
  const tubes = useMemo(() => {
    const result: { geometry: THREE.BufferGeometry; color: string; opacity: number }[] = [];
    const ring1Edges = edges.filter((e) => e.ring === 1);
    const pushAmount = 25;

    for (const edge of ring1Edges) {
      const from = new THREE.Vector3(edge.from.x, edge.from.y, edge.from.z);
      const to = new THREE.Vector3(edge.to.x, edge.to.y, edge.to.z);
      const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
      const dir = mid.clone();
      const control =
        dir.length() > 0.01
          ? mid.clone().add(dir.normalize().multiplyScalar(pushAmount))
          : new THREE.Vector3((from.x + to.x) / 2, (from.y + to.y) / 2 + 15, (from.z + to.z) / 2);
      const curve = new THREE.QuadraticBezierCurve3(from, control, to);

      const gradColor = getRibbonGradientColor(edge.from.depth);
      const hex = "#" + gradColor.getHexString();

      // Main ribbon arc (thick, bright)
      result.push({
        geometry: new THREE.TubeGeometry(curve, 24, 0.25, 8, false),
        color: hex,
        opacity: 0.55,
      });

      // Side bands (offset ±3 perpendicular to curve-plane)
      const crossDir = dir.clone().normalize();
      const up = new THREE.Vector3(0, 1, 0);
      let perp = new THREE.Vector3().crossVectors(crossDir, up).normalize();
      if (perp.length() < 0.01) perp = new THREE.Vector3(1, 0, 0);
      perp.multiplyScalar(3);

      const off1 = perp.clone();
      const off2 = perp.clone().multiplyScalar(-1);

      for (const offset of [off1, off2]) {
        const fs = from.clone().add(offset);
        const ts = to.clone().add(offset);
        const ms = new THREE.Vector3().addVectors(fs, ts).multiplyScalar(0.5);
        const cs =
          ms.length() > 0.01
            ? ms.clone().add(ms.clone().normalize().multiplyScalar(pushAmount))
            : control.clone();
        result.push({
          geometry: new THREE.TubeGeometry(
            new THREE.QuadraticBezierCurve3(fs, cs, ts),
            16,
            0.12,
            8,
            false,
          ),
          color: hex,
          opacity: 0.15,
        });
      }
    }
    return result;
  }, [edges]);

  if (tubes.length === 0) return null;

  return (
    <group>
      {tubes.map((t, i) => (
        <mesh key={i} geometry={t.geometry}>
          <meshBasicMaterial
            color={t.color}
            transparent
            opacity={t.opacity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// ══════════════════════════════════════════════════════════
// BOKEH PARTICLES — floating soft-focus dreamy dots
// ══════════════════════════════════════════════════════════
function BokehParticles() {
  const COUNT = 1000;
  const ref = useRef<THREE.Points>(null);

  const { positions } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 300;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 180;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 300;
    }
    return { positions: pos };
  }, []);

  const velocities = useRef<Float32Array | null>(null);
  if (!velocities.current || velocities.current.length !== COUNT * 3) {
    const v = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT * 3; i++) v[i] = (Math.random() - 0.5) * 2;
    velocities.current = v;
  }

  useFrame((_, delta) => {
    if (!ref.current) return;
    const posArr = ref.current.geometry.attributes.position.array as Float32Array;
    const vel = velocities.current!;
    for (let i = 0; i < COUNT; i++) {
      posArr[i * 3] += vel[i * 3] * delta * 4;
      posArr[i * 3 + 1] += vel[i * 3 + 1] * delta * 4;
      posArr[i * 3 + 2] += vel[i * 3 + 2] * delta * 4;
      if (Math.abs(posArr[i * 3]) > 150) { posArr[i * 3] *= -0.9; vel[i * 3] = (Math.random() - 0.5) * 2; }
      if (Math.abs(posArr[i * 3 + 1]) > 90) { posArr[i * 3 + 1] *= -0.9; vel[i * 3 + 1] = (Math.random() - 0.5) * 2; }
      if (Math.abs(posArr[i * 3 + 2]) > 150) { posArr[i * 3 + 2] *= -0.9; vel[i * 3 + 2] = (Math.random() - 0.5) * 2; }
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={1.5}
        color="#ffffff"
        transparent
        opacity={0.08}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ══════════════════════════════════════════════════════════
// GOD RAYS — radial beams from root with slow rotation
// ══════════════════════════════════════════════════════════
function GodRays() {
  const RAY_COUNT = 8;
  const groupRef = useRef<THREE.Group>(null);

  const rayGeos = useMemo(() =>
    Array.from({ length: RAY_COUNT }, (_, i) => {
      const angle = (i / RAY_COUNT) * Math.PI * 2;
      const len = 90;
      const pos = new Float32Array([0, 0, 0, Math.cos(angle) * len, 0, Math.sin(angle) * len]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      return geo;
    }),
  []);

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.12;
  });

  return (
    <group ref={groupRef}>
      {rayGeos.map((geo, i) => (
        <lineSegments key={i} geometry={geo}>
          <lineBasicMaterial
            color="#80b0ff"
            transparent
            opacity={0.1}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </lineSegments>
      ))}
    </group>
  );
}

// ══════════════════════════════════════════════════════════
// SCENE (inside Canvas)
// ══════════════════════════════════════════════════════════
interface SceneProps {
  layout: ReturnType<typeof computeRadialLayout>;
  settings: GalaxySettings;
  isDark: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function GalaxyScene({ layout, settings, isDark, selectedId, onSelect }: SceneProps) {
  const clr = isDark ? C.dark : C.light;
  const groupRef = useRef<THREE.Group>(null);
  const planetRef = useRef<THREE.InstancedMesh>(null);
  const starRef = useRef<THREE.Points>(null);
  const [hovered, setHovered] = useState<{ id: string; position: [number, number, number] } | null>(null);

  // ═══ Planet (dir) data ═══
  const planets = useMemo(
    () => layout.nodes.filter((n) => n.type === "planet"),
    [layout.nodes],
  );
  // ═══ Star (file) data ═══
  const stars = useMemo(
    () => layout.nodes.filter((n) => n.type === "star"),
    [layout.nodes],
  );
  // ═══ Dust data ═══
  const dusts = useMemo(
    () => layout.nodes.filter((n) => n.type === "dust"),
    [layout.nodes],
  );
  // ═══ Root node ═══
  const rootNode = useMemo(
    () => layout.nodes.find((n) => n.type === "root"),
    [layout.nodes],
  );

  // ═══ Star positions / colors for Points ═══
  const starData = useMemo(() => ({
    positions: new Float32Array(stars.flatMap((s) => [s.x, s.y, s.z])),
    colors: new Float32Array(stars.flatMap((s) => {
      const c = new THREE.Color(s.color);
      return [c.r, c.g, c.b];
    })),
  }), [stars]);

  // ═══ Dust positions / colors for Points ═══
  const dustData = useMemo(() => ({
    positions: new Float32Array(dusts.flatMap((d) => [d.x, d.y, d.z])),
    colors: new Float32Array(dusts.flatMap(() => {
      const c = new THREE.Color(clr.dustColor);
      return [c.r * 0.8, c.g * 0.7, c.b * 0.5];
    })),
  }), [dusts, clr.dustColor]);

  // ═══ Edge geometry: 3 LineSegments, one per ring ═══
  const edgeGeos = useMemo(() => {
    const rings: { positions: number[]; colors: number[] }[] = [
      { positions: [], colors: [] }, // Ring 1
      { positions: [], colors: [] }, // Ring 2
      { positions: [], colors: [] }, // Ring 3
    ];

    for (const edge of layout.edges) {
      const ri = edge.ring - 1;
      if (ri < 0 || ri > 2) continue;
      const from = new THREE.Vector3(edge.from.x, edge.from.y, edge.from.z);
      const to = new THREE.Vector3(edge.to.x, edge.to.y, edge.to.z);
      const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
      const dist = mid.length();
      const pushAmount = 25;
      let control: THREE.Vector3;
      if (dist > 0.01) {
        control = mid.clone().add(mid.clone().normalize().multiplyScalar(pushAmount));
      } else {
        control = new THREE.Vector3(
          (from.x + to.x) / 2,
          (from.y + to.y) / 2 + 15,
          (from.z + to.z) / 2,
        );
      }
      const curve = new THREE.QuadraticBezierCurve3(from, control, to);
      const pts = curve.getPoints(20);
      const col = new THREE.Color(edge.color);
      for (let i = 0; i < pts.length - 1; i++) {
        rings[ri].positions.push(pts[i].x, pts[i].y, pts[i].z);
        rings[ri].positions.push(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
        rings[ri].colors.push(col.r, col.g, col.b);
        rings[ri].colors.push(col.r, col.g, col.b);
      }
    }

    return rings.map((ring) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ring.positions), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(ring.colors), 3));
      return geo;
    });
  }, [layout.edges]);

  // ═══ Set planet instance matrices & colors ═══
  useEffect(() => {
    const mesh = planetRef.current;
    if (!mesh || planets.length === 0) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      dummy.position.set(p.x, p.y, p.z);
      // Slightly scale up selected/hovered
      const scale = (selectedId === p.id || hovered?.id === p.id) ? 1.6 : 1.0;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const c = new THREE.Color(p.color);
      if (hovered?.id === p.id) c.multiplyScalar(1.5);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [planets, selectedId, hovered]);

  // ═══ Handle planet click ═══
  const handlePlanetClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const idx = e.instanceId;
      if (idx !== undefined && idx < planets.length) {
        onSelect(planets[idx].id);
      }
    },
    [planets, onSelect],
  );

  const handlePlanetPointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const idx = e.instanceId;
      if (idx !== undefined && idx < planets.length) {
        const p = planets[idx];
        setHovered({ id: p.id, position: [p.x, p.y, p.z] });
      }
    },
    [planets],
  );

  const handlePlanetPointerOut = useCallback(() => setHovered(null), []);

  // ═══ Handle star click ═══
  const handleStarClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const idx = e.index;
      if (idx !== undefined && idx < stars.length) {
        onSelect(stars[idx].id);
      }
    },
    [stars, onSelect],
  );

  const handleStarPointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const idx = e.index;
      if (idx !== undefined && idx < stars.length) {
        const s = stars[idx];
        setHovered({ id: s.id, position: [s.x, s.y, s.z] });
      }
    },
    [stars],
  );

  // ═══ Handle root click ═══
  const handleRootClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (rootNode) onSelect(rootNode.id);
    },
    [rootNode, onSelect],
  );

  const handleRootPointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (rootNode) setHovered({ id: rootNode.id, position: [0, 0, 0] });
    },
    [rootNode],
  );



  // ═══ Edge opacity scaling ═══
  const edgeOpacities = useMemo(() => {
    const base = settings.edgeOpacity / 0.15; // normalize around default 0.15
    return [0.35 * base, 0.18 * base, 0.08 * base];
  }, [settings.edgeOpacity]);

  // ═══ Animate dust particles ═══
  const dustRef = useRef<THREE.Points>(null);
  useFrame((_, delta) => {
    if (dustRef.current) {
      dustRef.current.rotation.y += delta * 0.02;
    }
  });

  // ═══ Star flickering — randomly brighten ~5% each frame ═══
  const starOrigColors = useRef<Float32Array | null>(null);
  const starTimers = useRef<Float32Array | null>(null);
  useFrame((_, delta) => {
    if (!starRef.current || stars.length === 0) return;
    const geo = starRef.current.geometry;
    const colArr = geo.attributes.color.array as Float32Array;
    if (!starOrigColors.current) {
      starOrigColors.current = new Float32Array(colArr);
      starTimers.current = new Float32Array(stars.length);
    }
    const timers = starTimers.current!;
    const orig = starOrigColors.current!;
    for (let i = 0; i < stars.length; i++) {
      timers[i] -= delta;
      if (timers[i] <= 0) {
        colArr[i * 3] = orig[i * 3];
        colArr[i * 3 + 1] = orig[i * 3 + 1];
        colArr[i * 3 + 2] = orig[i * 3 + 2];
      }
    }
    const flickerN = Math.max(1, Math.floor(stars.length * 0.05));
    for (let f = 0; f < flickerN; f++) {
      const idx = Math.floor(Math.random() * stars.length);
      colArr[idx * 3] = 1.0;
      colArr[idx * 3 + 1] = 1.0;
      colArr[idx * 3 + 2] = 1.0;
      timers[idx] = 0.12 + Math.random() * 0.25;
    }
    geo.attributes.color.needsUpdate = true;
  });

  return (
    <group ref={groupRef}>
      {/* ── Deep field stars ── */}
      <Stars radius={300} depth={100} count={4000} factor={5} saturation={0.3} fade speed={0.3} />

      {/* ── God rays from root ── */}
      <GodRays />

      {/* ── Bokeh floating particles ── */}
      <BokehParticles />

      {/* ── OrbitControls ── */}
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        autoRotate
        autoRotateSpeed={0.2}
        minDistance={20}
        maxDistance={600}
        maxPolarAngle={Math.PI * 0.8}
      />

      {/* ── Ribbon arcs (Ring 1: root→planet, TubeGeometry) ── */}
      <RibbonArcs edges={layout.edges} />

      {/* ── Edge arcs (Rings 2 & 3: LineSegments) ── */}
      {edgeGeos[1].attributes.position.count > 0 && (
        <lineSegments geometry={edgeGeos[1]}>
          <lineBasicMaterial
            color={clr.edgeR2}
            transparent
            opacity={edgeOpacities[1]}
            depthWrite={false}
          />
        </lineSegments>
      )}
      {edgeGeos[2].attributes.position.count > 0 && (
        <lineSegments geometry={edgeGeos[2]}>
          <lineBasicMaterial
            color={clr.edgeR3}
            transparent
            opacity={edgeOpacities[2]}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* ── Dust particles (Ring 3) ── */}
      {dustData.positions.length > 0 && (
        <points ref={dustRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[dustData.positions, 3]}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[dustData.colors, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            size={0.3 * settings.nodeSize}
            vertexColors
            sizeAttenuation
            transparent
            opacity={0.5}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      )}

      {/* ── Star nodes (Ring 2) — Points ── */}
      {starData.positions.length > 0 && (
        <points
          ref={starRef}
          onClick={handleStarClick}
          onPointerOver={handleStarPointerOver}
          onPointerOut={handlePlanetPointerOut}
        >
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[starData.positions, 3]}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[starData.colors, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            size={0.6 * settings.nodeSize}
            vertexColors
            sizeAttenuation
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            opacity={0.9}
            transparent
          />
        </points>
      )}

      {/* ── Planet nodes (Ring 1) — InstancedMesh ── */}
      {planets.length > 0 && (
        <instancedMesh
          ref={planetRef}
          args={[undefined, undefined, planets.length]}
          onClick={handlePlanetClick}
          onPointerOver={handlePlanetPointerOver}
          onPointerOut={handlePlanetPointerOut}
        >
          <sphereGeometry args={[1.0 * settings.nodeSize, 24, 24]} />
          <meshStandardMaterial
            roughness={0.25}
            metalness={0.05}
            toneMapped={false}
            emissive={new THREE.Color("#80b0ff")}
            emissiveIntensity={1.5}
          />
        </instancedMesh>
      )}

      {/* ── Hover highlight indicator ── */}
      {hovered && (
        <mesh position={hovered.position}>
          <sphereGeometry args={[1.5 * settings.nodeSize, 16, 16]} />
          <meshBasicMaterial
            color="white"
            transparent
            opacity={0.25}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* ── Flow particles along edges ── */}
      <FlowParticles edges={layout.edges} />

      {/* ── Root sun: blue-white gradient glow ── */}
      {rootNode && (
        <group>
          {/* PointLight at core */}
          <pointLight
            position={[0, 0, 0]}
            intensity={8}
            color="#80b0ff"
            distance={200}
            decay={2}
          />
          {/* Core sphere */}
          <mesh
            onClick={handleRootClick}
            onPointerOver={handleRootPointerOver}
            onPointerOut={handlePlanetPointerOut}
          >
            <sphereGeometry args={[2.5 * settings.nodeSize, 48, 48]} />
            <meshStandardMaterial
              color="#e0f0ff"
              emissive="#e0f0ff"
              emissiveIntensity={8}
              roughness={0.05}
              metalness={0.02}
              toneMapped={false}
            />
          </mesh>
          {/* Root glow — transparent spheres instead of rings for reliability */}
          <mesh>
            <sphereGeometry args={[2.0 * settings.nodeSize, 32, 32]} />
            <meshBasicMaterial color="#80b0ff" transparent opacity={0.08} depthWrite={false} />
          </mesh>
          <mesh>
            <sphereGeometry args={[3.0 * settings.nodeSize, 32, 32]} />
            <meshBasicMaterial color="#c4b5fd" transparent opacity={0.04} depthWrite={false} />
          </mesh>
          <mesh>
            <sphereGeometry args={[4.5 * settings.nodeSize, 32, 32]} />
            <meshBasicMaterial color="#e879f9" transparent opacity={0.02} depthWrite={false} />
          </mesh>
          {/* Ambient glow sphere */}
          <mesh>
            <sphereGeometry args={[6.0 * settings.nodeSize, 32, 32]} />
            <meshBasicMaterial
              color="#80b0ff"
              transparent
              opacity={0.06}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {/* ── Post-processing ── */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.05}
          intensity={settings.bloomStrength}
          radius={1.2}
          mipmapBlur
        />
      </EffectComposer>
    </group>
  );
}

// ══════════════════════════════════════════════════════════
// DEFAULT SETTINGS
// ══════════════════════════════════════════════════════════
const DEFS: GalaxySettings = {
  nodeSize: 0.8,
  edgeOpacity: 0.15,
  bloomStrength: 2.5,
  chargeStrength: -400,
  linkDistance: 4,
  linkStrength: 0.7,
  centerGravity: 1.0,
};

// ══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════
interface Props {
  projectPath: string;
  fullscreen?: boolean;
}

export default function ProjectGalaxy({ projectPath, fullscreen = false }: Props) {
  const { graph, loading, refresh } = useScanGraph(projectPath);
  const { theme } = useTheme();
  const { t } = useTranslation();
  const isDark = theme === "dark";
  const clr = isDark ? C.dark : C.light;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [settings, setSettings] = useState<GalaxySettings>(DEFS);
  const [dim, setDim] = useState({ w: window.innerWidth, h: window.innerHeight });

  // Loading timeout
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => setLoadTimedOut(true), 15000);
      return () => clearTimeout(t);
    }
    setLoadTimedOut(false);
  }, [loading]);

  // Resize listener
  useEffect(() => {
    const onR = () => setDim({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  // Compute layout from graph data
  const layout = useMemo(
    () =>
      graph
        ? computeRadialLayout(graph.nodes, graph.edges, isDark)
        : { nodes: [], edges: [] },
    [graph, isDark],
  );

  // Selected node data for info panel
  const selectedNode = useMemo(
    () => layout.nodes.find((n) => n.id === selectedId) ?? null,
    [layout.nodes, selectedId],
  );

  const cnt = layout.nodes.length;
  const pc = layout.nodes.filter((n) => n.type === "planet").length;
  const sc = layout.nodes.filter((n) => n.type === "star").length;
  const canvasW = dim.w - (fullscreen ? 0 : 200) - (panelOpen ? 280 : 0);

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ background: clr.bg }}
    >
      {!loading && layout.nodes.length > 0 ? (
        <Canvas
          camera={{ position: [0, 30, 120], fov: 50, near: 0.1, far: 1000 }}
          gl={{ antialias: true, alpha: false }}
          style={{ width: canvasW, height: dim.h - 48 }}
          onPointerMissed={() => setSelectedId(null)}
        >
          <GalaxyScene
            layout={layout}
            settings={settings}
            isDark={isDark}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </Canvas>
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
                  borderColor: isDark
                    ? "rgba(100,96,255,0.15)"
                    : "rgba(0,0,0,0.1)",
                  borderTopColor: isDark ? "#8880ff" : "#6366f1",
                }}
              />
              <p>
                {loadTimedOut
                  ? "Still scanning... large project?"
                  : t("app.scanning")}
              </p>
            </>
          ) : (
            <>
              <p style={{ fontWeight: 600 }}>{t("app.noData")}</p>
              <p style={{ fontSize: 12, opacity: 0.6 }}>
                Project: {projectPath}
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Title overlay ── */}
      <div className="absolute top-6 left-8 pointer-events-none select-none">
        <h1
          className="text-2xl font-extrabold tracking-[0.12em]"
          style={{
            color: clr.ui.text,
            textShadow: isDark
              ? "0 0 40px rgba(136,128,255,0.4)"
              : "none",
          }}
        >
          {t("app.title")}
        </h1>
        <p style={{ color: clr.ui.dim, fontSize: 12, marginTop: 4 }}>
          {cnt > 0
            ? `${pc} planets · ${sc} stars · ${layout.edges.length} orbits`
            : t("app.awaiting")}
        </p>
      </div>

      {/* ── Buttons ── */}
      <button
        onClick={() => setPanelOpen((v) => !v)}
        className="absolute top-6 right-6 z-30 w-8 h-8 rounded-lg flex items-center justify-center"
        style={{
          background: clr.ui.card,
          border: `1px solid ${clr.ui.border}`,
          color: clr.ui.dim,
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      <button
        onClick={refresh}
        className="absolute bottom-6 right-6 z-20 w-8 h-8 rounded-lg flex items-center justify-center"
        style={{
          background: clr.ui.card,
          border: `1px solid ${clr.ui.border}`,
          color: clr.ui.dim,
        }}
        title="Rescan"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M1 4v6h6M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      </button>

      {/* ── Settings panel ── */}
      <SettingsPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        settings={settings}
        onChange={setSettings}
      />

      {/* ── Selected node info card ── */}
      {selectedNode && (
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
              {selectedNode.type !== "star" && selectedNode.type !== "dust" ? (
                <FolderOpen size={18} color={clr.dirCyan} />
              ) : (
                <File size={18} color={clr.ui.dim} />
              )}
              <span
                className="text-sm font-semibold"
                style={{ color: clr.ui.text }}
              >
                {selectedNode.name}
              </span>
            </div>
            <button onClick={() => setSelectedId(null)}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={clr.ui.muted}
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div
            className="space-y-1.5 text-xs"
            style={{ color: clr.ui.muted }}
          >
            <p className="break-all">{selectedNode.path}</p>
            <div className="flex gap-4 mt-2">
              <span className="flex items-center gap-1">
                <Hash size={10} />
                {selectedNode.type}
              </span>
              {selectedNode.size != null && selectedNode.size > 0 && (
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {selectedNode.size < 1024
                    ? `${selectedNode.size}B`
                    : `${(selectedNode.size / 1024).toFixed(1)}KB`}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── HUD overlay panel ── */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
          padding: "24px 32px 16px",
          pointerEvents: "none",
          zIndex: 15,
        }}
      >
        {selectedNode ? (
          <div style={{ display: "flex", gap: 16, alignItems: "center", color: "#e0e7ff", fontSize: 13 }}>
            <span style={{ color: selectedNode.color || "#e0e7ff" }}>●</span>
            <span style={{ fontWeight: 600 }}>{selectedNode.name}</span>
            <span style={{ color: "#a1a1aa", fontSize: 11 }}>{selectedNode.type}</span>
            {selectedNode.path && (
              <span style={{ color: "#71717a", fontSize: 11 }}>{selectedNode.path}</span>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 32, color: "#a1a1aa", fontSize: 12 }}>
            <span>● {cnt} Nodes</span>
            <span>● {layout.edges.length} Connections</span>
            <span>OrbitControls: drag/zoom</span>
          </div>
        )}
      </div>
    </div>
  );
}
