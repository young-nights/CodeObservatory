// CosmicProjectGalaxy — Ultimate 3D Galaxy Visualization
// R3F Canvas + Custom 3D Force Simulation + Bloom + Flowing Particles
// Node positions are animated via mutable THREE.Vector3 refs for performance.

import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, Line } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { useScanGraph } from "@/hooks/useObservatory";
import type { FileNode, FileEdge } from "@/lib/types";
import { FolderOpen, File, Clock, Hash, X } from "lucide-react";

// ══════════════════════════════════════════════════
// Color Palette — Hex only
// ══════════════════════════════════════════════════
const COLORS = {
  bg: "#000011",
  dirCyan: "#00e5ff",
  dirPurple: "#b44cff",
  fileColors: {
    ts: "#5b8def", tsx: "#6b9df0", js: "#56b6c2", jsx: "#66c6d2",
    rs: "#e07050", md: "#c084fc", json: "#d4b040", toml: "#d4b040",
    yaml: "#d4b040", yml: "#d4b040", css: "#50b070", scss: "#60c080",
    html: "#e89050", py: "#40b8d0", c: "#8899aa", h: "#8899aa",
    cpp: "#8899aa", hpp: "#8899aa", go: "#60b0d0", java: "#b07219",
    vue: "#42b883", svelte: "#ff3e00", kt: "#7f52ff", swift: "#fa7343",
    default: "#8ba0c0",
  } as Record<string, string>,
  edgeRootDir: "#a080ff",
  edgeDirFile: "#4030a0",
  edgeDirDir: "#6040c0",
  particleFlow: "#8880ff",
};

// ══════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════
function getFileColor(ext?: string): string {
  if (!ext) return COLORS.fileColors.default;
  return COLORS.fileColors[ext.toLowerCase()] ?? COLORS.fileColors.default;
}

function getDirColor(depth: number): string {
  return depth <= 1 ? COLORS.dirCyan : COLORS.dirPurple;
}

// ══════════════════════════════════════════════════
// SimNode: position is a mutable THREE.Vector3
// ══════════════════════════════════════════════════
interface SimNode {
  id: string;
  pos: THREE.Vector3;
  vx: number; vy: number; vz: number;
  type: "root" | "dir" | "file";
  depth: number;
  extension?: string;
  label: string;
  path: string;
  sizeBytes?: number;
  fixed: boolean;
}

interface SimLink {
  source: string;
  target: string;
}

// ══════════════════════════════════════════════════
// 3D Force Sim — n-body + spring + center gravity
// ══════════════════════════════════════════════════
const SIM = {
  chargeBase: -200,
  chargeSettleBonus: 2,
  linkDistance: 6,
  linkStrength: 0.2,
  centerStrength: 0.08,
  velocityDecay: 0.35,
  maxVelocity: 6,
  maxRadius: 15,        // hard position clamp — compact galaxy
  elasticPower: 2.0,    // gravity grows as dist^elasticPower (strong rubber-band)
};

function buildForceSim(nodes: FileNode[], edges: FileEdge[]): { simNodes: SimNode[]; simLinks: SimLink[]; tick: () => void } {
  // BFS depth
  const childrenMap = new Map<string, string[]>();
  const depthMap = new Map<string, number>();
  const targeted = new Set(edges.map((e) => e.target));
  for (const e of edges) {
    const arr = childrenMap.get(e.source) || [];
    arr.push(e.target);
    childrenMap.set(e.source, arr);
  }
  const root = nodes.find((n) => !targeted.has(n.id));
  if (root) {
    const queue = [root.id];
    depthMap.set(root.id, 0);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const child of childrenMap.get(cur) || []) {
        if (!depthMap.has(child)) {
          depthMap.set(child, (depthMap.get(cur) || 0) + 1);
          queue.push(child);
        }
      }
    }
  }

  // Create sim nodes — Fibonacci sphere initial positions
  const simNodes: SimNode[] = nodes.map((n, i) => {
    const depth = depthMap.get(n.id) ?? 2;
    const isDir = n.kind === "dir";
    const isRoot = depth === 0 && isDir;
    const phi = Math.acos(1 - 2 * (i + 0.5) / nodes.length);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const baseR = isRoot ? 0 : depth * 2 + 0.5;
    return {
      id: n.id,
      pos: new THREE.Vector3(
        baseR * Math.sin(phi) * Math.cos(theta) + (Math.random() - 0.5) * 2,
        baseR * Math.sin(phi) * Math.sin(theta) + (Math.random() - 0.5) * 4,
        baseR * Math.cos(phi),
      ),
      vx: 0, vy: 0, vz: 0,
      type: isRoot ? "root" : isDir ? "dir" : "file",
      depth,
      extension: n.extension,
      label: n.label,
      path: n.path,
      sizeBytes: n.size,
      fixed: isRoot,
    };
  });

  const simLinks: SimLink[] = edges.map((e) => ({ source: e.source, target: e.target }));

  // Pre-build index lookup
  const idxMap = new Map(simNodes.map((n, i) => [n.id, i]));
  const linkPairs = simLinks.map((l) => ({
    a: idxMap.get(l.source)!,
    b: idxMap.get(l.target)!,
  }));

  // Pre-settle: many iterations before rendering
  const preSettleTicks = 200;
  for (let t = 0; t < preSettleTicks; t++) {
    tickOnce(SIM.chargeBase * (1 + SIM.chargeSettleBonus * (1 - t / preSettleTicks)), 1.0);
  }

  const nCount = simNodes.length;

  function tickOnce(charge: number, dt: number) {
    const decay = 1 - SIM.velocityDecay * dt;

    // --- Repulsion (n-body) ---
    for (let i = 0; i < nCount; i++) {
      const a = simNodes[i];
      if (a.fixed) continue;
      let fx = 0, fy = 0, fz = 0;
      for (let j = 0; j < nCount; j++) {
        if (i === j) continue;
        const b = simNodes[j];
        const dx = a.pos.x - b.pos.x;
        const dy = a.pos.y - b.pos.y;
        const dz = a.pos.z - b.pos.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        // Soften at very short distances to avoid explosion
        const dist = Math.sqrt(distSq);
        const softened = dist < 0.5 ? 0.5 : dist;
        const force = charge / (softened * softened * softened);
        fx += dx / dist * force;
        fy += dy / dist * force;
        fz += dz / dist * force;
      }
      a.vx = (a.vx + fx) * decay;
      a.vy = (a.vy + fy) * decay;
      a.vz = (a.vz + fz) * decay;
    }

    // --- Spring attraction ---
    for (const { a: ai, b: bi } of linkPairs) {
      const a = simNodes[ai];
      const b = simNodes[bi];
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const dz = b.pos.z - a.pos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 0.01) continue;
      const displacement = (dist - SIM.linkDistance) / dist;
      const force = displacement * SIM.linkStrength;
      if (!a.fixed) { a.vx += dx * force; a.vy += dy * force; a.vz += dz * force; }
      if (!b.fixed) { b.vx -= dx * force; b.vy -= dy * force; b.vz -= dz * force; }
    }

    // --- Center gravity (non-linear: stronger at distance) ---
    for (let i = 0; i < nCount; i++) {
      const a = simNodes[i];
      if (a.fixed) continue;
      const d = Math.sqrt(a.pos.x * a.pos.x + a.pos.y * a.pos.y + a.pos.z * a.pos.z);
      if (d < 0.01) continue;
      // Gravity grows with distance^elasticPower — acts like a rubber band
      const pull = Math.min(Math.pow(d, SIM.elasticPower - 1) * SIM.centerStrength * 10, 8);
      a.vx -= a.pos.x * pull / d;
      a.vy -= a.pos.y * pull / d;
      a.vz -= a.pos.z * pull / d;
    }

    // --- Update positions ---
    for (let i = 0; i < nCount; i++) {
      const a = simNodes[i];
      if (a.fixed) continue;
      const speed = Math.sqrt(a.vx * a.vx + a.vy * a.vy + a.vz * a.vz);
      if (speed > SIM.maxVelocity) {
        const s = SIM.maxVelocity / speed;
        a.vx *= s; a.vy *= s; a.vz *= s;
      }
      a.pos.x += a.vx;
      a.pos.y += a.vy;
      a.pos.z += a.vz;

      // Hard clamp: if node exceeds maxRadius, pull it back proportionally
      const dist = Math.sqrt(a.pos.x * a.pos.x + a.pos.y * a.pos.y + a.pos.z * a.pos.z);
      if (dist > SIM.maxRadius) {
        const scale = SIM.maxRadius / dist;
        a.pos.x *= scale;
        a.pos.y *= scale;
        a.pos.z *= scale;
        // Dampen velocity outward to prevent re-escape
        const dot = (a.pos.x * a.vx + a.pos.y * a.vy + a.pos.z * a.vz) / dist;
        if (dot > 0) {
          a.vx -= (dot * a.pos.x / dist);
          a.vy -= (dot * a.pos.y / dist);
          a.vz -= (dot * a.pos.z / dist);
        }
      }
    }
  }

  let tickCount = 0;
  function tick() {
    tickCount++;
    // Gradually reduce charge over time to let the layout settle
    const settleFactor = Math.max(0.5, 1 - tickCount * 0.0005);
    tickOnce(SIM.chargeBase * settleFactor, 0.016);
  }

  return { simNodes, simLinks, tick };
}

// ══════════════════════════════════════════════════
// StarNode — Sphere + Glow Ring with animated position
// ══════════════════════════════════════════════════
function StarNode({
  node,
  hovered,
  selected,
  onHover,
  onClick,
}: {
  node: SimNode;
  hovered: boolean;
  selected: boolean;
  onHover: (v: boolean) => void;
  onClick: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const phase = useRef(Math.random() * Math.PI * 2);
  const isDir = node.type === "dir" || node.type === "root";
  const isRoot = node.type === "root";
  const color = isDir ? getDirColor(node.depth) : getFileColor(node.extension);
  const sphereSize = isRoot ? 1.2 : isDir ? 0.55 : 0.3;
  const emIntensity = isRoot ? 2.8 : isDir ? 1.5 : 1.2;

  // Sync position from mutable Vector3
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.position.copy(node.pos);

    phase.current += delta * 2.5;
    const pulse = 1 + Math.sin(phase.current) * (hovered || selected ? 0.25 : 0.06);
    const s = (hovered || selected) ? sphereSize * 1.6 : sphereSize * pulse;
    groupRef.current.scale.setScalar(s);

    const child = groupRef.current.children[0] as THREE.Mesh | undefined;
    if (child?.material) {
      (child.material as THREE.MeshStandardMaterial).emissiveIntensity =
        emIntensity * (hovered || selected ? 3.5 : pulse);
    }
  });

  return (
    <group
      ref={groupRef}
      position={[node.pos.x, node.pos.y, node.pos.z]}
      onPointerOver={(e) => { e.stopPropagation(); onHover(true); }}
      onPointerOut={() => onHover(false)}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* Core sphere */}
      <mesh>
        <sphereGeometry args={[1, isDir ? 20 : 10, isDir ? 20 : 10]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emIntensity}
          roughness={0.3}
          metalness={0.1}
          toneMapped={false}
        />
      </mesh>

      {/* Glow ring for dirs */}
      {(isDir || isRoot) && (
        <mesh>
          <ringGeometry args={[isRoot ? 2.2 : 1.8, isRoot ? 3.0 : 2.5, 64]} />
          <meshBasicMaterial
            color={color}
            side={THREE.DoubleSide}
            transparent
            opacity={selected ? 0.25 : 0.1}
          />
        </mesh>
      )}
    </group>
  );
}

// ══════════════════════════════════════════════════
// FlowParticles — flowing lights along edges
// ══════════════════════════════════════════════════
function FlowParticles({
  simLinks,
  simNodes,
}: {
  simLinks: SimLink[];
  simNodes: SimNode[];
}) {
  const pointsRef = useRef<THREE.Points>(null!);
  const offsetsRef = useRef<Float32Array>(new Float32Array(0));
  const speedsRef = useRef<Float32Array>(new Float32Array(0));
  const pairRef = useRef<[number, number][]>([]);
  const nodeIdxRef = useRef<Map<string, number>>(new Map());

  const { particleCount, positionsArr } = useMemo(() => {
    const total = Math.min(simLinks.length * 3, 4000);
    const pairCount = Math.min(simLinks.length, Math.floor(total / 3));
    const pc = pairCount * 3;
    const step = Math.max(1, Math.floor(simLinks.length / pairCount));

    const pos = new Float32Array(pc * 3);
    const offs = new Float32Array(pc);
    const spds = new Float32Array(pc);
    const pairs: [number, number][] = [];

    for (let i = 0; i < pc; i += 3) {
      const linkIdx = (i / 3) * step;
      if (linkIdx >= simLinks.length) continue;

      pairs.push([linkIdx, linkIdx]);

      for (let k = 0; k < 3; k++) {
        offs[i + k] = Math.random();
        spds[i + k] = 0.002 + Math.random() * 0.006;
      }
    }

    offsetsRef.current = offs;
    speedsRef.current = spds;
    pairRef.current = [];
    // Build node index map
    const idxMap = new Map<string, number>();
    simNodes.forEach((n, i) => idxMap.set(n.id, i));
    nodeIdxRef.current = idxMap;

    // Resolve link pairs to node indices
    for (const link of simLinks) {
      const si = idxMap.get(link.source);
      const ti = idxMap.get(link.target);
      if (si != null && ti != null) {
        pairRef.current.push([si, ti]);
      }
    }

    // Initialize positions
    const pairArr = pairRef.current;
    for (let i = 0; i < pc; i++) {
      const pi = Math.floor(i / 3) * step;
      const pairIdx = Math.min(pi, pairArr.length - 1);
      const [si, ti] = pairArr[pairIdx] ?? [0, 0];
      if (si >= simNodes.length || ti >= simNodes.length) continue;
      const s = simNodes[si].pos;
      const t = simNodes[ti].pos;
      const o = offs[i];
      pos[i * 3] = s.x + (t.x - s.x) * o;
      pos[i * 3 + 1] = s.y + (t.y - s.y) * o;
      pos[i * 3 + 2] = s.z + (t.z - s.z) * o;
    }

    return { particleCount: pc, positionsArr: pos };
  }, [simLinks, simNodes]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    const pos = positionsArr;
    const offs = offsetsRef.current;
    const spds = speedsRef.current;
    const pairs = pairRef.current;
    if (pairs.length === 0) return;

    for (let i = 0; i < particleCount; i++) {
      offs[i] = (offs[i] + spds[i] * delta * 60) % 1.0;
      const pi = Math.floor(i / 3);
      const linkIdx = Math.min(pi, pairs.length - 1);
      const [si, ti] = pairs[linkIdx];
      if (si >= simNodes.length || ti >= simNodes.length) continue;
      const s = simNodes[si].pos;
      const t = simNodes[ti].pos;
      const o = offs[i];
      pos[i * 3] = s.x + (t.x - s.x) * o;
      pos[i * 3 + 1] = s.y + (t.y - s.y) * o;
      pos[i * 3 + 2] = s.z + (t.z - s.z) * o;
    }
    (pointsRef.current.geometry as THREE.BufferGeometry).attributes.position.needsUpdate = true;
  });

  if (particleCount === 0) return null;

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positionsArr, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.12}
        color={COLORS.particleFlow}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        transparent
        opacity={0.7}
        toneMapped={false}
      />
    </points>
  );
}

// ══════════════════════════════════════════════════
// GalaxyEdges — Line-based with 3D depth via depthMap
// ══════════════════════════════════════════════════
function GalaxyEdges({
  simLinks,
  simNodes,
}: {
  simLinks: SimLink[];
  simNodes: SimNode[];
}) {
  const nodeIdx = useMemo(() => {
    const m = new Map<string, number>();
    simNodes.forEach((n, i) => m.set(n.id, i));
    return m;
  }, [simNodes]);

  const edgeLines = useMemo(() => {
    return simLinks.map((link, i) => {
      const si = nodeIdx.get(link.source);
      const ti = nodeIdx.get(link.target);
      if (si == null || ti == null) return null;

      const src = simNodes[si];
      const tgt = simNodes[ti];
      const isRootEdge = src.depth === 0;
      const isDirDir = tgt.type !== "file" && src.depth > 0;
      const color = isRootEdge ? COLORS.edgeRootDir
        : isDirDir ? COLORS.edgeDirDir
        : COLORS.edgeDirFile;
      const width = isRootEdge ? 0.55 : isDirDir ? 0.3 : 0.18;
      const opacity = isRootEdge ? 0.4 : isDirDir ? 0.2 : 0.12;

      // Return a component that reads positions from mutable Vec3 refs each frame
      return { key: i, si, ti, color, width, opacity };
    }).filter(Boolean) as { key: number; si: number; ti: number; color: string; width: number; opacity: number }[];
  }, [simLinks, simNodes, nodeIdx]);

  // We render edges as Lines inside a group, but note: Line from drei
  // needs static positions. For dynamic edges with force sim, we need
  // to update positions each frame. We use a custom component.
  return (
    <group>
      {edgeLines.map((el) => (
        <DynamicEdge
          key={el.key}
          nodes={simNodes}
          si={el.si}
          ti={el.ti}
          color={el.color}
          width={el.width}
          opacity={el.opacity}
        />
      ))}
    </group>
  );
}

// Dynamic edge that follows moving nodes via useFrame
function DynamicEdge({
  nodes, si, ti, color, width, opacity,
}: {
  nodes: SimNode[];
  si: number; ti: number;
  color: string; width: number; opacity: number;
}) {
  const lineRef = useRef<any>(null);
  const startRef = useRef(new THREE.Vector3());
  const endRef = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!lineRef.current) return;
    const s = nodes[si]?.pos;
    const t = nodes[ti]?.pos;
    if (!s || !t) return;
    startRef.current.copy(s);
    endRef.current.copy(t);
    // Line from drei uses BufferGeometry internally
    // We need to update its geometry
    const geo = lineRef.current.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position;
    pos.setXYZ(0, s.x, s.y, s.z);
    pos.setXYZ(1, t.x, t.y, t.z);
    pos.needsUpdate = true;
  });

  const s = nodes[si]?.pos ?? new THREE.Vector3();
  const t = nodes[ti]?.pos ?? new THREE.Vector3();

  return (
    <Line
      ref={lineRef}
      points={[[s.x, s.y, s.z], [t.x, t.y, t.z]]}
      color={color}
      lineWidth={width}
      transparent
      opacity={opacity}
      toneMapped={false}
    />
  );
}

// ══════════════════════════════════════════════════
// NebulaRing
// ══════════════════════════════════════════════════
function NebulaRing({ radius, color, opacity, speed, yOffset }: {
  radius: number; color: string; opacity: number; speed: number; yOffset: number;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((_, delta) => {
    ref.current.rotation.z += delta * speed;
    ref.current.rotation.x += delta * speed * 0.3;
  });
  return (
    <mesh ref={ref} position={[0, yOffset, 0]} rotation={[Math.PI / 2.5, 0, 0]}>
      <ringGeometry args={[radius - 0.5, radius + 0.5, 128]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ══════════════════════════════════════════════════
// DriftingStars
// ══════════════════════════════════════════════════
function DriftingStars() {
  const ref = useRef<THREE.Points>(null!);
  useFrame((_, delta) => {
    ref.current.rotation.y += delta * 0.015;
    ref.current.rotation.x += delta * 0.005;
  });
  return (
    <points ref={ref}>
      <Stars radius={200} depth={80} count={8000} factor={5} saturation={0.15} fade speed={0.4} />
    </points>
  );
}

// ══════════════════════════════════════════════════
// GalaxyScene — All 3D content
// ══════════════════════════════════════════════════
interface GalaxySceneProps {
  simNodes: SimNode[];
  simLinks: SimLink[];
  selectedId: string | null;
  onSelectNode: (id: string | null) => void;
  tick: () => void;
}

function GalaxyScene({ simNodes, simLinks, selectedId, onSelectNode, tick }: GalaxySceneProps) {
  const { camera } = useThree();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const fittedRef = useRef(false);
  const tickCountRef = useRef(0);

  // Continuous simulation tick + auto-fit after settle
  useFrame(() => {
    tick();
    tickCountRef.current++;

    // Auto-fit camera after 120 ticks (~2s) so all nodes are visible
    if (!fittedRef.current && tickCountRef.current > 120) {
      fittedRef.current = true;

      // Compute bounding sphere
      let cx = 0, cy = 0, cz = 0;
      for (const n of simNodes) { cx += n.pos.x; cy += n.pos.y; cz += n.pos.z; }
      cx /= simNodes.length; cy /= simNodes.length; cz /= simNodes.length;

      let maxR = 0;
      for (const n of simNodes) {
        const dx = n.pos.x - cx, dy = n.pos.y - cy, dz = n.pos.z - cz;
        maxR = Math.max(maxR, Math.sqrt(dx * dx + dy * dy + dz * dz));
      }

      // Position camera to see full bounding sphere (fov=55°)
      const fov = 55 * Math.PI / 180;
      const dist = (maxR / Math.sin(fov / 2)) * 1.15; // 15% margin
      const camDist = Math.max(dist, 20); // no upper limit — let camera see everything
      camera.position.set(cx, cy + camDist * 0.5, cz + camDist);
      camera.lookAt(cx, cy, cz);
    }
  });

  return (
    <>
      <DriftingStars />

      <NebulaRing radius={20} color="#4020a0" opacity={0.012} speed={0.1} yOffset={-1} />
      <NebulaRing radius={35} color="#2040a0" opacity={0.008} speed={0.06} yOffset={-2} />
      <NebulaRing radius={55} color="#102060" opacity={0.005} speed={0.04} yOffset={-3} />

      {/* Edges */}
      <GalaxyEdges simLinks={simLinks} simNodes={simNodes} />

      {/* Flowing particle lights */}
      <FlowParticles simLinks={simLinks} simNodes={simNodes} />

      {/* Nodes */}
      {simNodes.map((n) => (
        <StarNode
          key={n.id}
          node={n}
          hovered={n.id === hoveredId}
          selected={n.id === selectedId}
          onHover={(v) => setHoveredId(v ? n.id : null)}
          onClick={() => onSelectNode(selectedId === n.id ? null : n.id)}
        />
      ))}

      {/* Root glow aura */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[4, 64, 64]} />
        <meshBasicMaterial color="#6460ff" transparent opacity={0.03} />
      </mesh>

      {/* Bloom */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.05}
          intensity={2.5}
          radius={1.1}
          mipmapBlur
          luminanceSmoothing={0.8}
        />
      </EffectComposer>
    </>
  );
}

// ══════════════════════════════════════════════════
// NodeInfo Popup Overlay
// ══════════════════════════════════════════════════
function NodeInfo({ node, onClose }: { node: FileNode; onClose: () => void }) {
  const isDir = node.kind === "dir";
  return (
    <div className="absolute top-20 right-6 w-72 rounded-xl p-5 z-20"
      style={{
        background: "rgba(8,4,32,0.95)",
        border: "1px solid rgba(100,96,255,0.2)",
        backdropFilter: "blur(20px)",
      }}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          {isDir ? <FolderOpen size={18} color="#00e5ff" /> : <File size={18} color="#8880ff" />}
          <span className="text-sm font-semibold" style={{ color: "#e8e0f0" }}>{node.label}</span>
        </div>
        <button onClick={onClose}><X size={14} color="#8070a0" /></button>
      </div>
      <div className="space-y-1.5 text-xs" style={{ color: "#8070a0" }}>
        <p className="break-all">{node.path}</p>
        <div className="flex gap-4 mt-2">
          <span className="flex items-center gap-1"><Hash size={10} /> {isDir ? "Directory" : node.extension || "file"}</span>
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
// Main Component
// ══════════════════════════════════════════════════
interface CosmicProjectGalaxyProps {
  projectPath: string;
  fullscreen?: boolean;
}

export default function CosmicProjectGalaxy({ projectPath, fullscreen = false }: CosmicProjectGalaxyProps) {
  const { graph, loading, refresh } = useScanGraph(projectPath);
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [simData, setSimData] = useState<{
    simNodes: SimNode[]; simLinks: SimLink[]; tick: () => void;
  } | null>(null);

  // Build simulation when graph data arrives
  useEffect(() => {
    if (!graph || graph.nodes.length === 0) {
      setSimData(null);
      return;
    }
    const sim = buildForceSim(graph.nodes, graph.edges);
    setSimData(sim);
  }, [graph]);

  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (!id || !graph) { setSelectedNode(null); return; }
    setSelectedNode(graph.nodes.find((n) => n.id === id) ?? null);
  }, [graph]);

  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;
  const dirCount = graph?.nodes.filter((n) => n.kind === "dir").length ?? 0;
  const fileCount = nodeCount - dirCount;

  return (
    <div className="relative w-full h-full" style={{ background: COLORS.bg }}>
      {/* ── 3D Canvas ── */}
      {!loading && graph && graph.nodes.length > 0 && simData ? (
        <Canvas
          key={fullscreen ? "fs" : "normal"}
          gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping }}
          camera={{ position: [0, 20, 35], fov: 55, near: 0.1, far: 600 }}
          style={{ position: "absolute", inset: 0 }}
        >
          <GalaxyScene
            key={simData.simNodes.length}
            simNodes={simData.simNodes}
            simLinks={simData.simLinks}
            selectedId={selectedId}
            onSelectNode={handleSelect}
            tick={simData.tick}
          />
          <OrbitControls
            enableDamping dampingFactor={0.08}
            autoRotate autoRotateSpeed={0.35}
            minDistance={5} maxDistance={300}
            maxPolarAngle={Math.PI * 0.75}
          />
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
      <div className="absolute top-6 left-8 z-10 select-none pointer-events-none"
        style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <h1 className="text-2xl font-extrabold tracking-[0.15em]"
          style={{ color: "#e8e0f0", textShadow: "0 0 40px rgba(136,128,255,0.4)" }}>
          PROJECT GALAXY
        </h1>
        <p style={{ color: "#8070a0", fontSize: 12, marginTop: 2 }}>
          {nodeCount > 0 ? `${dirCount} planets · ${fileCount} stars · ${edgeCount} orbits` : "Awaiting project..."}
        </p>
      </div>

      {/* ── Node Info ── */}
      {selectedNode && <NodeInfo node={selectedNode} onClose={() => handleSelect(null)} />}

      {/* ── Bottom Bar ── */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10 pointer-events-none">
        <div className="flex items-center gap-6 px-5 py-2 rounded-full text-xs"
          style={{
            background: "rgba(8,4,32,0.7)", border: "1px solid rgba(100,96,255,0.15)",
            color: "#8070a0", backdropFilter: "blur(12px)",
          }}>
          <span>{nodeCount} nodes</span>
          <span style={{ color: "rgba(128,112,160,0.4)" }}>|</span>
          <span>{edgeCount} edges</span>
          <span style={{ color: "rgba(128,112,160,0.4)" }}>|</span>
          <span>Drag · Scroll · Click stars</span>
        </div>
      </div>

      {/* ── Refresh ── */}
      <button onClick={refresh}
        className="absolute top-6 right-6 z-10 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
        style={{ background: "rgba(8,4,32,0.6)", border: "1px solid rgba(100,96,255,0.15)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8070a0" strokeWidth="2">
          <path d="M1 4v6h6M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      </button>
    </div>
  );
}
