// Copy/paste of diagram nodes (and connections internal to the copied set).
import { newId } from '../model/id';
import { transact, useStore } from '../model/store';
import type { DiagramConnection, DiagramNode } from '../model/types';

interface ClipboardData {
  nodes: DiagramNode[]; // deep-cloned, original ids
  connections: DiagramConnection[];
  rootIds: string[];
}

let clipboard: ClipboardData | null = null;

export function copyNodes(ids: string[]): void {
  const model = useStore.getState().model;
  if (!model) return;
  const rootIds = ids.filter((id) => model.nodes[id]);
  if (rootIds.length === 0) return;
  const all = new Set<string>();
  const collect = (id: string) => {
    if (all.has(id)) return;
    all.add(id);
    for (const c of model.nodes[id]?.childIds ?? []) collect(c);
  };
  rootIds.forEach(collect);
  const nodes = [...all].map((id) => JSON.parse(JSON.stringify(model.nodes[id])) as DiagramNode);
  const connections = Object.values(model.connections)
    .filter((c) => all.has(c.sourceId) && all.has(c.targetId))
    .map((c) => JSON.parse(JSON.stringify(c)) as DiagramConnection);
  clipboard = { nodes, connections, rootIds };
}

export function hasClipboard(): boolean {
  return clipboard !== null;
}

/** Paste into a view. Returns new root node ids. */
export function pasteNodes(viewId: string, offset = 16): string[] {
  const data = clipboard;
  const model = useStore.getState().model;
  if (!data || !model || !model.views[viewId]) return [];
  const idMap = new Map<string, string>();
  for (const n of data.nodes) idMap.set(n.id, newId());
  for (const c of data.connections) idMap.set(c.id, newId());
  const newRootIds = data.rootIds.map((r) => idMap.get(r)!);

  transact('Paste', (draft) => {
    // data.nodes is ordered parents-before-children (collect order)
    for (const orig of data.nodes) {
      // skip element nodes whose concept no longer exists (cross-model paste)
      if (orig.nodeType === 'element' && !draft.elements[orig.elementId]) continue;
      if (orig.nodeType === 'ref' && !draft.views[orig.refViewId]) continue;
      const isRoot = data.rootIds.includes(orig.id);
      const mappedParent = isRoot ? viewId : idMap.get(orig.parentId)!;
      const parentId = mappedParent === viewId || draft.nodes[mappedParent] ? mappedParent : viewId;
      const node: DiagramNode = {
        ...JSON.parse(JSON.stringify(orig)),
        id: idMap.get(orig.id)!,
        viewId,
        parentId,
        bounds:
          parentId === viewId
            ? { ...orig.bounds, x: orig.bounds.x + offset, y: orig.bounds.y + offset }
            : { ...orig.bounds },
        childIds: [],
        sourceConnectionIds: [],
        targetConnectionIds: [],
      };
      draft.nodes[node.id] = node;
      if (parentId === viewId) draft.views[viewId].childIds.push(node.id);
      else draft.nodes[parentId].childIds.push(node.id);
    }
    for (const orig of data.connections) {
      const sourceId = idMap.get(orig.sourceId)!;
      const targetId = idMap.get(orig.targetId)!;
      if (!draft.nodes[sourceId] || !draft.nodes[targetId]) continue;
      if (orig.relationshipId && !draft.relationships[orig.relationshipId]) continue;
      const conn: DiagramConnection = {
        ...JSON.parse(JSON.stringify(orig)),
        id: idMap.get(orig.id)!,
        viewId,
        sourceId,
        targetId,
      };
      draft.connections[conn.id] = conn;
      draft.nodes[sourceId].sourceConnectionIds.push(conn.id);
      draft.nodes[targetId].targetConnectionIds.push(conn.id);
    }
  });
  const after = useStore.getState().model;
  return newRootIds.filter((id) => after?.nodes[id]);
}
