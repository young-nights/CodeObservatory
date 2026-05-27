// GalaxyEdges.tsx — Mixed curved/straight edge rendering for the galaxy
// Same-arm edges → CubicBezierCurve3 (AdditiveBlending)
// Cross-arm edges → straight LineSegments (NormalBlending)

import { useMemo } from "react";
import * as THREE from "three";
import type { GalaxyEdge } from "@/lib/galaxyLayout";
import { getArmAngle } from "@/lib/galaxyLayout";

interface GalaxyEdgesProps {
  edges: GalaxyEdge[];
  edgeOpacity: number;
}

export function GalaxyEdges({ edges, edgeOpacity }: GalaxyEdgesProps) {
  // ── Curved (same-arm) edges ──
  const curvedGeometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];

    for (const edge of edges) {
      if (!edge?.from || !edge?.to) continue;
      const fromAngle = getArmAngle(edge.from.x, edge.from.z);
      const toAngle = getArmAngle(edge.to.x, edge.to.z);
      let angleDiff = Math.abs(fromAngle - toAngle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      if (angleDiff >= Math.PI / 6) continue;

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

      const fromPos = new THREE.Vector3(edge.from.x, edge.from.y, edge.from.z);
      const toPos = new THREE.Vector3(edge.to.x, edge.to.y, edge.to.z);
      const mid = fromPos.clone().add(toPos).multiplyScalar(0.5);
      const midAngle = getArmAngle(mid.x, mid.z);
      const dist = fromPos.distanceTo(toPos);
      const cpOffset = dist * 0.35;

      const cp1 = new THREE.Vector3(
        mid.x + Math.cos(midAngle + Math.PI / 2) * cpOffset,
        mid.y + cpOffset * 0.3,
        mid.z + Math.sin(midAngle + Math.PI / 2) * cpOffset,
      );
      const cp2 = new THREE.Vector3(
        mid.x + Math.cos(midAngle - Math.PI / 2) * cpOffset,
        mid.y - cpOffset * 0.3,
        mid.z + Math.sin(midAngle - Math.PI / 2) * cpOffset,
      );

      const curve = new THREE.CubicBezierCurve3(fromPos, cp1, cp2, toPos);
      const pts = curve.getPoints(32);

      for (let i = 0; i < pts.length - 1; i++) {
        positions.push(pts[i].x, pts[i].y, pts[i].z);
        positions.push(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);
      }
    }

    const geo = new THREE.BufferGeometry();
    if (positions.length > 0) {
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
    }
    return geo;
  }, [edges]);

  // ── Straight (cross-arm) edges ──
  const straightGeometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];

    for (const edge of edges) {
      if (!edge?.from || !edge?.to) continue;
      const fromAngle = getArmAngle(edge.from.x, edge.from.z);
      const toAngle = getArmAngle(edge.to.x, edge.to.z);
      let angleDiff = Math.abs(fromAngle - toAngle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      if (angleDiff < Math.PI / 6) continue;

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

  return (
    <group>
      {curvedGeometry.attributes.position && curvedGeometry.attributes.position.count > 0 && (
        <lineSegments geometry={curvedGeometry}>
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={edgeOpacity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      )}
      {straightGeometry.attributes.position && straightGeometry.attributes.position.count > 0 && (
        <lineSegments geometry={straightGeometry}>
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={edgeOpacity * 0.7}
            depthWrite={false}
            blending={THREE.NormalBlending}
          />
        </lineSegments>
      )}
    </group>
  );
}
