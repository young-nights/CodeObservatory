// CosmicProjectGalaxy — Ultimate 3D Galaxy Visualization
// InstancedMesh + LineSegments + Progressive Settle + Unified Animation Loop
// Draw Calls: 3 (nodes + edges + particles) instead of O(N)

import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { useScanGraph } from "@/hooks/useObservatory";
import type { FileNode, FileEdge } from "@/lib/types";
import { FolderOpen, File, Clock, Hash, X } from "lucide-react";

// ══════════════════════════════════════════════════
// Color Palette
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
// Simulation Types
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
// SIM Constants
// ══════════════════════════════════════════════════
const SIM = {
  chargeBase: -200,
  linkDistance: 6,
  linkStrength: 0.2,
  centerStrength: 0.08,
  velocityDecay: 0.35,
  maxVelocity: 6,
  maxRadius: 15,
  elasticPower: 2.0,
};

// ══════════════════════════════════════════════════
// Progressive Settle Config
// ══════════════════════════════════════════════════
const WARMUP = {
  frames: 600,
  chargeStart: 5,
  chargeEnd: 0.5,
  decayStart: 0.7,
  decayEnd: 0.35,
};

// ══════════════════════════════════════════════════
// buildForceSim — no pre-settle; tick() accepts params
// ══════════════════════════════════════════════════
function buildForceSim(
  nodes: FileNode[],
  edges: FileEdge[],
): {
  simNodes: SimNode[];
  simLinks: SimLink[];
  tick: (charge: number, velocityDecay: number, dt: number) => void;
  idxMap: Map<string, number>;
} {
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

  // Fibonacci sphere init
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

  // Index map (also for external use)
  const idxMap = new Map(simNodes.map((n, i) => [n.id, i]));

  // Pre-resolve link indices
  const linkPairs: { a: number; b: number }[] = [];
  for (const l of simLinks) {
    const a = idxMap.get(l.source);
    const b = idxMap.get(l.target);
    if (a != null && b != null) linkPairs.push({ a, b });
  }

  const nCount = simNodes.length;

  function tickOnce(charge: number, velocityDecay: number, dt: number) {
    const decay = 1 - velocityDecay * dt;

    // ── Repulsion (n-body) ──
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
        const dist = Math.sqrt(distSq);
        const softened = dist < 0.5 ? 0.5 : dist;
        const force = charge / (softened * softened * softened);
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
        fz += (dz / dist) * force;
      }
      a.vx = (a.vx + fx) * decay;
      a.vy = (a.vy + fy) * decay;
      a.vz = (a.vz + fz) * decay;
    }

    // ── Spring attraction ──
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

    // ── Center gravity ──
    for (let i = 0; i < nCount; i++) {
      const a = simNodes[i];
      if (a.fixed) continue;
      const d = Math.sqrt(a.pos.x * a.pos.x + a.pos.y * a.pos.y + a.pos.z * a.pos.z);
      if (d < 0.01) continue;
      const pull = Math.min(Math.pow(d, SIM.elasticPower - 1) * SIM.centerStrength * 10, 8);
      a.vx -= (a.pos.x * pull) / d;
      a.vy -= (a.pos.y * pull) / d;
      a.vz -= (a.pos.z * pull) / d;
    }

    // ── Update positions ──
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

      const dist = Math.sqrt(a.pos.x * a.pos.x + a.pos.y * a.pos.y + a.pos.z * a.pos.z);
      if (dist > SIM.maxRadius) {
        const scale = SIM.maxRadius / dist;
        a.pos.x *= scale;
        a.pos.y *= scale;
        a.pos.z *= scale;
        const dot = (a.pos.x * a.vx + a.pos.y * a.vy + a.pos.z * a.vz) / dist;
        if (dot > 0) {
          a.vx -= (dot * a.pos.x) / dist;
          a.vy -= (dot * a.pos.y) / dist;
          a.vz -= (dot * a.pos.z) / dist;
        }
      }
    }
  }

  return {
    simNodes,
    simLinks,
    tick(charge: number, velocityDecay: number, dt: number) {
      tickOnce(charge, velocityDecay, Math.min(dt, 0.05));
    },
    idxMap,
  };
}

// ══════════════════════════════════════════════════
// GalaxyScene — Unified scene: InstancedMesh + LineSegments + Particles
// ══════════════════════════════════════════════════
interface GalaxySceneProps {
  simNodes: SimNode[];
  simLinks: SimLink[];
  selectedId: string | null;
  onSelectNode: (id: string | null) => void;
  tick: (charge: number, velocityDecay: number, dt: number) => void;
  idxMap: Map<string, number>;
}

function GalaxyScene({
  simNodes,
  simLinks,
  selectedId,
  onSelectNode,
  tick,
  idxMap,
}: GalaxySceneProps) {
  const { camera } = useThree();
  const pointer = useThree((s) => s.pointer);

  // ── Refs ────────────────────────────────
  const nodeMeshRef = useRef<THREE.InstancedMesh>(null!);
  const edgeLineRef = useRef<THREE.LineSegments>(null!);
  const particlePointsRef = useRef<THREE.Points>(null!);
  const starsRef = useRef<THREE.Points>(null!);
  const ring1Ref = useRef<THREE.Mesh>(null!);
  const ring2Ref = useRef<THREE.Mesh>(null!);
  const ring3Ref = useRef<THREE.Mesh>(null!);

  const frameCountRef = useRef(0);
  const fittedRef = useRef(false);
  const prevHoveredRef = useRef<number | null>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  raycaster.params.Points.threshold = 0.5;
  raycaster.params.Line = { threshold: 0.3 } as any;

  // ── Per-instance colors ─────────────────
  const metadataMap = useMemo(() => {
    const map = new Map<number, {
      id: string; label: string; type: SimNode["type"]; depth: number;
      extension?: string; path: string; sizeBytes?: number;
      originalColor: THREE.Color; baseScale: number;
    }>();
    simNodes.forEach((n, i) => {
      const hex = n.type === "dir" || n.type === "root"
        ? getDirColor(n.depth) : getFileColor(n.extension);
      const baseScale = n.type === "root" ? 1.2 : n.type === "dir" ? 0.55 : 0.3;
      map.set(i, {
        id: n.id, label: n.label, type: n.type, depth: n.depth,
        extension: n.extension, path: n.path, sizeBytes: n.sizeBytes,
        originalColor: new THREE.Color(hex), baseScale,
      });
    });
    return map;
  }, [simNodes]);

  // ── Node geometry & material ────────────
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 16, 16), []);
  const nodeMat = useMemo(() => new THREE.MeshStandardMaterial({
    roughness: 0.3,
    metalness: 0.1,
    toneMapped: false,
    emissive: new THREE.Color("#ffffff"),
    emissiveIntensity: 0.8,
  }), []);

  // ── Edge colors (pre-computed) ──────────
  const edgeColorData = useMemo(() => {
    const colors = new Float32Array(simLinks.length * 6); // 2 verts × 3
    for (let i = 0; i < simLinks.length; i++) {
      const link = simLinks[i];
      const si = idxMap.get(link.source);
      const ti = idxMap.get(link.target);
      if (si == null || ti == null) continue;
      const src = simNodes[si];
      const tgt = simNodes[ti];
      const isRootEdge = src.depth === 0;
      const isDirDir = tgt.type !== "file" && src.depth > 0;
      const c = new THREE.Color(
        isRootEdge ? COLORS.edgeRootDir
          : isDirDir ? COLORS.edgeDirDir
          : COLORS.edgeDirFile,
      );
      colors[i * 6] = c.r; colors[i * 6 + 1] = c.g; colors[i * 6 + 2] = c.b;
      colors[i * 6 + 3] = c.r; colors[i * 6 + 4] = c.g; colors[i * 6 + 5] = c.b;
    }
    return colors;
  }, [simLinks, simNodes, idxMap]);

  // ── Flow particle pre-init ──────────────
  const particleCount = Math.min(simLinks.length * 2, 3000);
  const particlePairsRef = useRef<[number, number][]>([]);
  const particleOffsetsRef = useRef(new Float32Array(particleCount));
  const particleSpeedsRef = useRef(new Float32Array(particleCount));

  // Initialize particle data once per mount
  useEffect(() => {
    const offsets = new Float32Array(particleCount);
    const speeds = new Float32Array(particleCount);
    const pairs: [number, number][] = [];
    const step = Math.max(1, Math.floor(simLinks.length / Math.max(particleCount, 1)));

    for (let i = 0; i < particleCount; i++) {
      offsets[i] = Math.random();
      speeds[i] = 0.002 + Math.random() * 0.006;
      const linkIdx = Math.min(Math.floor(i * step), simLinks.length - 1);
      const link = simLinks[linkIdx];
      if (link) {
        const si = idxMap.get(link.source);
        const ti = idxMap.get(link.target);
        if (si != null && ti != null) pairs.push([si, ti]);
      }
    }
    particleOffsetsRef.current = offsets;
    particleSpeedsRef.current = speeds;
    particlePairsRef.current = pairs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Set initial instance colors ─────────
  useEffect(() => {
    const mesh = nodeMeshRef.current;
    if (!mesh) return;
    for (let i = 0; i < simNodes.length; i++) {
      const meta = metadataMap.get(i);
      if (meta) mesh.setColorAt(i, meta.originalColor);
    }
    mesh.instanceColor!.needsUpdate = true;
  }, [simNodes.length, metadataMap]);

  // ── Set initial edge colors & positions ──
  useEffect(() => {
    const lines = edgeLineRef.current;
    if (!lines || simLinks.length === 0) return;
    const geo = lines.geometry;
    geo.setAttribute("color", new THREE.BufferAttribute(edgeColorData, 3));
    // Initialize positions
    const posArr = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < simLinks.length; i++) {
      const link = simLinks[i];
      const si = idxMap.get(link.source);
      const ti = idxMap.get(link.target);
      if (si == null || ti == null) continue;
      const s = simNodes[si].pos;
      const t = simNodes[ti].pos;
      posArr[i * 6] = s.x;     posArr[i * 6 + 1] = s.y;     posArr[i * 6 + 2] = s.z;
      posArr[i * 6 + 3] = t.x; posArr[i * 6 + 4] = t.y; posArr[i * 6 + 5] = t.z;
    }
    geo.attributes.position.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ═══════════════════════════════════════
  // UNIFIED ANIMATION LOOP
  // ═══════════════════════════════════════
  useFrame((_, delta) => {
    const fc = frameCountRef.current;
    const dt = Math.min(delta, 0.05);

    // ── Progressive settle params ───────
    const warmupF = WARMUP.frames;
    const warmupT = Math.min(fc / warmupF, 1);
    const charge = fc < warmupF
      ? SIM.chargeBase * (WARMUP.chargeStart + (WARMUP.chargeEnd - WARMUP.chargeStart) * warmupT)
      : SIM.chargeBase;
    const vDecay = fc < warmupF
      ? WARMUP.decayStart + (WARMUP.decayEnd - WARMUP.decayStart) * warmupT
      : SIM.velocityDecay;

    // a. Force simulation
    tick(charge, vDecay, dt);

    // b. Update InstancedMesh matrices
    const mesh = nodeMeshRef.current;
    if (mesh) {
      for (let i = 0; i < simNodes.length; i++) {
        const n = simNodes[i];
        const meta = metadataMap.get(i);
        const baseS = meta?.baseScale ?? 0.3;
        const hovered = prevHoveredRef.current === i;
        const s = hovered ? baseS * 1.5 : baseS;
        dummy.position.copy(n.pos);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    // c. Update edge LineSegments
    const lines = edgeLineRef.current;
    if (lines && simLinks.length > 0) {
      const posArr = lines.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < simLinks.length; i++) {
        const link = simLinks[i];
        const si = idxMap.get(link.source);
        const ti = idxMap.get(link.target);
        if (si == null || ti == null) continue;
        const s = simNodes[si].pos;
        const t = simNodes[ti].pos;
        posArr[i * 6] = s.x;     posArr[i * 6 + 1] = s.y;     posArr[i * 6 + 2] = s.z;
        posArr[i * 6 + 3] = t.x; posArr[i * 6 + 4] = t.y; posArr[i * 6 + 5] = t.z;
      }
      lines.geometry.attributes.position.needsUpdate = true;
    }

    // d. Update flow particles
    const pts = particlePointsRef.current;
    if (pts && particleCount > 0) {
      const posArr = pts.geometry.attributes.position.array as Float32Array;
      const offsets = particleOffsetsRef.current;
      const speeds = particleSpeedsRef.current;
      const pairs = particlePairsRef.current;
      for (let i = 0; i < particleCount; i++) {
        offsets[i] = (offsets[i] + speeds[i] * dt * 60) % 1;
        const pair = pairs[Math.min(i, pairs.length - 1)];
        if (!pair) continue;
        const [si, ti] = pair;
        if (si >= simNodes.length || ti >= simNodes.length) continue;
        const s = simNodes[si].pos;
        const t = simNodes[ti].pos;
        const o = offsets[i];
        posArr[i * 3] = s.x + (t.x - s.x) * o;
        posArr[i * 3 + 1] = s.y + (t.y - s.y) * o;
        posArr[i * 3 + 2] = s.z + (t.z - s.z) * o;
      }
      pts.geometry.attributes.position.needsUpdate = true;
    }

    // e. NebulaRing rotation
    const dtRing = delta;
    if (ring1Ref.current) { ring1Ref.current.rotation.z += dtRing * 0.1; ring1Ref.current.rotation.x += dtRing * 0.03; }
    if (ring2Ref.current) { ring2Ref.current.rotation.z += dtRing * 0.06; ring2Ref.current.rotation.x += dtRing * 0.018; }
    if (ring3Ref.current) { ring3Ref.current.rotation.z += dtRing * 0.04; ring3Ref.current.rotation.x += dtRing * 0.012; }

    // f. DriftingStars rotation
    if (starsRef.current) {
      starsRef.current.rotation.y += dtRing * 0.015;
      starsRef.current.rotation.x += dtRing * 0.005;
    }

    // g. Raycaster hit-test for hover
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(mesh);
    const newHovered = intersects.length > 0 ? intersects[0].instanceId ?? null : null;

    if (newHovered !== prevHoveredRef.current) {
      // Restore previous hovered
      if (prevHoveredRef.current != null && mesh) {
        const prevMeta = metadataMap.get(prevHoveredRef.current);
        if (prevMeta) {
          mesh.setColorAt(prevHoveredRef.current, prevMeta.originalColor);
        }
      }
      // Highlight new hovered
      if (newHovered != null && mesh) {
        const newMeta = metadataMap.get(newHovered);
        if (newMeta) {
          const bright = newMeta.originalColor.clone().multiplyScalar(1.8);
          mesh.setColorAt(newHovered, bright);
        }
      }
      if (mesh) mesh.instanceColor!.needsUpdate = true;
      prevHoveredRef.current = newHovered;
    }

    // ── Auto-fit camera after warmup settle ──
    if (!fittedRef.current && fc > 180) {
      fittedRef.current = true;
      let cx = 0, cy = 0, cz = 0;
      for (const n of simNodes) { cx += n.pos.x; cy += n.pos.y; cz += n.pos.z; }
      cx /= simNodes.length; cy /= simNodes.length; cz /= simNodes.length;
      let maxR = 0;
      for (const n of simNodes) {
        const dx = n.pos.x - cx, dy = n.pos.y - cy, dz = n.pos.z - cz;
        maxR = Math.max(maxR, Math.sqrt(dx * dx + dy * dy + dz * dz));
      }
      const fov = (55 * Math.PI) / 180;
      const dist = (maxR / Math.sin(fov / 2)) * 1.15;
      const camDist = Math.max(dist, 20);
      camera.position.set(cx, cy + camDist * 0.5, cz + camDist);
      camera.lookAt(cx, cy, cz);
    }

    frameCountRef.current++;
  });

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════
  return (
    <>
      {/* Background stars */}
      <points ref={starsRef}>
        <Stars radius={200} depth={80} count={8000} factor={5} saturation={0.15} fade speed={0.4} />
      </points>

      {/* Nebula rings */}
      <mesh ref={ring1Ref} position={[0, -1, 0]} rotation={[Math.PI / 2.5, 0, 0]}>
        <ringGeometry args={[19.5, 20.5, 128]} />
        <meshBasicMaterial color="#4020a0" transparent opacity={0.012} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ring2Ref} position={[0, -2, 0]} rotation={[Math.PI / 2.5, 0, 0]}>
        <ringGeometry args={[34.5, 35.5, 128]} />
        <meshBasicMaterial color="#2040a0" transparent opacity={0.008} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ring3Ref} position={[0, -3, 0]} rotation={[Math.PI / 2.5, 0, 0]}>
        <ringGeometry args={[54.5, 55.5, 128]} />
        <meshBasicMaterial color="#102060" transparent opacity={0.005} side={THREE.DoubleSide} />
      </mesh>

      {/* ── Edges: single LineSegments ── */}
      {simLinks.length > 0 && (
        <lineSegments ref={edgeLineRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(simLinks.length * 6), 3]}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[edgeColorData, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={0.22}
            toneMapped={false}
            depthWrite
          />
        </lineSegments>
      )}

      {/* ── Flow particles: single Points ── */}
      {particleCount > 0 && (
        <points ref={particlePointsRef} key={particleCount}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(particleCount * 3), 3]}
            />
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
      )}

      {/* ── Nodes: single InstancedMesh ── */}
      <instancedMesh
        ref={nodeMeshRef}
        args={[undefined, undefined, simNodes.length]}
        geometry={sphereGeo}
        material={nodeMat}
        onClick={(e) => {
          e.stopPropagation();
          if (prevHoveredRef.current != null) {
            const meta = metadataMap.get(prevHoveredRef.current);
            if (meta) onSelectNode(selectedId === meta.id ? null : meta.id);
          }
        }}
      />

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
    <div
      className="absolute top-20 right-6 w-72 rounded-xl p-5 z-20"
      style={{
        background: "rgba(8,4,32,0.95)",
        border: "1px solid rgba(100,96,255,0.2)",
        backdropFilter: "blur(20px)",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          {isDir ? <FolderOpen size={18} color="#00e5ff" /> : <File size={18} color="#8880ff" />}
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
              <Clock size={10} />{" "}
              {node.size < 1024 ? `${node.size}B` : `${(node.size / 1024).toFixed(1)}KB`}
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

export default function CosmicProjectGalaxy({
  projectPath,
  fullscreen: _fullscreen = false,
}: CosmicProjectGalaxyProps) {
  const { graph, loading, refresh } = useScanGraph(projectPath);
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [simData, setSimData] = useState<{
    simNodes: SimNode[];
    simLinks: SimLink[];
    tick: (charge: number, velocityDecay: number, dt: number) => void;
    idxMap: Map<string, number>;
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

  const handleSelect = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (!id || !graph) {
        setSelectedNode(null);
        return;
      }
      setSelectedNode(graph.nodes.find((n) => n.id === id) ?? null);
    },
    [graph],
  );

  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;
  const dirCount = graph?.nodes.filter((n) => n.kind === "dir").length ?? 0;
  const fileCount = nodeCount - dirCount;

  return (
    <div className="relative w-full h-full" style={{ background: COLORS.bg }}>
      {/* ── 3D Canvas ── */}
      {!loading && graph && graph.nodes.length > 0 && simData ? (
        <Canvas
          gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping }}
          camera={{ position: [0, 20, 35], fov: 55, near: 0.1, far: 600 }}
          style={{ position: "absolute", inset: 0, transition: "inset 300ms ease" }}
        >
          <GalaxyScene
            key={simData.simNodes.length}
            simNodes={simData.simNodes}
            simLinks={simData.simLinks}
            selectedId={selectedId}
            onSelectNode={handleSelect}
            tick={simData.tick}
            idxMap={simData.idxMap}
          />
          <OrbitControls
            enableDamping
            dampingFactor={0.08}
            autoRotate
            autoRotateSpeed={0.35}
            minDistance={5}
            maxDistance={300}
            maxPolarAngle={Math.PI * 0.75}
          />
        </Canvas>
      ) : (
        <div className="flex flex-col items-center justify-center h-full">
          {loading ? (
            <>
              <div
                className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mb-4"
                style={{ borderColor: "rgba(100,96,255,0.2)", borderTopColor: "#8880ff" }}
              />
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
          style={{ color: "#e8e0f0", textShadow: "0 0 40px rgba(136,128,255,0.4)" }}
        >
          PROJECT GALAXY
        </h1>
        <p style={{ color: "#8070a0", fontSize: 12, marginTop: 2 }}>
          {nodeCount > 0
            ? `${dirCount} planets · ${fileCount} stars · ${edgeCount} orbits`
            : "Awaiting project..."}
        </p>
      </div>

      {/* ── Node Info ── */}
      {selectedNode && (
        <NodeInfo node={selectedNode} onClose={() => handleSelect(null)} />
      )}

      {/* ── Bottom Bar ── */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10 pointer-events-none">
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

      {/* ── Refresh ── */}
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
