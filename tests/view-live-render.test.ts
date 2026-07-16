import { describe, expect, it, vi } from 'vitest';
import { createEmptyModel } from '../src/model/ops';
import {
  createNodeInteractionVersions,
  pruneStableRoutes,
  stableRoutePoints,
} from '../src/canvas/view-editor/live-render';
import { evaluateCachedLabelExpression } from '../src/canvas/view-editor/label-cache';

function nestedModel() {
  const model = createEmptyModel('Live render');
  model.nodes.parent = {
    id: 'parent',
    viewId: 'view',
    parentId: 'view',
    nodeType: 'group',
    name: 'Parent',
    documentation: '',
    bounds: { x: 0, y: 0, width: 200, height: 120 },
    childIds: ['child'],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    properties: [],
  };
  model.nodes.child = {
    id: 'child',
    viewId: 'view',
    parentId: 'parent',
    nodeType: 'note',
    content: 'Child',
    bounds: { x: 10, y: 10, width: 80, height: 40 },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    properties: [],
  };
  model.nodes.sibling = {
    id: 'sibling',
    viewId: 'view',
    parentId: 'view',
    nodeType: 'note',
    content: 'Sibling',
    bounds: { x: 240, y: 0, width: 80, height: 40 },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    properties: [],
  };
  return model;
}

describe('live view render projections', () => {
  it('invalidates only an affected node and its ancestor chain', () => {
    const model = nestedModel();
    const versions = createNodeInteractionVersions(model, {
      moveDelta: new Map([['child', { x: 12, y: 8 }]]),
      resize: null,
      dropParentId: null,
      connectSourceId: null,
      connectHover: null,
      reconnectIntent: null,
    });

    expect(versions.get('child')).toContain('move:12:8');
    expect(versions.get('parent')).toContain('move:12:8');
    expect(versions.has('sibling')).toBe(false);
  });

  it('reuses route arrays when every coordinate is unchanged', () => {
    const previous = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    expect(stableRoutePoints(previous, [{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe(previous);
    expect(stableRoutePoints(previous, [{ x: 1, y: 2 }, { x: 4, y: 4 }])).not.toBe(previous);
  });

  it('prunes deleted and foreign-view routes from the stable cache', () => {
    const base = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    const routes = new Map([
      ['base', base],
      ['deleted', [{ x: 0, y: 0 }]],
      ['foreign', [{ x: 9, y: 9 }]],
    ]);

    pruneStableRoutes(routes, new Set(['base']));

    expect(routes).toEqual(new Map([['base', base]]));
  });
});

describe('label expression render cache', () => {
  it('evaluates once per model identity, object, and expression', () => {
    const model = nestedModel();
    const evaluate = vi.fn(() => ({ text: 'Child', diagnostics: [] }));

    expect(evaluateCachedLabelExpression(model, 'child', '${name}', evaluate).text).toBe('Child');
    expect(evaluateCachedLabelExpression(model, 'child', '${name}', evaluate).text).toBe('Child');
    expect(evaluate).toHaveBeenCalledTimes(1);

    const nextModel = { ...model, nodes: { ...model.nodes } };
    evaluateCachedLabelExpression(nextModel, 'child', '${name}', evaluate);
    expect(evaluate).toHaveBeenCalledTimes(2);
  });
});
