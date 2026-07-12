/*
 * Behaviorally derived from Eclipse Draw2D's ManhattanConnectionRouter.
 * Copyright (c) 2000, 2010 IBM Corporation and others.
 * Licensed under the Eclipse Public License 1.0.
 * Source: org.eclipse.draw2d/ManhattanConnectionRouter.java in Archi 5.9.0,
 * tag release_5.9.0, commit e0ba88c6b3391e0d3c5839917474d1b6085adbe4.
 */

import type { Bounds } from '../model/types';
import type { Point } from './geometry';

interface Ray {
  x: number;
  y: number;
}

export interface ManhattanRouterState {
  rowsUsed: ReadonlySet<number>;
  columnsUsed: ReadonlySet<number>;
}

export interface ManhattanRouteInput {
  start: Point;
  end: Point;
  sourceBounds?: Bounds;
  targetBounds?: Bounds;
}

export interface ManhattanRouteResult {
  points: Point[];
  state: ManhattanRouterState;
}

const UP: Ray = { x: 0, y: -1 };
const DOWN: Ray = { x: 0, y: 1 };
const LEFT: Ray = { x: -1, y: 0 };
const RIGHT: Ray = { x: 1, y: 0 };

export function createManhattanRouterState(): ManhattanRouterState {
  return { rowsUsed: new Set(), columnsUsed: new Set() };
}

/**
 * Pure, integer-precise port of Draw2D's Manhattan routing decision tree.
 * Reservation sets are copied and returned so callers can route a whole view
 * without hidden global state.
 */
export function routeManhattanConnection(
  input: ManhattanRouteInput,
  previousState: ManhattanRouterState = createManhattanRouterState(),
): ManhattanRouteResult {
  const rowsUsed = new Set(previousState.rowsUsed);
  const columnsUsed = new Set(previousState.columnsUsed);
  const start: Ray = { x: Math.round(input.start.x), y: Math.round(input.start.y) };
  const end: Ray = { x: Math.round(input.end.x), y: Math.round(input.end.y) };
  const average: Ray = {
    x: Math.trunc((start.x + end.x) / 2),
    y: Math.trunc((start.y + end.y) / 2),
  };
  const direction: Ray = { x: end.x - start.x, y: end.y - start.y };
  const startNormal = getDirection(ownerBounds(input.sourceBounds, start), start);
  const endNormal = getDirection(ownerBounds(input.targetBounds, end), end);

  const positions: number[] = [];
  let horizontal = isHorizontal(startNormal);
  positions.push(horizontal ? start.y : start.x);
  horizontal = !horizontal;

  if (dot(startNormal, endNormal) === 0) {
    if (!(dot(startNormal, direction) >= 0 && dot(endNormal, direction) <= 0)) {
      let position: number;
      if (dot(startNormal, direction) < 0) {
        position = similarity(startNormal, add(start, scale(startNormal, 10)));
      } else {
        position = horizontal ? average.y : average.x;
      }
      positions.push(position);
      horizontal = !horizontal;

      if (dot(endNormal, direction) > 0) {
        position = similarity(endNormal, add(end, scale(endNormal, 10)));
      } else {
        position = horizontal ? average.y : average.x;
      }
      positions.push(position);
      horizontal = !horizontal;
    }
  } else if (dot(startNormal, endNormal) > 0) {
    const position = dot(startNormal, direction) >= 0
      ? similarity(startNormal, add(start, scale(startNormal, 10)))
      : similarity(endNormal, add(end, scale(endNormal, 10)));
    positions.push(position);
    horizontal = !horizontal;
  } else {
    if (dot(startNormal, direction) < 0) {
      positions.push(similarity(startNormal, add(start, scale(startNormal, 10))));
      horizontal = !horizontal;
    }

    positions.push(horizontal ? average.y : average.x);
    horizontal = !horizontal;

    if (dot(startNormal, direction) < 0) {
      positions.push(similarity(endNormal, add(end, scale(endNormal, 10))));
      horizontal = !horizontal;
    }
  }

  positions.push(horizontal ? end.y : end.x);
  const points = processPositions(
    start,
    end,
    positions,
    isHorizontal(startNormal),
    rowsUsed,
    columnsUsed,
  );
  return {
    points,
    state: { rowsUsed, columnsUsed },
  };
}

function ownerBounds(bounds: Bounds | undefined, point: Point): Bounds {
  return bounds ?? { x: point.x - 1, y: point.y - 1, width: 2, height: 2 };
}

function getDirection(bounds: Bounds, point: Point): Ray {
  let distance = Math.abs(bounds.x - point.x);
  let direction = LEFT;
  let candidate = Math.abs(bounds.y - point.y);
  if (candidate <= distance) {
    distance = candidate;
    direction = UP;
  }
  candidate = Math.abs(bounds.y + bounds.height - point.y);
  if (candidate <= distance) {
    distance = candidate;
    direction = DOWN;
  }
  candidate = Math.abs(bounds.x + bounds.width - point.x);
  if (candidate < distance) direction = RIGHT;
  return direction;
}

function processPositions(
  start: Ray,
  end: Ray,
  positions: number[],
  startsHorizontal: boolean,
  rowsUsed: Set<number>,
  columnsUsed: Set<number>,
): Point[] {
  const pos = new Array<number>(positions.length + 2);
  pos[0] = startsHorizontal ? start.x : start.y;
  for (let index = 0; index < positions.length; index++) pos[index + 1] = positions[index];
  pos[positions.length + 1] = startsHorizontal === (positions.length % 2 === 1)
    ? end.x
    : end.y;

  const points: Point[] = [{ x: start.x, y: start.y }];
  let horizontal = startsHorizontal;
  for (let index = 2; index < pos.length - 1; index++) {
    horizontal = !horizontal;
    const previous = pos[index - 1];
    let current = pos[index];
    const adjust = index !== pos.length - 2;
    if (horizontal) {
      if (adjust) {
        current = getNear(rowsUsed, current, pos[index - 2], pos[index + 2]);
        pos[index] = current;
      }
      points.push({ x: previous, y: current });
    } else {
      if (adjust) {
        current = getNear(columnsUsed, current, pos[index - 2], pos[index + 2]);
        pos[index] = current;
      }
      points.push({ x: current, y: previous });
    }
  }
  points.push({ x: end.x, y: end.y });
  return points;
}

function getNear(used: Set<number>, requested: number, near: number, far: number): number {
  let min = Math.min(near, far);
  let max = Math.max(near, far);
  if (min > requested) {
    max = min;
    min = requested - (min - requested);
  }
  if (max < requested) {
    min = max;
    max = requested + (requested - max);
  }
  let rowOrColumn = requested;
  if (rowOrColumn % 2 === 1) rowOrColumn--;
  let proximity = 0;
  let direction = -1;
  while (proximity < rowOrColumn) {
    const candidate = rowOrColumn + proximity * direction;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    if (candidate <= min) return candidate + 2;
    if (candidate >= max) return candidate - 2;
    if (direction === 1) direction = -1;
    else {
      direction = 1;
      proximity += 2;
    }
  }
  return rowOrColumn;
}

function dot(left: Ray, right: Ray): number {
  return left.x * right.x + left.y * right.y;
}

function similarity(left: Ray, right: Ray): number {
  return Math.abs(dot(left, right));
}

function isHorizontal(ray: Ray): boolean {
  return ray.x !== 0;
}

function add(left: Ray, right: Ray): Ray {
  return { x: left.x + right.x, y: left.y + right.y };
}

function scale(ray: Ray, amount: number): Ray {
  return { x: ray.x * amount, y: ray.y * amount };
}
