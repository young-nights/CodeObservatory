declare module 'd3-force-3d' {
  export interface SimulationNodeDatum {
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

  export interface SimulationLinkDatum<NodeDatum extends SimulationNodeDatum> {
    source: number | string | NodeDatum;
    target: number | string | NodeDatum;
    index?: number;
  }

  export interface Force<NodeDatum extends SimulationNodeDatum, LinkDatum extends SimulationLinkDatum<NodeDatum>> {
    (alpha: number): void;
    initialize: (nodes: NodeDatum[], random?: () => number) => void;
  }

  export interface Simulation<NodeDatum extends SimulationNodeDatum, LinkDatum extends SimulationLinkDatum<NodeDatum>> {
    restart(): this;
    stop(): this;
    tick(iterations?: number): this;
    nodes(): NodeDatum[];
    nodes(nodes: NodeDatum[]): this;
    force(name: string): Force<NodeDatum, LinkDatum> | undefined;
    force(name: string, force: Force<NodeDatum, LinkDatum>): this;
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
    on(typenames: string, listener: null): this;
    on(typenames: string, listener: (...args: any[]) => void): this;
  }

  export function forceSimulation<NodeDatum extends SimulationNodeDatum, LinkDatum extends SimulationLinkDatum<NodeDatum>>(
    nodes?: NodeDatum[],
    numDimensions?: number,
  ): Simulation<NodeDatum, LinkDatum>;

  export interface ForceManyBody<NodeDatum extends SimulationNodeDatum>
    extends Force<NodeDatum, SimulationLinkDatum<NodeDatum>> {
    strength(): (d: NodeDatum, i: number, data: NodeDatum[]) => number;
    strength(strength: number | ((d: NodeDatum, i: number, data: NodeDatum[]) => number)): this;
    distanceMin(): number;
    distanceMin(min: number): this;
    distanceMax(): number;
    distanceMax(max: number): this;
    theta(): number;
    theta(theta: number): this;
  }

  export function forceManyBody<NodeDatum extends SimulationNodeDatum>(): ForceManyBody<NodeDatum>;

  export interface ForceLink<NodeDatum extends SimulationNodeDatum, LinkDatum extends SimulationLinkDatum<NodeDatum>>
    extends Force<NodeDatum, LinkDatum> {
    links(): LinkDatum[];
    links(links: LinkDatum[]): this;
    id(): (node: NodeDatum, i: number, nodesData: NodeDatum[]) => string | number;
    id(fn: (node: NodeDatum, i: number, nodesData: NodeDatum[]) => string | number): this;
    distance(): (link: LinkDatum, i: number, links: LinkDatum[]) => number;
    distance(distance: number | ((link: LinkDatum, i: number, links: LinkDatum[]) => number)): this;
    strength(): (link: LinkDatum, i: number, links: LinkDatum[]) => number;
    strength(strength: number | ((link: LinkDatum, i: number, links: LinkDatum[]) => number)): this;
    iterations(): number;
    iterations(iterations: number): this;
  }

  export function forceLink<NodeDatum extends SimulationNodeDatum, LinkDatum extends SimulationLinkDatum<NodeDatum>>(
    links?: LinkDatum[],
  ): ForceLink<NodeDatum, LinkDatum>;

  export interface ForceCenter<NodeDatum extends SimulationNodeDatum>
    extends Force<NodeDatum, SimulationLinkDatum<NodeDatum>> {
    x(): number;
    x(x: number): this;
    y(): number;
    y(y: number): this;
    z(): number;
    z(z: number): this;
    strength(): (d: NodeDatum, i: number, data: NodeDatum[]) => number;
    strength(strength: number | ((d: NodeDatum, i: number, data: NodeDatum[]) => number)): this;
  }

  export function forceCenter<NodeDatum extends SimulationNodeDatum>(
    x?: number,
    y?: number,
    z?: number,
  ): ForceCenter<NodeDatum>;

  export interface ForceCollide<NodeDatum extends SimulationNodeDatum>
    extends Force<NodeDatum, SimulationLinkDatum<NodeDatum>> {
    radius(radius: number | ((d: NodeDatum, i: number, nodesData: NodeDatum[]) => number)): this;
    strength(strength: number | ((d: NodeDatum, i: number, nodesData: NodeDatum[]) => number)): this;
    iterations(): number;
    iterations(iterations: number): this;
  }

  export function forceCollide<NodeDatum extends SimulationNodeDatum>(
    radius?: number | ((d: NodeDatum, i: number, nodesData: NodeDatum[]) => number),
  ): ForceCollide<NodeDatum>;

  export interface ForceX<NodeDatum extends SimulationNodeDatum>
    extends Force<NodeDatum, SimulationLinkDatum<NodeDatum>> {
    x(): number;
    x(x: number | ((d: NodeDatum, i: number, nodesData: NodeDatum[]) => number)): this;
    strength(): number;
    strength(strength: number): this;
  }

  export function forceX<NodeDatum extends SimulationNodeDatum>(
    x: number | ((d: NodeDatum, i: number, nodesData: NodeDatum[]) => number),
  ): ForceX<NodeDatum>;

  export interface ForceY<NodeDatum extends SimulationNodeDatum>
    extends Force<NodeDatum, SimulationLinkDatum<NodeDatum>> {
    y(): number;
    y(y: number | ((d: NodeDatum, i: number, nodesData: NodeDatum[]) => number)): this;
    strength(): number;
    strength(strength: number): this;
  }

  export function forceY<NodeDatum extends SimulationNodeDatum>(
    y: number | ((d: NodeDatum, i: number, nodesData: NodeDatum[]) => number),
  ): ForceY<NodeDatum>;
}
