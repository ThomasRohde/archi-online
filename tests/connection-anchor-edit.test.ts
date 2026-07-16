import { describe, expect, it } from 'vitest';
import {
  bendpointPositions,
  createConnectionRouteResolver,
  toRelativeBendpoint,
} from '../src/canvas/geometry';
import { planConnectionAnchorBendpoints } from '../src/canvas/view-editor/connection-anchor-edit';
import { computeAbsBounds } from '../src/canvas/view-editor/bounds';
import { parseArchimate, serializeArchimate } from '../src/model/io/archimate-xml';
import { connectionEndpointModel } from './helpers/connection-endpoints';

describe('connection anchor bendpoint planning', () => {
  it('repositions one end of a straight connection without moving the opposite anchor', () => {
    const model = connectionEndpointModel();
    const bounds = computeAbsBounds(model, 'view');
    const connection = model.connections.base;
    const before = createConnectionRouteResolver(model, bounds);
    const endpoints = before.endpointPoints(connection.id)!;

    const bendpoints = planConnectionAnchorBendpoints({
      connection,
      end: 'source',
      dropPoint: { x: 0, y: 10 },
      nodeBounds: bounds,
      endpointPoints: endpoints,
      currentRoute: before(connection.id)!,
      orthogonalAnchors: false,
    });

    expect(bendpoints).toHaveLength(2);
    const edited = structuredClone(model);
    edited.connections.base.bendpoints = bendpoints!;
    const route = createConnectionRouteResolver(edited, bounds)('base')!;
    expect(route[0].x).toBe(0);
    expect(route[0].y).toBeCloseTo(10, 0);
    expect(route.at(-1)).toEqual({ x: 200, y: 20 });
  });

  it('reuses a near-end control on repeated adjustment', () => {
    const model = connectionEndpointModel();
    const bounds = computeAbsBounds(model, 'view');
    const firstResolver = createConnectionRouteResolver(model, bounds);
    const first = planConnectionAnchorBendpoints({
      connection: model.connections.base,
      end: 'source',
      dropPoint: { x: 0, y: 10 },
      nodeBounds: bounds,
      endpointPoints: firstResolver.endpointPoints('base')!,
      currentRoute: firstResolver('base')!,
      orthogonalAnchors: false,
    })!;
    model.connections.base.bendpoints = first;
    const secondResolver = createConnectionRouteResolver(model, bounds);

    const second = planConnectionAnchorBendpoints({
      connection: model.connections.base,
      end: 'source',
      dropPoint: { x: 0, y: 30 },
      nodeBounds: bounds,
      endpointPoints: secondResolver.endpointPoints('base')!,
      currentRoute: secondResolver('base')!,
      orthogonalAnchors: false,
    })!;

    expect(second).toHaveLength(2);
    model.connections.base.bendpoints = second;
    const route = createConnectionRouteResolver(model, bounds)('base')!;
    expect(route[0].x).toBe(0);
    expect(route[0].y).toBeCloseTo(30, 0);
    expect(route.at(-1)).toEqual({ x: 200, y: 20 });
  });

  it('inserts before a distant route bend and preserves existing absolute positions', () => {
    const model = connectionEndpointModel();
    const bounds = computeAbsBounds(model, 'view');
    const connection = model.connections.base;
    const endpoints = createConnectionRouteResolver(model, bounds).endpointPoints('base')!;
    connection.bendpoints = [
      toRelativeBendpoint({ x: 120, y: 100 }, endpoints.source, endpoints.target),
      toRelativeBendpoint({ x: 160, y: 120 }, endpoints.source, endpoints.target),
    ];
    const before = createConnectionRouteResolver(model, bounds);

    const bendpoints = planConnectionAnchorBendpoints({
      connection,
      end: 'source',
      dropPoint: { x: 0, y: 10 },
      nodeBounds: bounds,
      endpointPoints: endpoints,
      currentRoute: before('base')!,
      orthogonalAnchors: false,
    })!;

    expect(bendpoints).toHaveLength(3);
    expect(bendpointPositions(bendpoints, endpoints.source, endpoints.target).slice(1)).toEqual([
      { x: 120, y: 100 },
      { x: 160, y: 120 },
    ]);
  });

  it('uses exact orthogonal side coordinates and rejects connection endpoints', () => {
    const model = connectionEndpointModel();
    const bounds = computeAbsBounds(model, 'view');
    const baseResolver = createConnectionRouteResolver(model, bounds, { orthogonalAnchors: true });
    const targetBendpoints = planConnectionAnchorBendpoints({
      connection: model.connections.base,
      end: 'target',
      dropPoint: { x: 300, y: 10 },
      nodeBounds: bounds,
      endpointPoints: baseResolver.endpointPoints('base')!,
      currentRoute: baseResolver('base')!,
      orthogonalAnchors: true,
    })!;
    model.connections.base.bendpoints = targetBendpoints;
    const targetRoute = createConnectionRouteResolver(model, bounds, {
      orthogonalAnchors: true,
    })('base')!;

    expect(targetRoute[0]).toEqual({ x: 100, y: 20 });
    expect(targetRoute.at(-1)).toEqual({ x: 300, y: 10 });

    const dependentResolver = createConnectionRouteResolver(model, bounds, {
      orthogonalAnchors: true,
    });
    expect(planConnectionAnchorBendpoints({
      connection: model.connections.dependent,
      end: 'source',
      dropPoint: { x: 150, y: 20 },
      nodeBounds: bounds,
      endpointPoints: dependentResolver.endpointPoints('dependent')!,
      currentRoute: dependentResolver('dependent')!,
      orthogonalAnchors: true,
    })).toBeNull();
  });

  it('round-trips generated anchor controls as native Archi bendpoints', () => {
    const model = connectionEndpointModel();
    const bounds = computeAbsBounds(model, 'view');
    const resolver = createConnectionRouteResolver(model, bounds);
    model.connections.base.bendpoints = planConnectionAnchorBendpoints({
      connection: model.connections.base,
      end: 'source',
      dropPoint: { x: 0, y: 10 },
      nodeBounds: bounds,
      endpointPoints: resolver.endpointPoints('base')!,
      currentRoute: resolver('base')!,
      orthogonalAnchors: false,
    })!;

    const xml = serializeArchimate(model);
    const parsed = parseArchimate(xml);

    expect(xml).not.toContain('anchorPosition');
    expect(parsed.connections.base.bendpoints).toEqual(model.connections.base.bendpoints);
  });
});
