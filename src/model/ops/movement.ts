import { transact, type ModelStore } from '../store';
import type { Bounds, ModelState } from '../types';
import { pruneUnreferencedAssets } from '../assets';
import { deleteConnectionFromDraft, deleteNodeFromDraft } from './draft';

export interface MoveEntry {
  id: string;
  parentId: string;
  bounds: Bounds;
}

/** Apply validated relative moves to a model draft without opening a transaction. */
export function applyMoveEntriesToDraft(draft: ModelState, entries: MoveEntry[]): void {
  for (const entry of entries) {
    const node = draft.nodes[entry.id];
    if (!node) continue;
    if (node.parentId !== entry.parentId) {
      if (entry.id === entry.parentId || !draft.views[node.viewId]) continue;
      let parentId: string | undefined = entry.parentId;
      let cyclic = false;
      while (parentId && draft.nodes[parentId]) {
        if (parentId === entry.id) {
          cyclic = true;
          break;
        }
        parentId = draft.nodes[parentId]!.parentId;
      }
      if (cyclic || (entry.parentId !== node.viewId && !draft.nodes[entry.parentId])) continue;
      const oldParent = draft.nodes[node.parentId];
      if (oldParent) oldParent.childIds = oldParent.childIds.filter((id) => id !== entry.id);
      else {
        const view = draft.views[node.viewId];
        view.childIds = view.childIds.filter((id) => id !== entry.id);
      }
      node.parentId = entry.parentId;
      if (entry.parentId === node.viewId) draft.views[node.viewId].childIds.push(entry.id);
      else draft.nodes[entry.parentId].childIds.push(entry.id);
    }
    node.bounds = { ...entry.bounds };
  }
}

/** Commit a drag: move and/or reparent several nodes in one undo step. */
export function commitMove(entries: MoveEntry[], store?: ModelStore): void {
  transact('Move', (draft) => {
    applyMoveEntriesToDraft(draft, entries);
  }, store);
}

/** Bring to front / send to back within the node's parent. */
export function reorderNode(
  id: string,
  where: 'front' | 'back',
  store?: ModelStore,
): void {
  transact(where === 'front' ? 'Bring to Front' : 'Send to Back', (draft) => {
    const node = draft.nodes[id];
    if (!node) return;
    const list =
      node.parentId === node.viewId
        ? draft.views[node.viewId].childIds
        : draft.nodes[node.parentId].childIds;
    const i = list.indexOf(id);
    if (i < 0) return;
    list.splice(i, 1);
    if (where === 'front') list.push(id);
    else list.unshift(id);
  }, store);
}

export type ReorderMode = 'front' | 'forward' | 'backward' | 'back';

/** Reorder selected sibling runs while preserving their relative order. */
export function reorderViewObjects(
  ids: string[],
  mode: ReorderMode,
  store?: ModelStore,
): void {
  const labels: Record<ReorderMode, string> = {
    front: 'Bring to Front',
    forward: 'Bring Forward',
    backward: 'Send Backward',
    back: 'Send to Back',
  };
  transact(labels[mode], (draft) => {
    const selected = new Set(ids.filter((id) => Boolean(draft.nodes[id])));
    const siblingLists = [
      ...Object.values(draft.views).map((view) => view.childIds),
      ...Object.values(draft.nodes).map((node) => node.childIds),
    ];
    for (const siblings of siblingLists) {
      if (mode === 'front' || mode === 'back') {
        const chosen = siblings.filter((id) => selected.has(id));
        if (chosen.length === 0) continue;
        const unselected = siblings.filter((id) => !selected.has(id));
        const ordered = mode === 'front'
          ? [...unselected, ...chosen]
          : [...chosen, ...unselected];
        siblings.splice(0, siblings.length, ...ordered);
        continue;
      }
      if (mode === 'backward') {
        for (let start = 1; start < siblings.length;) {
          if (!selected.has(siblings[start]) || selected.has(siblings[start - 1])) {
            start++;
            continue;
          }
          let end = start;
          while (end + 1 < siblings.length && selected.has(siblings[end + 1])) end++;
          const adjacent = siblings.splice(start - 1, 1)[0];
          siblings.splice(end, 0, adjacent);
          start = end + 1;
        }
        continue;
      }
      for (let end = siblings.length - 2; end >= 0;) {
        if (!selected.has(siblings[end]) || selected.has(siblings[end + 1])) {
          end--;
          continue;
        }
        let start = end;
        while (start > 0 && selected.has(siblings[start - 1])) start--;
        const adjacent = siblings.splice(end + 1, 1)[0];
        siblings.splice(start, 0, adjacent);
        end = start - 1;
      }
    }
  }, store);
}

export function moveNodes(
  moves: { id: string; x: number; y: number }[],
  store?: ModelStore,
): void {
  transact('Move', (draft) => {
    for (const m of moves) {
      const node = draft.nodes[m.id];
      if (node) {
        node.bounds.x = m.x;
        node.bounds.y = m.y;
      }
    }
  }, store);
}

export function resizeNode(id: string, bounds: Bounds, store?: ModelStore): void {
  transact('Resize', (draft) => {
    const node = draft.nodes[id];
    if (node) node.bounds = { ...bounds };
  }, store);
}

/** Move a node under a new parent (view id or node id), with new relative bounds. */
export function reparentNode(
  id: string,
  newParentId: string,
  bounds: Bounds,
  store?: ModelStore,
): void {
  transact('Move', (draft) => {
    const node = draft.nodes[id];
    if (!node || id === newParentId) return;
    // Prevent dropping a node into its own descendant.
    let p: string | undefined = newParentId;
    while (p && draft.nodes[p]) {
      if (p === id) return;
      p = draft.nodes[p]!.parentId;
    }
    const oldParent = draft.nodes[node.parentId];
    if (oldParent) oldParent.childIds = oldParent.childIds.filter((c) => c !== id);
    else draft.views[node.viewId].childIds = draft.views[node.viewId].childIds.filter((c) => c !== id);
    node.parentId = newParentId;
    node.bounds = { ...bounds };
    if (newParentId === node.viewId) draft.views[node.viewId].childIds.push(id);
    else draft.nodes[newParentId].childIds.push(id);
  }, store);
}

/** Delete diagram nodes/connections from the view only (concepts stay in the model). */
export function deleteViewObjects(ids: string[], store?: ModelStore): void {
  transact('Delete from View', (draft) => {
    for (const id of ids) {
      if (draft.connections[id]) deleteConnectionFromDraft(draft, id);
      else if (draft.nodes[id]) deleteNodeFromDraft(draft, id);
    }
    pruneUnreferencedAssets(draft);
  }, store);
}

/** Delete selected view objects while lifting direct children into their parent. */
export function deleteViewObjectsKeepingChildren(ids: string[], store?: ModelStore): void {
  transact('Delete from View but Keep Children', (draft) => {
    const deletingConnections = new Set<string>();
    for (const id of ids) {
      if (draft.connections[id]) deleteConnectionFromDraft(draft, id, deletingConnections);
    }
    for (const id of ids) {
      const node = draft.nodes[id];
      if (!node) continue;
      for (const connectionId of [...node.sourceConnectionIds, ...node.targetConnectionIds]) {
        deleteConnectionFromDraft(draft, connectionId, deletingConnections);
      }
      const siblings = node.parentId === node.viewId
        ? draft.views[node.viewId]?.childIds
        : draft.nodes[node.parentId]?.childIds;
      if (!siblings) continue;
      const index = siblings.indexOf(id);
      const children = [...node.childIds];
      for (const childId of children) {
        const child = draft.nodes[childId];
        if (!child) continue;
        child.parentId = node.parentId;
        child.bounds.x += node.bounds.x;
        child.bounds.y += node.bounds.y;
      }
      if (index >= 0) siblings.splice(index, 1, ...children);
      delete draft.nodes[id];
    }
    pruneUnreferencedAssets(draft);
  }, store);
}
