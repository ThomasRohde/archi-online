import { describe, expect, it } from 'vitest';
import { buildAnalysisGraph } from '../src/model/analysis-graph';
import { addElement, addRelationship, createEmptyModel } from '../src/model/ops';
import { createModelStore } from '../src/model/store';

function fixture() {
  const store = createModelStore({ model: createEmptyModel('Graph') });
  const actor = addElement('BusinessActor', 'Actor', undefined, store);
  const role = addElement('BusinessRole', 'Role', undefined, store);
  const process = addElement('BusinessProcess', 'Process', undefined, store);
  const application = addElement('ApplicationComponent', 'App', undefined, store);
  const assignment = addRelationship(
    'AssignmentRelationship',
    actor,
    role,
    'Assigned',
    undefined,
    store,
  )!;
  const serving = addRelationship(
    'ServingRelationship',
    role,
    process,
    'Serves',
    undefined,
    store,
  )!;
  const cycle = addRelationship(
    'AssociationRelationship',
    process,
    actor,
    'Cycle',
    undefined,
    store,
  )!;
  const higherOrder = addRelationship(
    'AssociationRelationship',
    assignment,
    application,
    'Explains',
    undefined,
    store,
  )!;
  return {
    model: store.getState().model!,
    actor,
    role,
    process,
    application,
    assignment,
    serving,
    cycle,
    higherOrder,
  };
}

describe('analysis graph', () => {
  it('traverses deterministically by direction and depth without looping on cycles', () => {
    const graph = fixture();
    const result = buildAnalysisGraph(graph.model, {
      focusIds: [graph.actor],
      depth: 2,
      direction: 'both',
    });

    expect(result.conceptIds).toEqual([
      graph.actor,
      graph.assignment,
      graph.role,
      graph.cycle,
      graph.process,
      graph.higherOrder,
      graph.application,
      graph.serving,
    ]);
    expect(result.truncated).toBe(false);
  });

  it('applies viewpoint, element, and relationship filters before expanding', () => {
    const graph = fixture();
    const result = buildAnalysisGraph(graph.model, {
      focusIds: [graph.actor],
      depth: 6,
      direction: 'both',
      viewpointId: 'organization',
      elementTypes: ['BusinessActor', 'BusinessRole'],
      relationshipTypes: ['AssignmentRelationship'],
    });

    expect(result.conceptIds).toEqual([graph.actor, graph.assignment, graph.role]);
  });

  it('promotes relationship endpoints to compact nodes for higher-order topology', () => {
    const graph = fixture();
    const result = buildAnalysisGraph(graph.model, {
      focusIds: [graph.assignment],
      depth: 1,
      direction: 'both',
    });

    expect(result.nodes.find((node) => node.id === graph.assignment)).toMatchObject({
      kind: 'relationship',
      compact: true,
    });
    expect(result.edges.some((edge) => edge.sourceId === graph.assignment)).toBe(true);
  });

  it('caps concepts explicitly and returns a stable truncated prefix', () => {
    const store = createModelStore({ model: createEmptyModel('Large') });
    const focus = addElement('BusinessActor', 'Focus', undefined, store);
    for (let index = 0; index < 12; index++) {
      const target = addElement('BusinessRole', `Role ${String(index).padStart(2, '0')}`, undefined, store);
      addRelationship('AssignmentRelationship', focus, target, '', undefined, store);
    }

    const options = { focusIds: [focus], depth: 1, direction: 'both' as const, maxConcepts: 5 };
    const first = buildAnalysisGraph(store.getState().model!, options);
    const second = buildAnalysisGraph(store.getState().model!, options);

    expect(first.truncated).toBe(true);
    expect(first.conceptIds).toHaveLength(5);
    expect(second.conceptIds).toEqual(first.conceptIds);
  });

  it('keeps traversal order independent of the host locale comparator', () => {
    const store = createModelStore({ model: createEmptyModel('Locale independent') });
    const focus = addElement('BusinessActor', 'Focus', undefined, store);
    const firstTarget = addElement('BusinessRole', 'First', undefined, store);
    const secondTarget = addElement('BusinessRole', 'Second', undefined, store);
    addRelationship('AssignmentRelationship', focus, firstTarget, 'A', undefined, store);
    addRelationship('AssignmentRelationship', focus, secondTarget, 'B', undefined, store);
    const options = {
      focusIds: [focus], depth: 1, direction: 'both' as const, maxConcepts: 3,
    };
    const expected = buildAnalysisGraph(store.getState().model!, options).conceptIds;
    const localeCompare = String.prototype.localeCompare;
    try {
      String.prototype.localeCompare = function reverse(other: string) {
        const left = String(this);
        return left < other ? 1 : left > other ? -1 : 0;
      };
      const actual = buildAnalysisGraph(
        structuredClone(store.getState().model!), options,
      ).conceptIds;
      expect(actual).toEqual(expected);
    } finally {
      String.prototype.localeCompare = localeCompare;
    }
  });
});
