import { transact, type ModelStore } from '../store';
import type { ModelState } from '../types';
import { pruneUnreferencedAssets } from '../assets';
import { deleteConnectionFromDraft, deleteNodeFromDraft, removeFromFolder } from './draft';

function deleteViewFromDraft(draft: ModelState, viewId: string): void {
  const view = draft.views[viewId];
  if (!view) return;
  for (const [id, node] of Object.entries(draft.nodes)) {
    if (node.viewId === viewId) delete draft.nodes[id];
  }
  for (const [id, conn] of Object.entries(draft.connections)) {
    if (conn.viewId === viewId) delete draft.connections[id];
  }
  removeFromFolder(draft, viewId);
  delete draft.views[viewId];
}

/** Relationships attached (transitively) to any concept in `seed`. */
function collectAttachedRelationships(draft: ModelState, seed: Set<string>): Set<string> {
  const doomed = new Set(seed);
  let changed = true;
  while (changed) {
    changed = false;
    for (const rel of Object.values(draft.relationships)) {
      if (doomed.has(rel.id)) continue;
      if (doomed.has(rel.sourceId) || doomed.has(rel.targetId)) {
        doomed.add(rel.id);
        changed = true;
      }
    }
  }
  return doomed;
}

function deleteFolderFromDraft(draft: ModelState, folderId: string, doomedConcepts: Set<string>): void {
  const folder = draft.folders[folderId];
  if (!folder) return;
  for (const sub of [...folder.folderIds]) deleteFolderFromDraft(draft, sub, doomedConcepts);
  for (const itemId of [...folder.itemIds]) {
    if (draft.views[itemId]) deleteViewFromDraft(draft, itemId);
    else doomedConcepts.add(itemId);
  }
  removeFromFolder(draft, folderId);
  delete draft.folders[folderId];
}

/** Delete model items (elements, relationships, views, folders) with full cascade. */
export function deleteItems(ids: string[], store?: ModelStore): void {
  transact('Delete', (draft) => {
    const doomedConcepts = new Set<string>();
    for (const id of ids) {
      if (draft.folders[id]) {
        if (draft.folders[id].parentId === null) continue; // top-level folders are fixed
        deleteFolderFromDraft(draft, id, doomedConcepts);
      } else if (draft.views[id]) {
        deleteViewFromDraft(draft, id);
      } else if (draft.elements[id] || draft.relationships[id]) {
        doomedConcepts.add(id);
      }
    }
    if (doomedConcepts.size === 0) {
      pruneUnreferencedAssets(draft);
      return;
    }
    const doomed = collectAttachedRelationships(draft, doomedConcepts);
    // Remove diagram nodes/connections that reference doomed concepts.
    for (const [id, node] of Object.entries(draft.nodes)) {
      if (node.nodeType === 'element' && doomed.has(node.elementId) && draft.nodes[id]) {
        deleteNodeFromDraft(draft, id);
      }
    }
    for (const [id, conn] of Object.entries(draft.connections)) {
      if (conn.relationshipId && doomed.has(conn.relationshipId) && draft.connections[id]) {
        deleteConnectionFromDraft(draft, id);
      }
    }
    for (const id of doomed) {
      removeFromFolder(draft, id);
      delete draft.elements[id];
      delete draft.relationships[id];
    }
    pruneUnreferencedAssets(draft);
  }, store);
}

export function moveItemsToFolder(ids: string[], folderId: string, store?: ModelStore): void {
  transact('Move', (draft) => {
    const target = draft.folders[folderId];
    if (!target) return;
    for (const id of ids) {
      if (id === folderId) continue;
      const folder = draft.folders[id];
      if (folder && folder.parentId !== null) {
        // Prevent moving a folder into its own subtree.
        let p: string | null = folderId;
        let cyclic = false;
        while (p) {
          if (p === id) {
            cyclic = true;
            break;
          }
          p = draft.folders[p]?.parentId ?? null;
        }
        if (cyclic) continue;
        const oldParent = draft.folders[folder.parentId];
        if (oldParent) oldParent.folderIds = oldParent.folderIds.filter((f) => f !== id);
        folder.parentId = folderId;
        target.folderIds.push(id);
        continue;
      }
      const item = draft.elements[id] ?? draft.relationships[id] ?? draft.views[id];
      if (item) {
        const oldFolder = draft.folders[item.folderId];
        if (oldFolder) oldFolder.itemIds = oldFolder.itemIds.filter((i) => i !== id);
        item.folderId = folderId;
        target.itemIds.push(id);
      }
    }
  }, store);
}
