import { getConnectable, type DiagramConnection, type DiagramNode, type ModelState } from '../types';

export function removeFromFolder(draft: ModelState, id: string): void {
  for (const folder of Object.values(draft.folders)) {
    const i = folder.itemIds.indexOf(id);
    if (i >= 0) folder.itemIds.splice(i, 1);
    const j = folder.folderIds.indexOf(id);
    if (j >= 0) folder.folderIds.splice(j, 1);
  }
}

export function detachConnection(
  draft: ModelState,
  connection: string | DiagramConnection,
): void {
  const connId = typeof connection === 'string' ? connection : connection.id;
  const conn = draft.connections[connId];
  if (!conn) return;
  const src = getConnectable(draft, conn.sourceId);
  if (src) src.sourceConnectionIds = src.sourceConnectionIds.filter((c) => c !== connId);
  const tgt = getConnectable(draft, conn.targetId);
  if (tgt) tgt.targetConnectionIds = tgt.targetConnectionIds.filter((c) => c !== connId);
}

export function deleteConnectionFromDraft(
  draft: ModelState,
  connId: string,
  deleting = new Set<string>(),
): void {
  const conn = draft.connections[connId];
  if (!conn || deleting.has(connId)) return;
  deleting.add(connId);
  for (const attachedId of [...conn.sourceConnectionIds, ...conn.targetConnectionIds]) {
    deleteConnectionFromDraft(draft, attachedId, deleting);
  }
  detachConnection(draft, connId);
  delete draft.connections[connId];
}

export function deleteNodeFromDraft(
  draft: ModelState,
  nodeId: string,
  deletingNodes = new Set<string>(),
  deletingConnections = new Set<string>(),
): void {
  const node = draft.nodes[nodeId];
  if (!node || deletingNodes.has(nodeId)) return;
  deletingNodes.add(nodeId);
  for (const childId of [...node.childIds]) {
    deleteNodeFromDraft(draft, childId, deletingNodes, deletingConnections);
  }
  for (const connId of [...node.sourceConnectionIds, ...node.targetConnectionIds]) {
    deleteConnectionFromDraft(draft, connId, deletingConnections);
  }
  const parentNode = draft.nodes[node.parentId];
  if (parentNode) parentNode.childIds = parentNode.childIds.filter((c) => c !== nodeId);
  const view = draft.views[node.viewId];
  if (view) view.childIds = view.childIds.filter((c) => c !== nodeId);
  delete draft.nodes[nodeId];
}

export function attachNode(draft: ModelState, node: DiagramNode): void {
  draft.nodes[node.id] = node;
  if (node.parentId === node.viewId) {
    draft.views[node.viewId].childIds.push(node.id);
  } else {
    draft.nodes[node.parentId].childIds.push(node.id);
  }
}

export function attachConnection(draft: ModelState, conn: DiagramConnection): void {
  const src = getConnectable(draft, conn.sourceId);
  const tgt = getConnectable(draft, conn.targetId);
  if (!src || !tgt) {
    throw new Error(`Connection endpoint missing: ${conn.id}`);
  }
  if (src.viewId !== conn.viewId || tgt.viewId !== conn.viewId) {
    throw new Error(`Connection endpoint belongs to another view: ${conn.id}`);
  }
  for (const endpointId of [conn.sourceId, conn.targetId]) {
    if (
      draft.connections[endpointId] &&
      connectionDependsOn(draft, endpointId, conn.id, new Set())
    ) {
      throw new Error(`Connection endpoint cycle: ${conn.id}`);
    }
  }
  const existing = draft.connections[conn.id];
  if (
    existing &&
    existing.sourceId === conn.sourceId &&
    existing.targetId === conn.targetId
  ) {
    conn.sourceConnectionIds = [...existing.sourceConnectionIds];
    conn.targetConnectionIds = [...existing.targetConnectionIds];
    draft.connections[conn.id] = conn;
    return;
  }
  if (existing) detachConnection(draft, conn.id);
  draft.connections[conn.id] = conn;
  if (!src.sourceConnectionIds.includes(conn.id)) src.sourceConnectionIds.push(conn.id);
  if (!tgt.targetConnectionIds.includes(conn.id)) tgt.targetConnectionIds.push(conn.id);
}

function connectionDependsOn(
  draft: ModelState,
  connectionId: string,
  targetId: string,
  visited: Set<string>,
): boolean {
  if (connectionId === targetId) return true;
  if (visited.has(connectionId)) return false;
  visited.add(connectionId);
  const connection = draft.connections[connectionId];
  if (!connection) return false;
  return [connection.sourceId, connection.targetId].some(
    (endpointId) =>
      Boolean(draft.connections[endpointId]) &&
      connectionDependsOn(draft, endpointId, targetId, visited),
  );
}

/** Rebuild adjacency from endpoint ids while retaining any valid stored order. */
export function rebuildConnectionAdjacency(draft: ModelState): void {
  const connectables = [...Object.values(draft.nodes), ...Object.values(draft.connections)];
  const sourceOrder = new Map(connectables.map((item) => [item.id, [...item.sourceConnectionIds]]));
  const targetOrder = new Map(connectables.map((item) => [item.id, [...item.targetConnectionIds]]));
  for (const item of connectables) {
    item.sourceConnectionIds = [];
    item.targetConnectionIds = [];
  }
  for (const connection of Object.values(draft.connections)) {
    const source = getConnectable(draft, connection.sourceId);
    const target = getConnectable(draft, connection.targetId);
    if (source && !source.sourceConnectionIds.includes(connection.id)) {
      source.sourceConnectionIds.push(connection.id);
    }
    if (target && !target.targetConnectionIds.includes(connection.id)) {
      target.targetConnectionIds.push(connection.id);
    }
  }
  for (const item of connectables) {
    item.sourceConnectionIds = retainOrder(item.sourceConnectionIds, sourceOrder.get(item.id) ?? []);
    item.targetConnectionIds = retainOrder(item.targetConnectionIds, targetOrder.get(item.id) ?? []);
  }
}

function retainOrder(ids: string[], preferred: string[]): string[] {
  const valid = new Set(ids);
  const ordered = preferred.filter((id, index) => valid.has(id) && preferred.indexOf(id) === index);
  for (const id of ids) if (!ordered.includes(id)) ordered.push(id);
  return ordered;
}
