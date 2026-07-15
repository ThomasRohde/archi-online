import type { ModelState } from '../model/types';
import { treeItemLabel } from './tree-filter';

export const TREE_ROW_HEIGHT = 22;
export const TREE_ROW_OVERSCAN = 10;

export type TreeRowKind = 'model' | 'folder' | 'element' | 'relationship' | 'view';

export interface ProjectedTreeRow {
  id: string;
  parentId: string | null;
  kind: TreeRowKind;
  level: number;
  posInSet: number;
  setSize: number;
  label: string;
  expandable: boolean;
  expanded?: boolean;
}

export interface TreeRowWindow {
  start: number;
  end: number;
  offset: number;
  totalHeight: number;
}

export interface WindowedTreeRow {
  row: ProjectedTreeRow;
  index: number;
}

export function getTreeRowWindow(
  rowCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight = TREE_ROW_HEIGHT,
  overscan = TREE_ROW_OVERSCAN,
): TreeRowWindow {
  const firstVisible = Math.max(0, Math.floor(scrollTop / rowHeight));
  const visibleCount = Math.max(1, Math.ceil(viewportHeight / rowHeight));
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(rowCount, firstVisible + visibleCount + overscan);
  return { start, end, offset: start * rowHeight, totalHeight: rowCount * rowHeight };
}

/** Keep the focused row mounted even when pointer scrolling moves it outside the window. */
export function getTreeRowsForWindow(
  rows: ProjectedTreeRow[],
  window: TreeRowWindow,
  focusedId: string | undefined,
): WindowedTreeRow[] {
  const result = rows
    .slice(window.start, window.end)
    .map((row, offset) => ({ row, index: window.start + offset }));
  const focusedIndex = focusedId ? rows.findIndex((row) => row.id === focusedId) : -1;
  if (focusedIndex >= 0 && (focusedIndex < window.start || focusedIndex >= window.end)) {
    result.push({ row: rows[focusedIndex], index: focusedIndex });
    result.sort((left, right) => left.index - right.index);
  }
  return result;
}

export function projectModelTreeRows(
  model: ModelState,
  collapsed: ReadonlySet<string>,
  collapsePrefix: string,
  filtering: boolean,
  visibleIds: ReadonlySet<string>,
): ProjectedTreeRow[] {
  const rows: ProjectedTreeRow[] = [];
  const isVisible = (id: string) => !filtering || visibleIds.has(id);
  const isExpanded = (id: string) => filtering || !collapsed.has(`${collapsePrefix}:${id}`);

  const visitFolder = (
    folderId: string,
    level: number,
    parentId: string,
    posInSet: number,
    setSize: number,
  ) => {
    const folder = model.folders[folderId];
    if (!folder || !isVisible(folderId)) return;
    const expanded = isExpanded(folderId);
    rows.push({
      id: folderId,
      parentId,
      kind: 'folder',
      level,
      posInSet,
      setSize,
      label: treeItemLabel(model, folderId),
      expandable: true,
      expanded,
    });
    if (!expanded) return;

    const subfolderIds = [...folder.folderIds]
      .filter(isVisible)
      .sort((left, right) =>
        (model.folders[left]?.name ?? '').localeCompare(model.folders[right]?.name ?? ''));
    const itemIds = (filtering ? folder.itemIds.filter(isVisible) : folder.itemIds)
      .slice()
      .sort((left, right) => treeItemLabel(model, left).localeCompare(treeItemLabel(model, right)));
    const childCount = subfolderIds.length + itemIds.length;
    subfolderIds.forEach((id, index) =>
      visitFolder(id, level + 1, folderId, index + 1, childCount));
    itemIds.forEach((id, index) => {
        const kind: TreeRowKind | null = model.elements[id]
          ? 'element'
          : model.relationships[id]
            ? 'relationship'
            : model.views[id]
              ? 'view'
              : null;
        if (!kind) return;
        rows.push({
          id,
          parentId: folderId,
          kind,
          level: level + 1,
          posInSet: subfolderIds.length + index + 1,
          setSize: childCount,
          label: kind === 'element' ? model.elements[id].name : treeItemLabel(model, id),
          expandable: false,
        });
      });
  };

  if (!isVisible(model.info.id)) return rows;
  const rootExpanded = isExpanded(model.info.id);
  rows.push({
    id: model.info.id,
    parentId: null,
    kind: 'model',
    level: 1,
    posInSet: 1,
    setSize: 1,
    label: model.info.name,
    expandable: true,
    expanded: rootExpanded,
  });
  if (rootExpanded) {
    const rootFolderIds = model.rootFolderIds.filter(isVisible);
    rootFolderIds.forEach((id, index) =>
      visitFolder(id, 2, model.info.id, index + 1, rootFolderIds.length));
  }
  return rows;
}
