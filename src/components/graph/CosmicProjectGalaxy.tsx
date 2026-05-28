// CosmicProjectGalaxy — ForceGraph3D + PostProcessing Bloom + Scene Starfield
// Core: react-force-graph-3d | Bloom: UnrealBloomPass | Stars: Points in Scene

import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import * as api from "@/lib/api";
import type { GraphData } from "@/lib/types";
import { X } from "lucide-react";

// ══════════════════════════════════════════════════
// Color Palette
// ══════════════════════════════════════════════════
const COLORS = {
  bg: "#000011",
  dirGlow: "#80c0ff",
  dirPurple: "#a0b0ff",
  fileColors: {
    ts: "#6090d0", tsx: "#70a0e0", js: "#50b090", jsx: "#60c0a0",
    rs: "#d08060", md: "#b090e0", json: "#c0a050", toml: "#c0a050",
    yaml: "#c0a050", yml: "#c0a050", css: "#60b080", scss: "#70c090",
    html: "#d09060", py: "#50b0c0", c: "#90a0b0", h: "#90a0b0",
    cpp: "#90a0b0", hpp: "#90a0b0", go: "#50a0c0", java: "#b08020",
    vue: "#40b080", svelte: "#e06040", kt: "#8060e0", swift: "#e07040",
    default: "#8090b0",
  } as Record<string, string>,
  edgeBase: "#405080",
  starfield: "#c0d8ff",
};

function getFileColor(ext?: string): string {
  if (!ext) return COLORS.fileColors.default;
  return COLORS.fileColors[ext.toLowerCase()] ?? COLORS.fileColors.default;
}

// ══════════════════════════════════════════════════
// Create starfield particles
// ══════════════════════════════════════════════════
function createStarfield(count = 8000, radius = 200): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = radius * (0.5 + Math.random() * 0.5);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.5,
    color: COLORS.starfield,
    transparent: true,
    opacity: 0.5,
    sizeAttenuation: true,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

// ══════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════
interface CosmicProjectGalaxyProps {
  projectPaths: string[];
  fullscreen?: boolean;
}

export default function CosmicProjectGalaxy({
  projectPaths,
}: CosmicProjectGalaxyProps) {
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const fgRef = useRef<any>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const starfieldAdded = useRef(false);

  // ── Scan projects and merge ──
  useEffect(() => {
    if (!projectPaths || projectPaths.length === 0) {
      setGraphData(null);
      return;
    }
    let cancelled = false;

    async function loadGraphs() {
      setLoading(true);
      const allNodes: any[] = [];
      const allLinks: any[] = [];
      const nodeIdSet = new Set<string>();

      for (let pi = 0; pi < projectPaths.length; pi++) {
        const projectPath = projectPaths[pi];
        try {
          const data: GraphData = await api.scanDirectory(projectPath);
          const projectName = projectPath.split(/[\\/]/).pop() || `project_${pi}`;
          const angle = (2 * Math.PI * pi) / projectPaths.length;
          const clusterRadius = 15 * Math.sqrt(projectPaths.length);
          const cx = clusterRadius * Math.cos(angle);
          const cz = clusterRadius * Math.sin(angle);

          for (const n of data.nodes) {
            const nodeId = `${projectPath}::${n.id}`;
            if (nodeIdSet.has(nodeId)) continue;
            nodeIdSet.add(nodeId);
            const depth = n.path.split(/[\\/]/).length - projectPath.split(/[\\/]/).length;
            allNodes.push({
              id: nodeId, label: n.label, path: n.path, kind: n.kind,
              extension: n.extension, size: n.size, projectName, projectPath, depth,
              x: cx + (Math.random() - 0.5) * 10,
              y: (Math.random() - 0.5) * 10,
              z: cz + (Math.random() - 0.5) * 10,
            });
          }

          for (const e of data.edges) {
            const srcId = `${projectPath}::${e.source}`;
            const tgtId = `${projectPath}::${e.target}`;
            if (nodeIdSet.has(srcId) && nodeIdSet.has(tgtId)) {
              allLinks.push({ source: srcId, target: tgtId });
            }
          }
        } catch (err) {
          console.error(`Failed to scan ${projectPath}:`, err);
        }
      }
      if (!cancelled) {
        setGraphData({ nodes: allNodes, links: allLinks });
        setLoading(false);
      }
    }
    loadGraphs();
    return () => { cancelled = true; };
  }, [projectPaths]);

  // ── Degree map for node sizing ──
  const degreeMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!graphData) return map;
    for (const l of graphData.links) {
      const src = typeof l.source === "object" ? l.source.id : l.source;
      const tgt = typeof l.target === "object" ? l.target.id : l.target;
      map.set(src, (map.get(src) || 0) + 1);
      map.set(tgt, (map.get(tgt) || 0) + 1);
    }
    return map;
  }, [graphData]);

  // ── Setup bloom + starfield after mount ──
  useEffect(() => {
    if (!fgRef.current) return;
    const fg = fgRef.current;

    // Add starfield to scene
    if (!starfieldAdded.current) {
      const scene = fg.scene();
      if (scene) {
        scene.add(createStarfield(8000, 200));
        starfieldAdded.current = true;
      }
    }

    // Add bloom post-processing
    if (!composerRef.current) {
      const renderer = fg.renderer?.();
      const scene = fg.scene?.();
      const camera = fg.camera?.();
      if (renderer && scene && camera) {
        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        composer.addPass(new UnrealBloomPass(
          new THREE.Vector2(window.innerWidth, window.innerHeight),
          1.5, 0.6, 0.12
        ));
        composerRef.current = composer;

        // Override render loop to use composer
        const origRender = fg.renderer().render;
        if (origRender) {
          // ForceGraph3D uses its own render loop, we hook into postProcessingComposer
        }
      }
    }

    // Position camera
    fg.cameraPosition({ x: 0, y: 60, z: 120 });
  }, [graphData]);

  // ── Node click: fly to node ──
  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node);
    if (fgRef.current) {
      fgRef.current.cameraPosition(
        { x: node.x * 2, y: node.y * 2, z: node.z * 2 },
        { x: node.x, y: node.y, z: node.z },
        1000
      );
    }
  }, []);

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="relative w-full h-full" style={{ background: COLORS.bg }}>
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
      </div>
    );
  }

  const nodeCount = graphData.nodes.length;
  const edgeCount = graphData.links.length;
  const dirCount = graphData.nodes.filter((n) => n.kind === "dir").length;
  const fileCount = nodeCount - dirCount;

  return (
    <div className="relative w-full h-full" style={{ background: COLORS.bg }}>
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        backgroundColor={COLORS.bg}
        width={typeof window !== "undefined" ? window.innerWidth : 1200}
        height={typeof window !== "undefined" ? window.innerHeight : 800}
        showNavInfo={false}
        // ── Node styling ──
        nodeVal={(node: any) => {
          const deg = degreeMap.get(node.id) || 0;
          const base = node.kind === "dir" ? 4 : 2;
          return base + deg * 0.4;
        }}
        nodeColor={(node: any) => {
          if (node.kind === "dir") return COLORS.dirGlow;
          return getFileColor(node.extension);
        }}
        nodeOpacity={0.95}
        nodeResolution={20}
        nodeThreeObject={(node: any) => {
          const deg = degreeMap.get(node.id) || 0;
          const isDir = node.kind === "dir";
          const isRoot = node.depth === 0;
          const baseSize = isRoot ? 3 : isDir ? 1.8 : 1;
          const size = baseSize + deg * 0.2;
          const color = isDir ? COLORS.dirGlow : getFileColor(node.extension);

          const group = new THREE.Group();

          // Core sphere
          const geo = new THREE.SphereGeometry(size, 20, 20);
          const mat = new THREE.MeshStandardMaterial({
            color,
            emissive: new THREE.Color(color),
            emissiveIntensity: isRoot ? 3 : isDir ? 2 : 1.2,
            roughness: 0.15,
            metalness: 0.1,
            transparent: true,
            opacity: 0.95,
            toneMapped: false,
          });
          group.add(new THREE.Mesh(geo, mat));

          // Glow sphere
          const glowGeo = new THREE.SphereGeometry(size * 3, 16, 16);
          const glowMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: isRoot ? 0.2 : isDir ? 0.1 : 0.05,
            side: THREE.BackSide,
            toneMapped: false,
          });
          group.add(new THREE.Mesh(glowGeo, glowMat));

          return group;
        }}
        nodeThreeObjectExtend={false}
        // ── Link styling ──
        linkColor={() => COLORS.edgeBase}
        linkOpacity={0.3}
        linkWidth={0.4}
        linkCurvature={0.05}
        linkResolution={4}
        linkDirectionalParticles={0}
        // ── Force engine ──
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        warmupTicks={100}
        cooldownTicks={200}
        cooldownTime={5000}
        // ── Interaction ──
        onNodeClick={handleNodeClick}
      />

      {/* ── Title Overlay ── */}
      <div
        className="absolute top-6 left-8 z-10 select-none pointer-events-none"
        style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}
      >
        <h1
          className="text-2xl font-extrabold tracking-[0.15em]"
          style={{ color: "#e8e0f0", textShadow: "0 0 40px rgba(100,150,255,0.3)" }}
        >
          {new Set(graphData.nodes.map((n: any) => n.projectPath)).size > 1
            ? "GALAXY CLUSTER"
            : "PROJECT GALAXY"}
        </h1>
        <p style={{ color: "#8070a0", fontSize: 12, marginTop: 2 }}>
          {nodeCount > 0
            ? `${dirCount} planets · ${fileCount} stars · ${edgeCount} orbits`
            : "Awaiting project..."}
        </p>
      </div>

      {/* ── Node Info Popup ── */}
      {selectedNode && (
        <div
          className="absolute top-20 right-6 w-72 rounded-xl p-5 z-20"
          style={{
            background: "rgba(8,4,32,0.95)",
            border: "1px solid rgba(100,96,255,0.2)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold" style={{ color: "#e0d8f0" }}>
              {selectedNode.label}
            </span>
            <button
              onClick={() => setSelectedNode(null)}
              className="p-1 rounded hover:bg-white/10"
            >
              <X size={14} color="#8070a0" />
            </button>
          </div>
          <p className="break-all text-xs" style={{ color: "#8070a0" }}>
            {selectedNode.path}
          </p>
          <div className="flex gap-4 mt-2">
            <span className="text-xs" style={{ color: "#8070a0" }}>
              {selectedNode.kind === "dir" ? "Directory" : selectedNode.extension || "file"}
            </span>
            {selectedNode.size != null && selectedNode.size > 0 && (
              <span className="text-xs" style={{ color: "#8070a0" }}>
                {selectedNode.size < 1024
                  ? `${selectedNode.size}B`
                  : `${(selectedNode.size / 1024).toFixed(1)}KB`}
              </span>
            )}
          </div>
        </div>
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
    </div>
  );
}
