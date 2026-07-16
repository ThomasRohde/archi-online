import { describe, expect, it } from 'vitest';
import { computeAbsBounds } from '../src/canvas/view-editor/bounds';
import * as geometry from '../src/canvas/geometry';
import * as operations from '../src/model/ops';
import { attachConnection } from '../src/model/ops/draft';
import { createModelStore } from '../src/model/store';
import type { ModelState } from '../src/model/types';
import {
  connectionEndpointModel,
  endpointConnection,
} from './helpers/connection-endpoints';

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
  it('prewarms only the requested view and resolves foreign views on demand', () => {
    const model = connectionEndpointModel();
    model.views.other = {
      id: 'other',
      kind: 'view',
      name: 'Other',
      documentation: '',
      properties: [],
      folderId: model.views.view.folderId,
      childIds: ['other-a', 'other-b'],
    };
    model.nodes['other-a'] = {
      id: 'other-a',
      viewId: 'other',
      parentId: 'other',
      nodeType: 'note',
      content: 'Other A',
      bounds: { x: 0, y: 0, width: 100, height: 40 },
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      properties: [],
    };
    model.nodes['other-b'] = {
      id: 'other-b',
      viewId: 'other',
      parentId: 'other',
      nodeType: 'note',
      content: 'Other B',
      bounds: { x: 200, y: 0, width: 100, height: 40 },
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      properties: [],
    };
    attachConnection(model, endpointConnection('foreign', 'other-a', 'other-b', {
      viewId: 'other',
    }));
    const bounds = new Map([
      ...computeAbsBounds(model, 'view'),
      ...computeAbsBounds(model, 'other'),
    ]);
    const reads: string[] = [];
    const resolve = geometry.createConnectionRouteResolver(model, bounds, {
      connection: (connectionId) => {
        reads.push(connectionId);
        return model.connections[connectionId];
      },
      prewarmViewId: 'view',
    });

    expect(reads).not.toContain('foreign');
    expect(resolve('foreign')).toEqual([
      { x: 100, y: 20 },
      { x: 200, y: 20 },
    ]);
    expect(reads).toContain('foreign');
  });

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

  it('keeps radial anchors by default and opts into orthogonal sides and corners', () => {
    const model = connectionEndpointModel();
    model.connections.base.targetId = 'node-c';
    model.nodes['node-b'].targetConnectionIds = [];
    model.nodes['node-c'].targetConnectionIds.push('base');
    const bounds = computeAbsBounds(model, 'view');

    const radial = geometry.createConnectionRouteResolver(model, bounds)('base');
    const orthogonal = geometry.createConnectionRouteResolver(model, bounds, {
      orthogonalAnchors: true,
    })('base');

    expect(radial).toEqual([
      { x: 62.5, y: 40 },
      { x: 137.5, y: 160 },
    ]);
    expect(orthogonal).toEqual([
      { x: 100, y: 40 },
      { x: 100, y: 160 },
    ]);
  });

  it('uses orthogonal anchors directed by bendpoints and falls back for overlaps', () => {
    const model = connectionEndpointModel();
    model.connections.base.bendpoints = [
      { startX: 30, startY: 80, endX: -170, endY: 80 },
    ];
    const bounds = computeAbsBounds(model, 'view');

    expect(geometry.createConnectionRouteResolver(model, bounds, {
      orthogonalAnchors: true,
    })('base')).toEqual([
      { x: 80, y: 40 },
      { x: 80, y: 100 },
      { x: 200, y: 40 },
    ]);

    model.connections.base.bendpoints = [];
    model.nodes['node-b'].bounds = { x: 20, y: 10, width: 100, height: 40 };
    const overlappingBounds = computeAbsBounds(model, 'view');
    const radial = geometry.createConnectionRouteResolver(model, overlappingBounds)('base');
    expect(geometry.createConnectionRouteResolver(model, overlappingBounds, {
      orthogonalAnchors: true,
    })('base')).toEqual(radial);
  });

  it('feeds orthogonal endpoint anchors into Manhattan routing', () => {
    const model = connectionEndpointModel();
    model.connections.base.targetId = 'node-c';
    model.nodes['node-b'].targetConnectionIds = [];
    model.nodes['node-c'].targetConnectionIds.push('base');
    model.views.view.connectionRouterType = 2;

    const route = geometry.createConnectionRouteResolver(
      model,
      computeAbsBounds(model, 'view'),
      { orthogonalAnchors: true },
    )('base');

    expect(route?.[0]).toEqual({ x: 100, y: 40 });
    expect(route?.at(-1)).toEqual({ x: 100, y: 160 });
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

  it('uses the view-wide Manhattan router and ignores dormant bendpoints', () => {
    const model = connectionEndpointModel();
    model.views.view.connectionRouterType = 2;
    model.connections.base.bendpoints = [
      { startX: 0, startY: 100, endX: 0, endY: 100 },
    ];
    model.connections.dependent.bendpoints = [
      { startX: 200, startY: 200, endX: 200, endY: 200 },
    ];

    const resolve = geometry.createConnectionRouteResolver(
      model,
      computeAbsBounds(model, 'view'),
    );

    expect(resolve('base')).toEqual([
      { x: 100, y: 20 },
      { x: 150, y: 20 },
      { x: 150, y: 20 },
      { x: 200, y: 20 },
    ]);
    expect(resolve('dependent')).toEqual([
      { x: 150, y: 20 },
      { x: 150, y: 90 },
      { x: 150, y: 90 },
      { x: 150, y: 160 },
    ]);
  });

  it('preserves dormant bendpoints while toggling Manhattan off and on', () => {
    const model = connectionEndpointModel();
    model.connections.dependent.bendpoints = [
      { startX: 10, startY: 20, endX: -30, endY: 40 },
    ];
    const store = createModelStore({ model, fileName: null });
    const manual = geometry.createConnectionRouteResolver(
      model,
      computeAbsBounds(model, 'view'),
    )('dependent');
    const setRouter = (operations as typeof operations & {
      setViewConnectionRouterType?: (
        viewId: string,
        type: 0 | 2,
        store?: ReturnType<typeof createModelStore>,
      ) => void;
    }).setViewConnectionRouterType;
    expect(setRouter).toBeTypeOf('function');
    if (!setRouter) return;

    setRouter('view', 2, store);
    const manhattanModel = store.getState().model!;
    expect(manhattanModel.connections.dependent.bendpoints).toEqual(
      model.connections.dependent.bendpoints,
    );
    expect(
      geometry.createConnectionRouteResolver(
        manhattanModel,
        computeAbsBounds(manhattanModel, 'view'),
      )('dependent'),
    ).not.toEqual(manual);

    setRouter('view', 0, store);
    const restoredModel = store.getState().model!;
    expect(restoredModel.connections.dependent.bendpoints).toEqual(
      model.connections.dependent.bendpoints,
    );
    expect(
      geometry.createConnectionRouteResolver(
        restoredModel,
        computeAbsBounds(restoredModel, 'view'),
      )('dependent'),
    ).toEqual(manual);
  });
});
