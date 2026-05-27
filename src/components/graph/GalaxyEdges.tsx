// GalaxyEdges.tsx — Straight-line edge rendering for the galaxy
// Simple LineSegments with distance-based opacity gradient

import { useMemo } from "react";
import * as THREE from "three";
import type { GalaxyEdge } from "@/lib/galaxyLayout";

interface GalaxyEdgesProps {
  edges: GalaxyEdge[];
  edgeOpacity: number;
}

export function GalaxyEdges({ edges, edgeOpacity }: GalaxyEdgesProps) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];

    for (const edge of edges) {
      if (!edge?.from || !edge?.to) continue;
      if (typeof edge.from.x !== 'number' || typeof edge.from.z !== 'number') continue;
      if (typeof edge.to.x !== 'number' || typeof edge.to.z !== 'number') continue;

      const fromDist = Math.sqrt(edge.from.x ** 2 + edge.from.y ** 2 + edge.from.z ** 2);
      const toDist = Math.sqrt(edge.to.x ** 2 + edge.to.y ** 2 + edge.to.z ** 2);
      const avgDist = (fromDist + toDist) / 2;

      let alpha: number;
      if (avgDist < 15) alpha = 0.35;
      else if (avgDist < 40) alpha = 0.20;
      else alpha = 0.08;

      const color = avgDist < 20
        ? new THREE.Color("#d0dcff").multiplyScalar(alpha * 3)
        : new THREE.Color("#b0b4c8").multiplyScalar(alpha * 3);

      positions.push(edge.from.x, edge.from.y, edge.from.z);
      positions.push(edge.to.x, edge.to.y, edge.to.z);
      colors.push(color.r, color.g, color.b);
      colors.push(color.r, color.g, color.b);
    }

    const geo = new THREE.BufferGeometry();
    if (positions.length > 0) {
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
    }
    return geo;
  }, [edges]);

  if (!geometry.attributes.position || geometry.attributes.position.count === 0) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={edgeOpacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
}
