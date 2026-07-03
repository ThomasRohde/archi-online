import type { Bounds, ModelState } from '../../model/types';
import type { Point } from '../geometry';
import { pointInRect } from '../geometry';
import type { Interaction } from './types';

const CONTAINER_TYPES = new Set(['element', 'group']);

export function computeAbsBounds(model: ModelState, viewId: string): Map<string, Bounds> {
  const map = new Map<string, Bounds>();
  const walk = (ids: string[], ox: number, oy: number) => {
    for (const id of ids) {
      const node = model.nodes[id];
      if (!node) continue;
      const b = {
        x: ox + node.bounds.x,
        y: oy + node.bounds.y,
        width: node.bounds.width,
        height: node.bounds.height,
      };
      map.set(id, b);
      walk(node.childIds, b.x, b.y);
    }
  };
  const view = model.views[viewId];
  if (view) walk(view.childIds, 0, 0);
  return map;
}

/** Roots of the selection: selected nodes none of whose ancestors are selected. */
export function selectionRoots(model: ModelState, ids: string[]): string[] {
  const set = new Set(ids);
  return ids.filter((id) => {
    let p = model.nodes[id]?.parentId;
    while (p && model.nodes[p]) {
      if (set.has(p)) return false;
      p = model.nodes[p].parentId;
    }
    return !!model.nodes[id];
  });
}

export function descendants(model: ModelState, id: string, into: Set<string>): void {
  into.add(id);
  for (const c of model.nodes[id]?.childIds ?? []) descendants(model, c, into);
}

/** Deepest container node at point, excluding a set of node ids and their subtrees. */
export function containerAt(
  model: ModelState,
  viewId: string,
  absBounds: Map<string, Bounds>,
  p: Point,
  exclude: Set<string>,
): string | null {
  let found: string | null = null;
  const walk = (ids: string[]): void => {
    // topmost = last in z-order; iterate normally, deeper matches overwrite
    for (const id of ids) {
      if (exclude.has(id)) continue;
      const node = model.nodes[id];
      const b = absBounds.get(id);
      if (!node || !b) continue;
      if (pointInRect(p, b) && CONTAINER_TYPES.has(node.nodeType)) {
        found = id;
        walk(node.childIds);
      }
    }
  };
  walk(model.views[viewId]?.childIds ?? []);
  return found;
}

export function dropTargetFor(
  model: ModelState,
  viewId: string,
  absBounds: Map<string, Bounds>,
  p: Point,
  draggedRoots: string[],
): string | null {
  const exclude = new Set<string>();
  for (const r of draggedRoots) descendants(model, r, exclude);
  return containerAt(model, viewId, absBounds, p, exclude);
}

export function deriveLiveViewState(
  model: ModelState,
  viewId: string,
  absBounds: Map<string, Bounds>,
  inter: Interaction,
): {
  moveDelta: Map<string, Point>;
  dropParentId: string | null;
  resizeOverride: { nodeId: string; rel: Bounds } | null;
  liveAbs: Map<string, Bounds>;
} {
  const moveDelta = new Map<string, Point>();
  let dropParentId: string | null = null;
  let resizeOverride: { nodeId: string; rel: Bounds } | null = null;

  if (inter.kind === 'move') {
    const dx = inter.current.x - inter.start.x;
    const dy = inter.current.y - inter.start.y;
    for (const id of inter.rootIds) moveDelta.set(id, { x: dx, y: dy });
    dropParentId = inter.dropParentId;
  } else if (inter.kind === 'resize') {
    const node = model.nodes[inter.nodeId];
    if (node) {
      const parentAbs =
        node.parentId === viewId ? { x: 0, y: 0 } : (absBounds.get(node.parentId) ?? { x: 0, y: 0 });
      resizeOverride = {
        nodeId: inter.nodeId,
        rel: {
          x: inter.currentAbs.x - parentAbs.x,
          y: inter.currentAbs.y - parentAbs.y,
          width: inter.currentAbs.width,
          height: inter.currentAbs.height,
        },
      };
    }
  }

  if (moveDelta.size === 0 && !resizeOverride) {
    return { moveDelta, dropParentId, resizeOverride, liveAbs: absBounds };
  }

  const liveAbs = new Map(absBounds);
  if (moveDelta.size > 0) {
    for (const [rootId, d] of moveDelta) {
      const subtree = new Set<string>();
      descendants(model, rootId, subtree);
      for (const id of subtree) {
        const b = liveAbs.get(id);
        if (b) liveAbs.set(id, { ...b, x: b.x + d.x, y: b.y + d.y });
      }
    }
  }
  if (resizeOverride) {
    const node = model.nodes[resizeOverride.nodeId]!;
    const parentAbs =
      node.parentId === viewId ? { x: 0, y: 0 } : (liveAbs.get(node.parentId) ?? { x: 0, y: 0 });
    liveAbs.set(resizeOverride.nodeId, {
      x: parentAbs.x + resizeOverride.rel.x,
      y: parentAbs.y + resizeOverride.rel.y,
      width: resizeOverride.rel.width,
      height: resizeOverride.rel.height,
    });
  }

  return { moveDelta, dropParentId, resizeOverride, liveAbs };
}
