import type { ConnectableRefs, ModelState } from './types';

export interface ConnectionOrderIndex {
  readonly bySource: ReadonlyMap<string, readonly string[]>;
  readonly byTarget: ReadonlyMap<string, readonly string[]>;
  readonly byView: ReadonlyMap<string, readonly string[]>;
}

/** Index connection endpoints once while preserving normalized record insertion order. */
export function createConnectionOrderIndex(model: ModelState): ConnectionOrderIndex {
  const bySource = new Map<string, string[]>();
  const byTarget = new Map<string, string[]>();
  const byView = new Map<string, string[]>();
  for (const connection of Object.values(model.connections)) {
    const sourceIds = bySource.get(connection.sourceId) ?? [];
    sourceIds.push(connection.id);
    bySource.set(connection.sourceId, sourceIds);
    const targetIds = byTarget.get(connection.targetId) ?? [];
    targetIds.push(connection.id);
    byTarget.set(connection.targetId, targetIds);
    const viewIds = byView.get(connection.viewId) ?? [];
    viewIds.push(connection.id);
    byView.set(connection.viewId, viewIds);
  }
  return { bySource, byTarget, byView };
}

/** Apply explicit adjacency order, then retain deterministic endpoint-index fallbacks. */
export function orderedConnectableConnectionIds(
  connectable: ConnectableRefs & { id: string },
  direction: 'source' | 'target',
  index: ConnectionOrderIndex,
): string[] {
  const preferred = direction === 'source'
    ? connectable.sourceConnectionIds
    : connectable.targetConnectionIds;
  const candidates = (direction === 'source' ? index.bySource : index.byTarget)
    .get(connectable.id) ?? [];
  const valid = new Set(candidates);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const connectionId of preferred) {
    if (!valid.has(connectionId) || seen.has(connectionId)) continue;
    seen.add(connectionId);
    ordered.push(connectionId);
  }
  for (const connectionId of candidates) {
    if (seen.has(connectionId)) continue;
    seen.add(connectionId);
    ordered.push(connectionId);
  }
  return ordered;
}

/**
 * Enumerate one view's connections in native document topology: view/node order,
 * explicit source adjacency, then connection-to-connection descendants. Any
 * valid-view connection unreachable from that topology is appended in normalized
 * record order so malformed models remain fully inspectable.
 */
export function orderedViewConnectionIds(
  model: ModelState,
  viewId: string,
  index: ConnectionOrderIndex = createConnectionOrderIndex(model),
): readonly string[] {
  const ordered: string[] = [];
  const visitedConnections = new Set<string>();
  const visitedNodes = new Set<string>();
  const visitConnection = (connectionId: string) => {
    if (visitedConnections.has(connectionId)) return;
    const connection = model.connections[connectionId];
    if (!connection || connection.viewId !== viewId) return;
    visitedConnections.add(connectionId);
    ordered.push(connectionId);
    for (const childId of orderedConnectableConnectionIds(connection, 'source', index)) {
      visitConnection(childId);
    }
  };
  const visitNode = (nodeId: string) => {
    if (visitedNodes.has(nodeId)) return;
    const node = model.nodes[nodeId];
    if (!node || node.viewId !== viewId) return;
    visitedNodes.add(nodeId);
    for (const connectionId of orderedConnectableConnectionIds(node, 'source', index)) {
      visitConnection(connectionId);
    }
    node.childIds.forEach(visitNode);
  };

  model.views[viewId]?.childIds.forEach(visitNode);
  for (const connectionId of index.byView.get(viewId) ?? []) {
    visitConnection(connectionId);
  }
  return Object.freeze(ordered);
}
