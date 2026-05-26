// BloomOverlay — standalone R3F Canvas for Bloom post-processing
// Used as an overlay when ForceGraph3D manages its own renderer.
// Current implementation uses integrated EffectComposer in CosmicProjectGalaxy.
// This file is kept as a reference for ForceGraph3D integration if needed.

import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";

export function BloomOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <Canvas gl={{ preserveDrawingBuffer: true }}>
        <ambientLight intensity={0} />
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.08}
            intensity={2.0}
            radius={0.9}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
