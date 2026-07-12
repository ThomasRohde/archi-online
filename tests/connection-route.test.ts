import { describe, expect, it } from 'vitest';
import { computeAbsBounds } from '../src/canvas/view-editor/bounds';
import * as geometry from '../src/canvas/geometry';
import type { ModelState } from '../src/model/types';
import { connectionEndpointModel } from './helpers/connection-endpoints';

type RouteResolver = (connectionId: string) => geometry.Point[] | undefined;
type RouteFactory = (
  model: ModelState,
  bounds: ReadonlyMap<string, import('../src/model/types').Bounds>,
) => RouteResolver;
type VisibilityFactory = (
  model: ModelState,
  storedVisible?: (connectableId: string) => boolean,
) => (connectionId: string) => boolean;

describe('shared connection route resolver', () => {
  it('recursively routes connection endpoints from routed polyline midpoints', () => {
    const model = connectionEndpointModel();
    const factory = (geometry as typeof geometry & {
      createConnectionRouteResolver?: RouteFactory;
    }).createConnectionRouteResolver;
    expect(factory).toBeTypeOf('function');

    const resolve = factory!(model, computeAbsBounds(model, 'view'));
    const base = resolve('base');
    const dependent = resolve('dependent');

    expect(base).toEqual([{ x: 100, y: 20 }, { x: 200, y: 20 }]);
    expect(dependent).toEqual([{ x: 150, y: 20 }, { x: 150, y: 160 }]);
    expect(resolve('dependent')).toBe(dependent);
  });

  it('keeps relative bendpoint semantics for connection endpoints', () => {
    const model = connectionEndpointModel();
    model.connections.dependent.bendpoints = [
      { startX: 10, startY: 20, endX: -30, endY: 40 },
    ];
    const factory = (geometry as typeof geometry & {
      createConnectionRouteResolver?: RouteFactory;
    }).createConnectionRouteResolver;

    const route = factory!(model, computeAbsBounds(model, 'view'))('dependent');

    expect(route).toEqual([
      { x: 150, y: 20 },
      { x: 140, y: 130 },
      { x: 146, y: 160 },
    ]);
  });

  it('protects route and visibility recursion from corrupt cycles', () => {
    const model = connectionEndpointModel();
    model.connections.base.sourceId = 'dependent';
    const routeFactory = (geometry as typeof geometry & {
      createConnectionRouteResolver?: RouteFactory;
    }).createConnectionRouteResolver;
    const visibilityFactory = (geometry as typeof geometry & {
      createConnectionVisibilityResolver?: VisibilityFactory;
    }).createConnectionVisibilityResolver;
    expect(visibilityFactory).toBeTypeOf('function');

    const before = JSON.stringify(model.connections);
    const resolve = routeFactory!(model, computeAbsBounds(model, 'view'));
    const isVisible = visibilityFactory!(model);

    expect(resolve('base')).toBeUndefined();
    expect(resolve('dependent')).toBeUndefined();
    expect(isVisible('base')).toBe(false);
    expect(isVisible('dependent')).toBe(false);
    expect(JSON.stringify(model.connections)).toBe(before);
  });

  it('recursively hides dependents of an explicitly hidden connection', () => {
    const model = connectionEndpointModel();
    const visibilityFactory = (geometry as typeof geometry & {
      createConnectionVisibilityResolver?: VisibilityFactory;
    }).createConnectionVisibilityResolver;
    const isVisible = visibilityFactory!(model, (id) => id !== 'base');

    expect(isVisible('base')).toBe(false);
    expect(isVisible('dependent')).toBe(false);
    expect(model.connections.dependent.sourceId).toBe('base');
  });
});
