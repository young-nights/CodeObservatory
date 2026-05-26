// CosmicGalaxy — R3F 3D cosmic file-tree galaxy
// Spiral-layout nodes as stars/planets, bloom edges as star-tracks

import {
  useMemo, useRef, useState, useCallback, useEffect,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, Line, Environment } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import type { GraphData, FileNode } from "@/lib/types";

// ── Constants ──

const FILE_SIZE = 0.15;
const DIR_L2_SIZE = 0.25;
const DIR_L1_SIZE = 0.4;
const ROOT_SIZE = 0.8;

const DEFAULT_FILE_COLOR = "#8ba0c0";

const EXT_COLORS: Record<string, string> = {
  ts: "#5b8def", tsx: "#5b8def",
  rs: "#e07050",
  md: "#b070d0",
  json: "#d4b040", toml: "#d4b040",
  css: "#50b070", html: "#50b070",
};

const CAMERA_DEFAULTS = { position: [0, 0, 100] as [number, number, number], target: [0, 0, 0] as [number, number, number] };

// ── Interfaces ──

export interface CosmicGalaxyPanelSettings {
  nodeSize: number;       // 6–24 (default 7)
  edgeThickness: number;  // 0.2–2 (default 0.5)
  gravity: number;        // 1–20 (default 5)  → inner spread
  repulsion: number;      // 1–20 (default 10) → vertical spread
  edgeLength: number;     // 1–20 (default 5)  → radial scale
}

export interface CosmicGalaxyProps {
  data: GraphData;
  settings: CosmicGalaxyPanelSettings;
  searchQuery: string;
  showOnlyChanged: boolean;
  showOrphans: boolean;
  resetKey?: number;
  onNodeCountChange?: (visibleNodes: number, visibleEdges: number) => void;
}

interface LayoutNode {
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
}

interface LayoutEdge {
  source: [number, number, number];
  target: [number, number, number];
  sourceId: string;
  targetId: string;
}

// ── Helpers ──

function getNodeColor(kind: string | null, depth: number, extension?: string): string {
  if (kind !== "file") {
    if (depth === 0) return "#ffffff";
    if (depth === 1) return "#ffd700";
    return "#ff8c42";
  }
  if (extension) {
    return EXT_COLORS[extension.toLowerCase()] ?? DEFAULT_FILE_COLOR;
  }
  return DEFAULT_FILE_COLOR;
}

function getNodeSize(kind: string | null, depth: number): number {
  if (kind !== "file") {
    if (depth === 0) return ROOT_SIZE;
    if (depth === 1) return DIR_L1_SIZE;
    return DIR_L2_SIZE;
  }
  return FILE_SIZE;
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── 3D Spiral Layout ──

function compute3DLayout(
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

  const rootId = nodes.find((n) => !targeted.has(n.id))?.id;
  const positions = new Map<string, [number, number, number]>();
  const depths = new Map<string, number>();

  // BFS depth
  if (rootId) {
    const queue = [rootId];
    depths.set(rootId, 0);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const d = depths.get(cur)!;
      for (const child of childrenMap.get(cur) || []) {
        if (!depths.has(child.id)) {
          depths.set(child.id, d + 1);
          queue.push(child.id);
        }
      }
    }
  }

  // Place root
  if (rootId) {
    positions.set(rootId, [0, 0, 0]);
  }

  // Place depth-1 dirs in a ring on z=0, r=15
  const l1Dirs = nodes.filter((n) => depths.get(n.id) === 1 && n.kind === "dir");
  l1Dirs.forEach((d, i) => {
    const a = (2 * Math.PI * i) / l1Dirs.length;
    positions.set(d.id, [15 * Math.cos(a), 0, 15 * Math.sin(a)]);
  });

  // Place depth-2 dirs in z=±5 rings, r=30
  const l2Dirs = nodes.filter((n) => depths.get(n.id) === 2 && n.kind === "dir");
  l2Dirs.forEach((d, i) => {
    const parentEdge = edges.find((e) => e.target === d.id);
    const baseA = parentEdge && positions.has(parentEdge.source)
      ? (([px, , pz]) => Math.atan2(pz, px))(positions.get(parentEdge.source)!)
      : 0;
    const half = Math.ceil(l2Dirs.length / 2);
    const z = i < half ? 5 : -5;
    const ci = i < half ? i : i - half;
    const per = Math.max(1, i < half ? half : l2Dirs.length - half);
    const a = baseA + (2 * Math.PI * ci) / per;
    positions.set(d.id, [30 * Math.cos(a), z, 30 * Math.sin(a)]);
  });

  // Place files on Fibonacci spheres around parent
  const fileNodes = nodes.filter((n) => n.kind === "file" || (n.kind === undefined && depths.has(n.id)));
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
    const radius = 3 + Math.sqrt(count) * 0.6;
    if (count === 1) {
      positions.set(children[0].id, [center[0] + 4, center[1], center[2]]);
      continue;
    }
    children.forEach((child, i) => {
      const y = 1 - (i / (count - 1)) * 2; // -1 … 1
      const rY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = phi * i;
      positions.set(child.id, [
        center[0] + radius * rY * Math.cos(theta),
        center[1] + radius * y,
        center[2] + radius * rY * Math.sin(theta),
      ]);
    });
  }

  // Stray / deep nodes — scatter in outer spiral
  for (const n of nodes) {
    if (positions.has(n.id)) continue;
    const d = depths.get(n.id) ?? 3;
    const r = 35 + d * 5;
    const a = Math.random() * 2 * Math.PI;
    const h = (d - 3) * 6 + Math.random() * 3;
    positions.set(n.id, [r * Math.cos(a), h, r * Math.sin(a)]);
  }

  // Build layout data
  const layoutNodes: LayoutNode[] = nodes.map((n) => {
    const pos = positions.get(n.id) || [0, 0, 0];
    const d = depths.get(n.id) ?? 3;
    const kind = n.kind ?? null;
    return {
      id: n.id,
      label: n.label,
      path: n.path,
      position: pos as [number, number, number],
      size: getNodeSize(kind, d),
      color: getNodeColor(kind, d, n.extension),
      emissive: getNodeColor(kind, d, n.extension),
      depth: d,
      kind,
      extension: n.extension,
      sizeBytes: n.size,
      changeCount: n.changeCount ?? 0,
    };
  });

  const layoutEdges: LayoutEdge[] = edges
    .filter((e) => positions.has(e.source) && positions.has(e.target))
    .map((e) => ({
      source: positions.get(e.source)!,
      target: positions.get(e.target)!,
      sourceId: e.source,
      targetId: e.target,
    }));

  return { layoutNodes, layoutEdges };
}

// ── Camera reset controller ──

function CameraController({ resetKey }: { resetKey: number }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(...CAMERA_DEFAULTS.position);
    camera.lookAt(...CAMERA_DEFAULTS.target);
  }, [resetKey, camera]);
  return null;
}

// ── Sub-components ──

function StarNode({
  position, size, color, emissive, onClick, onHover,
}: {
  position: [number, number, number];
  size: number;
  color: string;
  emissive: string;
  onClick?: () => void;
  onHover?: (hovered: boolean) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);

  const handlePointerOver = useCallback(() => {
    setHovered(true);
    onHover?.(true);
  }, [onHover]);

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    onHover?.(false);
  }, [onHover]);

  const ballSize = hovered ? size * 1.4 : size;

  return (
    <mesh
      ref={meshRef}
      position={position}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <sphereGeometry args={[ballSize, 32, 32]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={hovered ? 1.2 : 0.6}
        roughness={0.4}
        metalness={0.1}
      />
    </mesh>
  );
}

function EdgeLines({ edges, edgeOpacity }: { edges: LayoutEdge[]; edgeOpacity: number }) {
  const sampled = useMemo(() => {
    if (edges.length <= 2000) return edges;
    const step = Math.ceil(edges.length / 2000);
    return edges.filter((_, i) => i % step === 0);
  }, [edges]);

  const gold = useMemo(() => new THREE.Color("#ffb841"), []);
  const blue = useMemo(() => new THREE.Color("#4070c0"), []);

  return (
    <group>
      {sampled.map((edge, i) => {
        const mx = (edge.source[0] + edge.target[0]) / 2;
        const my = (edge.source[1] + edge.target[1]) / 2;
        const mz = (edge.source[2] + edge.target[2]) / 2;
        const dist = Math.sqrt(mx * mx + my * my + mz * mz);
        const t = Math.min(dist / 60, 1);
        const ec = new THREE.Color().lerpColors(gold, blue, t);
        return (
          <Line
            key={`e-${i}`}
            points={[edge.source, edge.target]}
            color={ec.getStyle()}
            lineWidth={0.5}
            transparent
            opacity={edgeOpacity * 0.15}
          />
        );
      })}
    </group>
  );
}

// ── Galaxy Scene (inside Canvas) ──

function GalaxyScene({
  layoutNodes, layoutEdges, settings, searchQuery, showOnlyChanged, showOrphans,
  onNodeClick, onNodeHover, onFilterCountChange, resetKey,
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
}) {
  const totalNodes = layoutNodes.length;

  // Scale factor from panel sliders
  const radialScale = useMemo(() => {
    const g = Math.max(0.3, (21 - settings.gravity) / 5);
    const r = settings.repulsion / 5;
    const el = settings.edgeLength / 5;
    return g * r * el;
  }, [settings.gravity, settings.repulsion, settings.edgeLength]);

  const nodeSizeMul = settings.nodeSize / 7;

  // Filter nodes
  const filteredNodes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const edgeNodeIds = new Set<string>();
    for (const e of layoutEdges) {
      edgeNodeIds.add(e.sourceId);
      edgeNodeIds.add(e.targetId);
    }
    return layoutNodes.filter((n) => {
      if (q && !n.path.toLowerCase().includes(q) && !n.label.toLowerCase().includes(q)) return false;
      if (showOnlyChanged && n.changeCount === 0) return false;
      if (showOrphans && edgeNodeIds.has(n.id)) return false;
      return true;
    });
  }, [layoutNodes, layoutEdges, searchQuery, showOnlyChanged, showOrphans]);

  // Filter edges (both endpoints must be visible)
  const visibleIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);
  const filteredEdges = useMemo(
    () => layoutEdges.filter((e) => visibleIds.has(e.sourceId) && visibleIds.has(e.targetId)),
    [layoutEdges, visibleIds],
  );

  // Notify parent of counts
  useEffect(() => {
    onFilterCountChange?.(filteredNodes.length, filteredEdges.length);
  }, [filteredNodes.length, filteredEdges.length, onFilterCountChange]);

  // Performance scaling
  const starsCount = totalNodes > 3000 ? 1000 : totalNodes > 1000 ? 2000 : 5000;
  const edgeOpacity = settings.edgeThickness / 0.5;

  return (
    <>
      <color attach="background" args={["#000008"]} />
      <fog attach="fog" args={["#000008", 50, 400]} />
      <Stars radius={300} depth={50} count={starsCount} factor={4} saturation={0} fade speed={0.3} />
      <Environment preset="night" />

      <ambientLight intensity={0.2} />
      <pointLight position={[20, 20, 20]} intensity={2} color="#a5b4fc" />

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={500}
        autoRotate
        autoRotateSpeed={0.15}
      />

      <CameraController resetKey={resetKey} />

      <EdgeLines edges={filteredEdges} edgeOpacity={edgeOpacity} />

      {filteredNodes.map((node) => (
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
          onClick={() => onNodeClick(node)}
          onHover={(h) => onNodeHover(h ? node : null)}
        />
      ))}

      <EffectComposer>
        <Bloom luminanceThreshold={0.2} intensity={0.8} radius={0.5} />
      </EffectComposer>
    </>
  );
}

// ── Tooltip ──

function Tooltip({ node }: { node: LayoutNode | null }) {
  if (!node) return null;
  const kindLabel =
    node.kind === "file"
      ? `File${node.extension ? ` .${node.extension}` : ""}`
      : "Directory";

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

// ── Main component ──

export function CosmicGalaxy({
  data, settings, searchQuery, showOnlyChanged, showOrphans,
  resetKey = 0, onNodeCountChange,
}: CosmicGalaxyProps) {
  const [hoveredNode, setHoveredNode] = useState<LayoutNode | null>(null);

  // Compute layout once per data change
  const { layoutNodes, layoutEdges } = useMemo(
    () => compute3DLayout(data.nodes, data.edges),
    [data.nodes, data.edges],
  );

  const handleNodeClick = useCallback((_node: LayoutNode) => {
    // Click is reserved for future inspection
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
        />
      </Canvas>
      <Tooltip node={hoveredNode} />
    </div>
  );
}
