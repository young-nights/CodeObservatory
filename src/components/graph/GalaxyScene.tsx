// GalaxyScene.tsx — R3F scene for the galaxy visualization
// Renders nodes (InstancedMesh, Points), edges (GalaxyEdges), effects (Bloom)

import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import type { GalaxyLayout } from "@/lib/galaxyLayout";
import type { ColorScheme } from "@/lib/galaxyColors";
import type { GalaxySettings } from "./SettingsPanel";
import { GalaxyEdges } from "./GalaxyEdges";

interface GalaxySceneProps {
  layout: GalaxyLayout;
  settings: GalaxySettings;
  clr: ColorScheme;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function GalaxyScene({ layout, settings, clr, selectedId, onSelect }: GalaxySceneProps) {
  const planetRef = useRef<THREE.InstancedMesh>(null);
  const dustRef = useRef<THREE.Points>(null);
  const [hovered, setHovered] = useState<{ id: string; position: [number, number, number] } | null>(null);

  // ── Filter nodes by type ──
  const planets = useMemo(() => layout.nodes.filter((n) => n.type === "planet"), [layout.nodes]);
  const stars = useMemo(() => layout.nodes.filter((n) => n.type === "star"), [layout.nodes]);
  const dusts = useMemo(() => layout.nodes.filter((n) => n.type === "dust"), [layout.nodes]);
  const rootNode = useMemo(() => layout.nodes.find((n) => n.type === "root"), [layout.nodes]);

  // ── StarPoints data ──
  const starPositions = useMemo(
    () => new Float32Array(stars.flatMap((s) => [s.x, s.y, s.z])),
    [stars],
  );
  const starColors = useMemo(
    () => new Float32Array(stars.flatMap((s) => {
      const c = new THREE.Color(s.color);
      return [c.r, c.g, c.b];
    })),
    [stars],
  );

  // ── DustPoints data ──
  const dustPositions = useMemo(
    () => new Float32Array(dusts.flatMap((d) => [d.x, d.y, d.z])),
    [dusts],
  );
  const dustColors = useMemo(() => {
    const c = new THREE.Color(clr.dust);
    return new Float32Array(dusts.flatMap(() => [c.r, c.g, c.b]));
  }, [dusts, clr.dust]);

  // ── Planet instance transforms (degree-based sizing) ──
  useEffect(() => {
    const mesh = planetRef.current;
    if (!mesh || planets.length === 0) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      if (!p) continue;
      dummy.position.set(p.x, p.y, p.z);
      const degreeScale = 0.4 + Math.min((p.degree ?? 0) / 20, 0.8);
      const baseScale = degreeScale * settings.nodeSize;
      const scale = (selectedId === p.id || hovered?.id === p.id) ? baseScale * 1.6 : baseScale;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const c = new THREE.Color(p.color);
      if (hovered?.id === p.id) c.multiplyScalar(1.5);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [planets, selectedId, hovered, settings.nodeSize]);

  // ── Event handlers ──
  const clearHover = useCallback(() => setHovered(null), []);

  const handlePlanetClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined && e.instanceId < planets.length) {
        const planet = planets[e.instanceId];
        if (planet) onSelect(planet.id);
      }
    },
    [planets, onSelect],
  );

  const handlePlanetOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined && e.instanceId < planets.length) {
        const p = planets[e.instanceId];
        if (p) setHovered({ id: p.id, position: [p.x, p.y, p.z] });
      }
    },
    [planets],
  );

  const handleStarClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.index !== undefined && e.index < stars.length) {
        const star = stars[e.index];
        if (star) onSelect(star.id);
      }
    },
    [stars, onSelect],
  );

  const handleStarOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (e.index !== undefined && e.index < stars.length) {
        const s = stars[e.index];
        if (s) setHovered({ id: s.id, position: [s.x, s.y, s.z] });
      }
    },
    [stars],
  );

  const handleRootClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (rootNode) onSelect(rootNode.id);
    },
    [rootNode, onSelect],
  );

  const handleRootOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (rootNode) setHovered({ id: rootNode.id, position: [0, 0, 0] });
    },
    [rootNode],
  );

  // ── Dust slow orbit ──
  useFrame((_, delta) => {
    if (dustRef.current) dustRef.current.rotation.y += delta * 0.02;
  });

  return (
    <group>
      {/* OrbitControls */}
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        autoRotate
        autoRotateSpeed={0.15}
        minDistance={30}
        maxDistance={600}
        maxPolarAngle={Math.PI * 0.85}
      />

      {/* Background stars */}
      <Stars radius={400} depth={150} count={8000} factor={6} saturation={0.2} fade speed={0.3} />

      {/* Edges: mixed curved/straight */}
      <GalaxyEdges edges={layout.edges} edgeOpacity={settings.edgeOpacity} />

      {/* DustPoints */}
      {dustPositions.length > 0 && (
        <points ref={dustRef}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[dustPositions, 3]} />
            <bufferAttribute attach="attributes-color" args={[dustColors, 3]} />
          </bufferGeometry>
          <pointsMaterial
            size={0.3 * settings.nodeSize}
            vertexColors
            sizeAttenuation
            transparent
            opacity={0.45}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      )}

      {/* StarPoints */}
      {starPositions.length > 0 && (
        <points
          onClick={handleStarClick}
          onPointerOver={handleStarOver}
          onPointerOut={clearHover}
        >
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[starPositions, 3]} />
            <bufferAttribute attach="attributes-color" args={[starColors, 3]} />
          </bufferGeometry>
          <pointsMaterial
            size={0.6 * settings.nodeSize}
            vertexColors
            sizeAttenuation
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            opacity={0.9}
            transparent
          />
        </points>
      )}

      {/* Planets: InstancedMesh */}
      {planets.length > 0 && (
        <instancedMesh
          ref={planetRef}
          args={[undefined, undefined, planets.length]}
          onClick={handlePlanetClick}
          onPointerOver={handlePlanetOver}
          onPointerOut={clearHover}
        >
          <sphereGeometry args={[1.0 * settings.nodeSize, 24, 24]} />
          <meshStandardMaterial
            roughness={0.2}
            metalness={0.05}
            toneMapped={false}
            emissive={new THREE.Color("#80b0ff")}
            emissiveIntensity={2}
            transparent
            opacity={0.9}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </instancedMesh>
      )}

      {/* Hover highlight */}
      {hovered && (
        <mesh position={hovered.position}>
          <sphereGeometry args={[1.5 * settings.nodeSize, 16, 16]} />
          <meshBasicMaterial color="white" transparent opacity={0.25} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}

      {/* Root core + halos */}
      {rootNode && (
        <group>
          <mesh onClick={handleRootClick} onPointerOver={handleRootOver} onPointerOut={clearHover}>
            <sphereGeometry args={[2.5 * settings.nodeSize, 48, 48]} />
            <meshStandardMaterial
              color={clr.root}
              emissive={clr.root}
              emissiveIntensity={clr.rootEmissive}
              roughness={0.05}
              metalness={0.02}
              toneMapped={false}
              transparent
              opacity={0.95}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[3.5 * settings.nodeSize, 32, 32]} />
            <meshBasicMaterial color={clr.rootHalo[0]} transparent opacity={0.12} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh>
            <sphereGeometry args={[5.0 * settings.nodeSize, 32, 32]} />
            <meshBasicMaterial color={clr.rootHalo[1]} transparent opacity={0.06} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh>
            <sphereGeometry args={[7.0 * settings.nodeSize, 32, 32]} />
            <meshBasicMaterial color={clr.rootHalo[2]} transparent opacity={0.03} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        </group>
      )}

      {/* Bloom */}
      <EffectComposer>
        <Bloom luminanceThreshold={0.08} intensity={settings.bloomStrength} radius={1.0} mipmapBlur />
      </EffectComposer>
    </group>
  );
}
