import { JView, JVisual } from '../../scripting/jarchi';

type ElkDirection = 'right' | 'down' | 'left' | 'up';
type ElkEdgeRouting = 'preserve' | 'orthogonal' | 'splines';
type ElkScope = 'selection-or-view' | 'selection' | 'view';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

interface ElkPoint {
  x?: number;
  y?: number;
}

interface ElkSection {
  bendPoints?: ElkPoint[];
}

interface ElkEdgeResult {
  id?: string;
  sections?: ElkSection[];
}

interface ElkChildResult {
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface ElkGraphResult {
  children?: ElkChildResult[];
  edges?: ElkEdgeResult[];
}

interface ElkInstance {
  layout(graph: unknown): Promise<unknown>;
}

type ElkConstructor = new () => ElkInstance;

export interface ElkLayoutOptions {
  scope?: ElkScope;
  direction?: ElkDirection;
  nodeSpacing?: number;
  layerSpacing?: number;
  edgeRouting?: ElkEdgeRouting;
  recursive?: boolean;
}

export interface ElkLayoutRequest extends ElkLayoutOptions {
  view: JView;
  selectedVisuals?: JVisual[];
}

export interface ElkLayoutResult {
  scope: 'selection' | 'view';
  nodeCount: number;
  connectionCount: number;
  routedConnectionCount: number;
  elapsedMs: number;
}

let elkInstance: Promise<ElkInstance> | null = null;

const DIRECTION_OPTION: Record<ElkDirection, string> = {
  right: 'RIGHT',
  down: 'DOWN',
  left: 'LEFT',
  up: 'UP',
};

const EDGE_ROUTING_OPTION: Record<Exclude<ElkEdgeRouting, 'preserve'>, string> = {
  orthogonal: 'ORTHOGONAL',
  splines: 'SPLINES',
};

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
}

function isDirection(value: unknown): value is ElkDirection {
  return value === 'right' || value === 'down' || value === 'left' || value === 'up';
}

function isEdgeRouting(value: unknown): value is ElkEdgeRouting {
  return value === 'preserve' || value === 'orthogonal' || value === 'splines';
}

function isScope(value: unknown): value is ElkScope {
  return value === 'selection-or-view' || value === 'selection' || value === 'view';
}

function normalizedOptions(options: ElkLayoutOptions): Required<ElkLayoutOptions> {
  return {
    scope: isScope(options.scope) ? options.scope : 'selection-or-view',
    direction: isDirection(options.direction) ? options.direction : 'right',
    nodeSpacing: clamp(options.nodeSpacing, 40, 10, 300),
    layerSpacing: clamp(options.layerSpacing, 80, 20, 500),
    edgeRouting: isEdgeRouting(options.edgeRouting) ? options.edgeRouting : 'orthogonal',
    recursive: options.recursive ?? false,
  };
}

function loadElk(): Promise<ElkInstance> {
  elkInstance ??= import('elkjs/lib/elk.bundled.js').then((module) => {
    const Elk = module.default as ElkConstructor;
    return new Elk();
  });
  return elkInstance;
}

function selectedVisualRoots(view: JView, selectedVisuals: JVisual[]): JVisual[] {
  const sameView = selectedVisuals.filter((visual) => visual.view.id === view.id);
  const selectedIds = new Set(sameView.map((visual) => visual.id));
  return sameView.filter((visual) => {
    let parent = visual.parent();
    while (parent instanceof JVisual) {
      if (selectedIds.has(parent.id)) return false;
      parent = parent.parent();
    }
    return true;
  });
}

function resolveScope(
  view: JView,
  selectedVisuals: JVisual[] | undefined,
  scope: ElkScope,
): { scope: 'selection' | 'view'; nodes: JVisual[] } {
  if (scope === 'view') return { scope: 'view', nodes: view.nodes() };

  const selectedRoots = selectedVisualRoots(view, selectedVisuals ?? []);
  if (scope === 'selection' || selectedRoots.length >= 2) {
    return { scope: 'selection', nodes: selectedRoots };
  }

  return { scope: 'view', nodes: view.nodes() };
}

function scopeOrigin(bounds: Bounds[]): Point {
  if (bounds.length === 0) return { x: 0, y: 0 };
  return {
    x: Math.min(...bounds.map((bounds) => bounds.x)),
    y: Math.min(...bounds.map((bounds) => bounds.y)),
  };
}

function routeFromEdge(edge: ElkEdgeResult, origin: Point): Point[] {
  const section = edge.sections?.[0];
  if (!section?.bendPoints) return [];
  return section.bendPoints
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({ x: origin.x + point.x!, y: origin.y + point.y! }));
}

export async function runElkLayout(request: ElkLayoutRequest): Promise<ElkLayoutResult> {
  const startedAt = performance.now();
  const options = normalizedOptions(request);
  if (options.recursive) {
    throw new Error('Recursive ELK layout is not supported yet');
  }

  const resolved = resolveScope(request.view, request.selectedVisuals, options.scope);
  const nodes = resolved.nodes;
  if (nodes.length === 0) {
    return {
      scope: resolved.scope,
      nodeCount: 0,
      connectionCount: 0,
      routedConnectionCount: 0,
      elapsedMs: performance.now() - startedAt,
    };
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const boundsByNodeId = new Map(nodes.map((node) => [node.id, node.absoluteBounds()]));
  const origin = scopeOrigin([...boundsByNodeId.values()]);
  const connections = request.view.connections().filter((connection) => (
    nodeIds.has(connection.source.id) && nodeIds.has(connection.target.id)
  ));

  const graph = {
    id: `${request.view.id}.elk`,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': DIRECTION_OPTION[options.direction],
      'elk.spacing.nodeNode': String(options.nodeSpacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(options.layerSpacing),
      ...(options.edgeRouting === 'preserve'
        ? {}
        : { 'elk.edgeRouting': EDGE_ROUTING_OPTION[options.edgeRouting] }),
    },
    children: nodes.map((node) => {
      const bounds = boundsByNodeId.get(node.id)!;
      return {
        id: node.id,
        width: bounds.width,
        height: bounds.height,
      };
    }),
    edges: connections.map((connection) => ({
      id: connection.id,
      sources: [connection.source.id],
      targets: [connection.target.id],
    })),
  };

  const elk = await loadElk();
  const result = await elk.layout(graph) as ElkGraphResult;
  const layoutNodes = Object.fromEntries(
    (result.children ?? [])
      .filter((child) => child.id && boundsByNodeId.has(child.id))
      .map((child) => {
        const current = boundsByNodeId.get(child.id!)!;
        return [child.id!, {
          x: origin.x + finiteNumber(child.x, current.x - origin.x),
          y: origin.y + finiteNumber(child.y, current.y - origin.y),
          width: finiteNumber(child.width, current.width),
          height: finiteNumber(child.height, current.height),
        }];
      }),
  );

  const layoutConnections =
    options.edgeRouting === 'preserve'
      ? {}
      : Object.fromEntries(
          (result.edges ?? [])
            .filter((edge) => edge.id)
            .map((edge) => [edge.id!, { route: routeFromEdge(edge, origin) }]),
        );

  request.view.layout({
    nodes: layoutNodes,
    connections: layoutConnections,
  });

  return {
    scope: resolved.scope,
    nodeCount: Object.keys(layoutNodes).length,
    connectionCount: connections.length,
    routedConnectionCount: Object.keys(layoutConnections).length,
    elapsedMs: performance.now() - startedAt,
  };
}
