/// <reference types="vite/client" />

declare module "d3-force-3d" {
  export function forceSimulation<NodeDatum extends d3.SimulationNodeDatum>(
    nodes?: NodeDatum[],
  ): d3.Simulation<NodeDatum, undefined>;

  export function forceManyBody<
    NodeDatum extends d3.SimulationNodeDatum,
  >(): d3.ForceManyBody<NodeDatum>;

  export function forceLink<
    NodeDatum extends d3.SimulationNodeDatum,
    LinkDatum extends d3.SimulationLinkDatum<NodeDatum>,
  >(links?: LinkDatum[]): d3.ForceLink<NodeDatum, LinkDatum>;

  export function forceCenter<
    NodeDatum extends d3.SimulationNodeDatum,
  >(x?: number, y?: number, z?: number): d3.ForceCenter<NodeDatum>;

  export function forceCollide<
    NodeDatum extends d3.SimulationNodeDatum,
  >(radius?: number | (() => number)): d3.ForceCollide<NodeDatum>;
}

declare namespace d3 {
  interface SimulationNodeDatum {
    index?: number;
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
  }

  interface SimulationLinkDatum<NodeDatum extends SimulationNodeDatum> {
    source: string | number | NodeDatum;
    target: string | number | NodeDatum;
    index?: number;
  }

  interface Simulation<NodeDatum extends SimulationNodeDatum, LinkDatum extends SimulationLinkDatum<NodeDatum> | undefined> {
    restart(): this;
    stop(): this;
    tick(iterations?: number): this;
    nodes(): NodeDatum[];
    nodes(nodes: NodeDatum[]): this;
    alpha(): number;
    alpha(alpha: number): this;
    alphaMin(): number;
    alphaMin(min: number): this;
    alphaDecay(): number;
    alphaDecay(decay: number): this;
    alphaTarget(): number;
    alphaTarget(target: number): this;
    velocityDecay(): number;
    velocityDecay(decay: number): this;
    force(name: string): d3.Force<NodeDatum, LinkDatum> | undefined;
    force(name: string, force: d3.Force<NodeDatum, LinkDatum>): this;
    find(x: number, y: number, z: number, radius?: number): NodeDatum | undefined;
    randomSource(): () => number;
    randomSource(source: () => number): this;
    on(typenames: string, listener: ((this: this) => void) | null): this;
  }

  interface Force<NodeDatum extends SimulationNodeDatum, LinkDatum extends SimulationLinkDatum<NodeDatum> | undefined> {
    (alpha: number): void;
    initialize?(nodes: NodeDatum[], random: () => number): void;
  }

  interface ForceManyBody<NodeDatum extends SimulationNodeDatum> extends Force<NodeDatum, any> {
    strength(): (d: NodeDatum, i: number, nodes: NodeDatum[]) => number;
    strength(strength: number | ((d: NodeDatum, i: number, nodes: NodeDatum[]) => number)): this;
    theta(): number;
    theta(theta: number): this;
    distanceMin(): number;
    distanceMin(min: number): this;
    distanceMax(): number;
    distanceMax(max: number): this;
  }

  interface ForceLink<NodeDatum extends SimulationNodeDatum, LinkDatum extends SimulationLinkDatum<NodeDatum>>
    extends Force<NodeDatum, LinkDatum> {
    links(): LinkDatum[];
    links(links: LinkDatum[]): this;
    id(): (node: NodeDatum, i: number, nodes: NodeDatum[]) => string | number;
    id(id: (node: NodeDatum, i: number, nodes: NodeDatum[]) => string | number): this;
    distance(): (link: LinkDatum, i: number, links: LinkDatum[]) => number;
    distance(distance: number | ((link: LinkDatum, i: number, links: LinkDatum[]) => number)): this;
    strength(): (link: LinkDatum, i: number, links: LinkDatum[]) => number;
    strength(strength: number | ((link: LinkDatum, i: number, links: LinkDatum[]) => number)): this;
  }

  interface ForceCenter<NodeDatum extends SimulationNodeDatum> extends Force<NodeDatum, any> {
    x(): number;
    x(x: number): this;
    y(): number;
    y(y: number): this;
    z(): number;
    z(z: number): this;
    strength(): number;
    strength(strength: number): this;
  }

  interface ForceCollide<NodeDatum extends SimulationNodeDatum> extends Force<NodeDatum, any> {
    radius(): (node: NodeDatum, i: number, nodes: NodeDatum[]) => number;
    radius(radius: number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number)): this;
    strength(): number;
    strength(strength: number): this;
    iterations(): number;
    iterations(iterations: number): this;
  }
}
