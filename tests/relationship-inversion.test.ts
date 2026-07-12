import { describe, expect, it } from 'vitest';
import * as ops from '../src/model/ops';
import { attachConnection } from '../src/model/ops/draft';
import { createModelStore, undo, type ModelStore } from '../src/model/store';
import type { DiagramConnection, DiagramNode, FolderType, ModelState } from '../src/model/types';

interface RelationshipInversionInput {
  ids: string[];
}

interface RelationshipInversionPlan {
  valid: boolean;
  reason?: string;
  input: RelationshipInversionInput;
  relationshipIds: string[];
  occurrenceIds: string[];
}

type AnalyzeRelationshipInversion = (
  model: ModelState,
  input: RelationshipInversionInput,
) => RelationshipInversionPlan;
type ApplyRelationshipInversion = (
  plan: RelationshipInversionPlan,
  store?: ModelStore,
) => boolean;

function inversionApi(): {
  analyze: AnalyzeRelationshipInversion;
  apply: ApplyRelationshipInversion;
} | null {
  const candidate = ops as typeof ops & {
    analyzeRelationshipInversion?: AnalyzeRelationshipInversion;
    applyRelationshipInversion?: ApplyRelationshipInversion;
  };
  expect(candidate.analyzeRelationshipInversion).toBeTypeOf('function');
  expect(candidate.applyRelationshipInversion).toBeTypeOf('function');
  if (!candidate.analyzeRelationshipInversion || !candidate.applyRelationshipInversion) {
    return null;
  }
  return {
    analyze: candidate.analyzeRelationshipInversion,
    apply: candidate.applyRelationshipInversion,
  };
}

function folder(model: ModelState, type: FolderType): string {
  return model.rootFolderIds.find((id) => model.folders[id]?.folderType === type)!;
}

function putElement(model: ModelState, id: string, type: 'BusinessActor' | 'BusinessRole'): void {
  const folderId = folder(model, 'business');
  model.elements[id] = {
    id,
    kind: 'element',
    type,
    name: id,
    documentation: '',
    properties: [],
    profileIds: [],
    folderId,
  };
  model.folders[folderId].itemIds.push(id);
}

function putRelationship(
  model: ModelState,
  id: string,
  type: 'AssociationRelationship' | 'AssignmentRelationship',
  sourceId: string,
  targetId: string,
): void {
  const folderId = folder(model, 'relations');
  model.relationships[id] = {
    id,
    kind: 'relationship',
    type,
    name: id,
    documentation: '',
    properties: [],
    profileIds: [],
    folderId,
    sourceId,
    targetId,
  };
  model.folders[folderId].itemIds.push(id);
}

function putView(model: ModelState, id: string): void {
  const folderId = folder(model, 'diagrams');
  model.views[id] = {
    id,
    kind: 'view',
    name: id,
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

function putConnection(
  model: ModelState,
  connection: Pick<DiagramConnection, 'id' | 'viewId' | 'sourceId' | 'targetId'> &
    Partial<DiagramConnection>,
): void {
  attachConnection(model, {
    connType: connection.relationshipId ? 'relationship' : 'plain',
    name: '',
    documentation: '',
    properties: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    bendpoints: [],
    ...connection,
  } as DiagramConnection);
}

function inversionModel(): ModelState {
  const model = ops.createEmptyModel('Invert');
  putElement(model, 'actor', 'BusinessActor');
  putElement(model, 'role', 'BusinessRole');
  putRelationship(model, 'rel', 'AssociationRelationship', 'actor', 'role');
  putRelationship(model, 'dependent-rel', 'AssociationRelationship', 'rel', 'actor');
  putView(model, 'view-1');
  putView(model, 'view-2');
  putNode(model, 'actor-1', 'view-1', 'actor', 0);
  putNode(model, 'role-1', 'view-1', 'role', 300);
  putNode(model, 'actor-2', 'view-2', 'actor', 0);
  putNode(model, 'role-2', 'view-2', 'role', 300);
  putConnection(model, {
    id: 'occurrence-1',
    viewId: 'view-1',
    relationshipId: 'rel',
    sourceId: 'actor-1',
    targetId: 'role-1',
    textPosition: 0,
    bendpoints: [
      { startX: 1, startY: 2, endX: 3, endY: 4 },
      { startX: 5, startY: 6, endX: 7, endY: 8 },
    ],
  });
  putConnection(model, {
    id: 'dependent-occurrence',
    viewId: 'view-1',
    relationshipId: 'dependent-rel',
    sourceId: 'occurrence-1',
    targetId: 'actor-1',
  });
  putConnection(model, {
    id: 'occurrence-2',
    viewId: 'view-2',
    relationshipId: 'rel',
    sourceId: 'actor-2',
    targetId: 'role-2',
    textPosition: 2,
    bendpoints: [{ startX: -1, startY: -2, endX: -3, endY: -4 }],
  });
  return model;
}

describe('relationship inversion', () => {
  it('keeps the semantic ID and inverts every route and endpoint exactly once', () => {
    const api = inversionApi();
    if (!api) return;
    const model = inversionModel();
    const store = createModelStore({ model, fileName: null });
    const before = structuredClone(model);
    const plan = api.analyze(model, {
      ids: ['rel', 'occurrence-1', 'occurrence-2', 'occurrence-1'],
    });

    expect(plan).toEqual({
      valid: true,
      input: { ids: ['rel', 'occurrence-1', 'occurrence-2'] },
      relationshipIds: ['rel'],
      occurrenceIds: ['occurrence-1', 'occurrence-2'],
    });
    expect(api.apply(plan, store)).toBe(true);
    const changed = store.getState().model!;

    expect(changed.relationships.rel).toMatchObject({
      id: 'rel',
      sourceId: 'role',
      targetId: 'actor',
    });
    expect(changed.relationships['dependent-rel'].sourceId).toBe('rel');
    expect(changed.connections['occurrence-1']).toMatchObject({
      sourceId: 'role-1',
      targetId: 'actor-1',
      textPosition: 2,
      bendpoints: [
        { startX: 7, startY: 8, endX: 5, endY: 6 },
        { startX: 3, startY: 4, endX: 1, endY: 2 },
      ],
      sourceConnectionIds: ['dependent-occurrence'],
    });
    expect(changed.connections['occurrence-2']).toMatchObject({
      sourceId: 'role-2',
      targetId: 'actor-2',
      textPosition: 0,
      bendpoints: [{ startX: -3, startY: -4, endX: -1, endY: -2 }],
    });
    expect(changed.connections['dependent-occurrence'].sourceId).toBe('occurrence-1');
    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0].label).toBe('Invert Connection Direction');
    undo(store);
    expect(store.getState().model).toEqual(before);
  });

  it('leaves middle and unspecified text positions unchanged', () => {
    const api = inversionApi();
    if (!api) return;
    const model = inversionModel();
    model.connections['occurrence-1'].textPosition = 1;
    delete model.connections['occurrence-2'].textPosition;
    const store = createModelStore({ model, fileName: null });

    expect(api.apply(api.analyze(model, { ids: ['rel'] }), store)).toBe(true);
    expect(store.getState().model!.connections['occurrence-1'].textPosition).toBe(1);
    expect(store.getState().model!.connections['occurrence-2'].textPosition).toBeUndefined();
  });

  it('rejects an illegal reverse without mutation', () => {
    const api = inversionApi();
    if (!api) return;
    const model = ops.createEmptyModel('Illegal');
    putElement(model, 'actor', 'BusinessActor');
    putElement(model, 'role', 'BusinessRole');
    putRelationship(model, 'assignment', 'AssignmentRelationship', 'actor', 'role');
    const store = createModelStore({ model, fileName: null });

    const plan = api.analyze(model, { ids: ['assignment'] });
    expect(plan).toMatchObject({ valid: false, relationshipIds: ['assignment'] });
    expect(plan.reason).toMatch(/not legal/i);
    expect(api.apply(plan, store)).toBe(false);
    expect(store.getState().model).toEqual(model);
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it('honors read-only stores and isolates explicit stores', () => {
    const api = inversionApi();
    if (!api) return;
    const firstModel = inversionModel();
    const secondModel = inversionModel();
    const first = createModelStore({ model: firstModel, fileName: null });
    const second = createModelStore({ model: secondModel, fileName: null });
    const readOnly = createModelStore({
      model: inversionModel(),
      fileName: null,
      readOnly: true,
    });

    expect(api.apply(api.analyze(firstModel, { ids: ['rel'] }), first)).toBe(true);
    expect(first.getState().model!.relationships.rel.sourceId).toBe('role');
    expect(second.getState().model!.relationships.rel.sourceId).toBe('actor');

    const before = structuredClone(readOnly.getState().model!);
    expect(api.apply(api.analyze(before, { ids: ['rel'] }), readOnly)).toBe(false);
    expect(readOnly.getState().model).toEqual(before);
    expect(readOnly.getState().undoStack).toHaveLength(0);
  });
});
