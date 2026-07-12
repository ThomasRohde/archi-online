import { describe, expect, it } from 'vitest';
import * as ops from '../src/model/ops';
import { attachConnection } from '../src/model/ops/draft';
import { createModelStore, undo, type ModelStore } from '../src/model/store';
import type { DiagramConnection, DiagramNode, ModelState } from '../src/model/types';

interface ReconnectionInput {
  connectionId: string;
  end: 'source' | 'target';
  endpointId: string;
}

interface ReconnectionPlan {
  valid: boolean;
  reason?: string;
  scope: 'none' | 'occurrence' | 'semantic';
  input: ReconnectionInput;
  relationshipId?: string;
  previousConceptId?: string;
  nextConceptId?: string;
  changes: Array<{
    connectionId: string;
    viewId: string;
    previousEndpointId: string;
    nextEndpointId: string;
  }>;
  removals: Array<{ connectionId: string; viewId: string }>;
  affectedViews: Array<{
    viewId: string;
    viewName: string;
    reconnectedConnectionIds: string[];
    removedConnectionIds: string[];
  }>;
  requiresConfirmation: boolean;
}

type Analyze = (model: ModelState, input: ReconnectionInput) => ReconnectionPlan;
type Apply = (plan: ReconnectionPlan, store?: ModelStore) => boolean;

function reconnectApi(): { analyze: Analyze; apply: Apply } | null {
  const candidate = ops as typeof ops & {
    analyzeConnectionReconnection?: Analyze;
    applyConnectionReconnection?: Apply;
  };
  expect(candidate.analyzeConnectionReconnection).toBeTypeOf('function');
  expect(candidate.applyConnectionReconnection).toBeTypeOf('function');
  if (!candidate.analyzeConnectionReconnection || !candidate.applyConnectionReconnection) {
    return null;
  }
  return {
    analyze: candidate.analyzeConnectionReconnection,
    apply: candidate.applyConnectionReconnection,
  };
}

function folder(model: ModelState, folderType: 'business' | 'relations' | 'diagrams'): string {
  return model.rootFolderIds.find((id) => model.folders[id]?.folderType === folderType)!;
}

function putElement(
  model: ModelState,
  id: string,
  type: 'BusinessActor' | 'BusinessRole',
): void {
  const folderId = folder(model, 'business');
  model.elements[id] = {
    id,
    kind: 'element',
    type,
    name: id.toUpperCase(),
    documentation: '',
    properties: [],
    profileIds: [],
    folderId,
  };
  model.folders[folderId].itemIds.push(id);
}

function putView(model: ModelState, id: string, name: string): void {
  const folderId = folder(model, 'diagrams');
  model.views[id] = {
    id,
    kind: 'view',
    name,
    documentation: '',
    properties: [],
    folderId,
    childIds: [],
  };
  model.folders[folderId].itemIds.push(id);
}

function putNode(
  model: ModelState,
  id: string,
  viewId: string,
  elementId: string,
  x: number,
): void {
  const node: DiagramNode = {
    id,
    viewId,
    parentId: viewId,
    bounds: { x, y: 0, width: 100, height: 40 },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    nodeType: 'element',
    elementId,
  };
  model.nodes[id] = node;
  model.views[viewId].childIds.push(id);
}

function makeConnection(
  id: string,
  viewId: string,
  sourceId: string,
  targetId: string,
  relationshipId?: string,
): DiagramConnection {
  return {
    id,
    viewId,
    connType: relationshipId ? 'relationship' : 'plain',
    ...(relationshipId ? { relationshipId } : {}),
    name: '',
    documentation: '',
    properties: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    sourceId,
    targetId,
    bendpoints: [],
  };
}

function reconnectionModel(): ModelState {
  const model = ops.createEmptyModel('Reconnection');
  putElement(model, 'a', 'BusinessActor');
  putElement(model, 'b', 'BusinessRole');
  putElement(model, 'c', 'BusinessRole');
  putView(model, 'view-1', 'Current view');
  putView(model, 'view-2', 'Reconcilable view');
  putView(model, 'view-3', 'Unreconcilable view');

  putNode(model, 'a-1', 'view-1', 'a', 0);
  putNode(model, 'b-1', 'view-1', 'b', 200);
  putNode(model, 'b-1-alt', 'view-1', 'b', 400);
  putNode(model, 'c-1', 'view-1', 'c', 600);
  putNode(model, 'a-2', 'view-2', 'a', 0);
  putNode(model, 'b-2', 'view-2', 'b', 200);
  putNode(model, 'c-2', 'view-2', 'c', 400);
  putNode(model, 'a-3', 'view-3', 'a', 0);
  putNode(model, 'b-3', 'view-3', 'b', 200);

  const folderId = folder(model, 'relations');
  model.relationships.rel = {
    id: 'rel',
    kind: 'relationship',
    type: 'AssignmentRelationship',
    name: 'Assigned to',
    documentation: '',
    properties: [],
    profileIds: [],
    folderId,
    sourceId: 'a',
    targetId: 'b',
  };
  model.folders[folderId].itemIds.push('rel');

  attachConnection(model, makeConnection('selected', 'view-1', 'a-1', 'b-1', 'rel'));
  attachConnection(model, makeConnection('same-view', 'view-1', 'a-1', 'b-1-alt', 'rel'));
  attachConnection(model, makeConnection('other-view', 'view-2', 'a-2', 'b-2', 'rel'));
  attachConnection(model, makeConnection('remove-view', 'view-3', 'a-3', 'b-3', 'rel'));
  attachConnection(model, makeConnection('remove-dependent', 'view-3', 'remove-view', 'a-3'));
  return model;
}

function storeFor(model: ModelState, readOnly = false): ModelStore {
  return createModelStore({ model, readOnly, fileName: null });
}

describe('connection reconnection analysis and apply', () => {
  it('reconnects only the selected occurrence when the semantic concept is unchanged', () => {
    const api = reconnectApi();
    if (!api) return;
    const store = storeFor(reconnectionModel());
    const plan = api.analyze(store.getState().model!, {
      connectionId: 'selected',
      end: 'target',
      endpointId: 'b-1-alt',
    });

    expect(plan).toMatchObject({
      valid: true,
      scope: 'occurrence',
      previousConceptId: 'b',
      nextConceptId: 'b',
      requiresConfirmation: false,
    });
    expect(plan.changes.map((change) => change.connectionId)).toEqual(['selected']);
    expect(plan.removals).toEqual([]);
    expect(api.apply(plan, store)).toBe(true);
    expect(store.getState().model!.connections.selected.targetId).toBe('b-1-alt');
    expect(store.getState().model!.connections['same-view'].targetId).toBe('b-1-alt');
    expect(store.getState().model!.relationships.rel.targetId).toBe('b');
  });

  it('preflights a semantic change across views and removes only unreconcilable closure', () => {
    const api = reconnectApi();
    if (!api) return;
    const store = storeFor(reconnectionModel());
    const plan = api.analyze(store.getState().model!, {
      connectionId: 'selected',
      end: 'target',
      endpointId: 'c-1',
    });
    const before = structuredClone(store.getState().model!);

    expect(plan).toMatchObject({
      valid: true,
      scope: 'semantic',
      relationshipId: 'rel',
      previousConceptId: 'b',
      nextConceptId: 'c',
      requiresConfirmation: true,
    });
    expect(plan.changes).toEqual([
      {
        connectionId: 'selected',
        viewId: 'view-1',
        previousEndpointId: 'b-1',
        nextEndpointId: 'c-1',
      },
      {
        connectionId: 'same-view',
        viewId: 'view-1',
        previousEndpointId: 'b-1-alt',
        nextEndpointId: 'c-1',
      },
      {
        connectionId: 'other-view',
        viewId: 'view-2',
        previousEndpointId: 'b-2',
        nextEndpointId: 'c-2',
      },
    ]);
    expect(plan.removals).toEqual([
      { connectionId: 'remove-view', viewId: 'view-3' },
      { connectionId: 'remove-dependent', viewId: 'view-3' },
    ]);
    expect(plan.affectedViews.map((view) => [
      view.viewName,
      view.reconnectedConnectionIds,
      view.removedConnectionIds,
    ])).toEqual([
      ['Current view', ['selected', 'same-view'], []],
      ['Reconcilable view', ['other-view'], []],
      ['Unreconcilable view', [], ['remove-view', 'remove-dependent']],
    ]);

    const beforeUndo = store.getState().undoStack.length;
    expect(api.apply(plan, store)).toBe(true);
    const changed = store.getState().model!;
    expect(changed.relationships.rel.targetId).toBe('c');
    expect(changed.connections.selected.targetId).toBe('c-1');
    expect(changed.connections['same-view'].targetId).toBe('c-1');
    expect(changed.connections['other-view'].targetId).toBe('c-2');
    expect(changed.connections['remove-view']).toBeUndefined();
    expect(changed.connections['remove-dependent']).toBeUndefined();
    expect(store.getState().undoStack).toHaveLength(beforeUndo + 1);
    undo(store);
    expect(store.getState().model).toEqual(before);
  });

  it('supports plain connections and connection endpoints without semantic mutation', () => {
    const api = reconnectApi();
    if (!api) return;
    const model = reconnectionModel();
    attachConnection(model, makeConnection('plain', 'view-1', 'a-1', 'b-1'));
    const store = storeFor(model);
    const plan = api.analyze(model, {
      connectionId: 'plain',
      end: 'source',
      endpointId: 'selected',
    });

    expect(plan).toMatchObject({ valid: true, scope: 'occurrence', requiresConfirmation: false });
    expect(api.apply(plan, store)).toBe(true);
    expect(store.getState().model!.connections.plain.sourceId).toBe('selected');
    expect(store.getState().model!.relationships.rel).toEqual(model.relationships.rel);
  });

  it('reconnects semantic relationship endpoints through relationship connections', () => {
    const api = reconnectApi();
    if (!api) return;
    const model = reconnectionModel();
    const folderId = folder(model, 'relations');
    model.relationships['other-rel'] = {
      id: 'other-rel',
      kind: 'relationship',
      type: 'AssociationRelationship',
      name: 'Other',
      documentation: '',
      properties: [],
      profileIds: [],
      folderId,
      sourceId: 'a',
      targetId: 'c',
    };
    model.relationships['dependent-rel'] = {
      id: 'dependent-rel',
      kind: 'relationship',
      type: 'AssociationRelationship',
      name: 'Dependent',
      documentation: '',
      properties: [],
      profileIds: [],
      folderId,
      sourceId: 'rel',
      targetId: 'c',
    };
    model.folders[folderId].itemIds.push('other-rel', 'dependent-rel');
    attachConnection(
      model,
      makeConnection('other-semantic', 'view-1', 'a-1', 'c-1', 'other-rel'),
    );
    attachConnection(
      model,
      makeConnection('dependent-semantic', 'view-1', 'selected', 'c-1', 'dependent-rel'),
    );
    const store = storeFor(model);

    const local = api.analyze(model, {
      connectionId: 'dependent-semantic',
      end: 'source',
      endpointId: 'same-view',
    });
    expect(local).toMatchObject({
      valid: true,
      scope: 'occurrence',
      previousConceptId: 'rel',
      nextConceptId: 'rel',
    });
    expect(api.apply(local, store)).toBe(true);
    expect(store.getState().model!.relationships['dependent-rel'].sourceId).toBe('rel');
    expect(store.getState().model!.connections['dependent-semantic'].sourceId).toBe('same-view');

    const semantic = api.analyze(store.getState().model!, {
      connectionId: 'dependent-semantic',
      end: 'source',
      endpointId: 'other-semantic',
    });
    expect(semantic).toMatchObject({
      valid: true,
      scope: 'semantic',
      previousConceptId: 'rel',
      nextConceptId: 'other-rel',
    });
    expect(api.apply(semantic, store)).toBe(true);
    expect(store.getState().model!.relationships['dependent-rel'].sourceId).toBe('other-rel');
    expect(store.getState().model!.connections['dependent-semantic'].sourceId).toBe('other-semantic');
  });

  it('rejects cycles and stale plans without mutating the model', () => {
    const api = reconnectApi();
    if (!api) return;
    const model = reconnectionModel();
    const cycle = api.analyze(model, {
      connectionId: 'remove-view',
      end: 'source',
      endpointId: 'remove-dependent',
    });
    expect(cycle.valid).toBe(false);
    expect(cycle.reason).toMatch(/cycle/i);

    const store = storeFor(model);
    const plan = api.analyze(model, {
      connectionId: 'selected',
      end: 'target',
      endpointId: 'c-1',
    });
    const changed = structuredClone(store.getState().model!);
    delete changed.nodes['c-2'];
    store.setState({ model: changed });
    const beforeApply = structuredClone(changed);
    expect(api.apply(plan, store)).toBe(false);
    expect(store.getState().model).toEqual(beforeApply);
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it('honors read-only stores and isolates explicit model stores', () => {
    const api = reconnectApi();
    if (!api) return;
    const first = storeFor(reconnectionModel());
    const second = storeFor(reconnectionModel());
    const readOnly = storeFor(reconnectionModel(), true);
    const input: ReconnectionInput = {
      connectionId: 'selected',
      end: 'target',
      endpointId: 'b-1-alt',
    };

    expect(api.apply(api.analyze(first.getState().model!, input), first)).toBe(true);
    expect(first.getState().model!.connections.selected.targetId).toBe('b-1-alt');
    expect(second.getState().model!.connections.selected.targetId).toBe('b-1');

    const readOnlyBefore = structuredClone(readOnly.getState().model!);
    expect(api.apply(api.analyze(readOnly.getState().model!, input), readOnly)).toBe(false);
    expect(readOnly.getState().model).toEqual(readOnlyBefore);
    expect(readOnly.getState().undoStack).toHaveLength(0);
  });
});
