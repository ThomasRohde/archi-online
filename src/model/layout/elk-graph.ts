export type ElkGraphDirection = 'right' | 'down' | 'left' | 'up';
export type ElkGraphEdgeRouting = 'orthogonal' | 'splines';
export type ElkGraphPortSide = 'north' | 'east' | 'south' | 'west';
export type ElkGraphLayoutOptionValue = string | number | boolean;

export interface ElkGraphPort {
  id: string;
  side: ElkGraphPortSide;
  width?: number;
  height?: number;
}

export interface ElkGraphLabel {
  id: string;
  text: string;
  width: number;
  height: number;
}

export interface ElkGraphNode {
  id: string;
  width: number;
  height: number;
  portConstraints?: 'fixed-side';
  ports?: readonly ElkGraphPort[];
}

export interface ElkGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePortId?: string;
  targetPortId?: string;
  labels?: readonly ElkGraphLabel[];
}

export interface ElkGraph {
  nodes: readonly ElkGraphNode[];
  edges: readonly ElkGraphEdge[];
}

export interface ElkGraphLayoutOptions {
  direction?: ElkGraphDirection;
  nodeSpacing?: number;
  layerSpacing?: number;
  edgeRouting?: ElkGraphEdgeRouting;
  origin?: { x: number; y: number };
  layoutOptions?: Readonly<Record<string, ElkGraphLayoutOptionValue>>;
}

export interface ElkGraphLayoutResult {
  nodes: Record<string, { x: number; y: number; width: number; height: number }>;
  edges: Record<string, {
    points: Array<{ x: number; y: number }>;
    labels?: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  }>;
}

interface ElkPoint { x?: number; y?: number }
interface ElkSection {
  startPoint?: ElkPoint;
  bendPoints?: ElkPoint[];
  endPoint?: ElkPoint;
}
interface ElkResultLabel {
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}
interface ElkResult {
  children?: Array<{ id?: string; x?: number; y?: number; width?: number; height?: number }>;
  edges?: Array<{ id?: string; sections?: ElkSection[]; labels?: ElkResultLabel[] }>;
}
interface ElkInstance { layout(graph: unknown): Promise<unknown> }
type ElkConstructor = new () => ElkInstance;
export type ElkGraphLayoutRunner = (graph: unknown) => Promise<unknown>;

let elkInstance: Promise<ElkInstance> | null = null;

const DIRECTION: Record<ElkGraphDirection, string> = {
  right: 'RIGHT',
  down: 'DOWN',
  left: 'LEFT',
  up: 'UP',
};

const ROUTING: Record<ElkGraphEdgeRouting, string> = {
  orthogonal: 'ORTHOGONAL',
  splines: 'SPLINES',
};

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, finite(value, fallback)));
}

function loadElk(): Promise<ElkInstance> {
  elkInstance ??= import('elkjs/lib/elk.bundled.js').then((module) => {
    const Elk = module.default as ElkConstructor;
    return new Elk();
  });
  return elkInstance;
}

function point(value: ElkPoint | undefined, offset: { x: number; y: number }) {
  if (!Number.isFinite(value?.x) || !Number.isFinite(value?.y)) return undefined;
  return { x: offset.x + value!.x!, y: offset.y + value!.y! };
}

function optionValues(
  options: Readonly<Record<string, ElkGraphLayoutOptionValue>> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(options ?? {}).map(([key, value]) => [key, String(value)]),
  );
}

function elkInput(graph: ElkGraph, options: ElkGraphLayoutOptions) {
  const direction = options.direction ?? 'right';
  const edgeRouting = options.edgeRouting ?? 'orthogonal';
  return {
    id: 'analysis.elk',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': DIRECTION[direction],
      'elk.spacing.nodeNode': String(clamp(options.nodeSpacing, 40, 10, 300)),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(
        clamp(options.layerSpacing, 80, 20, 500),
      ),
      'elk.edgeRouting': ROUTING[edgeRouting],
      ...optionValues(options.layoutOptions),
    },
    children: graph.nodes.map((node) => ({
      id: node.id,
      width: node.width,
      height: node.height,
      ...(node.portConstraints === 'fixed-side'
        ? { layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE' } }
        : {}),
      ...(node.ports
        ? {
          ports: node.ports.map((port) => ({
            id: port.id,
            width: finite(port.width, 1),
            height: finite(port.height, 1),
            layoutOptions: { 'elk.port.side': port.side.toUpperCase() },
          })),
        }
        : {}),
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.sourcePortId ?? edge.sourceId],
      targets: [edge.targetPortId ?? edge.targetId],
      ...(edge.labels ? { labels: edge.labels.map((label) => ({ ...label })) } : {}),
    })),
  };
}

/** Layout an immutable graph using an injected ELK runner. */
export async function layoutElkGraphWithRunner(
  graph: ElkGraph,
  options: ElkGraphLayoutOptions,
  runner: ElkGraphLayoutRunner,
): Promise<ElkGraphLayoutResult> {
  if (graph.nodes.length === 0) return { nodes: {}, edges: {} };
  const origin = options.origin ?? { x: 0, y: 0 };
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const result = await runner(elkInput(graph, options)) as ElkResult;
  const children = (result.children ?? []).filter(
    (child): child is NonNullable<typeof child> & { id: string } => Boolean(child.id && nodeById.has(child.id)),
  );
  const minX = Math.min(...children.map((child) => finite(child.x, 0)));
  const minY = Math.min(...children.map((child) => finite(child.y, 0)));
  const offset = { x: origin.x - minX, y: origin.y - minY };
  const nodes = Object.fromEntries(children.map((child) => {
    const source = nodeById.get(child.id)!;
    return [child.id, {
      x: offset.x + finite(child.x, 0),
      y: offset.y + finite(child.y, 0),
      width: finite(child.width, source.width),
      height: finite(child.height, source.height),
    }];
  }));
  const edges = Object.fromEntries((result.edges ?? []).flatMap((edge) => {
    if (!edge.id) return [];
    const section = edge.sections?.[0];
    const points = [
      point(section?.startPoint, offset),
      ...(section?.bendPoints ?? []).map((candidate) => point(candidate, offset)),
      point(section?.endPoint, offset),
    ].filter((candidate): candidate is { x: number; y: number } => Boolean(candidate));
    const labels = (edge.labels ?? []).flatMap((label) => {
      if (
        !label.id ||
        !Number.isFinite(label.x) ||
        !Number.isFinite(label.y) ||
        !Number.isFinite(label.width) ||
        !Number.isFinite(label.height)
      ) return [];
      return [{
        id: label.id,
        x: offset.x + label.x!,
        y: offset.y + label.y!,
        width: label.width!,
        height: label.height!,
      }];
    });
    return [[edge.id, { points, ...(labels.length > 0 ? { labels } : {}) }]];
  }));
  return { nodes, edges };
}

/** Layout an immutable, UI-agnostic graph with the same ELK defaults as persisted views. */
export async function layoutElkGraph(
  graph: ElkGraph,
  options: ElkGraphLayoutOptions = {},
): Promise<ElkGraphLayoutResult> {
  return layoutElkGraphWithRunner(
    graph,
    options,
    async (input) => (await loadElk()).layout(input),
  );
}
