// CosmicProjectGalaxy — Immersive 3D Galaxy Visualization
// React + R3F + Drei + Postprocessing
// Integration: reads from Rust scan_directory via @/lib/api
// Visual reference: meet-blog.buyixiao.xyz

import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Stars,
  Line,
  Text,
  TrackballControls,
} from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { useScanGraph } from "@/hooks/useObservatory";
import type { FileNode, FileEdge, GraphData } from "@/lib/types";
import { FolderOpen, File, Clock, Hash, X } from "lucide-react";

// ══════════════════════════════════════════════════
// Color Palette — Hex only for Three.js compatibility
// ══════════════════════════════════════════════════
const COLORS = {
  bg: "#000011",
  rootGlow: "#ffffff",
  dirCyan: "#00e5ff",
  dirPurple: "#b44cff",
  fileColors: {
    ts: "#5b8def",
    tsx: "#6b9df0",
    js: "#56b6c2",
    jsx: "#66c6d2",
    rs: "#e07050",
    md: "#c084fc",
    json: "#d4b040",
    toml: "#d4b040",
    yaml: "#d4b040",
    css: "#50b070",
    scss: "#60c080",
    html: "#e89050",
    py: "#40b8d0",
    c: "#8899aa",
    h: "#8899aa",
    cpp: "#8899aa",
    go: "#60b0d0",
    default: "#8ba0c0",
  },
  edgeRootDir: "#a080ff",
  edgeDirFile: "#4030a0",
  edgeDirDir: "#6040c0",
  hover: "#ffffff",
};

// ══════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════
function getFileColor(ext?: string): string {
  if (!ext) return COLORS.fileColors.default;
  return COLORS.fileColors[ext.toLowerCase()] ?? COLORS.fileColors.default;
}

function getDirColor(depth: number): string {
  if (depth <= 1) return COLORS.dirCyan;
  return COLORS.dirPurple;
}

// ══════════════════════════════════════════════════
// 3D Galaxy Layout — Fibonacci sphere around parent
// ══════════════════════════════════════════════════
function computeGalaxyLayout(
  nodes: FileNode[],
  edges: FileEdge[],
): Map<string, [number, number, number]> {
  const positions = new Map<string, [number, number, number]>();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();

  // Build parent→children
  for (const e of edges) {
    const list = children.get(e.source) || [];
    list.push(e.target);
    children.set(e.source, list);
  }

  // Find root
  const targeted = new Set(edges.map((e) => e.target));
  const root = nodes.find((n) => !targeted.has(n.id));
  if (!root) {
    // Fallback: place all in a circle
    nodes.forEach((n, i) => {
      const a = (i / nodes.length) * Math.PI * 2;
      const r = 8 + Math.random() * 4;
      positions.set(n.id, [Math.cos(a) * r, (Math.random() - 0.5) * 4, Math.sin(a) * r]);
    });
    return positions;
  }

  positions.set(root.id, [0, 0, 0]);

  // BFS for depths
  const depth = new Map<string, number>();
  depth.set(root.id, 0);
  const queue = [root.id];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = depth.get(cur)!;
    for (const child of children.get(cur) || []) {
      if (!depth.has(child)) {
        depth.set(child, d + 1);
        queue.push(child);
      }
    }
  }

  // Place depth-1 directories on a ring at Z=0
  const d1Dirs = nodes.filter((n) => depth.get(n.id) === 1 && n.kind === "dir");
  d1Dirs.forEach((n, i) => {
    const a = (i / d1Dirs.length) * Math.PI * 2;
    positions.set(n.id, [Math.cos(a) * 6, 0, Math.sin(a) * 6]);
  });

  // Place depth-2+ directories on a wider ring with Z offset
  const d2Dirs = nodes.filter((n) => (depth.get(n.id) ?? 0) >= 2 && n.kind === "dir");
  d2Dirs.forEach((n, i) => {
    const parent = edges.find((e) => e.target === n.id);
    const parentPos = parent ? positions.get(parent.source) : [0, 0, 0];
    const pAngle = parentPos ? Math.atan2(parentPos[2], parentPos[0]) : 0;
    const spread = Math.PI / 3;
    const a = pAngle - spread / 2 + (i / Math.max(d2Dirs.length, 1)) * spread;
    const r = 12 + Math.random() * 3;
    positions.set(n.id, [Math.cos(a) * r, (Math.random() - 0.5) * 4, Math.sin(a) * r]);
  });

  // Place files around their parent directory using Fibonacci sphere
  const dirsWithFiles = new Map<string, { parentPos: [number, number, number]; files: string[] }>();
  for (const n of nodes) {
    if (n.kind !== "file" && n.kind !== "dir") continue;
    const parentEdge = edges.find((e) => e.target === n.id && nodeMap.get(e.source)?.kind === "dir");
    const parentId = parentEdge?.source || root.id;
    const parentPos = positions.get(parentId) || [0, 0, 0];
    const entry = dirsWithFiles.get(parentId) || { parentPos, files: [] };
    entry.files.push(n.id);
    dirsWithFiles.set(parentId, entry);
  }
  dirsWithFiles.forEach(({ parentPos, files }, parentId) => {
    files.forEach((fid, i) => {
      const phi = Math.acos(1 - 2 * (i + 0.5) / files.length);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = 3.5 + Math.random();
      positions.set(fid, [
        parentPos[0] + r * Math.sin(phi) * Math.cos(theta),
        parentPos[1] + r * Math.sin(phi) * Math.sin(theta),
        parentPos[2] + r * Math.cos(phi),
      ]);
    });
  });

  return positions;
}

// ══════════════════════════════════════════════════
// Twinkling Star — file node with subtle pulse
// ══════════════════════════════════════════════════
function StarNode({
  position,
  color,
  size = 0.15,
  emissiveIntensity = 0.8,
  hovered,
  onHover,
  onClick,
}: {
  position: [number, number, number];
  color: string;
  size?: number;
  emissiveIntensity?: number;
  hovered: boolean;
  onHover: (v: boolean) => void;
  onClick: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const phase = useRef(Math.random() * Math.PI * 2);

  useFrame((_, delta) => {
    if (!ref.current) return;
    phase.current += delta * 2;
    const pulse = 1 + Math.sin(phase.current) * (hovered ? 0.3 : 0.08);
    const s = hovered ? size * 1.8 : size * pulse;
    ref.current.scale.setScalar(s);
    (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
      emissiveIntensity * (hovered ? 3 : pulse);
  });

  return (
    <mesh
      ref={ref}
      position={position}
      onPointerOver={(e) => { e.stopPropagation(); onHover(true); }}
      onPointerOut={() => onHover(false)}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <sphereGeometry args={[1, size > 0.3 ? 16 : 8, size > 0.3 ? 16 : 8]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={emissiveIntensity}
        roughness={0.3}
        metalness={0.1}
        toneMapped={false}
      />
    </mesh>
  );
}

// ══════════════════════════════════════════════════
// Glowing Edge Line
// ══════════════════════════════════════════════════
function GlowEdge({
  start,
  end,
  color,
  width = 0.3,
}: {
  start: [number, number, number];
  end: [number, number, number];
  color: string;
  width?: number;
}) {
  return (
    <Line
      points={[start, end]}
      color={color}
      lineWidth={width}
      transparent
      opacity={0.7}
      toneMapped={false}
    />
  );
}

// ══════════════════════════════════════════════════
// Nebula Ring — rotating atmospheric ring
// ══════════════════════════════════════════════════
function NebulaRing({
  radius,
  color,
  opacity,
  speed,
  zOffset,
}: {
  radius: number;
  color: string;
  opacity: number;
  speed: number;
  zOffset: number;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((_, delta) => {
    ref.current.rotation.z += delta * speed;
    ref.current.rotation.x += delta * speed * 0.3;
  });
  return (
    <mesh ref={ref} position={[0, zOffset, 0]} rotation={[Math.PI / 2.5, 0, 0]}>
      <ringGeometry args={[radius - 0.5, radius + 0.5, 128]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ══════════════════════════════════════════════════
// Slow-moving Background Stars
// ══════════════════════════════════════════════════
function DriftingStars() {
  const ref = useRef<THREE.Points>(null!);
  useFrame((_, delta) => {
    ref.current.rotation.y += delta * 0.015;
    ref.current.rotation.x += delta * 0.005;
  });
  return (
    <points ref={ref}>
      <Stars radius={180} depth={60} count={6000} factor={5} saturation={0.2} fade speed={0.4} />
    </points>
  );
}

// ══════════════════════════════════════════════════
// Scene Content
// ══════════════════════════════════════════════════
interface GalaxySceneProps {
  nodes: FileNode[];
  edges: FileEdge[];
  onSelectNode: (node: FileNode | null) => void;
  selectedId: string | null;
}

function GalaxyScene({ nodes, edges, onSelectNode, selectedId }: GalaxySceneProps) {
  const { camera } = useThree();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const layout = useMemo(() => computeGalaxyLayout(nodes, edges), [nodes, edges]);
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const depthMap = useMemo(() => {
    const d = new Map<string, number>();
    const targeted = new Set(edges.map((e) => e.target));
    const root = nodes.find((n) => !targeted.has(n.id));
    if (!root) return d;
    d.set(root.id, 0);
    const q = [root.id];
    const children = new Map<string, string[]>();
    for (const e of edges) {
      const list = children.get(e.source) || [];
      list.push(e.target);
      children.set(e.source, list);
    }
    while (q.length) {
      const cur = q.shift()!;
      for (const c of children.get(cur) || []) {
        if (!d.has(c)) { d.set(c, (d.get(cur) || 0) + 1); q.push(c); }
      }
    }
    return d;
  }, [nodes, edges]);

  return (
    <>
      {/* Drifting stars background */}
      <DriftingStars />

      {/* Nebula rings */}
      <NebulaRing radius={15} color="#4020a0" opacity={0.012} speed={0.1} zOffset={-1} />
      <NebulaRing radius={25} color="#2040a0" opacity={0.008} speed={0.06} zOffset={-2} />
      <NebulaRing radius={40} color="#102060" opacity={0.005} speed={0.04} zOffset={-3} />

      {/* Edges */}
      {edges.map((e) => {
        const s = layout.get(e.source);
        const t = layout.get(e.target);
        if (!s || !t) return null;
        const srcNode = nodeMap.get(e.source);
        const tgtNode = nodeMap.get(e.target);
        const isRootDir = (depthMap.get(e.source) ?? 99) === 0;
        const isDirEdge = srcNode?.kind === "dir" && tgtNode?.kind === "dir";
        const color = isRootDir ? COLORS.edgeRootDir : isDirEdge ? COLORS.edgeDirDir : COLORS.edgeDirFile;
        const width = isRootDir ? 0.5 : isDirEdge ? 0.3 : 0.2;
        return <GlowEdge key={e.id} start={s} end={t} color={color} width={width} />;
      })}

      {/* Nodes */}
      {nodes.map((n) => {
        const pos = layout.get(n.id);
        if (!pos) return null;
        const depth = depthMap.get(n.id) ?? 0;
        const isDir = n.kind === "dir";
        const isSelected = n.id === selectedId;
        const isHovered = n.id === hoveredId;
        const color = isSelected
          ? COLORS.hover
          : isDir
            ? getDirColor(depth)
            : getFileColor(n.extension);
        const size = isDir
          ? depth === 0 ? 1.0 : depth === 1 ? 0.45 : 0.3
          : 0.15;
        const eIntensity = isDir
          ? depth === 0 ? 2.5 : 1.2
          : 0.8;

        return (
          <StarNode
            key={n.id}
            position={pos}
            color={color}
            size={size}
            emissiveIntensity={eIntensity}
            hovered={isHovered}
            onHover={(v) => setHoveredId(v ? n.id : null)}
            onClick={() => onSelectNode(isSelected ? null : n)}
          />
        );
      })}

      {/* Root glow aura */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[3, 64, 64]} />
        <meshBasicMaterial color="#6460ff" transparent opacity={0.04} />
      </mesh>
    </>
  );
}

// ══════════════════════════════════════════════════
// Info Popup Overlay
// ══════════════════════════════════════════════════
function NodeInfo({ node, onClose }: { node: FileNode; onClose: () => void }) {
  const isDir = node.kind === "dir";
  return (
    <div className="absolute top-20 right-6 w-72 rounded-xl p-5 z-20"
      style={{
        background: "rgba(8,4,32,0.95)",
        border: "1px solid rgba(100,96,255,0.2)",
        backdropFilter: "blur(20px)",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          {isDir ? (
            <FolderOpen size={18} color="#00e5ff" />
          ) : (
            <File size={18} color="#8880ff" />
          )}
          <span className="text-sm font-semibold" style={{ color: "#e8e0f0" }}>
            {node.label}
          </span>
        </div>
        <button onClick={onClose}>
          <X size={14} color="#8070a0" />
        </button>
      </div>
      <div className="space-y-1.5 text-xs" style={{ color: "#8070a0" }}>
        <p className="break-all">{node.path}</p>
        <div className="flex gap-4 mt-2">
          <span className="flex items-center gap-1">
            <Hash size={10} /> {isDir ? "Directory" : node.extension || "file"}
          </span>
          {node.size != null && node.size > 0 && (
            <span className="flex items-center gap-1">
              <Clock size={10} /> {node.size < 1024 ? `${node.size}B` : `${(node.size / 1024).toFixed(1)}KB`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// Main Export Component
// ══════════════════════════════════════════════════
interface CosmicProjectGalaxyProps {
  projectPath: string;
  fullscreen?: boolean;
}

export default function CosmicProjectGalaxy({
  projectPath,
  fullscreen = false,
}: CosmicProjectGalaxyProps) {
  const { graph, loading, refresh } = useScanGraph(projectPath);
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = useCallback((node: FileNode | null) => {
    setSelectedNode(node);
    setSelectedId(node?.id ?? null);
  }, []);

  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;
  const dirCount = graph?.nodes.filter((n) => n.kind === "dir").length ?? 0;
  const fileCount = graph?.nodes.filter((n) => n.kind !== "dir").length ?? 0;

  return (
    <div className="relative w-full h-full" style={{ background: COLORS.bg }}>
      {/* ── 3D Canvas ── */}
      {!loading && graph && graph.nodes.length > 0 ? (
        <Canvas
          key={fullscreen ? "fs" : "normal"}
          gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping }}
          camera={{ position: [0, 15, 30], fov: 55, near: 0.1, far: 500 }}
          style={{ position: "absolute", inset: 0 }}
        >
          <GalaxyScene
            nodes={graph.nodes}
            edges={graph.edges}
            onSelectNode={handleSelect}
            selectedId={selectedId}
          />
          <OrbitControls
            enableDamping
            dampingFactor={0.08}
            autoRotate
            autoRotateSpeed={0.4}
            minDistance={3}
            maxDistance={200}
            maxPolarAngle={Math.PI * 0.75}
          />
          <EffectComposer>
            <Bloom
              luminanceThreshold={0.12}
              intensity={1.8}
              radius={0.7}
              mipmapBlur
              luminanceSmoothing={0.9}
            />
          </EffectComposer>
        </Canvas>
      ) : (
        <div className="flex flex-col items-center justify-center h-full">
          {loading ? (
            <>
              <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mb-4"
                style={{ borderColor: "rgba(100,96,255,0.2)", borderTopColor: "#8880ff" }} />
              <p style={{ color: "#8070a0", fontSize: 13 }}>Scanning galaxy...</p>
            </>
          ) : (
            <p style={{ color: "#8070a0", fontSize: 13 }}>No data available</p>
          )}
        </div>
      )}

      {/* ── Title Overlay ── */}
      <div
        className="absolute top-6 left-8 z-10 select-none pointer-events-none"
        style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}
      >
        <h1
          className="text-2xl font-extrabold tracking-[0.15em]"
          style={{
            color: "#e8e0f0",
            textShadow: "0 0 40px rgba(136,128,255,0.4)",
          }}
        >
          PROJECT GALAXY
        </h1>
        <p style={{ color: "#8070a0", fontSize: 12, marginTop: 2 }}>
          {nodeCount > 0 ? `${dirCount} planets · ${fileCount} stars · ${edgeCount} orbits` : "Awaiting project..."}
        </p>
      </div>

      {/* ── Selected Node Info ── */}
      {selectedNode && (
        <NodeInfo node={selectedNode} onClose={() => handleSelect(null)} />
      )}

      {/* ── Bottom Bar ── */}
      <div
        className="absolute bottom-6 left-0 right-0 flex justify-center z-10 pointer-events-none"
      >
        <div
          className="flex items-center gap-6 px-5 py-2 rounded-full text-xs"
          style={{
            background: "rgba(8,4,32,0.7)",
            border: "1px solid rgba(100,96,255,0.15)",
            color: "#8070a0",
            backdropFilter: "blur(12px)",
          }}
        >
          <span>{nodeCount} nodes</span>
          <span style={{ color: "rgba(128,112,160,0.4)" }}>|</span>
          <span>{edgeCount} edges</span>
          <span style={{ color: "rgba(128,112,160,0.4)" }}>|</span>
          <span>Drag · Scroll · Click stars</span>
        </div>
      </div>

      {/* ── Refresh Button ── */}
      <button
        onClick={refresh}
        className="absolute top-6 right-6 z-10 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
        style={{ background: "rgba(8,4,32,0.6)", border: "1px solid rgba(100,96,255,0.15)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8070a0" strokeWidth="2">
          <path d="M1 4v6h6M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      </button>
    </div>
  );
}
