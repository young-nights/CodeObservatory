// CosmicGalaxy — Deep Space 3D Galaxy Visualization
// R3F Canvas with Bloom, Stars, NebulaRings, interactive nodes and edges
// Uses scan_directory data to build file-tree galaxy layout

import {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, Line } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import type { GraphData, FileNode } from "@/lib/types";
import { NebulaRings } from "@/components/graph/NebulaRings";

// ═══════════════════════════════════════════════════════════════
// Exported types
// ═══════════════════════════════════════════════════════════════

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
  modified?: string;
  parentId?: string;
}

export interface LayoutEdge {
  source: [number, number, number];
  target: [number, number, number];
  sourceId: string;
  targetId: string;
  type: "root-dir" | "dir-file" | "dir-dir";
}

interface CosmicGalaxyProps {
  graph: GraphData | null;
  fullscreen?: boolean;
  onNodeSelect?: (node: LayoutNode | null) => void;
}

// ═══════════════════════════════════════════════════════════════
// Extension → color mapping
// ═══════════════════════════════════════════════════════════════

const EXT_COLORS: Record<string, string> = {
  ts: "#5b8def",
  tsx: "#5b8def",
  js: "#f0db4f",
  jsx: "#f0db4f",
  rs: "#e07050",
  py: "#4b8bbe",
  go: "#00add8",
  java: "#b07219",
  c: "#555555",
  cpp: "#f34b7d",
  h: "#a0a0a0",
  md: "#b070d0",
  json: "#d4b040",
  toml: "#d4b040",
  yaml: "#d4b040",
  css: "#50b070",
  html: "#e34c26",
  svg: "#ff9900",
  png: "#a0a0a0",
  jpg: "#a0a0a0",
  lock: "#808080",
};

const DEFAULT_FILE_COLOR = "#8899cc";

// ═══════════════════════════════════════════════════════════════
// 3D Layout: build galaxy coordinates from file tree
// ═══════════════════════════════════════════════════════════════

function computeGalaxyLayout(
  nodes: FileNode[],
  edges: GraphData["edges"],
): { layoutNodes: LayoutNode[]; layoutEdges: LayoutEdge[] } {
  const nodeMap = new Map<string, FileNode>();
  const childrenMap = new Map<string, FileNode[]>();
  const targeted = new Set(edges.map((e) => e.target));

  for (const n of nodes) nodeMap.set(n.id, n);
  for (const e of edges) {
    const child = nodeMap.get(e.target);
    if (child) {
      const arr = childrenMap.get(e.source) || [];
      arr.push(child);
      childrenMap.set(e.source, arr);
    }
  }

  const root = nodes.find((n) => !targeted.has(n.id));
  const rootId = root?.id;
  const positions = new Map<string, [number, number, number]>();
  const depths = new Map<string, number>();
  const parents = new Map<string, string>();

  // BFS depth/parent
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

  // Root at origin
  if (rootId) positions.set(rootId, [0, 0, 0]);

  // Depth 1 dirs — Z=0 plane, radius 6
  const d1Dirs = nodes.filter((n) => depths.get(n.id) === 1 && n.kind === "dir");
  d1Dirs.forEach((d, i) => {
    const a = (2 * Math.PI * i) / Math.max(d1Dirs.length, 1);
    positions.set(d.id, [6 * Math.cos(a), 0, 6 * Math.sin(a)]);
  });

  // Depth 2 dirs — Z=±3 planes, radius 12, fan distribution
  const d2Dirs = nodes.filter((n) => depths.get(n.id) === 2 && n.kind === "dir");
  d2Dirs.forEach((d, i) => {
    const parentEdge = edges.find((e) => e.target === d.id);
    const parentPos = parentEdge ? positions.get(parentEdge.source) : undefined;
    const baseA = parentPos ? Math.atan2(parentPos[2], parentPos[0]) : (2 * Math.PI * i) / d2Dirs.length;
    const half = Math.ceil(d2Dirs.length / 2);
    const z = i < half ? 3 : -3;
    const ci = i < half ? i : i - half;
    const per = Math.max(1, i < half ? half : d2Dirs.length - half);
    const fanA = baseA + ((ci / per) - 0.5) * (Math.PI * 0.44); // ±40° fan
    positions.set(d.id, [12 * Math.cos(fanA), z, 12 * Math.sin(fanA)]);
  });

  // Deeper dirs — spiral
  const deepDirs = nodes.filter((n) => n.kind === "dir" && (depths.get(n.id) ?? 0) >= 3);
  deepDirs.forEach((d, i) => {
    const dd = depths.get(d.id) ?? 3;
    const r = 18 + (dd - 3) * 3;
    const a = (2 * Math.PI * i) / Math.max(deepDirs.length, 1);
    const h = ((dd - 3) * 3 + Math.sin(i * 0.7) * 4);
    positions.set(d.id, [r * Math.cos(a), h, r * Math.sin(a)]);
  });

  // Files — Fibonacci sphere around parent, radius 4
  const fileNodes = nodes.filter(
    (n) => n.kind === "file" || (depths.has(n.id) && n.kind === undefined),
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
    const radius = Math.min(2 + Math.sqrt(count) * 0.4, 8);
    if (count === 1) {
      positions.set(children[0].id, [
        center[0] + 2,
        center[1] + 0.5,
        center[2] + 1,
      ]);
      continue;
    }
    children.forEach((child, i) => {
      const y = 1 - (i / (count - 1)) * 2;
      const rY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = phi * i;
      const zOff = Math.sin(theta * 3) * 0.6 + Math.cos(i * 0.7) * 0.6;
      positions.set(child.id, [
        center[0] + radius * rY * Math.cos(theta),
        center[1] + radius * y,
        center[2] + radius * rY * Math.sin(theta) + zOff,
      ]);
    });
  }

  // Stray nodes
  for (const n of nodes) {
    if (positions.has(n.id)) continue;
    const d = depths.get(n.id) ?? 3;
    const r = 22 + d * 3;
    const a = Math.random() * 2 * Math.PI;
    const h = (d - 3) * 4 + (Math.random() - 0.5) * 4;
    positions.set(n.id, [r * Math.cos(a), h, r * Math.sin(a)]);
  }

  // Build layout nodes
  function getNodeSize(k: string | null, depth: number): number {
    if (k === "file") return 0.2;
    if (depth === 0) return 1.2;
    if (depth === 1) return 0.7;
    return 0.5;
  }

  function getNodeColor(k: string | null, depth: number, ext?: string): string {
    if (k !== "file") {
      if (depth === 0) return "#ffffff";
      if (depth === 1) return "#ffd700";
      return "#ff8c42";
    }
    return ext ? (EXT_COLORS[ext.toLowerCase()] || DEFAULT_FILE_COLOR) : DEFAULT_FILE_COLOR;
  }

  function getNodeEmissive(k: string | null, depth: number, ext?: string): string {
    if (k !== "file") {
      if (depth === 0) return "#ffffff";
      if (depth === 1) return "#ffd700";
      return "#ff8c42";
    }
    return ext ? (EXT_COLORS[ext.toLowerCase()] || DEFAULT_FILE_COLOR) : DEFAULT_FILE_COLOR;
  }

  const layoutNodes: LayoutNode[] = nodes.map((n) => {
    const pos = positions.get(n.id) || [0, 0, 0];
    const d = depths.get(n.id) ?? 3;
    const k = n.kind ?? null;
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
      modified: n.modified,
      parentId: parents.get(n.id),
    };
  });

  // Build layout edges with types
  const layoutEdges: LayoutEdge[] = edges
    .filter((e) => positions.has(e.source) && positions.has(e.target))
    .map((e) => {
      const src = layoutNodes.find((n) => n.id === e.source);
      const tgt = layoutNodes.find((n) => n.id === e.target);
      let type: LayoutEdge["type"] = "dir-file";
      if (src?.kind !== "file" && tgt?.kind !== "file") type = "dir-dir";
      if (src?.depth === 0) type = "root-dir";
      return {
        source: positions.get(e.source)!,
        target: positions.get(e.target)!,
        sourceId: e.source,
        targetId: e.target,
        type,
      };
    });

  return { layoutNodes, layoutEdges };
}

// ═══════════════════════════════════════════════════════════════
// Camera manager: auto-rotate + fly-to
// ═══════════════════════════════════════════════════════════════

function CameraManager({
  focusTarget,
  nodePositions,
}: {
  focusTarget: string | null;
  nodePositions: Map<string, [number, number, number]>;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const animRef = useRef<{
    startPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    endPos: THREE.Vector3;
    endTarget: THREE.Vector3;
    startTime: number;
    duration: number;
  } | null>(null);

  // Reset camera to root on right-click
  const resetCamera = useCallback(() => {
    const startPos = camera.position.clone();
    const endPos = new THREE.Vector3(0, 25, 35);
    const endTarget = new THREE.Vector3(0, 0, 0);
    animRef.current = {
      startPos,
      startTarget: new THREE.Vector3(0, 0, 0),
      endPos,
      endTarget,
      startTime: performance.now(),
      duration: 800,
    };
  }, [camera.position]);

  // Fly to node on double-click
  useEffect(() => {
    if (!focusTarget) return;
    const pos = nodePositions.get(focusTarget);
    if (!pos) return;
    const target = new THREE.Vector3(pos[0], pos[1], pos[2]);
    const dir = target.clone().normalize();
    const endPos = target.clone().add(dir.multiplyScalar(8));
    endPos.y += 3;
    animRef.current = {
      startPos: camera.position.clone(),
      startTarget: new THREE.Vector3(0, 0, 0),
      endPos,
      endTarget: target,
      startTime: performance.now(),
      duration: 1000,
    };
  }, [focusTarget, camera.position, nodePositions]);

  useFrame(() => {
    const anim = animRef.current;
    if (!anim) return;
    const elapsed = performance.now() - anim.startTime;
    const t = Math.min(elapsed / anim.duration, 1);
    // easeOutCubic
    const et = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(anim.startPos, anim.endPos, et);
    if (t >= 1) {
      animRef.current = null;
    }
  });

  // Listen for contextmenu (right-click) globally
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      e.preventDefault();
      resetCamera();
    };
    window.addEventListener("contextmenu", handler);
    return () => window.removeEventListener("contextmenu", handler);
  }, [resetCamera]);

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        autoRotate
        autoRotateSpeed={0.3}
        minDistance={5}
        maxDistance={300}
        target={new THREE.Vector3(0, 0, 0)}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// GalaxyNode — single node rendered as sphere
// ═══════════════════════════════════════════════════════════════

function GalaxyNode({
  layoutNode,
  isSelected,
  isHovered,
  onNodeClick,
  onNodeHover,
  onNodeDoubleClick,
}: {
  layoutNode: LayoutNode;
  isSelected: boolean;
  isHovered: boolean;
  onNodeClick: (id: string) => void;
  onNodeHover: (id: string | null) => void;
  onNodeDoubleClick: (id: string) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const isDir = layoutNode.kind === "dir";
  const isRoot = layoutNode.depth === 0 && isDir;

  // Emissive intensity by depth (root strongest)
  const emissiveIntensity = isRoot ? 2 : isDir ? 1.2 : 0.8;
  const segments = useMemo(() => {
    // Performance: reduce segments for distant small nodes
    if (layoutNode.size < 0.3) return [8, 8];
    if (layoutNode.size < 0.7) return [16, 16];
    return [24, 24];
  }, [layoutNode.size]);

  // Pulse animation for selected/root nodes
  useFrame(() => {
    if (!meshRef.current) return;
    const baseScale = isSelected ? layoutNode.size * 1.4 : isHovered ? layoutNode.size * 1.3 : layoutNode.size;
    let pulse = 1;
    if (isSelected || isRoot) {
      pulse = 1 + Math.sin(performance.now() * 0.003) * 0.1;
    }
    meshRef.current.scale.setScalar(baseScale * pulse);

    // Bloom via emissive pulsing
    const material = meshRef.current.material as THREE.MeshStandardMaterial;
    if (material && (isSelected || isRoot)) {
      material.emissiveIntensity = emissiveIntensity * (1 + Math.sin(performance.now() * 0.003) * 0.15);
    } else if (material) {
      material.emissiveIntensity = emissiveIntensity;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={layoutNode.position}
      onClick={(e) => {
        e.stopPropagation();
        onNodeClick(layoutNode.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (isDir) onNodeDoubleClick(layoutNode.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onNodeHover(layoutNode.id);
      }}
      onPointerOut={() => onNodeHover(null)}
      scale={layoutNode.size}
    >
      <sphereGeometry args={[1, segments[0], segments[1]]} />
      <meshStandardMaterial
        color={layoutNode.color}
        emissive={layoutNode.emissive}
        emissiveIntensity={emissiveIntensity}
        roughness={0.3}
        metalness={0.2}
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════
// GalaxyEdges — all connecting lines
// ═══════════════════════════════════════════════════════════════

function GalaxyEdges({ edges }: { edges: LayoutEdge[] }) {
  const rootDirEdges = useMemo(
    () => edges.filter((e) => e.type === "root-dir"),
    [edges],
  );
  const dirFileEdges = useMemo(
    () => edges.filter((e) => e.type === "dir-file"),
    [edges],
  );
  const dirDirEdges = useMemo(
    () => edges.filter((e) => e.type === "dir-dir"),
    [edges],
  );

  // Sample for performance beyond limits
  const sample = <T,>(items: T[], max: number): T[] => {
    if (items.length <= max) return items;
    const step = Math.ceil(items.length / max);
    return items.filter((_, i) => i % step === 0);
  };

  return (
    <group>
      {/* Root → Dir: purple-white, thick */}
      {sample(rootDirEdges, 800).map((edge, i) => (
        <Line
          key={`rd-${i}`}
          points={[edge.source, edge.target]}
          color="#a080ff"
          lineWidth={0.6}
          transparent
          opacity={0.35}
        />
      ))}
      {/* Dir → File: dark purple, thin */}
      {sample(dirFileEdges, 2000).map((edge, i) => (
        <Line
          key={`df-${i}`}
          points={[edge.source, edge.target]}
          color="#4030a0"
          lineWidth={0.3}
          transparent
          opacity={0.18}
        />
      ))}
      {/* Dir → Dir: medium purple */}
      {sample(dirDirEdges, 500).map((edge, i) => (
        <Line
          key={`dd-${i}`}
          points={[edge.source, edge.target]}
          color="#6040c0"
          lineWidth={0.4}
          transparent
          opacity={0.22}
        />
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// GalaxyScene — inside the Canvas render tree
// ═══════════════════════════════════════════════════════════════

function GalaxyScene({
  layoutNodes,
  layoutEdges,
  selectedNodeId,
  hoveredNodeId,
  focusTarget,
  onNodeClick,
  onNodeHover,
  onNodeDoubleClick,
  nodePositions,
}: {
  layoutNodes: LayoutNode[];
  layoutEdges: LayoutEdge[];
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  focusTarget: string | null;
  onNodeClick: (id: string) => void;
  onNodeHover: (id: string | null) => void;
  onNodeDoubleClick: (id: string) => void;
  nodePositions: Map<string, [number, number, number]>;
}) {
  return (
    <>
      {/* Deep space background */}
      <color attach="background" args={["#020010"]} />
      <fog attach="fog" args={["#020010", 60, 400]} />

      {/* Stars */}
      <Stars radius={200} depth={80} count={8000} factor={5} saturation={0.1} fade speed={0.4} />

      {/* Lighting */}
      <ambientLight intensity={0.15} />
      <pointLight position={[30, 30, 30]} intensity={2} color="#8880ff" />
      <pointLight position={[-30, -10, -20]} intensity={0.8} color="#4020a0" />

      {/* Camera */}
      <CameraManager focusTarget={focusTarget} nodePositions={nodePositions} />

      {/* Nebula rings */}
      <NebulaRings />

      {/* Edges */}
      <GalaxyEdges edges={layoutEdges} />

      {/* Nodes */}
      {layoutNodes.map((node) => (
        <GalaxyNode
          key={node.id}
          layoutNode={node}
          isSelected={selectedNodeId === node.id}
          isHovered={hoveredNodeId === node.id}
          onNodeClick={onNodeClick}
          onNodeHover={onNodeHover}
          onNodeDoubleClick={onNodeDoubleClick}
        />
      ))}

      {/* Post-processing bloom */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.15}
          intensity={1.5}
          radius={0.8}
          mipmapBlur
          luminanceSmoothing={0.9}
        />
      </EffectComposer>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Hover tooltip (HTML overlay)
// ═══════════════════════════════════════════════════════════════

function Tooltip({ node }: { node: LayoutNode | null }) {
  if (!node) return null;
  const kindLabel =
    node.kind === "file"
      ? `File${node.extension ? ` .${node.extension}` : ""}`
      : node.depth === 0
        ? "Root"
        : "Directory";

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 50,
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        padding: "6px 12px",
        borderRadius: 4,
        background: "rgba(4, 2, 24, 0.88)",
        border: "1px solid rgba(136, 128, 255, 0.15)",
        pointerEvents: "none",
        maxWidth: 320,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--cosmic-text)" }}>
        {node.label}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "var(--cosmic-text-dim)",
          display: "flex",
          gap: 4,
          marginTop: 1,
        }}
      >
        <span>{kindLabel}</span>
        {node.sizeBytes ? <span>· {node.sizeBytes} B</span> : null}
        {node.changeCount > 0 ? <span>· {node.changeCount} changes</span> : null}
      </div>
      <div
        style={{
          fontSize: 9,
          fontFamily: "monospace",
          color: "var(--cosmic-text-dim)",
          marginTop: 1,
          opacity: 0.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
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

export function CosmicGalaxy({ graph, fullscreen = false, onNodeSelect }: CosmicGalaxyProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);

  // Compute layout from graph data
  const layout = useMemo(() => {
    if (!graph) return { layoutNodes: [], layoutEdges: [], nodePositions: new Map<string, [number, number, number]>() };
    const result = computeGalaxyLayout(graph.nodes, graph.edges);
    const posMap = new Map<string, [number, number, number]>();
    result.layoutNodes.forEach((n) => posMap.set(n.id, n.position));
    return { ...result, nodePositions: posMap };
  }, [graph]);

  // Handlers
  const handleNodeClick = useCallback(
    (id: string) => {
      setSelectedNodeId((prev) => {
        const next = prev === id ? null : id;
        const node = next ? layout.layoutNodes.find((n) => n.id === next) ?? null : null;
        onNodeSelect?.(node);
        return next;
      });
    },
    [layout.layoutNodes, onNodeSelect],
  );

  const handleNodeHover = useCallback((id: string | null) => {
    setHoveredNodeId(id);
  }, []);

  const handleNodeDoubleClick = useCallback(
    (id: string) => {
      setFocusTarget(id);
    },
    [],
  );

  // Current hovered/selected node data
  const hoveredNode = hoveredNodeId
    ? layout.layoutNodes.find((n) => n.id === hoveredNodeId) ?? null
    : null;

  // Loading/empty states
  if (!graph) {
    return (
      <div className="co-cosmic-overlay" style={{ background: "var(--cosmic-bg)" }}>
        <div className="co-cosmic-spinner" />
        <p style={{ fontSize: 13, color: "var(--cosmic-text-dim)", marginTop: 12 }}>
          Scanning project…
        </p>
      </div>
    );
  }

  if (graph.nodes.length === 0) {
    return (
      <div className="co-cosmic-overlay" style={{ background: "var(--cosmic-bg)" }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--cosmic-text-dim)", marginBottom: 4 }}>
          Empty Project
        </p>
        <p style={{ fontSize: 12, color: "var(--cosmic-text-dim)" }}>
          This directory contains no files or folders.
        </p>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Canvas
        key={`galaxy-${fullscreen}`}
        camera={{ position: [0, 25, 35], fov: 55 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 1.5]}
      >
        <GalaxyScene
          layoutNodes={layout.layoutNodes}
          layoutEdges={layout.layoutEdges}
          selectedNodeId={selectedNodeId}
          hoveredNodeId={hoveredNodeId}
          focusTarget={focusTarget}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onNodeDoubleClick={handleNodeDoubleClick}
          nodePositions={layout.nodePositions}
        />
      </Canvas>

      {/* Overlay tooltip */}
      <Tooltip node={hoveredNode} />
    </div>
  );
}
