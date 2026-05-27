// ProjectGalaxy — 3D Spherical Particle Galaxy (R3F)
// Layout: RootStar → InstancedMesh(dirs) → Points(files) → Points(dust)
// Bezier arc edges + InstancedMesh + Points + Bloom
// Full dark/light theme support via useTheme()
// Uses Fibonacci sphere for uniform spherical distribution

import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { forceSimulation, forceManyBody, forceLink, forceCenter } from "d3-force-3d";
import { useScanGraph } from "@/hooks/useObservatory";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "react-i18next";
import { SettingsPanel, type GalaxySettings } from "./SettingsPanel";
import type { FileNode, FileEdge } from "@/lib/types";
import { FolderOpen, File, Hash, Clock } from "lucide-react";

// ══════════════════════════════════════════════════════════
// THEME COLORS
// ══════════════════════════════════════════════════════════
const DARK = {
  root: "#e0f0ff",
  rootEmissive: 8,
  rootHalo: ["#80b0ff", "#c4b5fd", "#e879f9"] as const,
  dir1: "#67e8f9",
  dir2: "#e879f9",
  edgeRoot: "#6366f1",
  edgeDir: "#8b5cf6",
  edgeFile: "#facc15",
  file: {
    ts: "#67e8f9", tsx: "#67e8f9", js: "#67e8f9", jsx: "#67e8f9",
    rs: "#e879f9",
    md: "#c084fc", mdx: "#c084fc",
    json: "#facc15", toml: "#facc15", yaml: "#facc15", yml: "#facc15",
    css: "#4ade80", scss: "#4ade80", less: "#4ade80",
    html: "#fb923c", htm: "#fb923c",
    py: "#2dd4bf",
    c: "#94a3b8", h: "#94a3b8", cpp: "#94a3b8", cc: "#94a3b8", hpp: "#94a3b8",
    go: "#60b0d0",
  } as Record<string, string>,
  defaultFile: "#c4b5fd",
  dust: "#f0c060",
  bg: "#05050f",
  ui: { bg: "#08080c", card: "rgba(8,4,20,0.97)", border: "rgba(99,102,241,0.12)", text: "#e0e7ff", dim: "#a1a1aa", muted: "#71717a" },
};

const LIGHT = {
  root: "#1e1b4b",
  rootEmissive: 3,
  rootHalo: ["#6366f1", "#7c3aed", "#a78bfa"] as const,
  dir1: "#0284c8",
  dir2: "#7c3aed",
  edgeRoot: "#64748b",
  edgeDir: "#6366f1",
  edgeFile: "#ca8a04",
  file: {
    ts: "#0284c7", tsx: "#0369a1", js: "#0284c7", jsx: "#0369a1",
    rs: "#7c3aed",
    md: "#7c3aed", mdx: "#7c3aed",
    json: "#ca8a04", toml: "#ca8a04", yaml: "#ca8a04", yml: "#ca8a04",
    css: "#16a34a", scss: "#15803d", less: "#15803d",
    html: "#ea580c", htm: "#ea580c",
    py: "#0d9488",
    c: "#64748b", h: "#64748b", cpp: "#64748b", cc: "#64748b", hpp: "#64748b",
    go: "#0891b2",
  } as Record<string, string>,
  defaultFile: "#6d28d9",
  dust: "#b8860b",
  bg: "#f8fafc",
  ui: { bg: "#ffffff", card: "rgba(255,255,255,0.95)", border: "rgba(0,0,0,0.08)", text: "#1e293b", dim: "#64748b", muted: "#94a3b8" },
};

// ══════════════════════════════════════════════════════════
// SPHERICAL LAYOUT TYPES
// ══════════════════════════════════════════════════════════
interface SphericalNode {
  id: string;
  name: string;
  path: string;
  type: "root" | "planet" | "star" | "dust";
  color: string;
  x: number;
  y: number;
  z: number;
  extension?: string;
  size?: number;
  depth: number;
}

interface SphericalEdge {
  from: SphericalNode;
  to: SphericalNode;
  color: string;
  /** Number of leaf file descendants under the source node; drives silk-bundle density. */
  childrenCount?: number;
}

// ══════════════════════════════════════════════════════════
// SHELL CONFIG
// ══════════════════════════════════════════════════════════
const SHELL = {
  dir1Inner: 50,
  dir1Outer: 70,
  dir2Inner: 90,
  dir2Outer: 120,
  fileInner: 140,
  fileOuter: 180,
  dustMin: 200,
  dustMax: 280,
};

// ══════════════════════════════════════════════════════════
// FIBONACCI SPHERE
// ══════════════════════════════════════════════════════════
function fibonacciSphere(
  n: number,
  radius: number,
  center: [number, number, number] = [0, 0, 0],
): [number, number, number][] {
  const points: [number, number, number][] = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / Math.max(n - 1, 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = phi * i;
    points.push([
      center[0] + radius * r * Math.cos(theta),
      center[1] + radius * y,
      center[2] + radius * r * Math.sin(theta),
    ]);
  }
  return points;
}

// ══════════════════════════════════════════════════════════
// RANDOM ON SPHERE
// ══════════════════════════════════════════════════════════
function randomOnSphere(radius: number, center: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  return [
    center[0] + radius * Math.sin(phi) * Math.cos(theta),
    center[1] + radius * Math.sin(phi) * Math.sin(theta),
    center[2] + radius * Math.cos(phi),
  ];
}

// ══════════════════════════════════════════════════════════
// SPHERICAL LAYOUT COMPUTATION
// ══════════════════════════════════════════════════════════
function computeSphericalLayout(
  nodes: FileNode[],
  edges: FileEdge[],
  isDark: boolean,
): { nodes: SphericalNode[]; edges: SphericalEdge[] } {
  const clr = isDark ? DARK : LIGHT;

  // Find root (node with no incoming edges)
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

  // BFS depth assignment
  const depthMap = new Map<string, number>();
  const nodesByDepth = new Map<number, FileNode[]>();
  const parentMap = new Map<string, string>();
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

  // Build leaf & childrenCount maps for silk-bundle density
  const sourceSetForLeaves = new Set(edges.map((e) => e.source));
  const leafIds = new Set<string>();
  for (const n of nodes) {
    if (!sourceSetForLeaves.has(n.id) && n.id !== root.id && depthMap.has(n.id)) {
      leafIds.add(n.id);
    }
  }
  const childrenCountMap = new Map<string, number>();
  function countLeaves(nodeId: string): number {
    if (childrenCountMap.has(nodeId)) return childrenCountMap.get(nodeId)!;
    const ch = children.get(nodeId) || [];
    let total = 0;
    for (const cid of ch) {
      if (leafIds.has(cid)) {
        total += 1;
      } else {
        total += countLeaves(cid);
      }
    }
    childrenCountMap.set(nodeId, total);
    return total;
  }
  countLeaves(root.id);
  for (const nodeId of children.keys()) {
    countLeaves(nodeId);
  }

  const sphericalNodes = new Map<string, SphericalNode>();
  const resultNodes: SphericalNode[] = [];

  // Shell 0: root at (0, 0, 0)
  const rootSN: SphericalNode = {
    id: root.id,
    name: root.label,
    path: root.path,
    type: "root",
    color: clr.root,
    x: 0, y: 0, z: 0,
    depth: 0,
  };
  sphericalNodes.set(root.id, rootSN);
  resultNodes.push(rootSN);

  // Shell 1: depth-1 dirs, Fibonacci sphere at varying radii (50-70)
  const depth1 = nodesByDepth.get(1) || [];
  const d1Count = depth1.length || 1;
  if (depth1.length > 0) {
    const shell1Radius = SHELL.dir1Inner + Math.random() * (SHELL.dir1Outer - SHELL.dir1Inner);
    const fiboPoints = fibonacciSphere(d1Count, shell1Radius);
    depth1.forEach((node, i) => {
      const [x, y, z] = fiboPoints[i % fiboPoints.length];
      const jitterZ = (Math.random() - 0.5) * 20;
      const sn: SphericalNode = {
        id: node.id, name: node.label, path: node.path,
        type: "planet",
        color: i % 2 === 0 ? clr.dir1 : clr.dir2,
        x, y: y + (Math.random() - 0.5) * 8, z: z + jitterZ,
        depth: 1,
      };
      sphericalNodes.set(node.id, sn);
      resultNodes.push(sn);
    });
  }

  // Shell 2: depth-2+ dirs, middle shell (90-120)
  const depth2 = nodesByDepth.get(2) || [];
  if (depth2.length > 0) {
    const shell2Radius = SHELL.dir2Inner + Math.random() * (SHELL.dir2Outer - SHELL.dir2Inner);
    const fiboPoints2 = fibonacciSphere(depth2.length, shell2Radius);
    depth2.forEach((node, i) => {
      const [x, y, z] = fiboPoints2[i];
      const jitterZ = (Math.random() - 0.5) * 20;
      const sn: SphericalNode = {
        id: node.id, name: node.label, path: node.path,
        type: "planet",
        color: clr.dir2,
        x, y: y + (Math.random() - 0.5) * 8, z: z + jitterZ,
        depth: 2,
      };
      sphericalNodes.set(node.id, sn);
      resultNodes.push(sn);
    });
  }

  // Collect all deeper dirs (depth 3+) as "planet" too — middle shell
  for (let d = 3; d <= 10; d++) {
    const layer = nodesByDepth.get(d);
    if (!layer || layer.length === 0) break;
    // deeper dirs pushed a bit outward
    const r = SHELL.dir2Outer + (d - 2) * 10;
    const fiboPoints = fibonacciSphere(layer.length, r);
    layer.forEach((node, i) => {
      const [x, y, z] = fiboPoints[i % fiboPoints.length];
      const jitterZ = (Math.random() - 0.5) * 20;
      const sn: SphericalNode = {
        id: node.id, name: node.label, path: node.path,
        type: "planet",
        color: clr.dir2,
        x, y: y + (Math.random() - 0.5) * 8, z: z + jitterZ,
        depth: d,
      };
      sphericalNodes.set(node.id, sn);
      resultNodes.push(sn);
    });
  }

  // Shell 3: file nodes (leaves with extensions) — outer shell 140-180 around parents
  // Find all leaf nodes (nodes that are not sources of any edge)
  const sourceSet = new Set(edges.map((e) => e.source));
  const leafNodes = nodes.filter(
    (n) => !sourceSet.has(n.id) && n.id !== root.id && depthMap.has(n.id),
  );

  // Group file nodes by parent
  const filesByParent = new Map<string, FileNode[]>();
  for (const fn of leafNodes) {
    const p = parentMap.get(fn.id);
    if (p) {
      const list = filesByParent.get(p) || [];
      list.push(fn);
      filesByParent.set(p, list);
    }
  }

  const fileRadiusBase = SHELL.fileInner + Math.random() * (SHELL.fileOuter - SHELL.fileInner);
  for (const [parentId, childNodes] of filesByParent) {
    const parentSN = sphericalNodes.get(parentId);
    if (!parentSN) continue;
    const parentPos: [number, number, number] = [parentSN.x, parentSN.y, parentSN.z];
    const count = childNodes.length || 1;
    const offsetRadius = 8 + Math.random() * 6; // per-parent cluster spread

    childNodes.forEach((node, i) => {
      // Spherical offset around parent position with sector constraint
      const [ox, oy, oz] = randomOnSphere(offsetRadius);
      // Blend: parent position + spherical offset + some fileRadius push outward
      const pushFactor = (i / Math.max(count - 1, 1)) * 0.6 + 0.4; // 0.4-1.0
      const pushR = fileRadiusBase * pushFactor + Math.random() * 10;
      // Normalize parent position direction for outward push
      const pDist = Math.sqrt(parentPos[0] ** 2 + parentPos[1] ** 2 + parentPos[2] ** 2) || 1;
      const nx = parentPos[0] / pDist;
      const nz = parentPos[2] / pDist;
      const ext = (node.extension || "").toLowerCase();
      const starDepth = depthMap.get(node.id) ?? 2;
      // Extra random jitter for outer file nodes (deeper orbits → more scatter)
      const jitterX = starDepth >= 2 ? (Math.random() - 0.5) * 50 : 0;
      const jitterY = starDepth >= 2 ? (Math.random() - 0.5) * 50 : 0;
      const jitterZ = starDepth >= 2 ? (Math.random() - 0.5) * 50 : 0;
      const sn: SphericalNode = {
        id: node.id, name: node.label, path: node.path,
        type: "star",
        color: clr.file[ext] || clr.defaultFile,
        x: parentPos[0] + ox + nx * pushR * 0.3 + jitterX,
        y: parentPos[1] + oy + jitterY,
        z: parentPos[2] + oz + nz * pushR * 0.3 + (Math.random() - 0.5) * 20 + jitterZ,
        extension: node.extension, size: node.size,
        depth: starDepth,
      };
      sphericalNodes.set(node.id, sn);
      resultNodes.push(sn);
    });
  }

  // Shell 4: dust (remaining deeper nodes that aren't dirs or leaves)
  const alreadyPlaced = new Set(sphericalNodes.keys());
  const remaining = nodes.filter((n) => !alreadyPlaced.has(n.id));
  if (remaining.length > 0) {
    for (const node of remaining) {
      const p = parentMap.get(node.id);
      const paPos: [number, number, number] = p && sphericalNodes.get(p)
        ? [sphericalNodes.get(p)!.x, sphericalNodes.get(p)!.y, sphericalNodes.get(p)!.z]
        : [0, 0, 0];
      const dustR = SHELL.dustMin + Math.random() * (SHELL.dustMax - SHELL.dustMin);
      const [sx, sy, sz] = randomOnSphere(dustR);
      const d = depthMap.get(node.id) ?? 99;
      const sn: SphericalNode = {
        id: node.id, name: node.label, path: node.path,
        type: "dust", color: clr.dust,
        x: paPos[0] * 0.3 + sx,
        y: paPos[1] * 0.3 + sy,
        z: paPos[2] * 0.3 + sz + (Math.random() - 0.5) * 30,
        depth: d,
      };
      sphericalNodes.set(node.id, sn);
      resultNodes.push(sn);
    }
  }

  // Build edges: color by source depth, store childrenCount for silk-bundle density
  const resultEdges: SphericalEdge[] = [];
  for (const e of edges) {
    const from = sphericalNodes.get(e.source);
    const to = sphericalNodes.get(e.target);
    if (!from || !to) continue;
    const color = from.depth === 0 ? clr.edgeRoot
      : from.depth === 1 ? clr.edgeDir
      : clr.edgeFile;
    const cc = childrenCountMap.get(e.source) ?? 0;
    resultEdges.push({ from, to, color, childrenCount: cc });
  }

  // Root-to-file edges: connect root to every file (star) node — radiating filaments
  const rootSN_forEdge = sphericalNodes.get(root.id)!;
  for (const sn of resultNodes) {
    if (sn.type === "star") {
      resultEdges.push({ from: rootSN_forEdge, to: sn, color: "#c8d0ff", childrenCount: 0 });
    }
  }

  return { nodes: resultNodes, edges: resultEdges };
}

// ══════════════════════════════════════════════════════════
// FORCE LAYOUT COMPUTATION (d3-force-3d)
// ══════════════════════════════════════════════════════════
function computeForceLayout(
  initial: ReturnType<typeof computeSphericalLayout>,
  settings: GalaxySettings,
): ReturnType<typeof computeSphericalLayout> {
  if (initial.nodes.length <= 1) return initial;

  // Build force-simulation nodes from initial positions
  const forceNodes = initial.nodes.map((n) => ({
    x: n.x,
    y: n.y,
    z: n.z,
    fx: n.type === "root" ? 0 : (undefined as number | undefined),
    fy: n.type === "root" ? 0 : (undefined as number | undefined),
    fz: n.type === "root" ? 0 : (undefined as number | undefined),
  }));

  // Build link references by node id → array index
  const idToIdx = new Map(initial.nodes.map((n, i) => [n.id, i]));
  const forceLinks = initial.edges
    .filter((e) => idToIdx.has(e.from.id) && idToIdx.has(e.to.id))
    .map((e) => ({
      source: idToIdx.get(e.from.id)!,
      target: idToIdx.get(e.to.id)!,
    }));

  if (forceLinks.length > 0) {
    const sim = forceSimulation(forceNodes, 3)
      .force("charge", forceManyBody().strength(settings.chargeStrength))
      .force(
        "link",
        forceLink(forceLinks)
          .distance(settings.linkDistance)
          .strength(settings.linkStrength),
      )
      .force(
        "center",
        forceCenter(0, 0, 0).strength(settings.centerGravity),
      )
      .stop();

    // Run 300 ticks synchronously (instant layout)
    for (let i = 0; i < 300; i++) sim.tick();
  }

  // Copy force-sim positions back onto new SphericalNode objects
  const resultNodes: SphericalNode[] = initial.nodes.map((n, i) => ({
    ...n,
    x: forceNodes[i].x,
    y: forceNodes[i].y,
    z: forceNodes[i].z,
  }));

  // Rebuild edges so they reference the new node objects
  const nodeMap = new Map(resultNodes.map((n) => [n.id, n]));
  const resultEdges: SphericalEdge[] = initial.edges.map((e) => ({
    ...e,
    from: nodeMap.get(e.from.id)!,
    to: nodeMap.get(e.to.id)!,
  }));

  return { nodes: resultNodes, edges: resultEdges };
}

// ══════════════════════════════════════════════════════════
// SCENE (inside Canvas)
// ══════════════════════════════════════════════════════════
interface SceneProps {
  layout: ReturnType<typeof computeSphericalLayout>;
  settings: GalaxySettings;
  isDark: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function GalaxyScene({ layout, settings, isDark, selectedId, onSelect }: SceneProps) {
  const clr = isDark ? DARK : LIGHT;
  const planetRef = useRef<THREE.InstancedMesh>(null);
  const dustRef = useRef<THREE.Points>(null);
  const [hovered, setHovered] = useState<{ id: string; position: [number, number, number] } | null>(null);

  // ── Filter nodes by type ──
  const planets = useMemo(() => layout.nodes.filter((n) => n.type === "planet"), [layout.nodes]);
  const stars = useMemo(() => layout.nodes.filter((n) => n.type === "star"), [layout.nodes]);
  const dusts = useMemo(() => layout.nodes.filter((n) => n.type === "dust"), [layout.nodes]);
  const rootNode = useMemo(() => layout.nodes.find((n) => n.type === "root"), [layout.nodes]);

  // ── StarPoints data (vertex colors, AdditiveBlending) ──
  const starPositions = useMemo(
    () => new Float32Array(stars.flatMap((s) => [s.x, s.y, s.z])),
    [stars],
  );
  const starColors = useMemo(
    () => new Float32Array(stars.flatMap((s) => {
      const c = new THREE.Color(s.color);
      return [c.r, c.g, c.b];
    })),
    [stars],
  );

  // ── DustPoints data ──
  const dustPositions = useMemo(
    () => new Float32Array(dusts.flatMap((d) => [d.x, d.y, d.z])),
    [dusts],
  );
  const dustColors = useMemo(() => {
    const c = new THREE.Color(clr.dust);
    return new Float32Array(dusts.flatMap(() => [c.r, c.g, c.b]));
  }, [dusts, clr.dust]);

  // ── ArcEdges: filament-style glowing white edges with distance gradient,
  //   silk-bundle parallel offsets, split near/far for blending ──
  const { nearArcGeometry, farArcGeometry } = useMemo(() => {
    const nearPositions: number[] = [];
    const nearColors: number[] = [];
    const farPositions: number[] = [];
    const farColors: number[] = [];

    // Map midpoint distance to filament color (blue-white core → grey-white outskirts)
    function filament(dist: number): { hex: string; bright: number } {
      if (dist < 50) {
        return { hex: "#e0e8ff", bright: 0.30 + (dist / 50) * 0.05 }; // 0.30–0.35
      } else if (dist < 150) {
        const t = (dist - 50) / 100;
        return { hex: "#c0c8e0", bright: 0.25 - t * 0.10 }; // 0.25 → 0.15
      } else {
        const t = Math.min((dist - 150) / 130, 1);
        return { hex: "#a0a0c0", bright: 0.12 - t * 0.06 }; // 0.12 → 0.06
      }
    }

    for (const edge of layout.edges) {
      const from = new THREE.Vector3(edge.from.x, edge.from.y, edge.from.z);
      const to = new THREE.Vector3(edge.to.x, edge.to.y, edge.to.z);
      const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
      const dist = mid.length();
      const isNear = dist < 80;

      // Filament color & brightness from distance
      const { hex, bright } = filament(dist);
      const baseColor = new THREE.Color(hex).multiplyScalar(bright);

      // Control point: push midpoint outward by distance * 0.4
      let control: THREE.Vector3;
      if (dist > 0.01) {
        control = mid.clone().add(mid.clone().normalize().multiplyScalar(dist * 0.4));
      } else {
        control = new THREE.Vector3(
          (from.x + to.x) / 2,
          (from.y + to.y) / 2 + 15,
          (from.z + to.z) / 2,
        );
      }

      // Silk bundle: parallel offset curves for dense folders (childrenCount > 10)
      const cc = edge.childrenCount ?? 0;
      const numExtra = cc > 10 ? 2 : 0;
      const offsetMag = Math.min(cc / 5, 3);

      // Perpendicular direction for offset (cross with up vector, or X as fallback)
      const edgeDir = new THREE.Vector3().subVectors(to, from).normalize();
      let perp: THREE.Vector3;
      if (Math.abs(edgeDir.y) < 0.9) {
        perp = new THREE.Vector3().crossVectors(edgeDir, new THREE.Vector3(0, 1, 0)).normalize();
      } else {
        perp = new THREE.Vector3().crossVectors(edgeDir, new THREE.Vector3(1, 0, 0)).normalize();
      }

      // Offsets: 0 (main strand), +offset, -offset
      const offsets = [0];
      for (let oi = 0; oi < numExtra; oi++) {
        offsets.push(offsetMag * (oi + 1) / numExtra);
        offsets.push(-offsetMag * (oi + 1) / numExtra);
      }

      for (const off of offsets) {
        const offVec = perp.clone().multiplyScalar(off);
        const fOff = from.clone().add(offVec);
        const tOff = to.clone().add(offVec);
        const cOff = control.clone().add(offVec);

        const curve = new THREE.QuadraticBezierCurve3(fOff, cOff, tOff);
        const pts = curve.getPoints(24);
        // Offset strands are fainter than the main filament
        const mult = off === 0 ? 1.0 : 0.45;
        const col = baseColor.clone().multiplyScalar(mult);

        const targetPositions = isNear ? nearPositions : farPositions;
        const targetColors = isNear ? nearColors : farColors;

        for (let i = 0; i < pts.length - 1; i++) {
          targetPositions.push(pts[i].x, pts[i].y, pts[i].z);
          targetPositions.push(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
          targetColors.push(col.r, col.g, col.b);
          targetColors.push(col.r, col.g, col.b);
        }
      }
    }

    const nearGeo = new THREE.BufferGeometry();
    if (nearPositions.length > 0) {
      nearGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nearPositions), 3));
      nearGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(nearColors), 3));
    }

    const farGeo = new THREE.BufferGeometry();
    if (farPositions.length > 0) {
      farGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(farPositions), 3));
      farGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(farColors), 3));
    }

    return { nearArcGeometry: nearGeo, farArcGeometry: farGeo };
  }, [layout.edges]);

  // ── Planet instance transforms ──
  useEffect(() => {
    const mesh = planetRef.current;
    if (!mesh || planets.length === 0) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      dummy.position.set(p.x, p.y, p.z);
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

  // ── Event handlers ──
  const clearHover = useCallback(() => setHovered(null), []);

  const handlePlanetClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined && e.instanceId < planets.length) {
        onSelect(planets[e.instanceId].id);
      }
    },
    [planets, onSelect],
  );

  const handlePlanetOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined && e.instanceId < planets.length) {
        const p = planets[e.instanceId];
        setHovered({ id: p.id, position: [p.x, p.y, p.z] });
      }
    },
    [planets],
  );

  const handleStarClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.index !== undefined && e.index < stars.length) {
        onSelect(stars[e.index].id);
      }
    },
    [stars, onSelect],
  );

  const handleStarOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (e.index !== undefined && e.index < stars.length) {
        const s = stars[e.index];
        setHovered({ id: s.id, position: [s.x, s.y, s.z] });
      }
    },
    [stars],
  );

  const handleRootClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (rootNode) onSelect(rootNode.id);
    },
    [rootNode, onSelect],
  );

  const handleRootOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (rootNode) setHovered({ id: rootNode.id, position: [0, 0, 0] });
    },
    [rootNode],
  );

  // ── Dust slow orbit rotation ──
  useFrame((_, delta) => {
    if (dustRef.current) dustRef.current.rotation.y += delta * 0.02;
  });

  // ── Edge opacity ──
  const edgeAlpha = Math.min(1, Math.max(0.02, settings.edgeOpacity * 2.5));

  return (
    <group>
      {/* ── OrbitControls ── */}
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        autoRotate
        autoRotateSpeed={0.15}
        minDistance={30}
        maxDistance={600}
        maxPolarAngle={Math.PI * 0.85}
      />

      {/* ── Near arc segments (dist < 80): AdditiveBlending for core glow ── */}
      {nearArcGeometry.attributes.position?.count > 0 && (
        <lineSegments geometry={nearArcGeometry}>
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={edgeAlpha}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      )}

      {/* ── Far arc segments (dist >= 80): NormalBlending for solid filament tails ── */}
      {farArcGeometry.attributes.position?.count > 0 && (
        <lineSegments geometry={farArcGeometry}>
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={edgeAlpha * 0.8}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* ── DustPoints: gold-amber, slow outer orbit ── */}
      {dustPositions.length > 0 && (
        <points ref={dustRef}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[dustPositions, 3]} />
            <bufferAttribute attach="attributes-color" args={[dustColors, 3]} />
          </bufferGeometry>
          <pointsMaterial
            size={0.3 * settings.nodeSize}
            vertexColors
            sizeAttenuation
            transparent
            opacity={0.45}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      )}

      {/* ── StarPoints: files, vertex colors, AdditiveBlending ── */}
      {starPositions.length > 0 && (
        <points
          onClick={handleStarClick}
          onPointerOver={handleStarOver}
          onPointerOut={clearHover}
        >
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[starPositions, 3]} />
            <bufferAttribute attach="attributes-color" args={[starColors, 3]} />
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

      {/* ── Planets: InstancedMesh with emissive ── */}
      {planets.length > 0 && (
        <instancedMesh
          ref={planetRef}
          args={[undefined, undefined, planets.length]}
          onClick={handlePlanetClick}
          onPointerOver={handlePlanetOver}
          onPointerOut={clearHover}
        >
          <sphereGeometry args={[1.0 * settings.nodeSize, 24, 24]} />
          <meshStandardMaterial
            roughness={0.2}
            metalness={0.05}
            toneMapped={false}
            emissive={new THREE.Color("#80b0ff")}
            emissiveIntensity={2}
          />
        </instancedMesh>
      )}

      {/* ── Hover highlight ring ── */}
      {hovered && (
        <mesh position={hovered.position}>
          <sphereGeometry args={[1.5 * settings.nodeSize, 16, 16]} />
          <meshBasicMaterial color="white" transparent opacity={0.25} depthWrite={false} />
        </mesh>
      )}

      {/* ── RootStar: high-emissive core + 3 translucent halo spheres ── */}
      {rootNode && (
        <group>
          {/* Core */}
          <mesh
            onClick={handleRootClick}
            onPointerOver={handleRootOver}
            onPointerOut={clearHover}
          >
            <sphereGeometry args={[2.5 * settings.nodeSize, 48, 48]} />
            <meshStandardMaterial
              color={clr.root}
              emissive={clr.root}
              emissiveIntensity={clr.rootEmissive}
              roughness={0.05}
              metalness={0.02}
              toneMapped={false}
            />
          </mesh>
          {/* 3 translucent halo spheres */}
          <mesh>
            <sphereGeometry args={[3.5 * settings.nodeSize, 32, 32]} />
            <meshBasicMaterial color={clr.rootHalo[0]} transparent opacity={0.12} depthWrite={false} />
          </mesh>
          <mesh>
            <sphereGeometry args={[5.0 * settings.nodeSize, 32, 32]} />
            <meshBasicMaterial color={clr.rootHalo[1]} transparent opacity={0.06} depthWrite={false} />
          </mesh>
          <mesh>
            <sphereGeometry args={[7.0 * settings.nodeSize, 32, 32]} />
            <meshBasicMaterial color={clr.rootHalo[2]} transparent opacity={0.03} depthWrite={false} />
          </mesh>
        </group>
      )}

      {/* ── Post-processing Bloom (threshold 0.08 for wide glow) ── */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.08}
          intensity={settings.bloomStrength}
          radius={1.0}
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
  nodeSize: 1.2,
  edgeOpacity: 0.05,
  bloomStrength: 0.5,
  chargeStrength: -200,
  linkDistance: 20,
  linkStrength: 0.4,
  centerGravity: 0.1,
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
  const clr = isDark ? DARK : LIGHT;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"sphere" | "force">("sphere");
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

  // Compute layout (sphere or force) from graph
  const layout = useMemo(() => {
    if (!graph) return { nodes: [] as SphericalNode[], edges: [] as SphericalEdge[] };
    const initial = computeSphericalLayout(graph.nodes, graph.edges, isDark);
    if (layoutMode === "force") {
      return computeForceLayout(initial, settings);
    }
    return initial;
  }, [graph, isDark, layoutMode, settings]);

  // Selected node data
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
      {/* ── 3D Canvas or loading state ── */}
      {!loading && layout.nodes.length > 0 ? (
        <Canvas
          camera={{ position: [0, 0, 200], fov: 50, near: 0.1, far: 1000 }}
          gl={{ antialias: true, alpha: false }}
          style={{ width: canvasW, height: dim.h - 48 }}
          onPointerMissed={() => setSelectedId(null)}
        >
          {/* Background stars (count=8000) */}
          <Stars radius={400} depth={150} count={8000} factor={6} saturation={0.2} fade speed={0.3} />

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

      {/* ── Title overlay + stats ── */}
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
            ? `${pc} planets · ${sc} stars · ${layout.edges.length} orbits`
            : t("app.awaiting")}
        </p>
      </div>

      {/* ── Settings button ── */}
      <button
        onClick={() => setPanelOpen((v) => !v)}
        className="absolute top-6 right-6 z-30 w-8 h-8 rounded-lg flex items-center justify-center"
        style={{
          background: clr.ui.card,
          border: `1px solid ${clr.ui.border}`,
          color: clr.ui.dim,
        }}
        title="Settings"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {/* ── Refresh button ── */}
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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
        layoutMode={layoutMode}
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
                <FolderOpen size={18} color={clr.dir1} />
              ) : (
                <File size={18} color={clr.ui.dim} />
              )}
              <span className="text-sm font-semibold" style={{ color: clr.ui.text }}>
                {selectedNode.name}
              </span>
            </div>
            <button onClick={() => setSelectedId(null)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={clr.ui.muted} strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="space-y-1.5 text-xs" style={{ color: clr.ui.muted }}>
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

      {/* ── Layout mode toggle (bottom center) ── */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-20 pointer-events-none z-20">
        <div
          className="flex gap-1 rounded-lg p-1 pointer-events-auto"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          <button
            onClick={() => setLayoutMode("sphere")}
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              background: layoutMode === "sphere" ? "#06b6d4" : "transparent",
              color: layoutMode === "sphere" ? "#fff" : "#888",
            }}
          >
            Sphere
          </button>
          <button
            onClick={() => setLayoutMode("force")}
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              background: layoutMode === "force" ? "#06b6d4" : "transparent",
              color: layoutMode === "force" ? "#fff" : "#888",
            }}
          >
            Force
          </button>
        </div>
      </div>

      {/* ── HUD overlay (bottom bar) ── */}
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
