import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as router from '../src/canvas/geometry';
import type { Bounds } from '../src/model/types';

interface Point { x: number; y: number }
interface RouterState {
  rowsUsed: ReadonlySet<number>;
  columnsUsed: ReadonlySet<number>;
}
interface RouteInput {
  start: Point;
  end: Point;
  sourceBounds?: Bounds;
  targetBounds?: Bounds;
}
interface RouteResult {
  points: Point[];
  state: RouterState;
}
type RouteManhattan = (input: RouteInput, state?: RouterState) => RouteResult;

function routeApi(): { route: RouteManhattan; empty: () => RouterState } | null {
  const candidate = router as typeof router & {
    routeManhattanConnection?: RouteManhattan;
    createManhattanRouterState?: () => RouterState;
  };
  expect(candidate.routeManhattanConnection).toBeTypeOf('function');
  expect(candidate.createManhattanRouterState).toBeTypeOf('function');
  if (!candidate.routeManhattanConnection || !candidate.createManhattanRouterState) return null;
  return { route: candidate.routeManhattanConnection, empty: candidate.createManhattanRouterState };
}

describe('Draw2D-compatible Manhattan router', () => {
  it('records the pinned Draw2D source and EPL-1.0 attribution', () => {
    const notice = readFileSync(resolve('THIRD_PARTY_NOTICES.md'), 'utf8');

    expect(notice).toContain('ManhattanConnectionRouter.java');
    expect(notice).toContain('release_5.9.0');
    expect(notice).toContain('EPL-1.0');
    expect(notice).toContain('src/canvas/manhattan-router.ts');
  });

  it('routes perpendicular endpoint normals with one orthogonal corner', () => {
    const api = routeApi();
    if (!api) return;
    const result = api.route({
      start: { x: 100, y: 20 },
      end: { x: 150, y: 100 },
      sourceBounds: { x: 0, y: 0, width: 100, height: 40 },
      targetBounds: { x: 130, y: 100, width: 40, height: 50 },
    });

    expect(result.points).toEqual([
      { x: 100, y: 20 },
      { x: 150, y: 20 },
      { x: 150, y: 100 },
    ]);
  });

  it('uses ten-pixel escape segments and immutable column reservations', () => {
    const api = routeApi();
    if (!api) return;
    const initial = api.empty();
    const input: RouteInput = {
      start: { x: 100, y: 20 },
      end: { x: 300, y: 100 },
      sourceBounds: { x: 0, y: 0, width: 100, height: 40 },
      targetBounds: { x: 200, y: 80, width: 100, height: 40 },
    };

    const first = api.route(input, initial);
    const second = api.route(input, first.state);

    expect(first.points).toEqual([
      { x: 100, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 100 },
      { x: 300, y: 100 },
    ]);
    expect(second.points).toEqual([
      { x: 100, y: 20 },
      { x: 112, y: 20 },
      { x: 112, y: 100 },
      { x: 300, y: 100 },
    ]);
    expect([...initial.columnsUsed]).toEqual([]);
    expect([...first.state.columnsUsed]).toEqual([110]);
    expect([...second.state.columnsUsed]).toEqual([110, 112]);
  });

  it('takes Draw2D\'s perpendicular detour branch when the source faces away', () => {
    const api = routeApi();
    if (!api) return;
    const result = api.route({
      start: { x: 100, y: 20 },
      end: { x: 50, y: 100 },
      sourceBounds: { x: 0, y: 0, width: 100, height: 40 },
      targetBounds: { x: 30, y: 100, width: 40, height: 50 },
    });

    expect(result.points).toEqual([
      { x: 100, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 60 },
      { x: 50, y: 60 },
      { x: 50, y: 100 },
    ]);
    expect([...result.state.rowsUsed]).toEqual([60]);
    expect([...result.state.columnsUsed]).toEqual([110]);
  });

  it('uses opposite normals and immutable row reservations', () => {
    const api = routeApi();
    if (!api) return;
    const initial = api.empty();
    const input: RouteInput = {
      start: { x: 100, y: 40 },
      end: { x: 200, y: 80 },
      sourceBounds: { x: 0, y: 0, width: 100, height: 40 },
      targetBounds: { x: 200, y: 80, width: 100, height: 40 },
    };

    const first = api.route(input, initial);
    const second = api.route(input, first.state);

    expect(first.points).toEqual([
      { x: 100, y: 40 },
      { x: 100, y: 60 },
      { x: 200, y: 60 },
      { x: 200, y: 80 },
    ]);
    expect(second.points).toEqual([
      { x: 100, y: 40 },
      { x: 100, y: 62 },
      { x: 200, y: 62 },
      { x: 200, y: 80 },
    ]);
    expect([...initial.rowsUsed]).toEqual([]);
    expect([...first.state.rowsUsed]).toEqual([60]);
    expect([...second.state.rowsUsed]).toEqual([60, 62]);
  });

  it('pins Draw2D direction tie ordering at a centered owner point', () => {
    const api = routeApi();
    if (!api) return;
    const result = api.route({
      start: { x: 20, y: 20 },
      end: { x: 100, y: -100 },
      sourceBounds: { x: 0, y: 0, width: 40, height: 40 },
      targetBounds: { x: 100, y: -120, width: 40, height: 40 },
    });

    expect(result.points).toEqual([
      { x: 20, y: 20 },
      { x: 20, y: 30 },
      { x: 60, y: 30 },
      { x: 60, y: -100 },
      { x: 100, y: -100 },
    ]);
  });
});
