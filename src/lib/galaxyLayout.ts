// galaxyLayout.ts — Pure layout computation for the galaxy visualization
// No React or Three.js dependencies — pure functions, testable

import { forceSimulation, forceManyBody, forceLink, forceCenter } from "d3-force-3d";
import type { FileNode, FileEdge } from "./types";
import type { ColorScheme } from "./galaxyColors";
import type { GalaxySettings } from "@/components/graph/SettingsPanel";

// ══════════════════════════════════════════════════════════
// Exported types
// ══════════════════════════════════════════════════════════

export interface GalaxyNode {
  id: string;
  label: string;
  path: string;
  type: "root" | "planet" | "star" | "dust";
  color: string;
  x: number;
  y: number;
  z: number;
  extension?: string;
  size?: number;
  depth: number;
  degree?: number;
}

export interface GalaxyEdge {
  from: GalaxyNode;
  to: GalaxyNode;
  color: string;
  childrenCount?: number;
}

export interface GalaxyLayout {
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
  nodeArm: Map<string, number>;
}

// ══════════════════════════════════════════════════════════
// Helper functions
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

/** Logarithmic spiral: r = a * e^(b * theta) */
function spiralPosition(
  armIndex: number,
  t: number,
  armCount: number,
  galaxyScale: number,
  armCurvature: number,
): [number, number, number] {
  if (armCount <= 0) return [0, 0, 0];
  const baseAngle = (2 * Math.PI * armIndex) / armCount;
  const thetaMax = Math.PI * 4;
  const theta = t * thetaMax;
  const r = 5 + galaxyScale * 40 * t * Math.exp(armCurvature * theta * 0.3);
  const clampedR = Math.min(r, 200);
  const angle = baseAngle + theta;
  return [
    clampedR * Math.cos(angle),
    (Math.random() - 0.5) * clampedR * 0.3,
    clampedR * Math.sin(angle),
  ];
}

/** Returns angular position in the galaxy plane [-PI, PI] */
export function getArmAngle(x: number, z: number): number {
  return Math.atan2(z, x);
}

// ══════════════════════════════════════════════════════════
// Graph structure building
// ══════════════════════════════════════════════════════════

interface GraphStructure {
  root: FileNode;
  children: Map<string, string[]>;
  depthMap: Map<string, number>;
  nodesByDepth: Map<number, FileNode[]>;
  parentMap: Map<string, string>;
  leafIds: Set<string>;
  childrenCountMap: Map<string, number>;
  filesByParent: Map<string, FileNode[]>;
}

function buildGraphStructure(nodes: FileNode[], edges: FileEdge[]): GraphStructure | null {
  const targeted = new Set(edges.map((e) => e.target));
  const root = nodes.find((n) => !targeted.has(n.id));
  if (!root) return null;

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

  // Build leaf & childrenCount maps
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
      if (leafIds.has(cid)) total += 1;
      else total += countLeaves(cid);
    }
    childrenCountMap.set(nodeId, total);
    return total;
  }
  countLeaves(root.id);
  for (const nodeId of children.keys()) countLeaves(nodeId);

  // Build filesByParent
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

  return { root, children, depthMap, nodesByDepth, parentMap, leafIds, childrenCountMap, filesByParent };
}

// ══════════════════════════════════════════════════════════
// Main layout function
// ══════════════════════════════════════════════════════════

export function computeGalaxyLayout(
  nodes: FileNode[],
  edges: FileEdge[],
  clr: ColorScheme,
  settings: GalaxySettings,
): GalaxyLayout {
  const armCount = settings.armCount ?? 5;
  const galaxyScale = settings.galaxyScale ?? 1.0;
  const armCurvature = settings.armCurvature ?? 0.6;

  const graph = buildGraphStructure(nodes, edges);
  if (!graph) return { nodes: [], edges: [], nodeArm: new Map() };

  const { root, depthMap, nodesByDepth, parentMap, childrenCountMap, filesByParent } = graph;

  // ── Place nodes ──
  const galaxyNodes = new Map<string, GalaxyNode>();
  const resultNodes: GalaxyNode[] = [];
  const nodeArm = new Map<string, number>();

  // Root at origin
  const rootNode: GalaxyNode = {
    id: root.id, label: root.label, path: root.path,
    type: "root", color: clr.root,
    x: 0, y: 0, z: 0, depth: 0,
  };
  galaxyNodes.set(root.id, rootNode);
  resultNodes.push(rootNode);

  // Depth-1 folders: spiral arms, t = 0.1~0.4
  const depth1 = nodesByDepth.get(1) || [];
  for (let i = 0; i < depth1.length; i++) {
    const node = depth1[i];
    if (!node) continue;
    const arm = i % armCount;
    const t = 0.1 + Math.random() * 0.3;
    const [x, y, z] = spiralPosition(arm, t, armCount, galaxyScale, armCurvature);
    const sn: GalaxyNode = {
      id: node.id, label: node.label, path: node.path,
      type: "planet",
      color: Math.random() < 0.5 ? clr.dir1 : clr.dir2,
      x, y, z, depth: 1,
    };
    galaxyNodes.set(node.id, sn);
    nodeArm.set(node.id, arm);
    resultNodes.push(sn);
  }

  // Depth-2+ folders: follow parent's arm, t = 0.4~0.8
  for (let d = 2; d <= 10; d++) {
    const layer = nodesByDepth.get(d);
    if (!layer || layer.length === 0) break;
    for (const node of layer) {
      if (!node) continue;
      const pId = parentMap.get(node.id);
      let arm: number;
      if (pId && nodeArm.has(pId)) arm = nodeArm.get(pId)!;
      else arm = Math.floor(Math.random() * armCount);
      const t = 0.4 + Math.random() * 0.4;
      const [x, y, z] = spiralPosition(arm, t, armCount, galaxyScale, armCurvature);
      const sn: GalaxyNode = {
        id: node.id, label: node.label, path: node.path,
        type: "planet", color: clr.dir2,
        x, y, z, depth: d,
      };
      galaxyNodes.set(node.id, sn);
      nodeArm.set(node.id, arm);
      resultNodes.push(sn);
    }
  }

  // File nodes: clustered around parent
  for (const [parentId, childNodes] of filesByParent) {
    const parentSN = galaxyNodes.get(parentId);
    if (!parentSN) continue;
    const parentArm = nodeArm.get(parentId) ?? 0;
    const armAngle = (2 * Math.PI * parentArm) / armCount;

    childNodes.forEach((node) => {
      const localR = 3 + Math.random() * 7;
      const [ox, oy, oz] = randomOnSphere(localR);
      const pushOut = 2 + Math.random() * 3;
      const nx = Math.cos(armAngle);
      const nz = Math.sin(armAngle);
      const ext = (node.extension || "").toLowerCase();
      const starDepth = depthMap.get(node.id) ?? 2;
      const sn: GalaxyNode = {
        id: node.id, label: node.label, path: node.path,
        type: "star",
        color: clr.file[ext] || clr.defaultFile,
        x: parentSN.x + ox + nx * pushOut,
        y: parentSN.y + oy + (Math.random() - 0.5) * 16,
        z: parentSN.z + oz + nz * pushOut,
        extension: node.extension, size: node.size,
        depth: starDepth,
      };
      galaxyNodes.set(node.id, sn);
      nodeArm.set(node.id, parentArm);
      resultNodes.push(sn);
    });
  }

  // Dust nodes
  const alreadyPlaced = new Set(galaxyNodes.keys());
  const remaining = nodes.filter((n) => !alreadyPlaced.has(n.id));
  for (const node of remaining) {
    const r = 15 + Math.random() * 25;
    const angle = Math.random() * 2 * Math.PI;
    const d = depthMap.get(node.id) ?? 99;
    const sn: GalaxyNode = {
      id: node.id, label: node.label, path: node.path,
      type: "dust", color: clr.dust,
      x: r * Math.cos(angle),
      y: (Math.random() - 0.5) * 30,
      z: r * Math.sin(angle),
      depth: d,
    };
    galaxyNodes.set(node.id, sn);
    resultNodes.push(sn);
  }

  // ── Force simulation ──
  if (resultNodes.length > 1) {
    const forceNodes = resultNodes.map((n) => ({
      id: n.id, x: n.x, y: n.y, z: n.z, type: n.type,
      fx: n.type === "root" ? 0 : undefined,
      fy: n.type === "root" ? 0 : undefined,
      fz: n.type === "root" ? 0 : undefined,
    }));

    const idToIdx = new Map(resultNodes.map((n, i) => [n.id, i]));
    const forceLinks: { source: number; target: number }[] = [];
    for (const e of edges) {
      const si = idToIdx.get(e.source);
      const ti = idToIdx.get(e.target);
      if (si !== undefined && ti !== undefined) {
        forceLinks.push({ source: si, target: ti });
      }
    }

    const sim = forceSimulation(forceNodes, 3)
      .force("charge", forceManyBody().strength((d) => {
        const t = (d as { type?: string }).type;
        if (t === "planet") return -100;
        if (t === "star") return -60;
        return -80;
      }))
      .force("link", forceLink(forceLinks).distance(settings.linkDistance).strength(settings.linkStrength))
      .force("center", forceCenter(0, 0, 0).strength(settings.centerGravity))
      .stop();

    for (let i = 0; i < 500; i++) sim.tick();

    resultNodes.forEach((n, i) => {
      n.x = forceNodes[i].x;
      n.y = forceNodes[i].y;
      n.z = forceNodes[i].z;
    });

    // Compute degree
    const degreeMap = new Map<string, number>();
    for (const link of forceLinks) {
      const sid = forceNodes[link.source].id;
      const tid = forceNodes[link.target].id;
      degreeMap.set(sid, (degreeMap.get(sid) || 0) + 1);
      degreeMap.set(tid, (degreeMap.get(tid) || 0) + 1);
    }
    for (const n of resultNodes) {
      n.degree = degreeMap.get(n.id) || 0;
    }
  }

  // ── Build edges ──
  const resultEdges: GalaxyEdge[] = [];
  for (const e of edges) {
    const from = galaxyNodes.get(e.source);
    const to = galaxyNodes.get(e.target);
    if (!from || !to) continue;
    const color = from.depth === 0 ? clr.edgeRoot
      : from.depth === 1 ? clr.edgeDir
      : clr.edgeFile;
    const cc = childrenCountMap.get(e.source) ?? 0;
    resultEdges.push({ from, to, color, childrenCount: cc });
  }

  // Root-to-file edges
  const rootGN = galaxyNodes.get(root.id)!;
  for (const sn of resultNodes) {
    if (sn.type === "star") {
      resultEdges.push({ from: rootGN, to: sn, color: "#c8d0ff", childrenCount: 0 });
    }
  }

  // Sibling connections
  for (const [, childNodes] of filesByParent) {
    if (childNodes.length < 3) continue;
    for (const node of childNodes) {
      const others = childNodes.filter(c => c.id !== node.id);
      const numLinks = Math.min((childNodes.length / 3) | 0, 3);
      for (let i = 0; i < numLinks; i++) {
        const target = others[Math.floor(Math.random() * others.length)];
        if (!target) continue;
        const fromSN = galaxyNodes.get(node.id);
        const toSN = galaxyNodes.get(target.id);
        if (fromSN && toSN) {
          resultEdges.push({ from: fromSN, to: toSN, color: "#8888aa", childrenCount: 0 });
        }
      }
    }
  }

  return { nodes: resultNodes, edges: resultEdges, nodeArm };
}
