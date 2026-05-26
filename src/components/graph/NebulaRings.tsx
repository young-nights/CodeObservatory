// NebulaRings — 3 transparent rotating rings in the cosmic background
// Creates depth and movement sensation in the galaxy scene

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface RingConfig {
  innerRadius: number;
  outerRadius: number;
  color: string;
  opacity: number;
  rotationSpeed: [number, number, number];
  segments: number;
}

const RING_CONFIGS: RingConfig[] = [
  {
    innerRadius: 18,
    outerRadius: 22,
    color: "#4020a0",
    opacity: 0.025,
    rotationSpeed: [0.015, 0.01, 0.005],
    segments: 128,
  },
  {
    innerRadius: 30,
    outerRadius: 35,
    color: "#302060",
    opacity: 0.018,
    rotationSpeed: [-0.008, 0.005, 0.012],
    segments: 128,
  },
  {
    innerRadius: 50,
    outerRadius: 58,
    color: "#6040c0",
    opacity: 0.012,
    rotationSpeed: [0.006, -0.004, 0.003],
    segments: 128,
  },
];

function NebulaRing({ config }: { config: RingConfig }) {
  const meshRef = useRef<THREE.Mesh>(null!);

  const geometry = useMemo(
    () => new THREE.RingGeometry(config.innerRadius, config.outerRadius, config.segments),
    [config.innerRadius, config.outerRadius, config.segments],
  );

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: config.opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [config.color, config.opacity],
  );

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x += config.rotationSpeed[0] * delta;
    meshRef.current.rotation.y += config.rotationSpeed[1] * delta;
    meshRef.current.rotation.z += config.rotationSpeed[2] * delta;
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} />;
}

export function NebulaRings() {
  return (
    <group>
      {RING_CONFIGS.map((config, i) => (
        <NebulaRing key={i} config={config} />
      ))}
    </group>
  );
}
