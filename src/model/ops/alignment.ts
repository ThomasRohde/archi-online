import { getActiveModelStore, transact, type ModelStore } from '../store';
import { absoluteBounds, type Bounds, type DiagramNode, type ModelState } from '../types';
import type { AnchorMode } from '../../settings/app-settings';

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type MatchMode = 'width' | 'height' | 'both';
export type DistributeMode = 'horizontal' | 'vertical';
export type { AnchorMode } from '../../settings/app-settings';

interface Point {
  x: number;
  y: number;
}

interface NodeGeometry {
  id: string;
  absolute: Bounds;
  parentOffset: Point;
}

export function alignableNodeIds(state: ModelState, ids: string[]): string[] {
  const selected = new Set<string>();
  const nodeIds: string[] = [];
  for (const id of ids) {
    if (!selected.has(id) && state.nodes[id]) {
      selected.add(id);
      nodeIds.push(id);
    }
  }
  return nodeIds.filter((id) => !hasSelectedAncestor(state, id, selected));
}

/**
 * PowerPoint-style align: snap every node to the anchor element (the first or
 * last selected node), leaving the anchor itself in place. Width/height unchanged.
 */
export function alignNodes(
  ids: string[],
  mode: AlignMode,
  anchor: AnchorMode,
  store: ModelStore = getActiveModelStore(),
): void {
  const state = store.getState().model;
  if (!state) return;
  const geometries = selectedNodeGeometries(state, ids);
  if (geometries.length < 2) return;
  const box = anchorBounds(geometries, anchor);

  transact('Align', (draft) => {
    for (const entry of geometries) {
      const node = draft.nodes[entry.id];
      if (!node) continue;
      const next = absoluteToRelative(entry, alignedBounds(entry.absolute, box, mode));
      applyBounds(node, next);
    }
  }, store);
}

/**
 * PowerPoint-style match size: resize every node to the anchor element's
 * width/height, keeping each node's top-left corner fixed.
 */
export function matchSize(
  ids: string[],
  mode: MatchMode,
  anchor: AnchorMode,
  store: ModelStore = getActiveModelStore(),
): void {
  const state = store.getState().model;
  if (!state) return;
  const geometries = selectedNodeGeometries(state, ids);
  if (geometries.length < 2) return;
  const box = anchorBounds(geometries, anchor);

  transact('Match Size', (draft) => {
    for (const entry of geometries) {
      const node = draft.nodes[entry.id];
      if (!node) continue;
      const next = absoluteToRelative(entry, {
        ...entry.absolute,
        width: mode === 'height' ? entry.absolute.width : box.width,
        height: mode === 'width' ? entry.absolute.height : box.height,
      });
      applyBounds(node, next);
    }
  }, store);
}

/**
 * PowerPoint-style distribute: keep the two outermost nodes fixed and equalize
 * the gaps between adjacent edges of the nodes in between. Needs ≥ 3 nodes.
 */
export function distributeNodes(
  ids: string[],
  mode: DistributeMode,
  store: ModelStore = getActiveModelStore(),
): void {
  const state = store.getState().model;
  if (!state) return;
  const geometries = selectedNodeGeometries(state, ids);
  if (geometries.length < 3) return;

  const horizontal = mode === 'horizontal';
  const pos = (b: Bounds) => (horizontal ? b.x : b.y);
  const size = (b: Bounds) => (horizontal ? b.width : b.height);
  const sorted = [...geometries].sort((a, b) => pos(a.absolute) - pos(b.absolute));

  const totalSize = sorted.reduce((sum, entry) => sum + size(entry.absolute), 0);
  const first = sorted[0].absolute;
  const last = sorted[sorted.length - 1].absolute;
  const span = pos(last) + size(last) - pos(first);
  const gap = (span - totalSize) / (sorted.length - 1);

  transact('Distribute', (draft) => {
    let cursor = pos(first);
    for (const entry of sorted) {
      const node = draft.nodes[entry.id];
      if (node) {
        const target = horizontal
          ? { ...entry.absolute, x: cursor }
          : { ...entry.absolute, y: cursor };
        applyBounds(node, absoluteToRelative(entry, target));
      }
      cursor += size(entry.absolute) + gap;
    }
  }, store);
}

function selectedNodeGeometries(state: ModelState, ids: string[]): NodeGeometry[] {
  return alignableNodeIds(state, ids).map((id) => {
    const absolute = absoluteBounds(state, id);
    return {
      id,
      absolute,
      parentOffset: {
        x: absolute.x - state.nodes[id].bounds.x,
        y: absolute.y - state.nodes[id].bounds.y,
      },
    };
  });
}

function anchorBounds(geometries: NodeGeometry[], anchor: AnchorMode): Bounds {
  const entry = anchor === 'first' ? geometries[0] : geometries[geometries.length - 1];
  return entry.absolute;
}

function hasSelectedAncestor(state: ModelState, nodeId: string, selected: Set<string>): boolean {
  let parentId = state.nodes[nodeId]?.parentId;
  while (parentId && state.nodes[parentId]) {
    if (selected.has(parentId)) return true;
    parentId = state.nodes[parentId].parentId;
  }
  return false;
}

function alignedBounds(bounds: Bounds, box: Bounds, mode: AlignMode): Bounds {
  switch (mode) {
    case 'left':
      return { ...bounds, x: box.x };
    case 'center':
      return { ...bounds, x: box.x + box.width / 2 - bounds.width / 2 };
    case 'right':
      return { ...bounds, x: box.x + box.width - bounds.width };
    case 'top':
      return { ...bounds, y: box.y };
    case 'middle':
      return { ...bounds, y: box.y + box.height / 2 - bounds.height / 2 };
    case 'bottom':
      return { ...bounds, y: box.y + box.height - bounds.height };
  }
}

function absoluteToRelative(entry: NodeGeometry, bounds: Bounds): Bounds {
  return {
    x: bounds.x - entry.parentOffset.x,
    y: bounds.y - entry.parentOffset.y,
    width: bounds.width,
    height: bounds.height,
  };
}

function applyBounds(node: DiagramNode, bounds: Bounds): void {
  if (node.bounds.x !== bounds.x) node.bounds.x = bounds.x;
  if (node.bounds.y !== bounds.y) node.bounds.y = bounds.y;
  if (node.bounds.width !== bounds.width) node.bounds.width = bounds.width;
  if (node.bounds.height !== bounds.height) node.bounds.height = bounds.height;
}
