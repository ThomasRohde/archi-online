import type { Bounds, ModelState } from '../../model/types';
import { isLegendNote } from '../../model/legend';
import type { Point } from '../geometry';
import { pointInRect } from '../geometry';
import type { AlignmentGuide, Interaction } from './types';

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

function viewObjectTypeKey(model: ModelState, id: string): string | undefined {
  const node = model.nodes[id];
  if (node) {
    if (node.nodeType === 'element') {
      const type = model.elements[node.elementId]?.type;
      return type ? `element:${type}` : undefined;
    }
    if (node.nodeType === 'note') return isLegendNote(node) ? 'node:legend' : 'node:note';
    return `node:${node.nodeType}`;
  }
  const connection = model.connections[id];
  if (!connection) return undefined;
  if (connection.connType === 'plain') return 'connection:plain';
  const type = connection.relationshipId
    ? model.relationships[connection.relationshipId]?.type
    : undefined;
  return type ? `relationship:${type}` : undefined;
}

/** Select every current-view object matching any selected object's base type. */
export function sameTypeViewObjectIds(
  model: ModelState,
  viewId: string,
  seedIds: string[],
): string[] {
  const keys = new Set(seedIds.flatMap((id) => {
    const key = viewObjectTypeKey(model, id);
    return key ? [key] : [];
  }));
  if (keys.size === 0) return [];
  const orderedNodeIds: string[] = [];
  const walk = (ids: string[]) => {
    for (const id of ids) {
      const node = model.nodes[id];
      if (!node) continue;
      orderedNodeIds.push(id);
      walk(node.childIds);
    }
  };
  walk(model.views[viewId]?.childIds ?? []);
  const connectionIds = Object.values(model.connections)
    .filter((connection) => connection.viewId === viewId)
    .map((connection) => connection.id);
  return [...orderedNodeIds, ...connectionIds].filter((id) => {
    const key = viewObjectTypeKey(model, id);
    return key !== undefined && keys.has(key);
  });
}

export interface AlignmentSnapResult {
  delta: Point;
  snapped: { x: boolean; y: boolean };
  guides: AlignmentGuide[];
}

interface GuideCandidate {
  distance: number;
  correction: number;
  position: number;
  moving: Bounds;
  sibling: Bounds;
}

function enclosingBounds(bounds: Bounds[]): Bounds | undefined {
  if (bounds.length === 0) return undefined;
  const left = Math.min(...bounds.map((item) => item.x));
  const top = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.x + item.width));
  const bottom = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function axisAnchors(bounds: Bounds, axis: 'x' | 'y'): number[] {
  return axis === 'x'
    ? [bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width]
    : [bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height];
}

/** Snap selected root groups to sibling edges/centres in absolute view coordinates. */
export function snapMoveToAlignmentGuides(
  model: ModelState,
  absBounds: Map<string, Bounds>,
  rootIds: string[],
  delta: Point,
  threshold: number,
): AlignmentSnapResult {
  const selected = new Set(rootIds);
  const groups = new Map<string, string[]>();
  for (const id of rootIds) {
    const node = model.nodes[id];
    if (!node || !absBounds.has(id)) continue;
    groups.set(node.parentId, [...(groups.get(node.parentId) ?? []), id]);
  }
  const best: { x?: GuideCandidate; y?: GuideCandidate } = {};
  for (const [parentId, ids] of groups) {
    const original = enclosingBounds(ids.flatMap((id) => {
      const bounds = absBounds.get(id);
      return bounds ? [bounds] : [];
    }));
    if (!original) continue;
    const moving = { ...original, x: original.x + delta.x, y: original.y + delta.y };
    const siblingIds = parentId === model.nodes[ids[0]]?.viewId
      ? model.views[parentId]?.childIds ?? []
      : model.nodes[parentId]?.childIds ?? [];
    for (const siblingId of siblingIds) {
      if (selected.has(siblingId)) continue;
      const sibling = absBounds.get(siblingId);
      if (!sibling) continue;
      for (const axis of ['x', 'y'] as const) {
        for (const movingAnchor of axisAnchors(moving, axis)) {
          for (const siblingAnchor of axisAnchors(sibling, axis)) {
            const correction = siblingAnchor - movingAnchor;
            const distance = Math.abs(correction);
            if (distance > threshold || (best[axis] && best[axis]!.distance <= distance)) continue;
            best[axis] = {
              distance,
              correction,
              position: siblingAnchor,
              moving,
              sibling,
            };
          }
        }
      }
    }
  }
  const snappedDelta = {
    x: delta.x + (best.x?.correction ?? 0),
    y: delta.y + (best.y?.correction ?? 0),
  };
  const guides: AlignmentGuide[] = [];
  if (best.x) {
    const moved = { ...best.x.moving, y: best.x.moving.y + (best.y?.correction ?? 0) };
    guides.push({
      orientation: 'vertical',
      position: best.x.position,
      from: Math.min(moved.y, best.x.sibling.y),
      to: Math.max(moved.y + moved.height, best.x.sibling.y + best.x.sibling.height),
    });
  }
  if (best.y) {
    const moved = { ...best.y.moving, x: best.y.moving.x + (best.x?.correction ?? 0) };
    guides.push({
      orientation: 'horizontal',
      position: best.y.position,
      from: Math.min(moved.x, best.y.sibling.x),
      to: Math.max(moved.x + moved.width, best.y.sibling.x + best.y.sibling.width),
    });
  }
  return {
    delta: snappedDelta,
    snapped: { x: Boolean(best.x), y: Boolean(best.y) },
    guides,
  };
}

export interface ResizeAlignmentSnapResult {
  bounds: Bounds;
  snapped: { x: boolean; y: boolean };
  guides: AlignmentGuide[];
}

/** Snap only the actively resized edges to sibling edges/centres. */
export function snapResizeToAlignmentGuides(
  model: ModelState,
  absBounds: Map<string, Bounds>,
  nodeId: string,
  rawBounds: Bounds,
  handle: string,
  threshold: number,
  minSize: number,
): ResizeAlignmentSnapResult {
  const node = model.nodes[nodeId];
  if (!node) return { bounds: rawBounds, snapped: { x: false, y: false }, guides: [] };
  const siblingIds = node.parentId === node.viewId
    ? model.views[node.viewId]?.childIds ?? []
    : model.nodes[node.parentId]?.childIds ?? [];
  const siblings = siblingIds
    .filter((id) => id !== nodeId)
    .flatMap((id) => {
      const bounds = absBounds.get(id);
      return bounds ? [bounds] : [];
    });
  const next = { ...rawBounds };
  const snapped = { x: false, y: false };
  const guides: AlignmentGuide[] = [];
  const snapAxis = (axis: 'x' | 'y') => {
    const leading = axis === 'x' ? handle.includes('w') : handle.includes('n');
    const trailing = axis === 'x' ? handle.includes('e') : handle.includes('s');
    if (!leading && !trailing) return;
    const start = axis === 'x' ? rawBounds.x : rawBounds.y;
    const size = axis === 'x' ? rawBounds.width : rawBounds.height;
    const active = leading ? start : start + size;
    let best: { target: number; distance: number; sibling: Bounds } | undefined;
    for (const sibling of siblings) {
      for (const target of axisAnchors(sibling, axis)) {
        const distance = Math.abs(target - active);
        const fixed = leading ? start + size : start;
        if (distance > threshold || Math.abs(target - fixed) < minSize) continue;
        if (!best || distance < best.distance) best = { target, distance, sibling };
      }
    }
    if (!best) return;
    if (axis === 'x') {
      const right = rawBounds.x + rawBounds.width;
      if (leading) {
        next.x = best.target;
        next.width = right - best.target;
      } else {
        next.width = best.target - rawBounds.x;
      }
      snapped.x = true;
      guides.push({
        orientation: 'vertical',
        position: best.target,
        from: Math.min(next.y, best.sibling.y),
        to: Math.max(next.y + next.height, best.sibling.y + best.sibling.height),
      });
    } else {
      const bottom = rawBounds.y + rawBounds.height;
      if (leading) {
        next.y = best.target;
        next.height = bottom - best.target;
      } else {
        next.height = best.target - rawBounds.y;
      }
      snapped.y = true;
      guides.push({
        orientation: 'horizontal',
        position: best.target,
        from: Math.min(next.x, best.sibling.x),
        to: Math.max(next.x + next.width, best.sibling.x + best.sibling.width),
      });
    }
  };
  snapAxis('x');
  snapAxis('y');
  return { bounds: next, snapped, guides };
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
