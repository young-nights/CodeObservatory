// CosmicGalaxy — R3F 3D cosmic "seed universe" graph
// Root → Seed (directory) → Star (file) → Dust (history)
// Seed growth animation, layered edges, 3D depth, camera fly-to

import {
  useMemo, useRef, useState, useCallback, useEffect, createContext, useContext,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, Line, Environment } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import type { GraphData, FileNode } from "@/lib/types";

// ═══════════════════════════════════════════════════════════════
// Constants — Cosmic Galaxy seed universe
// ═══════════════════════════════════════════════════════════════

// Node sizes (per spec)
const SEED_ROOT_SIZE = 2.5;
const SEED_D1_SIZE = 1.2;
const SEED_D2_SIZE = 0.8;
const STAR_SIZE = 0.3;
const DUST_SIZE = 0.1;

// Node colors
const SEED_ROOT_COLOR = "#ffffff";
const SEED_D1_COLOR = "#ffd700";
const SEED_D2_COLOR = "#ff8c42";
const DUST_COLOR = "#a09060";

// Edge line widths
const EDGE_SEED_LINE_WIDTH = 0.5;
const EDGE_STAR_LINE_WIDTH = 0.3;
const EDGE_DUST_LINE_WIDTH = 0.1;

// Extension colors for file stars
const EXT_COLORS: Record<string, string> = {
  ts: "#5b8def", tsx: "#5b8def",
  rs: "#e07050",
  md: "#b070d0",
  json: "#d4b040", toml: "#d4b040",
  css: "#50b070", html: "#50b070",
};
const DEFAULT_FILE_COLOR = "#8ba0c0";

const CAMERA_DEFAULTS = {
  position: [0, 0, 100] as [number, number, number],
  target: [0, 0, 0] as [number, number, number],
};

// Animation timing (seconds)
const ANIM_ROOT_DURATION = 0.8;
const ANIM_DIR_DELAY = 0.2;
const ANIM_DIR_DURATION = 0.8;
const ANIM_FILE_DELAY = 0.4;
const ANIM_FILE_DURATION = 0.8;

// ═══════════════════════════════════════════════════════════════
// Interfaces
// ═══════════════════════════════════════════════════════════════

export interface CosmicGalaxyPanelSettings {
  nodeSize: number;       // 6–24 (default 7)
  edgeThickness: number;  // 0.2–2 (default 0.5)
  gravity: number;        // 1–20 (default 5)
  repulsion: number;      // 1–20 (default 10)
  edgeLength: number;     // 1–20 (default 5)
}

export interface CosmicGalaxyProps {
  data: GraphData;
  settings: CosmicGalaxyPanelSettings;
  searchQuery: string;
  showOnlyChanged: boolean;
  showOrphans: boolean;
  resetKey?: number;
  onNodeCountChange?: (visibleNodes: number, visibleEdges: number) => void;
  /** External signal to fly camera to a specific node position */
  flyTarget?: [number, number, number] | null;
  onFlyComplete?: () => void;
  /** Top directories for tag panel */
  onTopDirsChange?: (dirs: { id: string; label: string; count: number; position: [number, number, number] }[]) => void;
}

export interface LayoutNode {
  id: string;
  label: string;
  path: string;
  position: [number, number, number];
  size: number;
  color: string;
  emissive: string;
  depth: number;
  kind: string | null;
  extension?: string;
  sizeBytes?: number;
  changeCount: number;
  isDust: boolean;
  parentId?: string;
}

interface LayoutEdge {
  source: [number, number, number];
  target: [number, number, number];
  sourceId: string;
  targetId: string;
  edgeType: "seed-seed" | "seed-star" | "star-dust";
}

// ═══════════════════════════════════════════════════════════════
// Context: shared growth timer ref
// ═══════════════════════════════════════════════════════════════

const GrowthTimeContext = createContext<React.MutableRefObject<number>>({ current: 0 });

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function getFileColor(extension?: string): string {
  if (extension) return EXT_COLORS[extension.toLowerCase()] ?? DEFAULT_FILE_COLOR;
  return DEFAULT_FILE_COLOR;
}

function getNodeSize(kind: string | null, depth: number): number {
  if (kind !== "file") {
    if (depth === 0) return SEED_ROOT_SIZE;
    if (depth === 1) return SEED_D1_SIZE;
    return SEED_D2_SIZE;
  }
  return STAR_SIZE;
}

function getNodeColor(kind: string | null, depth: number, extension?: string): string {
  if (kind !== "file") {
    if (depth === 0) return SEED_ROOT_COLOR;
    if (depth === 1) return SEED_D1_COLOR;
    return SEED_D2_COLOR;
  }
  return getFileColor(extension);
}

function getNodeEmissive(kind: string | null, depth: number, extension?: string): string {
  if (kind !== "file") {
    if (depth === 0) return SEED_ROOT_COLOR;
    if (depth === 1) return SEED_D1_COLOR;
    return SEED_D2_COLOR;
  }
  return getFileColor(extension);
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ═══════════════════════════════════════════════════════════════
// 3D Seed-Universe Layout
// ═══════════════════════════════════════════════════════════════

function computeSeedLayout(
  nodes: FileNode[],
  edges: GraphData["edges"],
): { layoutNodes: LayoutNode[]; layoutEdges: LayoutEdge[] } {
  const nodeMap = new Map<string, FileNode>();
  const childrenMap = new Map<string, FileNode[]>();
  const targeted = new Set(edges.map((e) => e.target));

  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }
  for (const e of edges) {
    const arr = childrenMap.get(e.source) || [];
    const child = nodeMap.get(e.target);
    if (child) arr.push(child);
    childrenMap.set(e.source, arr);
  }

  const rootNode = nodes.find((n) => !targeted.has(n.id));
  const rootId = rootNode?.id;
  const positions = new Map<string, [number, number, number]>();
  const depths = new Map<string, number>();
  const parents = new Map<string, string>();

  // BFS depth + parent lookup
  if (rootId) {
    const queue = [rootId];
    depths.set(rootId, 0);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const d = depths.get(cur)!;
      for (const child of childrenMap.get(cur) || []) {
        if (!depths.has(child.id)) {
          depths.set(child.id, d + 1);
          parents.set(child.id, cur);
          queue.push(child.id);
        }
      }
    }
  }

  // Place root at origin
  if (rootId) {
    positions.set(rootId, [0, 0, 0]);
  }

  // Place depth-1 dirs in a ring on z=0 plane, radius 18
  const d1Dirs = nodes.filter((n) => depths.get(n.id) === 1 && n.kind === "dir");
  d1Dirs.forEach((d, i) => {
    const a = (2 * Math.PI * i) / d1Dirs.length;
    positions.set(d.id, [18 * Math.cos(a), 0, 18 * Math.sin(a)]);
  });

  // Place depth-2 dirs in z=±6 rings, radius 32
  const d2Dirs = nodes.filter((n) => depths.get(n.id) === 2 && n.kind === "dir");
  d2Dirs.forEach((d, i) => {
    const parentEdge = edges.find((e) => e.target === d.id);
    const parentPos = parentEdge ? positions.get(parentEdge.source) : undefined;
    const baseA = parentPos
      ? Math.atan2(parentPos[2], parentPos[0])
      : (2 * Math.PI * i) / d2Dirs.length;
    const half = Math.ceil(d2Dirs.length / 2);
    const z = i < half ? 6 : -6;
    const ci = i < half ? i : i - half;
    const per = Math.max(1, i < half ? half : d2Dirs.length - half);
    const a = baseA + (2 * Math.PI * ci) / per;
    positions.set(d.id, [32 * Math.cos(a), z, 32 * Math.sin(a)]);
  });

  // Place depth-3+ dirs in outer spiral
  const deepDirs = nodes.filter((n) => n.kind === "dir" && (depths.get(n.id) ?? 0) >= 3);
  deepDirs.forEach((d, i) => {
    const dd = depths.get(d.id) ?? 3;
    const r = 38 + (dd - 3) * 4;
    const a = (2 * Math.PI * i) / Math.max(deepDirs.length, 1);
    const h = (dd - 3) * 3 + Math.sin(i * 0.7) * 5;
    positions.set(d.id, [r * Math.cos(a), h, r * Math.sin(a)]);
  });

  // Place files in 3D clusters around their parent directories
  // with Z offsets of ±5 for depth
  const fileNodes = nodes.filter(
    (n) => n.kind === "file" || (n.kind === undefined && depths.has(n.id))
  );
  const filesByParent = new Map<string, FileNode[]>();
  for (const fn of fileNodes) {
    const pe = edges.find((e) => e.target === fn.id);
    const pid = pe?.source || rootId || "";
    const arr = filesByParent.get(pid) || [];
    arr.push(fn);
    filesByParent.set(pid, arr);
  }

  const phi = Math.PI * (3 - Math.sqrt(5)); // golden angle
  for (const [parentId, children] of filesByParent) {
    const center = positions.get(parentId) || [0, 0, 0];
    const count = children.length;
    const radius = 3.5 + Math.sqrt(count) * 0.7;
    if (count === 1) {
      positions.set(children[0].id, [center[0] + 4.5, center[1] + 1, center[2] + 1]);
      continue;
    }
    children.forEach((child, i) => {
      const y = 1 - (i / (count - 1)) * 2; // -1 … 1
      const rY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = phi * i;
      // Z offset for 3D depth (±5)
      const zOffset = (Math.sin(theta * 3) * 0.5 + Math.cos(i * 0.7) * 0.5) * 5;
      positions.set(child.id, [
        center[0] + radius * rY * Math.cos(theta),
        center[1] + radius * y,
        center[2] + radius * rY * Math.sin(theta) + zOffset,
      ]);
    });
  }

  // Stray nodes — scatter in outer belt
  for (const n of nodes) {
    if (positions.has(n.id)) continue;
    const d = depths.get(n.id) ?? 3;
    const r = 42 + d * 3;
    const a = Math.random() * 2 * Math.PI;
    const h = (d - 3) * 5 + Math.random() * 4 - 2;
    positions.set(n.id, [r * Math.cos(a), h, r * Math.sin(a)]);
  }

  // ── Build layout nodes ──
  const layoutNodes: LayoutNode[] = nodes.map((n) => {
    const pos = positions.get(n.id) || [0, 0, 0];
    const d = depths.get(n.id) ?? 3;
    const k = n.kind ?? null;
    const parentId = parents.get(n.id);
    return {
      id: n.id,
      label: n.label,
      path: n.path,
      position: pos as [number, number, number],
      size: getNodeSize(k, d),
      color: getNodeColor(k, d, n.extension),
      emissive: getNodeEmissive(k, d, n.extension),
      depth: d,
      kind: k,
      extension: n.extension,
      sizeBytes: n.size,
      changeCount: n.changeCount ?? 0,
      isDust: false,
      parentId,
    };
  });

  // ── Generate dust nodes for files with history ──
  const dustNodes: LayoutNode[] = [];
  const dustEdges: LayoutEdge[] = [];
  const fileLayoutNodes = layoutNodes.filter((n) => n.kind === "file");
  for (const fileNode of fileLayoutNodes) {
    const dustCount = Math.min(fileNode.changeCount || 1, 12);
    for (let di = 0; di < dustCount; di++) {
      const dustId = `${fileNode.id}__dust__${di}`;
      const theta = (2 * Math.PI * di) / dustCount;
      const phiAngle = Math.acos(1 - (2 * (di + 0.5)) / dustCount);
      const radius = 0.8 + Math.random() * 0.4;
      const dx = radius * Math.sin(phiAngle) * Math.cos(theta);
      const dy = radius * Math.sin(phiAngle) * Math.sin(theta);
      const dz = radius * Math.cos(phiAngle);
      dustNodes.push({
        id: dustId,
        label: `v${di + 1}`,
        path: fileNode.path,
        position: [
          fileNode.position[0] + dx,
          fileNode.position[1] + dy,
          fileNode.position[2] + dz,
        ],
        size: DUST_SIZE,
        color: DUST_COLOR,
        emissive: DUST_COLOR,
        depth: fileNode.depth + 3,
        kind: "dust",
        extension: undefined,
        changeCount: 0,
        isDust: true,
        parentId: fileNode.id,
      });
    }
    // Dust edge: first dust only (to keep it clean)
    if (dustCount > 0) {
      const d0 = dustNodes[dustNodes.length - dustCount];
      dustEdges.push({
        source: fileNode.position,
        target: d0.position,
        sourceId: fileNode.id,
        targetId: d0.id,
        edgeType: "star-dust",
      });
    }
  }

  // ── Build layout edges with types ──
  const layoutEdges: LayoutEdge[] = edges
    .filter((e) => positions.has(e.source) && positions.has(e.target))
    .map((e) => {
      const srcNode = layoutNodes.find((n) => n.id === e.source);
      const tgtNode = layoutNodes.find((n) => n.id === e.target);
      const isSrcFile = srcNode?.kind === "file";
      const isTgtFile = tgtNode?.kind === "file";
      let edgeType: LayoutEdge["edgeType"] = "seed-star";
      if (!isSrcFile && !isTgtFile) edgeType = "seed-seed";
      else if (isSrcFile || isTgtFile) edgeType = "seed-star";
      return {
        source: positions.get(e.source)!,
        target: positions.get(e.target)!,
        sourceId: e.source,
        targetId: e.target,
        edgeType,
      };
    });

  return {
    layoutNodes: [...layoutNodes, ...dustNodes],
    layoutEdges: [...layoutEdges, ...dustEdges],
  };
}

// ═══════════════════════════════════════════════════════════════
// Camera fly-to controller
// ═══════════════════════════════════════════════════════════════

function CameraController({ resetKey }: { resetKey: number }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(...CAMERA_DEFAULTS.position);
    camera.lookAt(...CAMERA_DEFAULTS.target);
  }, [resetKey, camera]);
  return null;
}

function CameraFlyController({
  target, onComplete, resetKey,
}: {
  target: [number, number, number] | null;
  onComplete?: () => void;
  resetKey: number;
}) {
  const { camera } = useThree();
  const animRef = useRef<{
    startPos: THREE.Vector3;
    target: THREE.Vector3;
    startTime: number;
    duration: number;
  } | null>(null);

  useEffect(() => {
    if (!target) {
      animRef.current = null;
      return;
    }
    const startPos = camera.position.clone();
    const targetVec = new THREE.Vector3(
      target[0], target[1], target[2] + 20, // offset for viewing
    );
    animRef.current = {
      startPos,
      target: targetVec,
      startTime: performance.now(),
      duration: 800, // ms
    };
  }, [target, camera.position]);

  useEffect(() => {
    animRef.current = null;
  }, [resetKey]);

  useFrame(() => {
    const anim = animRef.current;
    if (!anim) return;
    const elapsed = performance.now() - anim.startTime;
    const t = Math.min(elapsed / anim.duration, 1);
    const et = easeOutCubic(t);
    camera.position.lerpVectors(anim.startPos, anim.target, et);
    camera.lookAt(target![0], target![1], target![2]);
    if (t >= 1) {
      animRef.current = null;
      onComplete?.();
    }
  });

  return null;
}

// ═══════════════════════════════════════════════════════════════
// Growth animation hook (global timer ref)
// ═══════════════════════════════════════════════════════════════

function GrowthTimer() {
  const growthTimeRef = useContext(GrowthTimeContext);
  const startRef = useRef(performance.now());

  useFrame(() => {
    growthTimeRef.current = (performance.now() - startRef.current) / 1000;
  });

  return null;
}

// ═══════════════════════════════════════════════════════════════
// StarNode — animated seed/star/dust node
// ═══════════════════════════════════════════════════════════════

function StarNode({
  position,
  size,
  color,
  emissive,
  depth,
  kind,
  isDust,
  visible,
  onClick,
  onHover,
}: {
  position: [number, number, number];
  size: number;
  color: string;
  emissive: string;
  depth: number;
  kind: string | null;
  isDust: boolean;
  visible: boolean;
  onClick?: () => void;
  onHover?: (hovered: boolean) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const growthTimeRef = useContext(GrowthTimeContext);
  const [hovered, setHovered] = useState(false);

  const handlePointerOver = useCallback(() => {
    setHovered(true);
    onHover?.(true);
  }, [onHover]);

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    onHover?.(false);
  }, [onHover]);

  // Emissive intensity by hierarchy
  const baseEmissiveIntensity = isDust
    ? 0
    : kind !== "file"
      ? depth === 0
        ? 1.5 // root — strongest glow
        : depth === 1
          ? 1.0 // depth-1 — strong
          : 0.6 // depth-2 — medium
      : 0.25; // file — weak

  useFrame(() => {
    if (!meshRef.current) return;
    const t = growthTimeRef.current;
    let scale = 0;

    if (isDust) {
      // Dust: only show after file click (handled by parent visibility)
      // When visible, grow quickly
      scale = visible ? 1 : 0;
    } else if (kind !== "file") {
      // Seeds (directories)
      if (depth === 0) {
        // Root: 0 → 1 over ANIM_ROOT_DURATION
        scale = t >= ANIM_ROOT_DURATION ? 1 : easeOutCubic(t / ANIM_ROOT_DURATION);
      } else {
        // Sub-seeds: delay ANIM_DIR_DELAY, then grow over ANIM_DIR_DURATION
        const dt = t - ANIM_DIR_DELAY;
        scale = dt <= 0 ? 0 : dt >= ANIM_DIR_DURATION ? 1 : easeOutCubic(dt / ANIM_DIR_DURATION);
      }
    } else {
      // Stars (files): delay ANIM_FILE_DELAY, then grow
      const ft = t - ANIM_FILE_DELAY;
      scale = ft <= 0 ? 0 : ft >= ANIM_FILE_DURATION ? 1 : easeOutCubic(ft / ANIM_FILE_DURATION);
    }

    const finalSize = size * scale * (hovered ? 1.4 : 1);
    meshRef.current.scale.setScalar(Math.max(finalSize, 0));
    meshRef.current.visible = scale > 0.001;
  });

  // Emissive pulsing for root node
  useFrame(() => {
    if (!meshRef.current || depth !== 0 || kind === "file") return;
    const material = meshRef.current.material as THREE.MeshStandardMaterial;
    if (!material) return;
    const pulse = 1 + Math.sin(performance.now() * 0.002) * 0.15;
    material.emissiveIntensity = baseEmissiveIntensity * pulse * (hovered ? 1.3 : 1);
    material.roughness = hovered ? 0.2 : 0.35;
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        if (!isDust) onClick?.();
      }}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <sphereGeometry args={[1, 32, 32]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={baseEmissiveIntensity}
        roughness={0.35}
        metalness={0.1}
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════
// DustOrbit — animated dust ring around selected file
// ═══════════════════════════════════════════════════════════════

function DustOrbit({
  center,
  count,
  visible,
}: {
  center: [number, number, number];
  count: number;
  visible: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const dustRefs = useRef<THREE.Mesh[]>([]);

  const dustData = useMemo(() => {
    const items: { pos: [number, number, number]; orbitRadius: number; speed: number; offset: number }[] = [];
    const actualCount = Math.min(count || 1, 12);
    for (let i = 0; i < actualCount; i++) {
      const orbitRadius = 0.5 + Math.random() * 1.0;
      const theta = (2 * Math.PI * i) / actualCount;
      const phi = Math.acos(1 - (2 * (i + 0.5)) / actualCount);
      items.push({
        pos: [
          orbitRadius * Math.sin(phi) * Math.cos(theta),
          orbitRadius * Math.sin(phi) * Math.sin(theta),
          orbitRadius * Math.cos(phi),
        ],
        orbitRadius,
        speed: 0.5 + Math.random() * 1.5,
        offset: Math.random() * Math.PI * 2,
      });
    }
    return items;
  }, [count]);

  useEffect(() => {
    const meshes = dustRefs.current;
    return () => {
      meshes.forEach((m) => {
        m.geometry?.dispose();
        (m.material as THREE.Material)?.dispose();
      });
    };
  }, []);

  useFrame(() => {
    if (!groupRef.current) return;
    const t = performance.now() * 0.001;
    const wasVisible = groupRef.current.visible;
    groupRef.current.visible = visible;
    if (!visible) return;

    groupRef.current.position.set(...center);

    // Fade in
    if (!wasVisible) {
      groupRef.current.scale.setScalar(0);
    }
    const fadeTarget = 1;
    groupRef.current.scale.setScalar(
      THREE.MathUtils.lerp(groupRef.current.scale.x, fadeTarget, 0.1),
    );

    dustRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const data = dustData[i];
      if (!data) return;
      const angle = t * data.speed + data.offset;
      const r = data.orbitRadius;
      mesh.position.set(
        Math.cos(angle) * r,
        Math.sin(data.offset) * r * 0.3,
        Math.sin(angle) * r,
      );
    });
  });

  return (
    <group ref={groupRef}>
      {dustData.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) dustRefs.current[i] = el;
          }}
        >
          <sphereGeometry args={[DUST_SIZE, 8, 8]} />
          <meshBasicMaterial color={DUST_COLOR} transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// EdgeLines — layered edges by type
// ═══════════════════════════════════════════════════════════════

function EdgeLines({ edges, edgeOpacity }: { edges: LayoutEdge[]; edgeOpacity: number }) {
  const seedSeedEdges = useMemo(() => edges.filter((e) => e.edgeType === "seed-seed"), [edges]);
  const seedStarEdges = useMemo(() => edges.filter((e) => e.edgeType === "seed-star"), [edges]);
  const starDustEdges = useMemo(() => edges.filter((e) => e.edgeType === "star-dust"), [edges]);

  // Sample large edge sets for performance
  const sample = (items: LayoutEdge[], max: number) => {
    if (items.length <= max) return items;
    const step = Math.ceil(items.length / max);
    return items.filter((_, i) => i % step === 0);
  };

  const ssEdges = useMemo(() => sample(seedSeedEdges, 500), [seedSeedEdges]);
  const sstEdges = useMemo(() => sample(seedStarEdges, 1500), [seedStarEdges]);
  const sdEdges = useMemo(() => sample(starDustEdges, 500), [starDustEdges]);

  return (
    <group>
      {/* Seed → Seed: gold, thick */}
      {ssEdges.map((edge, i) => (
        <Line
          key={`ss-${i}`}
          points={[edge.source, edge.target]}
          color={"#ffb841"}
          lineWidth={EDGE_SEED_LINE_WIDTH}
          transparent
          opacity={edgeOpacity * 0.25}
        />
      ))}
      {/* Seed → Star: blue, medium */}
      {sstEdges.map((edge, i) => (
        <Line
          key={`sst-${i}`}
          points={[edge.source, edge.target]}
          color={"#4070c0"}
          lineWidth={EDGE_STAR_LINE_WIDTH}
          transparent
          opacity={edgeOpacity * 0.12}
        />
      ))}
      {/* Star → Dust: light gold, thin */}
      {sdEdges.map((edge, i) => (
        <Line
          key={`sd-${i}`}
          points={[edge.source, edge.target]}
          color={"#a09060"}
          lineWidth={EDGE_DUST_LINE_WIDTH}
          transparent
          opacity={edgeOpacity * 0.06}
        />
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// GalaxyScene — inside Canvas render tree
// ═══════════════════════════════════════════════════════════════

function GalaxyScene({
  layoutNodes,
  layoutEdges,
  settings,
  searchQuery,
  showOnlyChanged,
  showOrphans,
  onNodeClick,
  onNodeHover,
  onFilterCountChange,
  resetKey,
  flyTarget,
  onFlyComplete,
  selectedNodeId,
}: {
  layoutNodes: LayoutNode[];
  layoutEdges: LayoutEdge[];
  settings: CosmicGalaxyPanelSettings;
  searchQuery: string;
  showOnlyChanged: boolean;
  showOrphans: boolean;
  onNodeClick: (node: LayoutNode) => void;
  onNodeHover: (node: LayoutNode | null) => void;
  onFilterCountChange?: (n: number, e: number) => void;
  resetKey: number;
  flyTarget: [number, number, number] | null;
  onFlyComplete?: () => void;
  selectedNodeId: string | null;
}) {
  const totalNodes = layoutNodes.filter((n) => !n.isDust).length;
  const growthTimeRef = useRef(0);

  // ── Scale from panel sliders ──
  const radialScale = useMemo(() => {
    const g = Math.max(0.3, (21 - settings.gravity) / 5);
    const r = settings.repulsion / 5;
    const el = settings.edgeLength / 5;
    return g * r * el;
  }, [settings.gravity, settings.repulsion, settings.edgeLength]);

  const nodeSizeMul = settings.nodeSize / 7;
  const edgeOpacity = settings.edgeThickness / 0.5;

  // ── Filter non-dust nodes ──
  const mainNodes = useMemo(() => layoutNodes.filter((n) => !n.isDust), [layoutNodes]);

  const filteredMainNodes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const edgeNodeIds = new Set<string>();
    for (const e of layoutEdges) {
      edgeNodeIds.add(e.sourceId);
      edgeNodeIds.add(e.targetId);
    }
    return mainNodes.filter((n) => {
      if (q && !n.path.toLowerCase().includes(q) && !n.label.toLowerCase().includes(q)) return false;
      if (showOnlyChanged && n.changeCount === 0) return false;
      if (showOrphans && edgeNodeIds.has(n.id)) return false;
      return true;
    });
  }, [mainNodes, layoutEdges, searchQuery, showOnlyChanged, showOrphans]);

  const visibleIds = useMemo(() => new Set(filteredMainNodes.map((n) => n.id)), [filteredMainNodes]);
  const filteredEdges = useMemo(
    () => layoutEdges.filter((e) => {
      if (e.edgeType === "star-dust") return false; // dust edges controlled separately
      return visibleIds.has(e.sourceId) && visibleIds.has(e.targetId);
    }),
    [layoutEdges, visibleIds],
  );

  // ── Report counts to parent ──
  useEffect(() => {
    onFilterCountChange?.(filteredMainNodes.length, filteredEdges.length);
  }, [filteredMainNodes.length, filteredEdges.length, onFilterCountChange]);

  // ── Background star count scaling ──
  const bgStars = totalNodes > 3000 ? 1000 : totalNodes > 1000 ? 2000 : 5000;

  return (
    <GrowthTimeContext.Provider value={growthTimeRef}>
      <color attach="background" args={["#000008"]} />
      <fog attach="fog" args={["#000008", 60, 400]} />
      <Stars radius={350} depth={60} count={bgStars} factor={4} saturation={0} fade speed={0.3} />
      <Environment preset="night" />

      <ambientLight intensity={0.15} />
      <pointLight position={[30, 30, 30]} intensity={3} color="#a5b4fc" />
      <pointLight position={[-20, -10, -20]} intensity={1} color="#4070c0" />

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={500}
        autoRotate
        autoRotateSpeed={0.12}
      />

      <GrowthTimer />
      <CameraController resetKey={resetKey} />
      <CameraFlyController target={flyTarget} onComplete={onFlyComplete} resetKey={resetKey} />

      {/* Edges — layered by type */}
      <EdgeLines edges={filteredEdges} edgeOpacity={edgeOpacity} />

      {/* Main nodes (seeds + stars) */}
      {filteredMainNodes.map((node) => (
        <StarNode
          key={node.id}
          position={[
            node.position[0] * radialScale,
            node.position[1] * radialScale,
            node.position[2] * radialScale,
          ]}
          size={node.size * nodeSizeMul}
          color={node.color}
          emissive={node.emissive}
          depth={node.depth}
          kind={node.kind}
          isDust={false}
          visible
          onClick={() => onNodeClick(node)}
          onHover={(h) => onNodeHover(h ? node : null)}
        />
      ))}

      {/* Dust orbit around selected file */}
      {selectedNodeId && (() => {
        const selNode = layoutNodes.find((n) => n.id === selectedNodeId && n.kind === "file");
        if (!selNode) return null;
        return (
          <DustOrbit
            center={[
              selNode.position[0] * radialScale,
              selNode.position[1] * radialScale,
              selNode.position[2] * radialScale,
            ]}
            count={selNode.changeCount || 5}
            visible
          />
        );
      })()}

      {/* ── Post processing ── */}
      <EffectComposer>
        <Bloom luminanceThreshold={0.15} intensity={0.8} radius={0.5} />
      </EffectComposer>
    </GrowthTimeContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tooltip — hover info overlay
// ═══════════════════════════════════════════════════════════════

function Tooltip({ node }: { node: LayoutNode | null }) {
  if (!node || node.isDust) return null;
  const kindLabel =
    node.kind === "file"
      ? `File${node.extension ? ` .${node.extension}` : ""}`
      : node.depth === 0
        ? "Root Seed"
        : "Directory Seed";

  return (
    <div
      style={{
        position: "absolute", zIndex: 50, top: 12, left: 12,
        padding: "6px 10px", borderRadius: 4,
        background: "rgba(20,20,30,0.92)",
        border: "1px solid rgba(255,255,255,0.08)",
        pointerEvents: "none", maxWidth: 300,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
        {node.label}
      </div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", display: "flex", gap: 4, marginTop: 1 }}>
        <span>{kindLabel}</span>
        {node.sizeBytes ? <span>· {formatSize(node.sizeBytes)}</span> : null}
        {node.changeCount > 0 ? <span>· {node.changeCount} changes</span> : null}
      </div>
      <div
        style={{
          fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.25)",
          marginTop: 1, overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {node.path}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export function CosmicGalaxy({
  data,
  settings,
  searchQuery,
  showOnlyChanged,
  showOrphans,
  resetKey = 0,
  onNodeCountChange,
  flyTarget,
  onFlyComplete,
  onTopDirsChange,
}: CosmicGalaxyProps) {
  const [hoveredNode, setHoveredNode] = useState<LayoutNode | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Compute layout once per data change
  const { layoutNodes, layoutEdges } = useMemo(
    () => computeSeedLayout(data.nodes, data.edges),
    [data.nodes, data.edges],
  );

  // Report top directories to parent
  useEffect(() => {
    const dirs = layoutNodes
      .filter((n) => n.kind !== "file" && !n.isDust && n.depth > 0)
      .map((d) => {
        const fileCount = layoutNodes.filter(
          (n) => n.kind === "file" && n.parentId === d.id && !n.isDust,
        ).length;
        return { id: d.id, label: d.label, count: fileCount, position: d.position };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    onTopDirsChange?.(dirs);
  }, [layoutNodes, onTopDirsChange]);

  const handleNodeClick = useCallback((node: LayoutNode) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const handleNodeHover = useCallback((node: LayoutNode | null) => {
    setHoveredNode(node);
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Canvas
        camera={{ position: CAMERA_DEFAULTS.position, fov: 60 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 1.5]}
      >
        <GalaxyScene
          layoutNodes={layoutNodes}
          layoutEdges={layoutEdges}
          settings={settings}
          searchQuery={searchQuery}
          showOnlyChanged={showOnlyChanged}
          showOrphans={showOrphans}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onFilterCountChange={onNodeCountChange}
          resetKey={resetKey}
          flyTarget={flyTarget ?? null}
          onFlyComplete={onFlyComplete}
          selectedNodeId={selectedNodeId}
        />
      </Canvas>

      {/* Tooltip */}
      <Tooltip node={hoveredNode} />

      {/* Dust particles overlay hint */}
      {selectedNodeId && layoutNodes.find((n) => n.id === selectedNodeId && n.kind === "file") && (
        <div
          style={{
            position: "absolute", zIndex: 40, bottom: 40, left: "50%",
            transform: "translateX(-50%)",
            padding: "4px 12px", borderRadius: 9999,
            background: "rgba(20,20,30,0.85)",
            border: "1px solid rgba(255,215,0,0.15)",
            fontSize: 11, color: "rgba(255,215,0,0.7)",
            pointerEvents: "none",
          }}
        >
          🌟 点击以查看变更尘埃
        </div>
      )}
    </div>
  );
}
