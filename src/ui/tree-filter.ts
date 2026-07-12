import { labelForModelTreeItem } from '../model/label-expression';
import type { ModelState } from '../model/types';

/**
 * Tree filter type selector: a category, a concrete concept type name, or
 * 'all'. Matches desktop Archi's model-tree search widget scope (name text
 * plus optional concept-type restriction).
 */
export type TreeTypeFilter =
  | 'all'
  | 'elements'
  | 'relationships'
  | 'views'
  | 'folders'
  | (string & {});

/** The label a tree row displays for a model item (elements, relationships
 * with endpoint names, views). Shared by the tree and the filter so search
 * matches exactly what the user sees. */
export function treeItemLabel(model: ModelState, id: string): string {
  const el = model.elements[id];
  if (el) return labelForModelTreeItem(model, id);
  const rel = model.relationships[id];
  if (rel) return labelForModelTreeItem(model, id);
  const view = model.views[id];
  if (view) return labelForModelTreeItem(model, id);
  const folder = model.folders[id];
  if (folder) return labelForModelTreeItem(model, id);
  return '?';
}

/**
 * Compute the set of tree item ids visible under the given filter, including
 * the ancestor folders needed to show each match. Returns null when the
 * filter is inactive (show everything, normal collapse behavior).
 */
export function computeVisibleTreeItems(
  model: ModelState,
  text: string,
  type: TreeTypeFilter,
): Set<string> | null {
  const needle = text.trim().toLowerCase();
  if (!needle && type === 'all') return null;

  const visible = new Set<string>();
  const nameMatches = (label: string) => !needle || label.toLowerCase().includes(needle);
  const addWithAncestors = (id: string, folderId: string | null) => {
    visible.add(id);
    let f: string | null = folderId;
    while (f && !visible.has(f)) {
      visible.add(f);
      f = model.folders[f]?.parentId ?? null;
    }
  };

  for (const el of Object.values(model.elements)) {
    if (type !== 'all' && type !== 'elements' && type !== el.type) continue;
    if (nameMatches(treeItemLabel(model, el.id))) addWithAncestors(el.id, el.folderId);
  }
  for (const rel of Object.values(model.relationships)) {
    if (type !== 'all' && type !== 'relationships' && type !== rel.type) continue;
    if (nameMatches(treeItemLabel(model, rel.id))) addWithAncestors(rel.id, rel.folderId);
  }
  for (const view of Object.values(model.views)) {
    if (type !== 'all' && type !== 'views') continue;
    if (nameMatches(treeItemLabel(model, view.id))) addWithAncestors(view.id, view.folderId);
  }
  // Folders match by their own name only when searching text or explicitly
  // filtering for folders; a bare type filter shouldn't flood with folders.
  if ((type === 'all' && needle) || type === 'folders') {
    for (const folder of Object.values(model.folders)) {
      if (nameMatches(treeItemLabel(model, folder.id))) addWithAncestors(folder.id, folder.parentId);
    }
  }
  return visible;
}
