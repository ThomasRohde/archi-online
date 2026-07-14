export type ElkGraphDirection = 'right' | 'down' | 'left' | 'up';
export type ElkGraphEdgeRouting = 'orthogonal' | 'splines';

export interface ElkGraphNode {
  id: string;
  width: number;
  height: number;
}

export interface ElkGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
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
}

export interface ElkGraphLayoutResult {
  nodes: Record<string, { x: number; y: number; width: number; height: number }>;
  edges: Record<string, { points: Array<{ x: number; y: number }> }>;
}

interface ElkPoint { x?: number; y?: number }
interface ElkSection {
  startPoint?: ElkPoint;
  bendPoints?: ElkPoint[];
  endPoint?: ElkPoint;
}
interface ElkResult {
  children?: Array<{ id?: string; x?: number; y?: number; width?: number; height?: number }>;
  edges?: Array<{ id?: string; sections?: ElkSection[] }>;
}
interface ElkInstance { layout(graph: unknown): Promise<unknown> }
type ElkConstructor = new () => ElkInstance;

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

/** Layout an immutable, UI-agnostic graph with the same ELK defaults as persisted views. */
export async function layoutElkGraph(
  graph: ElkGraph,
  options: ElkGraphLayoutOptions = {},
): Promise<ElkGraphLayoutResult> {
  if (graph.nodes.length === 0) return { nodes: {}, edges: {} };
  const direction = options.direction ?? 'right';
  const edgeRouting = options.edgeRouting ?? 'orthogonal';
  const origin = options.origin ?? { x: 0, y: 0 };
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const input = {
    id: 'analysis.elk',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': DIRECTION[direction],
      'elk.spacing.nodeNode': String(clamp(options.nodeSpacing, 40, 10, 300)),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(
        clamp(options.layerSpacing, 80, 20, 500),
      ),
      'elk.edgeRouting': ROUTING[edgeRouting],
    },
    children: graph.nodes.map((node) => ({ ...node })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.sourceId],
      targets: [edge.targetId],
    })),
  };
  const result = await (await loadElk()).layout(input) as ElkResult;
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
    return [[edge.id, { points }]];
  }));
  return { nodes, edges };
}
