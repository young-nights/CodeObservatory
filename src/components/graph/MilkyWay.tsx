// MilkyWay — Native Three.js 3D galaxy visualization
// Visual reference: https://meet-blog.buyixiao.xyz/
// No R3F, no react-force-graph-3d — pure THREE.js

import { useRef, useEffect, useState, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from "d3-force-3d";
import * as api from "@/lib/api";
import type { GraphData, FileNode, FileEdge } from "@/lib/types";
import { useTheme } from "@/hooks/useTheme";
import { X } from "lucide-react";

// ══════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════
interface SphericalNode extends FileNode {
  x: number;
  y: number;
  z: number;
  inDegree: number;
  outDegree: number;
  totalDegree: number;
  normDegree: number; // normalized [0,1]
  colorHex: number;
  scaledSize: number;
  projectPath: string;
  projectName: string;
}

interface SphericalEdge {
  source: string;
  target: string;
}

interface MilkyWayProps {
  projectPaths: string[];
  fullscreen?: boolean;
}

// ══════════════════════════════════════════════════
// Color System — 6-band gradient
// ══════════════════════════════════════════════════
const COLOR_BANDS = [
  { t: 0,    r: 0x1a, g: 0x10, b: 0x2e },  // deep purple
  { t: 0.18, r: 0x25, g: 0x63, b: 0xab },  // blue
  { t: 0.38, r: 0x43, g: 0x1c, b: 0x04 },  // deep orange
  { t: 0.6,  r: 0x10, g: 0xb5, b: 0x41 },  // green
  { t: 0.78, r: 0xf5, g: 0xa6, b: 0x23 },  // gold
  { t: 1,    r: 0xff, g: 0xff, b: 0xff },  // white
];

function bandColor(normDegree: number): number {
  const t = Math.max(0, Math.min(1, normDegree));
  let i = 0;
  for (let k = 0; k < COLOR_BANDS.length - 1; k++) {
    if (t >= COLOR_BANDS[k].t && t <= COLOR_BANDS[k + 1].t) { i = k; break; }
    if (k === COLOR_BANDS.length - 2) i = k;
  }
  const a = COLOR_BANDS[i], b = COLOR_BANDS[i + 1];
  const f = (t - a.t) / (b.t - a.t || 1);
  const r = Math.round(a.r + (b.r - a.r) * f);
  const g = Math.round(a.g + (b.g - a.g) * f);
  const bl = Math.round(a.b + (b.b - a.b) * f);
  return (r << 16) | (g << 8) | bl;
}

// ══════════════════════════════════════════════════
// Layout computation (d3-force-3d)
// ══════════════════════════════════════════════════
function computeLayout(
  allNodes: FileNode[],
  allEdges: FileEdge[],
  projectPaths: string[],
): { nodes: SphericalNode[]; edges: SphericalEdge[] } {
  // Build id lookup
  const nodeMap = new Map<string, FileNode>();
  for (const n of allNodes) nodeMap.set(n.id, n);

  // Compute degrees
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const e of allEdges) {
    outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }

  // Build spherical nodes
  const sphericalNodes: SphericalNode[] = allNodes.map((n) => {
    const inD = inDeg.get(n.id) ?? 0;
    const outD = outDeg.get(n.id) ?? 0;
    const total = inD + outD;
    const pp = projectPaths.find(p => n.path.startsWith(p)) ?? projectPaths[0];
    return {
      ...n,
      x: (Math.random() - 0.5) * 200,
      y: (Math.random() - 0.5) * 200,
      z: (Math.random() - 0.5) * 200,
      inDegree: inD,
      outDegree: outD,
      totalDegree: total,
      normDegree: 0,
      colorHex: 0xffffff,
      scaledSize: 1,
      projectPath: pp,
      projectName: pp.split(/[\\/]/).pop() ?? pp,
    };
  });

  // Normalize degree
  const maxDeg = Math.max(1, ...sphericalNodes.map(n => n.totalDegree));
  for (const n of sphericalNodes) {
    n.normDegree = n.totalDegree / maxDeg;
    n.colorHex = bandColor(n.normDegree);
    n.scaledSize = 1.5 + n.normDegree * 3.5;
  }

  // Build valid edges (both endpoints must exist)
  const validEdges: SphericalEdge[] = allEdges
    .filter(e => nodeMap.has(e.source) && nodeMap.has(e.target))
    .map(e => ({ source: e.source, target: e.target }));

  // d3-force-3d layout
  const simNodes = sphericalNodes as any[];
  const simLinks = validEdges.map(e => ({
    source: e.source,
    target: e.target,
  }));

  const simulation = forceSimulation(simNodes, 3)
    .force("charge", forceManyBody().strength(-120).distanceMax(400))
    .force("link", forceLink(simLinks).id((d: any) => d.id).distance(60).strength(0.3))
    .force("center", forceCenter(0, 0, 0))
    .force("collide", forceCollide<SphericalNode>((d: any) => d.scaledSize * 2))
    .stop();

  // Run simulation synchronously
  for (let i = 0; i < 300; i++) simulation.tick();

  return { nodes: sphericalNodes, edges: validEdges };
}

// ══════════════════════════════════════════════════
// Glow texture (Canvas 128×128 radial gradient)
// ══════════════════════════════════════════════════
function createGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1.0)");
  gradient.addColorStop(0.12, "rgba(255,255,255,0.85)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.35)");
  gradient.addColorStop(0.65, "rgba(255,255,255,0.08)");
  gradient.addColorStop(1, "rgba(255,255,255,0.0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// ══════════════════════════════════════════════════
// Shader sources
// ══════════════════════════════════════════════════
const STAR_VERT = /* glsl */ `
  attribute float size;
  attribute vec3 aCol;
  varying vec3 vCol;
  void main() {
    vCol = aCol;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const STAR_FRAG = /* glsl */ `
  varying vec3 vCol;
  void main() {
    float d = distance(gl_PointCoord, vec2(0.5));
    if (d > 0.5) discard;
    gl_FragColor = vec4(vCol * 1.4, (1.0 - smoothstep(0.2, 0.5, d)) * 0.9);
  }
`;

const NEBULA_VERT = /* glsl */ `
  void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 160.0 * (300.0 / -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const NEBULA_FRAG = /* glsl */ `
  uniform vec3 uColor;
  void main() {
    float d = distance(gl_PointCoord, vec2(0.5));
    float a = (1.0 - smoothstep(0.0, 0.5, d)) * 0.07;
    gl_FragColor = vec4(uColor, a);
  }
`;

const NODE_VERT = /* glsl */ `
  attribute vec3 instanceColor;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vColor = instanceColor;
    vec4 worldPos = instanceMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(instanceMatrix) * normal);
    vec4 mvPos = modelViewMatrix * worldPos;
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const NODE_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vViewDir);
    float rim = 1.0 - max(0.0, dot(n, v));
    rim = pow(rim, 1.6);
    vec3 col = vColor * mix(0.45, 1.8, rim);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const GLOW_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * (320.0 / -mvPos.z), 1.5, 48.0);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const GLOW_FRAG = /* glsl */ `
  uniform sampler2D uGlowTex;
  varying vec3 vColor;
  void main() {
    float r = texture2D(uGlowTex, gl_PointCoord).r;
    gl_FragColor = vec4(vColor, r * 0.75);
  }
`;

// ══════════════════════════════════════════════════
// Build starfield (8000 points)
// ══════════════════════════════════════════════════
function buildStarfield(): THREE.Points {
  const COUNT = 8000;
  const positions = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const colors = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 500 + Math.random() * 2500;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    sizes[i] = 0.5 + Math.random() * 2.5;
    // Slight color variation
    const warmth = Math.random();
    colors[i * 3] = 0.8 + warmth * 0.2;
    colors[i * 3 + 1] = 0.85 + (1 - warmth) * 0.15;
    colors[i * 3 + 2] = 0.9 + Math.random() * 0.1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aCol", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geo, mat);
}

// ══════════════════════════════════════════════════
// Build nebula (300 large soft points)
// ══════════════════════════════════════════════════
function buildNebula(): THREE.Points[] {
  const nebulae: THREE.Points[] = [];
  const nebulaColors = [
    new THREE.Color(0x2a1050),
    new THREE.Color(0x1a3060),
    new THREE.Color(0x402010),
    new THREE.Color(0x103020),
  ];

  for (let k = 0; k < 4; k++) {
    const COUNT = 75;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 300 + Math.random() * 1200;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.ShaderMaterial({
      vertexShader: NEBULA_VERT,
      fragmentShader: NEBULA_FRAG,
      uniforms: { uColor: { value: nebulaColors[k] } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    nebulae.push(new THREE.Points(geo, mat));
  }
  return nebulae;
}

// ══════════════════════════════════════════════════
// Build node spheres (InstancedMesh + Fresnel)
// ══════════════════════════════════════════════════
function buildNodeSpheres(nodes: SphericalNode[]): THREE.InstancedMesh {
  const baseGeo = new THREE.SphereGeometry(1, 20, 20);
  const mat = new THREE.ShaderMaterial({
    vertexShader: NODE_VERT,
    fragmentShader: NODE_FRAG,
  });

  const mesh = new THREE.InstancedMesh(baseGeo, mat, nodes.length);
  const dummy = new THREE.Object3D();
  const colorArr = new Float32Array(nodes.length * 3);

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    dummy.position.set(n.x ?? 0, n.y ?? 0, n.z ?? 0);
    dummy.scale.setScalar(n.scaledSize);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    const c = new THREE.Color(n.colorHex);
    colorArr[i * 3] = c.r;
    colorArr[i * 3 + 1] = c.g;
    colorArr[i * 3 + 2] = c.b;
  }

  mesh.instanceMatrix.needsUpdate = true;
  baseGeo.setAttribute("instanceColor", new THREE.InstancedBufferAttribute(colorArr, 3));
  return mesh;
}

// ══════════════════════════════════════════════════
// Build node glow (Points + Canvas texture)
// ══════════════════════════════════════════════════
function buildNodeGlow(
  nodes: SphericalNode[],
  glowTex: THREE.CanvasTexture,
): THREE.Points {
  const positions = new Float32Array(nodes.length * 3);
  const sizes = new Float32Array(nodes.length);
  const colors = new Float32Array(nodes.length * 3);

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    positions[i * 3] = n.x ?? 0;
    positions[i * 3 + 1] = n.y ?? 0;
    positions[i * 3 + 2] = n.z ?? 0;
    sizes[i] = n.scaledSize * 6;
    const c = new THREE.Color(n.colorHex);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: { uGlowTex: { value: glowTex } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geo, mat);
}

// ══════════════════════════════════════════════════
// Build edges (bezier curves + gradient color)
// ══════════════════════════════════════════════════
function buildEdges(
  edges: SphericalEdge[],
  nodeMap: Map<string, SphericalNode>,
): THREE.LineSegments | null {
  if (edges.length === 0) return null;

  const SEGMENTS = 6;
  const positions = new Float32Array(edges.length * SEGMENTS * 6);
  const colors = new Float32Array(edges.length * SEGMENTS * 6);

  let vi = 0, ci = 0;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (!src || !tgt) continue;

    const sx = src.x ?? 0, sy = src.y ?? 0, sz = src.z ?? 0;
    const tx = tgt.x ?? 0, ty = tgt.y ?? 0, tz = tgt.z ?? 0;

    // Bezier midpoint with slight curvature
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2 + sz * 0.04;
    const mz = (sz + tz) / 2;

    const cSrc = new THREE.Color(src.colorHex);
    const cTgt = new THREE.Color(tgt.colorHex);

    for (let s = 0; s < SEGMENTS; s++) {
      const t0 = s / SEGMENTS;
      const t1 = (s + 1) / SEGMENTS;

      // Quadratic bezier
      const px0 = (1 - t0) * (1 - t0) * sx + 2 * (1 - t0) * t0 * mx + t0 * t0 * tx;
      const py0 = (1 - t0) * (1 - t0) * sy + 2 * (1 - t0) * t0 * my + t0 * t0 * ty;
      const pz0 = (1 - t0) * (1 - t0) * sz + 2 * (1 - t0) * t0 * mz + t0 * t0 * tz;

      const px1 = (1 - t1) * (1 - t1) * sx + 2 * (1 - t1) * t1 * mx + t1 * t1 * tx;
      const py1 = (1 - t1) * (1 - t1) * sy + 2 * (1 - t1) * t1 * my + t1 * t1 * ty;
      const pz1 = (1 - t1) * (1 - t1) * sz + 2 * (1 - t1) * t1 * mz + t1 * t1 * tz;

      positions[vi++] = px0; positions[vi++] = py0; positions[vi++] = pz0;
      positions[vi++] = px1; positions[vi++] = py1; positions[vi++] = pz1;

      // Interpolated color
      const f0 = t0, f1 = t1;
      colors[ci++] = cSrc.r * (1 - f0) + cTgt.r * f0;
      colors[ci++] = cSrc.g * (1 - f0) + cTgt.g * f0;
      colors[ci++] = cSrc.b * (1 - f0) + cTgt.b * f0;
      colors[ci++] = cSrc.r * (1 - f1) + cTgt.r * f1;
      colors[ci++] = cSrc.g * (1 - f1) + cTgt.g * f1;
      colors[ci++] = cSrc.b * (1 - f1) + cTgt.b * f1;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  return new THREE.LineSegments(geo, mat);
}

// ══════════════════════════════════════════════════
// Particle system (flowing along edges)
// ══════════════════════════════════════════════════
class ParticleSystem {
  count: number;
  edgeIndices: Int32Array;
  t: Float32Array;
  speeds: Float32Array;
  points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private edges: SphericalEdge[];
  private nodeMap: Map<string, SphericalNode>;

  constructor(
    edges: SphericalEdge[],
    nodeMap: Map<string, SphericalNode>,
    count: number,
  ) {
    this.edges = edges;
    this.nodeMap = nodeMap;
    this.count = count;
    this.edgeIndices = new Int32Array(count);
    this.t = new Float32Array(count);
    this.speeds = new Float32Array(count);
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);

    if (edges.length === 0) {
      // No edges — create empty geometry
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
      const mat = new THREE.PointsMaterial({
        size: 1.2,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });
      this.points = new THREE.Points(geo, mat);
      return;
    }

    for (let i = 0; i < count; i++) {
      this.edgeIndices[i] = Math.floor(Math.random() * edges.length);
      this.t[i] = Math.random();
      this.speeds[i] = 0.002 + Math.random() * 0.006;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
  }

  update() {
    for (let i = 0; i < this.count; i++) {
      this.t[i] += this.speeds[i];
      if (this.t[i] > 1) this.t[i] -= 1;

      const ei = this.edgeIndices[i] % this.edges.length;
      const e = this.edges[ei];
      const src = this.nodeMap.get(e.source);
      const tgt = this.nodeMap.get(e.target);
      if (!src || !tgt) continue;

      const t = this.t[i];
      const sx = src.x ?? 0, sy = src.y ?? 0, sz = src.z ?? 0;
      const tx = tgt.x ?? 0, ty = tgt.y ?? 0, tz = tgt.z ?? 0;

      // Lerp
      this.positions[i * 3] = sx + (tx - sx) * t;
      this.positions[i * 3 + 1] = sy + (ty - sy) * t;
      this.positions[i * 3 + 2] = sz + (tz - sz) * t;

      // Color: blend source → target
      const cSrc = new THREE.Color(src.colorHex);
      const cTgt = new THREE.Color(tgt.colorHex);
      this.colors[i * 3] = cSrc.r + (cTgt.r - cSrc.r) * t;
      this.colors[i * 3 + 1] = cSrc.g + (cTgt.g - cSrc.g) * t;
      this.colors[i * 3 + 2] = cSrc.b + (cTgt.b - cSrc.b) * t;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

// ══════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════
export default function MilkyWay({ projectPaths, fullscreen: _fullscreen }: MilkyWayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<SphericalNode | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Stable refs for Three.js objects that persist across renders
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    composer: EffectComposer;
    particleSystem: ParticleSystem | null;
    nodeMap: Map<string, SphericalNode>;
    nodes: SphericalNode[];
    edges: SphericalEdge[];
    nodeMesh: THREE.InstancedMesh | null;
    glowPoints: THREE.Points | null;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    frameId: number | null;
    animating: boolean;
    disposed: boolean;
  } | null>(null);

  // Store hovered/selected in ref for animation loop access
  const hoveredIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => { hoveredIdRef.current = hoveredId; }, [hoveredId]);
  useEffect(() => { selectedIdRef.current = selectedNode?.id ?? null; }, [selectedNode]);

  // ── Initialize Three.js scene ──
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Create canvas
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000008);
    scene.fog = new THREE.FogExp2(0x000010, 3.5e-5);

    // Camera
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.5, 8000);
    camera.position.set(0, 0, 400);

    // Controls
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;
    controls.minDistance = 50;
    controls.maxDistance = 2000;

    // Post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(w, h),
      1.0,   // intensity
      0.5,   // radius
      0.28,  // threshold
    ));
    composer.addPass(new OutputPass());

    // Add starfield + nebula immediately (static background)
    scene.add(buildStarfield());
    for (const n of buildNebula()) scene.add(n);

    // Raycaster
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 5 };
    const mouse = new THREE.Vector2(-9999, -9999);

    sceneRef.current = {
      renderer, scene, camera, controls, composer,
      particleSystem: null,
      nodeMap: new Map(),
      nodes: [],
      edges: [],
      nodeMesh: null,
      glowPoints: null,
      raycaster, mouse,
      frameId: null,
      animating: true,
      disposed: false,
    };

    // ── Animation loop ──
    const animate = () => {
      if (!sceneRef.current || sceneRef.current.disposed) return;
      sceneRef.current.frameId = requestAnimationFrame(animate);
      sceneRef.current.controls.update();

      // Particle flow
      if (sceneRef.current.particleSystem) {
        sceneRef.current.particleSystem.update();
      }

      // Hover highlight via raycaster
      const r = sceneRef.current;
      r.raycaster.setFromCamera(r.mouse, r.camera);
      if (r.nodeMesh) {
        const intersects = r.raycaster.intersectObject(r.nodeMesh);
        const hitId = intersects.length > 0
          ? r.nodes[intersects[0].instanceId ?? -1]?.id ?? null
          : null;
        if (hitId !== hoveredIdRef.current) {
          setHoveredId(hitId);
        }
      }

      r.composer.render();
    };
    animate();

    // ── Resize handler ──
    const onResize = () => {
      if (!sceneRef.current || sceneRef.current.disposed) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      sceneRef.current.camera.aspect = w / h;
      sceneRef.current.camera.updateProjectionMatrix();
      sceneRef.current.renderer.setSize(w, h);
      sceneRef.current.composer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // ── Mouse move for hover ──
    const onMouseMove = (e: MouseEvent) => {
      if (!sceneRef.current || sceneRef.current.disposed) return;
      const rect = container.getBoundingClientRect();
      sceneRef.current.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      sceneRef.current.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    container.addEventListener("mousemove", onMouseMove);

    // ── Click for selection ──
    const onClick = (e: MouseEvent) => {
      if (!sceneRef.current || sceneRef.current.disposed) return;
      const r = sceneRef.current;
      const rect = container.getBoundingClientRect();
      r.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      r.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      r.raycaster.setFromCamera(r.mouse, r.camera);
      if (r.nodeMesh) {
        const intersects = r.raycaster.intersectObject(r.nodeMesh);
        if (intersects.length > 0) {
          const node = r.nodes[intersects[0].instanceId ?? -1];
          if (node) setSelectedNode(node);
        } else {
          setSelectedNode(null);
        }
      }
    };
    container.addEventListener("click", onClick);

    // ── Double click: fly to node ──
    const onDblClick = (e: MouseEvent) => {
      if (!sceneRef.current || sceneRef.current.disposed) return;
      const r = sceneRef.current;
      const rect = container.getBoundingClientRect();
      r.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      r.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      r.raycaster.setFromCamera(r.mouse, r.camera);
      if (r.nodeMesh) {
        const intersects = r.raycaster.intersectObject(r.nodeMesh);
        if (intersects.length > 0) {
          const node = r.nodes[intersects[0].instanceId ?? -1];
          if (node) {
            const targetPos = new THREE.Vector3(node.x ?? 0, node.y ?? 0, node.z ?? 0);
            const offset = targetPos.clone().add(new THREE.Vector3(0, 10, 30));
            const startPos = r.camera.position.clone();
            const startTime = performance.now();
            const duration = 1500;
            const flyAnim = () => {
              const elapsed = performance.now() - startTime;
              const t = Math.min(1, elapsed / duration);
              const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
              r.camera.position.lerpVectors(startPos, offset, ease);
              r.controls.target.lerp(targetPos, ease * 0.3);
              if (t < 1) requestAnimationFrame(flyAnim);
            };
            flyAnim();
          }
        }
      }
    };
    container.addEventListener("dblclick", onDblClick);

    // ── Cleanup ──
    return () => {
      if (sceneRef.current) {
        sceneRef.current.disposed = true;
        if (sceneRef.current.frameId !== null) {
          cancelAnimationFrame(sceneRef.current.frameId);
        }
        sceneRef.current.controls.dispose();
        sceneRef.current.composer.dispose();
        sceneRef.current.renderer.dispose();
        // Dispose geometries and materials
        sceneRef.current.scene.traverse((obj) => {
          if (obj instanceof THREE.Points || obj instanceof THREE.InstancedMesh) {
            obj.geometry?.dispose();
            if (obj.material instanceof THREE.Material) {
              obj.material.dispose();
            } else if (Array.isArray(obj.material)) {
              obj.material.forEach(m => m.dispose());
            }
          }
          if (obj instanceof THREE.LineSegments) {
            obj.geometry?.dispose();
            if (obj.material instanceof THREE.Material) obj.material.dispose();
          }
        });
        sceneRef.current = null;
      }
      window.removeEventListener("resize", onResize);
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("click", onClick);
      container.removeEventListener("dblclick", onDblClick);
      if (container.contains(canvas)) container.removeChild(canvas);
    };
  }, []); // Mount once

  // ── Load data & build graph objects ──
  useEffect(() => {
    if (!projectPaths?.length || !sceneRef.current) {
      return;
    }

    let dead = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const allNodes: FileNode[] = [];
        const allEdges: FileEdge[] = [];
        const seen = new Set<string>();

        for (const pp of projectPaths) {
          const d: GraphData = await api.scanDirectory(pp);
          for (const n of d.nodes) {
            if (seen.has(n.id)) continue;
            seen.add(n.id);
            allNodes.push(n);
          }
          for (const e of d.edges) {
            allEdges.push(e);
          }
        }

        if (dead) return;

        const { nodes, edges } = computeLayout(allNodes, allEdges, projectPaths);
        if (dead) return;

        const r = sceneRef.current;
        if (!r || r.disposed) return;

        // Clear previous graph objects (keep background stars/nebula)
        const toRemove: THREE.Object3D[] = [];
        r.scene.traverse((obj) => {
          if (obj instanceof THREE.InstancedMesh || obj instanceof THREE.LineSegments) {
            toRemove.push(obj);
          }
          if (obj instanceof THREE.Points && !obj.userData.isNebula) {
            toRemove.push(obj);
          }
        });
        for (const obj of toRemove) {
          r.scene.remove(obj);
          if (obj instanceof THREE.Points || obj instanceof THREE.InstancedMesh || obj instanceof THREE.LineSegments) {
            obj.geometry?.dispose();
            const mat = obj.material;
            if (mat instanceof THREE.Material) mat.dispose();
            else if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          }
        }

        // Rebuild background
        const stars = buildStarfield();
        r.scene.add(stars);
        for (const n of buildNebula()) {
          n.userData.isNebula = true;
          r.scene.add(n);
        }

        // Build graph objects
        const nodeMap = new Map<string, SphericalNode>();
        for (const n of nodes) nodeMap.set(n.id, n);

        const nodeMesh = buildNodeSpheres(nodes);
        r.scene.add(nodeMesh);

        const glowTex = createGlowTexture();
        const glowPoints = buildNodeGlow(nodes, glowTex);
        r.scene.add(glowPoints);

        const edgeLines = buildEdges(edges, nodeMap);
        if (edgeLines) r.scene.add(edgeLines);

        const particleCount = Math.min(edges.length * 3, 500);
        const ps = new ParticleSystem(edges, nodeMap, particleCount);
        r.scene.add(ps.points);

        r.nodeMap = nodeMap;
        r.nodes = nodes;
        r.edges = edges;
        r.nodeMesh = nodeMesh;
        r.glowPoints = glowPoints;
        r.particleSystem = ps;

        setLoading(false);
      } catch (err) {
        if (!dead) {
          setError(err instanceof Error ? err.message : "Failed to load graph data");
          setLoading(false);
        }
      }
    })();

    return () => { dead = true; };
  }, [projectPaths]);

  // ── Highlight dimmed nodes on hover ──
  useEffect(() => {
    const r = sceneRef.current;
    if (!r || !r.nodeMesh) return;

    const dummy = new THREE.Object3D();
    const hovId = hoveredIdRef.current;

    for (let i = 0; i < r.nodes.length; i++) {
      const n = r.nodes[i];
      dummy.position.set(n.x ?? 0, n.y ?? 0, n.z ?? 0);

      const isHov = hovId === n.id;
      const isConnected = hovId ? r.nodeMap.get(hovId)?.id === n.id : false;
      const dimmed = hovId && !isHov && !isConnected;

      const scale = dimmed ? n.scaledSize * 0.6 : n.scaledSize * (isHov ? 1.4 : 1);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      r.nodeMesh.setMatrixAt(i, dummy.matrix);
    }
    r.nodeMesh.instanceMatrix.needsUpdate = true;
  }, [hoveredId]);

  // ── Adjacency for detail card ──
  const adj = useMemo(() => {
    const a = new Map<string, Set<string>>();
    if (!sceneRef.current) return a;
    for (const e of sceneRef.current.edges) {
      if (!a.has(e.source)) a.set(e.source, new Set());
      a.get(e.source)!.add(e.target);
      if (!a.has(e.target)) a.set(e.target, new Set());
      a.get(e.target)!.add(e.source);
    }
    return a;
  }, [sceneRef.current?.edges.length]);

  const nc = sceneRef.current?.nodes.length ?? 0;
  const ec = sceneRef.current?.edges.length ?? 0;
  const dc = sceneRef.current?.nodes.filter(n => n.kind === "dir").length ?? 0;

  const bgColor = theme === "light" ? "#f0f0f8" : "#000011";

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      style={{ background: bgColor, position: "absolute", inset: 0 }}
    >
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none">
          <div
            className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mb-4"
            style={{ borderColor: "rgba(100,96,255,0.2)", borderTopColor: "#8880ff" }}
          />
          <p style={{ color: "#8070a0", fontSize: 13 }}>Scanning galaxy...</p>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none">
          <p style={{ color: "#ff6b6b", fontSize: 14, fontWeight: 600 }}>Graph Error</p>
          <p style={{ color: "#8070a0", fontSize: 12, marginTop: 6 }}>{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && nc === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none">
          <p style={{ color: "#8070a0", fontSize: 13 }}>No data available</p>
        </div>
      )}

      {/* Title */}
      {nc > 0 && (
        <div className="absolute top-6 left-8 z-10 select-none pointer-events-none" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
          <h1
            className="text-2xl font-extrabold tracking-[0.15em]"
            style={{ color: theme === "light" ? "#1a102e" : "#e8e0f0", textShadow: theme === "light" ? "none" : "0 0 30px rgba(150,150,255,0.2)" }}
          >
            {projectPaths.length > 1 ? "GALAXY CLUSTER" : "MILKY WAY"}
          </h1>
          <p style={{ color: theme === "light" ? "#6050a0" : "#8070a0", fontSize: 12, marginTop: 2 }}>
            {dc} planets · {nc - dc} stars · {ec} orbits
          </p>
        </div>
      )}

      {/* Info Card */}
      {selectedNode && (
        <div
          className="absolute top-20 right-6 w-80 rounded-xl p-5 z-20"
          style={{
            background: theme === "light" ? "rgba(255,255,255,0.95)" : "rgba(8,4,32,0.95)",
            border: `1px solid ${theme === "light" ? "rgba(100,96,255,0.15)" : "rgba(100,96,255,0.25)"}`,
            backdropFilter: "blur(12px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className="text-base font-bold truncate"
              style={{ color: theme === "light" ? "#1a102e" : "#f0e8ff" }}
            >
              {selectedNode.label}
            </span>
            <button
              onClick={() => setSelectedNode(null)}
              className="p-1 rounded hover:bg-white/10 ml-2 flex-shrink-0"
            >
              <X size={14} color="#8070a0" />
            </button>
          </div>
          <p className="break-all text-xs mb-3" style={{ color: "#8070a0" }}>
            {selectedNode.path}
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium"
              style={{
                background: `#${selectedNode.colorHex.toString(16).padStart(6, "0")}30`,
                color: `#${selectedNode.colorHex.toString(16).padStart(6, "0")}`,
              }}
            >
              {selectedNode.kind === "dir" ? "📁 Directory" : `📄 .${selectedNode.extension || "file"}`}
            </span>
            {selectedNode.size != null && selectedNode.size > 0 && (
              <span
                className="px-2 py-0.5 rounded-full text-xs"
                style={{ background: "rgba(100,96,255,0.1)", color: "#8070a0" }}
              >
                {selectedNode.size < 1024 ? `${selectedNode.size}B` : `${(selectedNode.size / 1024).toFixed(1)}KB`}
              </span>
            )}
          </div>
          <div className="flex gap-4 text-xs" style={{ color: "#6050a0" }}>
            <span>🔗 {adj.get(selectedNode.id)?.size || 0} connections</span>
            <span>⬆ {selectedNode.inDegree} in</span>
            <span>⬇ {selectedNode.outDegree} out</span>
          </div>
        </div>
      )}

      {/* Bottom Bar */}
      {nc > 0 && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <div
            className="flex items-center gap-6 px-5 py-2 rounded-full text-xs"
            style={{
              background: theme === "light" ? "rgba(255,255,255,0.7)" : "rgba(8,4,32,0.7)",
              border: `1px solid ${theme === "light" ? "rgba(100,96,255,0.1)" : "rgba(100,96,255,0.15)"}`,
              color: theme === "light" ? "#6050a0" : "#8070a0",
              backdropFilter: "blur(12px)",
            }}
          >
            <span>{nc} nodes</span>
            <span style={{ color: "rgba(128,112,160,0.4)" }}>|</span>
            <span>{ec} edges</span>
            <span style={{ color: "rgba(128,112,160,0.4)" }}>|</span>
            <span>Drag · Scroll · Click stars</span>
          </div>
        </div>
      )}
    </div>
  );
}
