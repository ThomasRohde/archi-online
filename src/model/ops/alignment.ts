import { transact, useStore } from '../store';
import { absoluteBounds, type Bounds, type DiagramNode, type ModelState } from '../types';

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type MatchMode = 'width' | 'height' | 'both';

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

export function alignNodes(ids: string[], mode: AlignMode): void {
  const state = useStore.getState().model;
  if (!state) return;
  const geometries = selectedNodeGeometries(state, ids);
  if (geometries.length < 2) return;
  const box = unionBounds(geometries.map((entry) => entry.absolute));

  transact('Align', (draft) => {
    for (const entry of geometries) {
      const node = draft.nodes[entry.id];
      if (!node) continue;
      const next = absoluteToRelative(entry, alignedBounds(entry.absolute, box, mode));
      applyBounds(node, next);
    }
  });
}

export function matchSize(ids: string[], mode: MatchMode): void {
  const state = useStore.getState().model;
  if (!state) return;
  const geometries = selectedNodeGeometries(state, ids);
  if (geometries.length < 2) return;
  const width = Math.max(...geometries.map((entry) => entry.absolute.width));
  const height = Math.max(...geometries.map((entry) => entry.absolute.height));

  transact('Match Size', (draft) => {
    for (const entry of geometries) {
      const node = draft.nodes[entry.id];
      if (!node) continue;
      const next = absoluteToRelative(entry, {
        ...entry.absolute,
        width: mode === 'height' ? entry.absolute.width : width,
        height: mode === 'width' ? entry.absolute.height : height,
      });
      applyBounds(node, next);
    }
  });
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

function hasSelectedAncestor(state: ModelState, nodeId: string, selected: Set<string>): boolean {
  let parentId = state.nodes[nodeId]?.parentId;
  while (parentId && state.nodes[parentId]) {
    if (selected.has(parentId)) return true;
    parentId = state.nodes[parentId].parentId;
  }
  return false;
}

function unionBounds(bounds: Bounds[]): Bounds {
  const x = Math.min(...bounds.map((b) => b.x));
  const y = Math.min(...bounds.map((b) => b.y));
  const right = Math.max(...bounds.map((b) => b.x + b.width));
  const bottom = Math.max(...bounds.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
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
