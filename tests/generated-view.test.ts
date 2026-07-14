import { describe, expect, it } from 'vitest';
import type { ElkGraph, ElkGraphLayoutResult } from '../src/model/layout/elk-graph';
import { generateViewFor } from '../src/model/ops/generate-view';
import { addElement, addRelationship, createEmptyModel } from '../src/model/ops';
import { createModelStore, redo, undo } from '../src/model/store';

async function simpleLayout(graph: ElkGraph): Promise<ElkGraphLayoutResult> {
  return {
    nodes: Object.fromEntries(graph.nodes.map((node, index) => [node.id, {
      x: index * 180,
      y: index % 2 * 100,
      width: node.width,
      height: node.height,
    }])),
    edges: {},
  };
}

describe('Generate View For', () => {
  it('creates semantic occurrences and higher-order connections in one undoable transaction', async () => {
    const store = createModelStore({ model: createEmptyModel('Generated') });
    const actor = addElement('BusinessActor', 'Actor', undefined, store);
    const role = addElement('BusinessRole', 'Role', undefined, store);
    const app = addElement('ApplicationComponent', 'App', undefined, store);
    const assignment = addRelationship(
      'AssignmentRelationship', actor, role, '', undefined, store,
    )!;
    const annotation = addRelationship(
      'AssociationRelationship', assignment, app, '', undefined, store,
    )!;
    const beforeUndo = store.getState().undoStack.length;

    const result = await generateViewFor(store, {
      focusIds: [assignment],
      name: 'Generated view',
      depth: 1,
      direction: 'both',
      allInternalRelationships: true,
    }, simpleLayout);

    const model = store.getState().model!;
    expect(model.views[result.viewId].name).toBe('Generated view');
    expect(result.elementIds).toEqual(expect.arrayContaining([actor, role, app]));
    expect(result.relationshipIds).toEqual(expect.arrayContaining([assignment, annotation]));
    expect(Object.values(model.nodes).filter((node) => node.viewId === result.viewId)).toHaveLength(3);
    const connections = Object.values(model.connections).filter(
      (connection) => connection.viewId === result.viewId,
    );
    expect(connections).toHaveLength(2);
    const assignmentConnection = connections.find(
      (connection) => connection.relationshipId === assignment,
    )!;
    expect(connections.find((connection) => connection.relationshipId === annotation)?.sourceId)
      .toBe(assignmentConnection.id);
    expect(store.getState().undoStack).toHaveLength(beforeUndo + 1);

    undo(store);
    expect(store.getState().model!.views[result.viewId]).toBeUndefined();
    expect(Object.values(store.getState().model!.nodes).some((node) => node.viewId === result.viewId))
      .toBe(false);
    redo(store);
    expect(store.getState().model!.views[result.viewId]).toBeDefined();
  });

  it('adds otherwise-untraversed internal relationships only when requested', async () => {
    const store = createModelStore({ model: createEmptyModel('Internal') });
    const actor = addElement('BusinessActor', 'Actor', undefined, store);
    const role = addElement('BusinessRole', 'Role', undefined, store);
    const process = addElement('BusinessProcess', 'Process', undefined, store);
    addRelationship('AssignmentRelationship', actor, role, '', undefined, store);
    addRelationship('AssignmentRelationship', actor, process, '', undefined, store);
    const internal = addRelationship(
      'TriggeringRelationship', role, process, '', undefined, store,
    )!;

    const without = await generateViewFor(store, {
      focusIds: [actor], name: 'Without', depth: 1, direction: 'both',
      allInternalRelationships: false,
    }, simpleLayout);
    const withInternal = await generateViewFor(store, {
      focusIds: [actor], name: 'With', depth: 1, direction: 'both',
      allInternalRelationships: true,
    }, simpleLayout);

    expect(without.relationshipIds).not.toContain(internal);
    expect(withInternal.relationshipIds).toContain(internal);
  });

  it('does not mutate when layout fails or the model is read-only', async () => {
    const store = createModelStore({ model: createEmptyModel('Failure') });
    const actor = addElement('BusinessActor', 'Actor', undefined, store);
    const before = structuredClone(store.getState().model);

    await expect(generateViewFor(store, {
      focusIds: [actor], name: 'Broken', depth: 1, direction: 'both',
      allInternalRelationships: false,
    }, async () => { throw new Error('layout failed'); })).rejects.toThrow('layout failed');
    expect(store.getState().model).toEqual(before);

    store.setState({ readOnly: true });
    await expect(generateViewFor(store, {
      focusIds: [actor], name: 'Read only', depth: 1, direction: 'both',
      allInternalRelationships: false,
    }, simpleLayout)).rejects.toThrow('read-only');
    expect(store.getState().model).toEqual(before);
  });
});
