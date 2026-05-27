// ProjectGalaxy — 3D Force-Directed Volumetric Cloud Galaxy (R3F)
// Layout: RootStar → InstancedMesh(dirs) → Points(files) → Points(dust)
// Bezier arc edges + InstancedMesh + Points + Bloom
// Full dark/light theme support via useTheme()
// Hybrid: volumetric random init + d3-force-3d simulation (single layout, no toggle)

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
// GALAXY NODE TYPES
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
  /** Connectivity degree (in-edges + out-edges); computed post-layout */
  degree?: number;
}

interface SphericalEdge {
  from: SphericalNode;
  to: SphericalNode;
  color: string;
  /** Number of leaf file descendants under the source node; drives silk-bundle density. */
  childrenCount?: number;
}

// ══════════════════════════════════════════════════════════
// RANDOM ON SPHERE — 3D direction with uniform distribution
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
// SPIRAL ARM POSITIONING — logarithmic spiral arm helpers
// ══════════════════════════════════════════════════════════

/** Logarithmic spiral: r = a * e^(b * theta) */
function spiralPosition(
  armIndex: number,
  t: number,
  armCount: number,
  galaxyScale: number,
  armCurvature: number,
): [number, number, number] {
  const baseAngle = (2 * Math.PI * armIndex) / armCount;
  const thetaMax = Math.PI * 4; // 2 full turns
  const theta = t * thetaMax;
  const r = 5 + galaxyScale * 40 * t * Math.exp(armCurvature * theta * 0.3);
  const angle = baseAngle + theta;
  return [
    r * Math.cos(angle),
    (Math.random() - 0.5) * r * 0.3,
    r * Math.sin(angle),
  ];
}

/** Returns angular position in the galaxy plane [-PI, PI] */
function getArmAngle(x: number, z: number): number {
  return Math.atan2(z, x);
}

// ══════════════════════════════════════════════════════════
// GALAXY LAYOUT — spiral arm distribution + d3-force-3d
// Logarithmic spiral arm placement preserving galaxy structure
// with d3-force relaxation on top.
// ══════════════════════════════════════════════════════════
function computeGalaxyLayout(
  nodes: FileNode[],
  edges: FileEdge[],
  isDark: boolean,
  settings: GalaxySettings,
): { nodes: SphericalNode[]; edges: SphericalEdge[] } {
  const clr = isDark ? DARK : LIGHT;

  // ── 1. Find root & build graph structures ──
  const targeted = new Set(edges.map((e) => e.target));
  const root = nodes.find((n) => !targeted.has(n.id));
  if (!root) return { nodes: [], edges: [] };

  const children = new Map<string, string[]>();
  for (const e of edges) {
    const list = children.get(e.source) || [];
    list.push(e.target);
    children.set(e.source, list);
  }

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
        const childNode = nodes.find((n) => n.id === ch);
        if (!childNode) continue;
        depthMap.set(ch, curDepth + 1);
        parentMap.set(ch, cur);
        const list = nodesByDepth.get(curDepth + 1) || [];
        list.push(childNode);
        nodesByDepth.set(curDepth + 1, list);
        queue.push(ch);
      }
    }
  }

  // ── 2. Build leaf & childrenCount maps ──
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
  for (const nodeId of children.keys()) countLeaves(nodeId);

  // ── 3. Spiral-arm initial placement ──
  const sphericalNodes = new Map<string, SphericalNode>();
  const resultNodes: SphericalNode[] = [];
  const nodeArm = new Map<string, number>(); // node id → arm index

  // Root fixed at origin
  const rootSN: SphericalNode = {
    id: root.id, name: root.label, path: root.path,
    type: "root", color: clr.root,
    x: 0, y: 0, z: 0, depth: 0,
  };
  sphericalNodes.set(root.id, rootSN);
  resultNodes.push(rootSN);

  // ── 3a. Depth-1 folders: distributed along spiral arms, t = 0.1~0.4 ──
  const depth1 = nodesByDepth.get(1) || [];
  for (let i = 0; i < depth1.length; i++) {
    const node = depth1[i];
    const arm = i % settings.armCount;
    const t = 0.1 + Math.random() * 0.3;
    const [x, y, z] = spiralPosition(arm, t, settings.armCount, settings.galaxyScale, settings.armCurvature);
    const sn: SphericalNode = {
      id: node.id, name: node.label, path: node.path,
      type: "planet",
      color: Math.random() < 0.5 ? clr.dir1 : clr.dir2,
      x, y, z, depth: 1,
    };
    sphericalNodes.set(node.id, sn);
    nodeArm.set(node.id, arm);
    resultNodes.push(sn);
  }

  // ── 3b. Depth-2+ folders: follow same arm as parent, t = 0.4~0.8 ──
  for (let d = 2; d <= 10; d++) {
    const layer = nodesByDepth.get(d);
    if (!layer || layer.length === 0) break;
    for (const node of layer) {
      const pId = parentMap.get(node.id);
      let arm: number;
      if (pId && nodeArm.has(pId)) {
        arm = nodeArm.get(pId)!;
      } else {
        arm = Math.floor(Math.random() * settings.armCount);
      }
      const t = 0.4 + Math.random() * 0.4;
      const [x, y, z] = spiralPosition(arm, t, settings.armCount, settings.galaxyScale, settings.armCurvature);
      const sn: SphericalNode = {
        id: node.id, name: node.label, path: node.path,
        type: "planet", color: clr.dir2,
        x, y, z, depth: d,
      };
      sphericalNodes.set(node.id, sn);
      nodeArm.set(node.id, arm);
      resultNodes.push(sn);
    }
  }

  // ── 3c. File (star) nodes: clustered around parent with spiral-aware offsets ──
  const sourceSet = new Set(edges.map((e) => e.source));
  const leafNodes = nodes.filter(
    (n) => !sourceSet.has(n.id) && n.id !== root.id && depthMap.has(n.id),
  );

  const filesByParent = new Map<string, FileNode[]>();
  for (const fn of leafNodes) {
    const p = parentMap.get(fn.id);
    if (p) {
      const list = filesByParent.get(p) || [];
      list.push(fn);
      filesByParent.set(p, list);
    }
  }

  for (const [parentId, childNodes] of filesByParent) {
    const parentSN = sphericalNodes.get(parentId);
    if (!parentSN) continue;
    const parentArm = nodeArm.get(parentId) ?? 0;
    const armAngle = (2 * Math.PI * parentArm) / settings.armCount;

    childNodes.forEach((node) => {
      // Local cluster offset around parent (radius 3–10)
      const localR = 3 + Math.random() * 7;
      const [ox, oy, oz] = randomOnSphere(localR);
      // Small outward push along arm direction
      const pushOut = 2 + Math.random() * 3;
      const nx = Math.cos(armAngle);
      const nz = Math.sin(armAngle);
      const ext = (node.extension || "").toLowerCase();
      const starDepth = depthMap.get(node.id) ?? 2;
      const sn: SphericalNode = {
        id: node.id, name: node.label, path: node.path,
        type: "star",
        color: clr.file[ext] || clr.defaultFile,
        x: parentSN.x + ox + nx * pushOut,
        y: parentSN.y + oy + (Math.random() - 0.5) * 16,
        z: parentSN.z + oz + nz * pushOut,
        extension: node.extension, size: node.size,
        depth: starDepth,
      };
      sphericalNodes.set(node.id, sn);
      nodeArm.set(node.id, parentArm);
      resultNodes.push(sn);
    });
  }

  // ── 3d. Dust nodes: inter-arm space, radius 15–40 + height jitter ──
  const alreadyPlaced = new Set(sphericalNodes.keys());
  const remaining = nodes.filter((n) => !alreadyPlaced.has(n.id));
  for (const node of remaining) {
    const r = 15 + Math.random() * 25;
    const angle = Math.random() * 2 * Math.PI;
    const d = depthMap.get(node.id) ?? 99;
    const sn: SphericalNode = {
      id: node.id, name: node.label, path: node.path,
      type: "dust", color: clr.dust,
      x: r * Math.cos(angle),
      y: (Math.random() - 0.5) * 30,
      z: r * Math.sin(angle),
      depth: d,
    };
    sphericalNodes.set(node.id, sn);
    resultNodes.push(sn);
  }

  // ── 4. Run d3-force-3d simulation on top of initial positions ──
  if (resultNodes.length > 1) {
    // Build force-simulation nodes (root fixed at origin)
    const forceNodes = resultNodes.map((n) => ({
      id: n.id,
      x: n.x, y: n.y, z: n.z,
      type: n.type,
      fx: n.type === "root" ? 0 : (undefined as number | undefined),
      fy: n.type === "root" ? 0 : (undefined as number | undefined),
      fz: n.type === "root" ? 0 : (undefined as number | undefined),
    }));

    // Build link references by node id → array index
    const idToIdx = new Map(resultNodes.map((n, i) => [n.id, i]));

    // Only link parent-child edges (not the extra root-to-file edges)
    const forceLinks: { source: number; target: number }[] = [];
    for (const e of edges) {
      const si = idToIdx.get(e.source);
      const ti = idToIdx.get(e.target);
      if (si !== undefined && ti !== undefined) {
        forceLinks.push({ source: si, target: ti });
      }
    }

    // Per-type charge: folders repel more than files to reduce crowding
    const sim = forceSimulation(forceNodes, 3)
      .force(
        "charge",
        forceManyBody().strength((d) => {
          const t = (d as { type?: string }).type;
          if (t === "planet") return -100;   // folders
          if (t === "star") return -60;       // files cluster tighter
          return -80;                          // dust & others
        }),
      )
      .force(
        "link",
        forceLink(forceLinks).distance(settings.linkDistance).strength(settings.linkStrength),
      )
      .force(
        "center",
        forceCenter(0, 0, 0).strength(settings.centerGravity),
      )
      .stop();

    // Run 500 ticks for convergence
    for (let i = 0; i < 500; i++) sim.tick();

    // Copy positions back
    resultNodes.forEach((n, i) => {
      n.x = forceNodes[i].x;
      n.y = forceNodes[i].y;
      n.z = forceNodes[i].z;
    });

    // Compute degree for each node (in + out edges from force links)
    const degreeMap = new Map<string, number>();
    for (const link of forceLinks) {
      const sid = forceNodes[link.source].id;
      const tid = forceNodes[link.target].id;
      degreeMap.set(sid, (degreeMap.get(sid) || 0) + 1);
      degreeMap.set(tid, (degreeMap.get(tid) || 0) + 1);
    }
    // Also count sibling edges we'll add later
    for (const [_parentId, childNodes] of filesByParent) {
      if (childNodes.length < 3) continue;
      const numLinks = Math.min((childNodes.length / 3) | 0, 3);
      for (const node of childNodes) {
        degreeMap.set(node.id, (degreeMap.get(node.id) || 0) + numLinks);
      }
    }
    for (const n of resultNodes) {
      n.degree = degreeMap.get(n.id) || 0;
    }
  }

  // ── 5. Build edges ──
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

  // Root-to-file edges: radiating filaments from center
  const rootSN_forEdge = sphericalNodes.get(root.id)!;
  for (const sn of resultNodes) {
    if (sn.type === "star") {
      resultEdges.push({ from: rootSN_forEdge, to: sn, color: "#c8d0ff", childrenCount: 0 });
    }
  }

  // Sibling connections: create local mesh within each folder
  const siblingEdges: SphericalEdge[] = [];
  for (const [_parentId, childNodes] of filesByParent) {
    if (childNodes.length < 3) continue;
    for (const node of childNodes) {
      const others = childNodes.filter(c => c.id !== node.id);
      const numLinks = Math.min((childNodes.length / 3) | 0, 3);
      for (let i = 0; i < numLinks; i++) {
        const target = others[Math.floor(Math.random() * others.length)];
        const fromSN = sphericalNodes.get(node.id);
        const toSN = sphericalNodes.get(target.id);
        if (fromSN && toSN) {
          siblingEdges.push({
            from: fromSN, to: toSN,
            color: "#8888aa",
            childrenCount: 0,
          });
        }
      }
    }
  }
  resultEdges.push(...siblingEdges);

  return { nodes: resultNodes, edges: resultEdges };
}

// ══════════════════════════════════════════════════════════
// SCENE (inside Canvas) — UNCHANGED from previous version
// ══════════════════════════════════════════════════════════
interface SceneProps {
  layout: ReturnType<typeof computeGalaxyLayout>;
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

  // ── Curved (same-arm) edge geometry: CubicBezierCurve3, AdditiveBlending ──
  const arcCurvedGeometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];

    for (const edge of layout.edges) {
      // Check if source & target are on the same spiral arm (angle diff < 30°)
      const fromAngle = getArmAngle(edge.from.x, edge.from.z);
      const toAngle = getArmAngle(edge.to.x, edge.to.z);
      let angleDiff = Math.abs(fromAngle - toAngle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      if (angleDiff >= Math.PI / 6) continue; // cross-arm → handled by straight geometry

      const fromDist = Math.sqrt(edge.from.x**2 + edge.from.y**2 + edge.from.z**2);
      const toDist = Math.sqrt(edge.to.x**2 + edge.to.y**2 + edge.to.z**2);
      const avgDist = (fromDist + toDist) / 2;

      let alpha: number;
      if (avgDist < 15) alpha = 0.35;
      else if (avgDist < 40) alpha = 0.20;
      else alpha = 0.08;

      const color = avgDist < 20
        ? new THREE.Color("#d0dcff").multiplyScalar(alpha * 3)
        : new THREE.Color("#b0b4c8").multiplyScalar(alpha * 3);

      // Build CubicBezierCurve3 with control points offset perpendicular to spiral
      const fromPos = new THREE.Vector3(edge.from.x, edge.from.y, edge.from.z);
      const toPos = new THREE.Vector3(edge.to.x, edge.to.y, edge.to.z);
      const mid = fromPos.clone().add(toPos).multiplyScalar(0.5);
      const midAngle = getArmAngle(mid.x, mid.z);
      const dist = fromPos.distanceTo(toPos);
      const cpOffset = dist * 0.35;
      const cp1 = new THREE.Vector3(
        mid.x + Math.cos(midAngle + Math.PI / 2) * cpOffset,
        mid.y + cpOffset * 0.3,
        mid.z + Math.sin(midAngle + Math.PI / 2) * cpOffset,
      );
      const cp2 = new THREE.Vector3(
        mid.x + Math.cos(midAngle - Math.PI / 2) * cpOffset,
        mid.y - cpOffset * 0.3,
        mid.z + Math.sin(midAngle - Math.PI / 2) * cpOffset,
      );
      const curve = new THREE.CubicBezierCurve3(fromPos, cp1, cp2, toPos);
      const pts = curve.getPoints(32);

      for (let i = 0; i < pts.length - 1; i++) {
        positions.push(pts[i].x, pts[i].y, pts[i].z);
        positions.push(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
    return geo;
  }, [layout.edges]);

  // ── Straight (cross-arm) edge geometry: LineSegments, NormalBlending ──
  const arcStraightGeometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];

    for (const edge of layout.edges) {
      // Only cross-arm edges (angle diff ≥ 30°)
      const fromAngle = getArmAngle(edge.from.x, edge.from.z);
      const toAngle = getArmAngle(edge.to.x, edge.to.z);
      let angleDiff = Math.abs(fromAngle - toAngle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      if (angleDiff < Math.PI / 6) continue; // same-arm → handled by curved geometry

      const fromDist = Math.sqrt(edge.from.x**2 + edge.from.y**2 + edge.from.z**2);
      const toDist = Math.sqrt(edge.to.x**2 + edge.to.y**2 + edge.to.z**2);
      const avgDist = (fromDist + toDist) / 2;

      let alpha: number;
      if (avgDist < 15) alpha = 0.35;
      else if (avgDist < 40) alpha = 0.20;
      else alpha = 0.08;

      const color = avgDist < 20
        ? new THREE.Color("#d0dcff").multiplyScalar(alpha * 3)
        : new THREE.Color("#b0b4c8").multiplyScalar(alpha * 3);

      positions.push(edge.from.x, edge.from.y, edge.from.z);
      positions.push(edge.to.x, edge.to.y, edge.to.z);
      colors.push(color.r, color.g, color.b);
      colors.push(color.r, color.g, color.b);

      // Silk bundles for dense folders (childrenCount > 10)
      const cc = edge.childrenCount ?? 0;
      if (cc > 10) {
        const offsetMag = Math.min(cc / 8, 2);
        const numExtra = Math.min(Math.floor(cc / 5), 4);
        for (let oi = 0; oi < numExtra; oi++) {
          const off = (oi + 1) * offsetMag * 0.5;
          const jx = (Math.random() - 0.5) * off;
          const jy = (Math.random() - 0.5) * off;
          const jz = (Math.random() - 0.5) * off;
          const dimColor = color.clone().multiplyScalar(0.4);
          positions.push(edge.from.x + jx, edge.from.y + jy, edge.from.z + jz);
          positions.push(edge.to.x + jx, edge.to.y + jy, edge.to.z + jz);
          colors.push(dimColor.r, dimColor.g, dimColor.b);
          colors.push(dimColor.r, dimColor.g, dimColor.b);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
    return geo;
  }, [layout.edges]);

  // ── Planet instance transforms (degree-based sizing) ──
  useEffect(() => {
    const mesh = planetRef.current;
    if (!mesh || planets.length === 0) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      dummy.position.set(p.x, p.y, p.z);
      const degreeScale = 0.4 + Math.min((p.degree ?? 0) / 20, 0.8);
      const baseScale = degreeScale * settings.nodeSize;
      const scale = (selectedId === p.id || hovered?.id === p.id) ? baseScale * 1.6 : baseScale;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const c = new THREE.Color(p.color);
      if (hovered?.id === p.id) c.multiplyScalar(1.5);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [planets, selectedId, hovered, settings.nodeSize]);

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

      {/* ── Curved (same-arm) edge filaments: CubicBezierCurve3, AdditiveBlending ── */}
      {arcCurvedGeometry.attributes.position?.count > 0 && (
        <lineSegments geometry={arcCurvedGeometry}>
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={settings.edgeOpacity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      )}

      {/* ── Straight (cross-arm) edge filaments: LineSegments, NormalBlending ── */}
      {arcStraightGeometry.attributes.position?.count > 0 && (
        <lineSegments geometry={arcStraightGeometry}>
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={settings.edgeOpacity * 0.7}
            depthWrite={false}
            blending={THREE.NormalBlending}
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
            size={0.15 * settings.nodeSize}
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
            size={0.3 * settings.nodeSize}
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
// DEFAULT SETTINGS — tuned for hybrid force layout
// ══════════════════════════════════════════════════════════
const DEFS: GalaxySettings = {
  nodeSize: 1.2,
  edgeOpacity: 0.12,
  bloomStrength: 0.5,
  chargeStrength: -80,
  linkDistance: 15,
  linkStrength: 0.4,
  centerGravity: 0.1,
  armCount: 5,
  galaxyScale: 1.0,
  armCurvature: 0.6,
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

  // Compute single hybrid layout (volumetric random init + d3-force, no toggle)
  const layout = useMemo(() => {
    if (!graph) return { nodes: [] as SphericalNode[], edges: [] as SphericalEdge[] };
    return computeGalaxyLayout(graph.nodes, graph.edges, isDark, settings);
  }, [graph, isDark, settings]);

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
        layoutMode="force"
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
