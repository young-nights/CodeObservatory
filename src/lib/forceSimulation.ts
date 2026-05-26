// N-body force simulation for graphology graphs
// O(n²) repulsion + spring attraction + center gravity
// Suitable for < 5000 nodes file-tree graphs

import Graph from "graphology";

export interface ForceSimulationOptions {
  /** Node repulsion strength (default: 5000) */
  repulsion: number;
  /** Edge spring attraction coefficient (default: 0.005) */
  attraction: number;
  /** Center gravity pull (default: 0.01) */
  gravity: number;
  /** Velocity damping per tick (default: 0.85) */
  damping: number;
  /** Maximum iterations before stopping (default: 200) */
  maxIterations: number;
  /** Called after each iteration with current iteration count */
  onTick?: (iteration: number) => void;
  /** Called when simulation stops (converged or max iterations) */
  onEnd?: () => void;
}

export interface ForceSimulationController {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

/**
 * Creates a simple force-directed layout simulation.
 *
 * The simulation runs in a `requestAnimationFrame` loop.
 * Call `.start()` to begin, `.stop()` to halt.
 * Sigma.js should call `sigma.refresh()` after each tick to update the WebGL canvas.
 */
export function createForceSimulation(
  graph: Graph,
  options: ForceSimulationOptions,
): ForceSimulationController {
  const {
    repulsion = 5000,
    attraction = 0.005,
    gravity = 0.01,
    damping = 0.85,
    maxIterations = 200,
    onTick,
    onEnd,
  } = options;

  let running = false;
  let rafId: number | null = null;

  // Per-node velocity store
  const velocities = new Map<string, { vx: number; vy: number }>();

  function initVelocity(id: string) {
    if (!velocities.has(id)) {
      velocities.set(id, { vx: 0, vy: 0 });
    }
  }

  function tick(iteration: number) {
    if (!running) return;

    const nodeIds = graph.nodes();
    const n = nodeIds.length;
    if (n === 0) {
      stop();
      return;
    }

    // Ensure all nodes have velocity entries
    for (const id of nodeIds) initVelocity(id);

    // Compute center of mass
    let cx = 0;
    let cy = 0;
    for (const id of nodeIds) {
      cx += (graph.getNodeAttribute(id, "x") as number) || 0;
      cy += (graph.getNodeAttribute(id, "y") as number) || 0;
    }
    cx /= n;
    cy /= n;

    // ── N-body repulsion + gravity ──
    for (let i = 0; i < n; i++) {
      const a = nodeIds[i];
      const ax = (graph.getNodeAttribute(a, "x") as number) || 0;
      const ay = (graph.getNodeAttribute(a, "y") as number) || 0;

      // Gravity toward center
      let fx = (cx - ax) * gravity;
      let fy = (cy - ay) * gravity;

      // Repulsion from all other nodes
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const b = nodeIds[j];
        const bx = (graph.getNodeAttribute(b, "x") as number) || 0;
        const by = (graph.getNodeAttribute(b, "y") as number) || 0;

        const dx = ax - bx;
        const dy = ay - by;
        const distSq = dx * dx + dy * dy + 1; // +1 avoids singularity
        const dist = Math.sqrt(distSq);
        const f = repulsion / distSq;

        fx += (dx / dist) * f;
        fy += (dy / dist) * f;
      }

      const va = velocities.get(a)!;
      va.vx = (va.vx + fx) * damping;
      va.vy = (va.vy + fy) * damping;
    }

    // ── Edge spring attraction ──
    graph.forEachEdge(
      (_edge, _attr, source, target) => {
        const sx = (graph.getNodeAttribute(source, "x") as number) || 0;
        const sy = (graph.getNodeAttribute(source, "y") as number) || 0;
        const tx = (graph.getNodeAttribute(target, "x") as number) || 0;
        const ty = (graph.getNodeAttribute(target, "y") as number) || 0;

        const dx = tx - sx;
        const dy = ty - sy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = dist * attraction;

        const vs = velocities.get(source);
        const vt = velocities.get(target);
        if (vs && vt) {
          vs.vx += (dx / dist) * f;
          vs.vy += (dy / dist) * f;
          vt.vx -= (dx / dist) * f;
          vt.vy -= (dy / dist) * f;
        }
      },
    );

    // ── Apply velocities ──
    let maxSpeed = 0;
    for (const id of nodeIds) {
      const v = velocities.get(id);
      if (!v) continue;
      const x = (graph.getNodeAttribute(id, "x") as number) || 0;
      const y = (graph.getNodeAttribute(id, "y") as number) || 0;
      graph.setNodeAttribute(id, "x", x + v.vx);
      graph.setNodeAttribute(id, "y", y + v.vy);
      maxSpeed = Math.max(maxSpeed, Math.abs(v.vx) + Math.abs(v.vy));
    }

    onTick?.(iteration);

    // Stop conditions
    if (iteration >= maxIterations || maxSpeed < 0.01) {
      stop();
      return;
    }

    rafId = requestAnimationFrame(() => tick(iteration + 1));
  }

  function start() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(() => tick(0));
  }

  function stop() {
    if (!running) return;
    running = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    onEnd?.();
  }

  return { start, stop, isRunning: () => running };
}
