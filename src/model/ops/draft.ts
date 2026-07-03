import type { DiagramConnection, DiagramNode, ModelState } from '../types';

export function removeFromFolder(draft: ModelState, id: string): void {
  for (const folder of Object.values(draft.folders)) {
    const i = folder.itemIds.indexOf(id);
    if (i >= 0) folder.itemIds.splice(i, 1);
    const j = folder.folderIds.indexOf(id);
    if (j >= 0) folder.folderIds.splice(j, 1);
  }
}

export function deleteConnectionFromDraft(draft: ModelState, connId: string): void {
  const conn = draft.connections[connId];
  if (!conn) return;
  delete draft.connections[connId];
  const src = draft.nodes[conn.sourceId];
  if (src) src.sourceConnectionIds = src.sourceConnectionIds.filter((c) => c !== connId);
  const tgt = draft.nodes[conn.targetId];
  if (tgt) tgt.targetConnectionIds = tgt.targetConnectionIds.filter((c) => c !== connId);
}

export function deleteNodeFromDraft(draft: ModelState, nodeId: string): void {
  const node = draft.nodes[nodeId];
  if (!node) return;
  for (const childId of [...node.childIds]) deleteNodeFromDraft(draft, childId);
  for (const connId of [...node.sourceConnectionIds, ...node.targetConnectionIds]) {
    deleteConnectionFromDraft(draft, connId);
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
  draft.connections[conn.id] = conn;
  const src = draft.nodes[conn.sourceId];
  if (src) src.sourceConnectionIds.push(conn.id);
  const tgt = draft.nodes[conn.targetId];
  if (tgt) tgt.targetConnectionIds.push(conn.id);
}
