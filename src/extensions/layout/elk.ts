import { JView, JVisual } from '../../scripting/jarchi';
import {
  layoutElkGraph,
  type ElkGraphDirection,
  type ElkGraphEdgeRouting,
} from '../../model/layout/elk-graph';

type ElkDirection = ElkGraphDirection;
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
  const connections = request.view.connections().filter((connection) => {
    const source = connection.source;
    const target = connection.target;
    return (
      source instanceof JVisual &&
      target instanceof JVisual &&
      nodeIds.has(source.id) &&
      nodeIds.has(target.id)
    );
  });

  const result = await layoutElkGraph({
    nodes: nodes.map((node) => {
      const bounds = boundsByNodeId.get(node.id)!;
      return {
        id: node.id,
        width: bounds.width,
        height: bounds.height,
      };
    }),
    edges: connections.map((connection) => ({
      id: connection.id,
      sourceId: connection.source.id,
      targetId: connection.target.id,
    })),
  }, {
    direction: options.direction,
    nodeSpacing: options.nodeSpacing,
    layerSpacing: options.layerSpacing,
    edgeRouting: (options.edgeRouting === 'preserve'
      ? 'orthogonal'
      : options.edgeRouting) as ElkGraphEdgeRouting,
    origin,
  });

  const layoutNodes = result.nodes;

  const layoutConnections =
    options.edgeRouting === 'preserve'
      ? {}
      : Object.fromEntries(Object.entries(result.edges).map(([id, edge]) => [
          id,
          { route: edge.points.slice(1, -1) },
        ]));

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
