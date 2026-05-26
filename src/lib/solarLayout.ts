// Concentric radial layout for the "galaxy graph" visualization
// Star → Planet → Moon → Satellite → Dust orbital structure

import type { FileNode, FileEdge } from "./types";

/** Orbital radii for each ring (in pixels) */
export const RING_RADII = [0, 180, 320, 460, 580] as const;

/** Ring names for debugging */
export const RING_NAMES = ["star", "planet", "moon", "satellite", "dust"] as const;

export interface SolarLayoutResult {
  /** Node ID → absolute (x, y) position */
  positions: Map<string, { x: number; y: number }>;
  /** Node ID → angular sector { start, end } in radians */
  sectorMap: Map<string, { start: number; end: number }>;
  /** Node ID → ring index (0-4) */
  ringMap: Map<string, number>;
  /** Parent node ID → array of child node IDs */
  childMap: Map<string, string[]>;
  /** Node ID → tree depth from root */
  depthMap: Map<string, number>;
}

/**
 * Compute concentric radial layout for a file-tree graph.
 *
 * Ring 0 (r=0):     Star — project root, single node at center
 * Ring 1 (r=180):   Planet — top-level directories
 * Ring 2 (r=320):   Moon — sub-directories (depth ≥ 2)
 * Ring 3 (r=460):   Satellite — source files (hidden by default)
 * Ring 4 (r=580):   Dust — change history (hidden by default, added dynamically)
 */
export function computeSolarLayout(
  nodes: FileNode[],
  edges: FileEdge[],
  _projectRoot: string,
): SolarLayoutResult {
  const nodeMap = new Map<string, FileNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // ── Build parent → children map ──
  const childMap = new Map<string, string[]>();
  const targeted = new Set<string>();
  for (const e of edges) {
    targeted.add(e.target);
    const children = childMap.get(e.source) || [];
    children.push(e.target);
    childMap.set(e.source, children);
  }

  // ── Find root (node with no incoming edge) ──
  let rootId: string | undefined;
  for (const n of nodes) {
    if (!targeted.has(n.id)) {
      rootId = n.id;
      break;
    }
  }
  if (!rootId) throw new Error("No root node found in graph data");

  // ── BFS depth computation ──
  const depthMap = new Map<string, number>();
  const queue: string[] = [rootId];
  depthMap.set(rootId, 0);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curDepth = depthMap.get(cur)!;
    for (const child of childMap.get(cur) || []) {
      if (!depthMap.has(child)) {
        depthMap.set(child, curDepth + 1);
        queue.push(child);
      }
    }
  }

  // ── Assign ring numbers ──
  const ringMap = new Map<string, number>();
  for (const n of nodes) {
    const depth = depthMap.get(n.id) ?? 0;
    if (n.kind === "dir") {
      if (depth === 0) ringMap.set(n.id, 0);        // Star
      else if (depth === 1) ringMap.set(n.id, 1);   // Planet
      else ringMap.set(n.id, 2);                      // Moon
    } else {
      ringMap.set(n.id, 3);                           // Satellite
    }
  }

  // ── Recursive sector assignment ──
  const positions = new Map<string, { x: number; y: number }>();
  const sectorMap = new Map<string, { start: number; end: number }>();

  function assignSector(nodeId: string, startAngle: number, endAngle: number) {
    const ring = ringMap.get(nodeId) ?? 0;
    const radius = RING_RADII[ring] ?? 460;
    const angle = (startAngle + endAngle) / 2;

    // Clamp angle to avoid floating glitches
    const clampedAngle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    positions.set(nodeId, {
      x: radius * Math.cos(clampedAngle),
      y: radius * Math.sin(clampedAngle),
    });
    sectorMap.set(nodeId, { start: startAngle, end: endAngle });

    const children = childMap.get(nodeId) || [];
    const childCount = children.length;
    if (childCount === 0) return;

    const sectorWidth = endAngle - startAngle;
    for (let i = 0; i < childCount; i++) {
      const childId = children[i];
      const childStart = startAngle + i * sectorWidth / childCount;
      const childEnd = startAngle + (i + 1) * sectorWidth / childCount;
      assignSector(childId, childStart, childEnd);
    }
  }

  assignSector(rootId, 0, 2 * Math.PI);

  return { positions, sectorMap, ringMap, childMap, depthMap };
}

/**
 * Compute positions for dust nodes (change history) around a file node.
 * Dust nodes are placed on Ring 4 within the file's angular sector.
 *
 * @param dustNodeIds - unique identifiers for each dust node
 * @param parentSectorStart - start angle (radians) of the parent file's sector
 * @param parentSectorEnd - end angle (radians) of the parent file's sector
 */
export function computeDustPositions(
  dustNodeIds: string[],
  parentSectorStart: number,
  parentSectorEnd: number,
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  const count = dustNodeIds.length;
  const sectorWidth = parentSectorEnd - parentSectorStart;

  for (let i = 0; i < count; i++) {
    const angle =
      count === 1
        ? (parentSectorStart + parentSectorEnd) / 2
        : parentSectorStart + (i + 0.5) * sectorWidth / count;
    result.set(dustNodeIds[i], {
      x: RING_RADII[4] * Math.cos(angle),
      y: RING_RADII[4] * Math.sin(angle),
    });
  }

  return result;
}

/**
 * Determine the edge visual ring for rendering orbit lines.
 * 1 = Star↔Planet (0.5px), 2 = Planet↔Moon/File (0.3px), 3 = File↔Dust (0.2px)
 */
export function getEdgeRing(
  sourceRing: number,
  targetRing: number,
): number {
  if (sourceRing === 3 && targetRing === 4) return 3;
  if (sourceRing === 4 && targetRing === 3) return 3;
  if (sourceRing <= 1 && targetRing <= 3) return sourceRing === 0 ? 1 : 2;
  return 2;
}
