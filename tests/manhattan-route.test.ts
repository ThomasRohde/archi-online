import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as router from '../src/canvas/geometry';
import type { Bounds } from '../src/model/types';

interface Point { x: number; y: number }
interface RouterState {
  rowsUsed: ReadonlySet<number>;
  columnsUsed: ReadonlySet<number>;
  reservations?: ReadonlyMap<string, {
    rows: ReadonlySet<number>;
    columns: ReadonlySet<number>;
  }>;
}
interface RouteInput {
  connectionId: string;
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

  it('ships the complete EPL-1.0 license and corresponding-source notice', () => {
    const licensePath = resolve('public/licenses/EPL-1.0.txt');
    const draw2dNoticePath = resolve('public/licenses/Eclipse-Draw2D-NOTICE.txt');
    const mitLicensePath = resolve('public/licenses/MIT.txt');
    const correspondingSourcePath = resolve('public/licenses/source/manhattan-router.ts.txt');

    expect(existsSync(licensePath)).toBe(true);
    expect(existsSync(draw2dNoticePath)).toBe(true);
    expect(existsSync(mitLicensePath)).toBe(true);
    expect(existsSync(correspondingSourcePath)).toBe(true);
    if (
      !existsSync(licensePath) ||
      !existsSync(draw2dNoticePath) ||
      !existsSync(mitLicensePath) ||
      !existsSync(correspondingSourcePath)
    ) return;

    const license = readFileSync(licensePath, 'utf8');
    const draw2dNotice = readFileSync(draw2dNoticePath, 'utf8');
    const mitLicense = readFileSync(mitLicensePath, 'utf8');
    const projectLicense = readFileSync(resolve('LICENSE'), 'utf8');
    const correspondingSource = readFileSync(correspondingSourcePath, 'utf8');
    const routerSource = readFileSync(resolve('src/canvas/manhattan-router.ts'), 'utf8');
    const repositoryNotice = readFileSync(resolve('THIRD_PARTY_NOTICES.md'), 'utf8');

    expect(license).toContain('Eclipse Public License - v 1.0');
    expect(license).toContain('3. REQUIREMENTS');
    expect(license).toContain('7. GENERAL');
    expect(license).toContain('This Agreement is governed by the laws of the State of New York');
    expect(draw2dNotice).toContain('Copyright (c) 2000, 2010 IBM Corporation and others.');
    expect(draw2dNotice).toContain('release_5.9.0');
    expect(draw2dNotice).toContain('e0ba88c6b3391e0d3c5839917474d1b6085adbe4');
    expect(draw2dNotice).toContain('src/canvas/manhattan-router.ts');
    expect(draw2dNotice).toContain('git clone https://github.com/ThomasRohde/archi-online.git');
    expect(draw2dNotice).toContain('ALL EPL CONTRIBUTORS DISCLAIM ALL WARRANTIES AND CONDITIONS');
    expect(draw2dNotice).toContain('NO EPL CONTRIBUTOR SHALL BE LIABLE');
    expect(draw2dNotice).toContain('/licenses/source/manhattan-router.ts.txt');
    expect(draw2dNotice).not.toContain('<corresponding Git tag>');
    expect(mitLicense.replace(/\r\n/g, '\n')).toBe(projectLicense.replace(/\r\n/g, '\n'));
    expect(correspondingSource).toBe(routerSource);
    expect(repositoryNotice).toContain('public/licenses/EPL-1.0.txt');
    expect(repositoryNotice).toContain('public/licenses/Eclipse-Draw2D-NOTICE.txt');
    expect(repositoryNotice).toContain('public/licenses/MIT.txt');
    expect(repositoryNotice).toContain('public/licenses/source/manhattan-router.ts.txt');
  });

  it('routes perpendicular endpoint normals with one orthogonal corner', () => {
    const api = routeApi();
    if (!api) return;
    const result = api.route({
      connectionId: 'perpendicular',
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
      connectionId: 'first',
      start: { x: 100, y: 20 },
      end: { x: 300, y: 100 },
      sourceBounds: { x: 0, y: 0, width: 100, height: 40 },
      targetBounds: { x: 200, y: 80, width: 100, height: 40 },
    };

    const first = api.route(input, initial);
    const rerouted = api.route(input, first.state);
    const second = api.route({ ...input, connectionId: 'second' }, first.state);
    const reroutedWithPeer = api.route(input, second.state);

    expect(first.points).toEqual([
      { x: 100, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 100 },
      { x: 300, y: 100 },
    ]);
    expect(rerouted.points).toEqual(first.points);
    expect(second.points).toEqual([
      { x: 100, y: 20 },
      { x: 112, y: 20 },
      { x: 112, y: 100 },
      { x: 300, y: 100 },
    ]);
    expect([...initial.columnsUsed]).toEqual([]);
    expect([...first.state.columnsUsed]).toEqual([110]);
    expect([...rerouted.state.columnsUsed]).toEqual([110]);
    expect([...second.state.columnsUsed]).toEqual([110, 112]);
    expect(reroutedWithPeer.points).toEqual(first.points);
    expect(new Set(reroutedWithPeer.state.columnsUsed)).toEqual(new Set([110, 112]));
    expect([...second.state.columnsUsed]).toEqual([110, 112]);
    expect([
      ...(rerouted.state.reservations?.get('first')?.columns ?? []),
    ]).toEqual([110]);
    expect([
      ...(second.state.reservations?.get('second')?.columns ?? []),
    ]).toEqual([112]);
    expect([
      ...(reroutedWithPeer.state.reservations?.get('second')?.columns ?? []),
    ]).toEqual([112]);
    expect([
      ...(second.state.reservations?.get('first')?.columns ?? []),
    ]).toEqual([110]);
  });

  it('replaces one connection\'s old reservations when its geometry changes', () => {
    const api = routeApi();
    if (!api) return;
    const input: RouteInput = {
      connectionId: 'moving',
      start: { x: 100, y: 20 },
      end: { x: 300, y: 100 },
      sourceBounds: { x: 0, y: 0, width: 100, height: 40 },
      targetBounds: { x: 200, y: 80, width: 100, height: 40 },
    };

    const first = api.route(input);
    const moved = api.route({
      ...input,
      start: { x: 120, y: 20 },
      sourceBounds: { x: 20, y: 0, width: 100, height: 40 },
    }, first.state);
    const replacement = api.route({ ...input, connectionId: 'replacement' }, moved.state);

    expect([...first.state.columnsUsed]).toEqual([110]);
    expect(moved.points).toEqual([
      { x: 120, y: 20 },
      { x: 130, y: 20 },
      { x: 130, y: 100 },
      { x: 300, y: 100 },
    ]);
    expect([...moved.state.columnsUsed]).toEqual([130]);
    expect([
      ...(moved.state.reservations?.get('moving')?.columns ?? []),
    ]).toEqual([130]);
    expect(replacement.points).toEqual(first.points);
    expect([...replacement.state.columnsUsed]).toEqual([130, 110]);
  });

  it('takes Draw2D\'s perpendicular detour branch when the source faces away', () => {
    const api = routeApi();
    if (!api) return;
    const result = api.route({
      connectionId: 'detour',
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

  it('releases both row and column ownership when a reroute needs no reservation', () => {
    const api = routeApi();
    if (!api) return;
    const connectionId = 'detour-to-direct';
    const detour = api.route({
      connectionId,
      start: { x: 100, y: 20 },
      end: { x: 50, y: 100 },
      sourceBounds: { x: 0, y: 0, width: 100, height: 40 },
      targetBounds: { x: 30, y: 100, width: 40, height: 50 },
    });
    const direct = api.route({
      connectionId,
      start: { x: 100, y: 20 },
      end: { x: 150, y: 100 },
      sourceBounds: { x: 0, y: 0, width: 100, height: 40 },
      targetBounds: { x: 130, y: 100, width: 40, height: 50 },
    }, detour.state);

    expect([...detour.state.rowsUsed]).toEqual([60]);
    expect([...detour.state.columnsUsed]).toEqual([110]);
    expect(direct.points).toEqual([
      { x: 100, y: 20 },
      { x: 150, y: 20 },
      { x: 150, y: 100 },
    ]);
    expect([...direct.state.rowsUsed]).toEqual([]);
    expect([...direct.state.columnsUsed]).toEqual([]);
    expect(direct.state.reservations?.has(connectionId)).toBe(false);
  });

  it('uses opposite normals and immutable row reservations', () => {
    const api = routeApi();
    if (!api) return;
    const initial = api.empty();
    const input: RouteInput = {
      connectionId: 'first-row',
      start: { x: 100, y: 40 },
      end: { x: 200, y: 80 },
      sourceBounds: { x: 0, y: 0, width: 100, height: 40 },
      targetBounds: { x: 200, y: 80, width: 100, height: 40 },
    };

    const first = api.route(input, initial);
    const same = api.route(input, first.state);
    const second = api.route({ ...input, connectionId: 'second-row' }, first.state);

    expect(first.points).toEqual([
      { x: 100, y: 40 },
      { x: 100, y: 60 },
      { x: 200, y: 60 },
      { x: 200, y: 80 },
    ]);
    expect(same.points).toEqual(first.points);
    expect(second.points).toEqual([
      { x: 100, y: 40 },
      { x: 100, y: 62 },
      { x: 200, y: 62 },
      { x: 200, y: 80 },
    ]);
    expect([...initial.rowsUsed]).toEqual([]);
    expect([...first.state.rowsUsed]).toEqual([60]);
    expect([...same.state.rowsUsed]).toEqual([60]);
    expect([...second.state.rowsUsed]).toEqual([60, 62]);
  });

  it('pins Draw2D direction tie ordering at a centered owner point', () => {
    const api = routeApi();
    if (!api) return;
    const result = api.route({
      connectionId: 'direction-tie',
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
