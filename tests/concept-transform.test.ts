import { describe, expect, it } from 'vitest';
import * as ops from '../src/model/ops';
import { attachConnection } from '../src/model/ops/draft';
import type { RelationshipType } from '../src/model/metamodel';
import { createModelStore, setSelection, undo, type ModelStore } from '../src/model/store';
import type {
  ConceptType,
  DiagramConnection,
  DiagramNode,
  FolderType,
  ModelState,
} from '../src/model/types';

interface ConceptTypeChangeInput {
  conceptIds: string[];
  targetType: ConceptType;
}

interface ConceptTypeChangePlan {
  valid: boolean;
  reason?: string;
  input: ConceptTypeChangeInput;
  kind: 'element' | 'relationship' | 'none';
  changedConceptIds: string[];
  invalidAdjacentRelationshipIds: string[];
  requiresConfirmation: boolean;
}

interface ConceptTypeChangeOptions {
  convertInvalidRelationshipsToAssociation?: boolean;
  addDocumentationNote?: boolean;
}

interface ConceptTypeChangeResult {
  idMap: Record<string, string>;
}

type AnalyzeConceptTypeChange = (
  model: ModelState,
  input: ConceptTypeChangeInput,
) => ConceptTypeChangePlan;
type ApplyConceptTypeChange = (
  plan: ConceptTypeChangePlan,
  options?: ConceptTypeChangeOptions,
  store?: ModelStore,
) => ConceptTypeChangeResult | null;

function transformApi(): {
  analyze: AnalyzeConceptTypeChange;
  apply: ApplyConceptTypeChange;
} | null {
  const candidate = ops as typeof ops & {
    analyzeConceptTypeChange?: AnalyzeConceptTypeChange;
    applyConceptTypeChange?: ApplyConceptTypeChange;
  };
  expect(candidate.analyzeConceptTypeChange).toBeTypeOf('function');
  expect(candidate.applyConceptTypeChange).toBeTypeOf('function');
  if (!candidate.analyzeConceptTypeChange || !candidate.applyConceptTypeChange) return null;
  return {
    analyze: candidate.analyzeConceptTypeChange,
    apply: candidate.applyConceptTypeChange,
  };
}

function folder(model: ModelState, type: FolderType): string {
  return model.rootFolderIds.find((id) => model.folders[id]?.folderType === type)!;
}

function putElement(
  model: ModelState,
  id: string,
  type: 'BusinessActor' | 'BusinessRole' | 'BusinessObject' | 'DataObject' | 'Junction',
  folderId = folder(
    model,
    type === 'Junction' ? 'other' : type === 'DataObject' ? 'application' : 'business',
  ),
): void {
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
  type: RelationshipType,
  sourceId: string,
  targetId: string,
  folderId = folder(model, 'relations'),
): void {
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

function putView(model: ModelState, id = 'view'): void {
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

function putNode(model: ModelState, id: string, elementId: string, x: number): void {
  const node: DiagramNode = {
    id,
    viewId: 'view',
    parentId: 'view',
    bounds: { x, y: 0, width: 120, height: 55 },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    nodeType: 'element',
    elementId,
  };
  model.nodes[id] = node;
  model.views.view.childIds.push(id);
}

function putConnection(
  model: ModelState,
  id: string,
  relationshipId: string,
  sourceId: string,
  targetId: string,
): void {
  const connection: DiagramConnection = {
    id,
    viewId: 'view',
    connType: 'relationship',
    relationshipId,
    name: id,
    documentation: '',
    properties: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    sourceId,
    targetId,
    bendpoints: [],
  };
  attachConnection(model, connection);
}

describe('concept type transformations', () => {
  it('replaces an element with a fresh ID while preserving generic metadata order', () => {
    const api = transformApi();
    if (!api) return;
    const model = ops.createEmptyModel('Transform');
    const folderId = folder(model, 'business');
    model.elements.actor = {
      id: 'actor',
      kind: 'element',
      type: 'BusinessActor',
      name: 'Customer',
      documentation: 'Original documentation',
      properties: [
        { key: 'second', value: '2' },
        { key: 'first', value: '1' },
      ],
      profileIds: [],
      folderId,
    };
    model.folders[folderId].itemIds.push('actor');
    const store = createModelStore({ model, fileName: null });

    const plan = api.analyze(model, {
      conceptIds: ['actor'],
      targetType: 'BusinessRole',
    });
    expect(plan).toMatchObject({
      valid: true,
      kind: 'element',
      changedConceptIds: ['actor'],
      invalidAdjacentRelationshipIds: [],
      requiresConfirmation: false,
    });

    const result = api.apply(plan, {}, store);
    expect(result).not.toBeNull();
    const replacementId = result!.idMap.actor;
    expect(replacementId).toBeTypeOf('string');
    expect(replacementId).not.toBe('actor');
    expect(store.getState().model!.elements.actor).toBeUndefined();
    expect(store.getState().model!.elements[replacementId]).toMatchObject({
      id: replacementId,
      type: 'BusinessRole',
      name: 'Customer',
      documentation: 'Original documentation',
      properties: [
        { key: 'second', value: '2' },
        { key: 'first', value: '1' },
      ],
    });
  });

  it('keeps a compatible subfolder, clears specialization and type fields, and resets figures', () => {
    const api = transformApi();
    if (!api) return;
    const model = ops.createEmptyModel('Compatible folder');
    const businessId = folder(model, 'business');
    model.folders.custom = {
      id: 'custom',
      kind: 'folder',
      name: 'Custom',
      documentation: '',
      properties: [],
      parentId: businessId,
      folderIds: [],
      itemIds: [],
    };
    model.folders[businessId].folderIds.push('custom');
    model.profiles.actor = {
      id: 'actor-profile',
      name: 'External',
      conceptType: 'BusinessActor',
      specialization: true,
    };
    putElement(model, 'actor', 'BusinessActor', 'custom');
    model.elements.actor.profileIds = ['actor-profile'];
    const withTypeField = model.elements.actor as typeof model.elements.actor & {
      junctionType?: 'and' | 'or';
      features?: Array<{ name: string; value: string }>;
    };
    withTypeField.junctionType = 'or';
    withTypeField.features = [{ name: 'generic', value: 'preserved' }];
    putView(model);
    putNode(model, 'actor-node', 'actor', 0);
    if (model.nodes['actor-node'].nodeType === 'element') {
      model.nodes['actor-node'].figureType = 1;
    }
    const store = createModelStore({ model, fileName: null });

    const result = api.apply(api.analyze(model, {
      conceptIds: ['actor'],
      targetType: 'BusinessRole',
    }), {}, store)!;
    const replacementId = result.idMap.actor;
    const replacement = store.getState().model!.elements[replacementId] as typeof withTypeField;

    expect(replacement.folderId).toBe('custom');
    expect(store.getState().model!.folders.custom.itemIds.at(-1)).toBe(replacementId);
    expect(replacement.profileIds).toEqual([]);
    expect(replacement.junctionType).toBeUndefined();
    expect(replacement.features).toEqual([{ name: 'generic', value: 'preserved' }]);
    expect(store.getState().model!.nodes['actor-node']).toMatchObject({ elementId: replacementId });
    const changedNode = store.getState().model!.nodes['actor-node'];
    expect(changedNode.nodeType === 'element' ? changedNode.figureType : null).toBeUndefined();
  });

  it('moves an element to its new default folder when the current subfolder is incompatible', () => {
    const api = transformApi();
    if (!api) return;
    const model = ops.createEmptyModel('Move folder');
    putElement(model, 'actor', 'BusinessActor');
    const store = createModelStore({ model, fileName: null });

    const result = api.apply(api.analyze(model, {
      conceptIds: ['actor'],
      targetType: 'ApplicationComponent',
    }), {}, store)!;
    const replacementId = result.idMap.actor;

    expect(store.getState().model!.elements[replacementId].folderId).toBe(
      folder(store.getState().model!, 'application'),
    );
  });

  it('rewires relationship endpoints, relationship occurrences, and tree selection through one ID map', () => {
    const api = transformApi();
    if (!api) return;
    const model = ops.createEmptyModel('Relationship replacement');
    putElement(model, 'actor', 'BusinessActor');
    putElement(model, 'role', 'BusinessRole');
    putRelationship(model, 'base', 'AccessRelationship', 'actor', 'role');
    model.relationships.base.documentation = 'Base docs';
    model.relationships.base.properties = [
      { key: 'z', value: 'last' },
      { key: 'a', value: 'first' },
    ];
    model.relationships.base.accessType = 3;
    model.profiles.access = {
      id: 'access',
      name: 'Reads and writes',
      conceptType: 'AccessRelationship',
      specialization: true,
    };
    model.relationships.base.profileIds = ['access'];
    putRelationship(model, 'dependent', 'AssociationRelationship', 'base', 'role');
    putView(model);
    putNode(model, 'actor-node', 'actor', 0);
    putNode(model, 'role-node', 'role', 300);
    putConnection(model, 'base-connection', 'base', 'actor-node', 'role-node');
    putConnection(model, 'dependent-connection', 'dependent', 'base-connection', 'role-node');
    const store = createModelStore({ model, fileName: null });
    setSelection('tree', ['base', 'actor'], store);

    const result = api.apply(api.analyze(model, {
      conceptIds: ['base'],
      targetType: 'AssociationRelationship',
    }), {}, store)!;
    const replacementId = result.idMap.base;
    const changed = store.getState().model!;

    expect(replacementId).not.toBe('base');
    expect(changed.relationships.base).toBeUndefined();
    expect(changed.relationships[replacementId]).toMatchObject({
      type: 'AssociationRelationship',
      documentation: 'Base docs',
      properties: [
        { key: 'z', value: 'last' },
        { key: 'a', value: 'first' },
      ],
      profileIds: [],
    });
    expect(changed.relationships[replacementId].accessType).toBeUndefined();
    expect(changed.relationships.dependent.sourceId).toBe(replacementId);
    expect(changed.connections['base-connection'].relationshipId).toBe(replacementId);
    expect(changed.connections['dependent-connection'].sourceId).toBe('base-connection');
    expect(store.getState().selection).toEqual({ source: 'tree', ids: [replacementId, 'actor'] });
  });

  it('evaluates a complete relationship multi-selection before Junction legality', () => {
    const api = transformApi();
    if (!api) return;
    const model = ops.createEmptyModel('Final state');
    putElement(model, 'actor', 'BusinessActor');
    putElement(model, 'junction', 'Junction');
    putElement(model, 'role', 'BusinessRole');
    putRelationship(model, 'left', 'AssociationRelationship', 'actor', 'junction');
    putRelationship(model, 'right', 'AssociationRelationship', 'junction', 'role');

    expect(api.analyze(model, {
      conceptIds: ['left'],
      targetType: 'FlowRelationship',
    })).toMatchObject({ valid: false });
    expect(api.analyze(model, {
      conceptIds: ['left', 'right'],
      targetType: 'FlowRelationship',
    })).toMatchObject({
      valid: true,
      changedConceptIds: ['left', 'right'],
      invalidAdjacentRelationshipIds: [],
    });
  });

  it('previews invalid adjacent relationships and converts them to Association only when confirmed', () => {
    const api = transformApi();
    if (!api) return;
    const model = ops.createEmptyModel('Invalid adjacent');
    putElement(model, 'actor', 'BusinessActor');
    putElement(model, 'role', 'BusinessRole');
    putRelationship(model, 'assignment', 'AssignmentRelationship', 'actor', 'role');
    model.relationships.assignment.documentation = 'Existing relationship documentation';
    const store = createModelStore({ model, fileName: null });
    setSelection('tree', ['actor', 'assignment'], store);
    const plan = api.analyze(model, {
      conceptIds: ['actor'],
      targetType: 'BusinessObject',
    });

    expect(plan).toMatchObject({
      valid: true,
      invalidAdjacentRelationshipIds: ['assignment'],
      requiresConfirmation: true,
    });
    const before = structuredClone(store.getState().model!);
    expect(api.apply(plan, {}, store)).toBeNull();
    expect(store.getState().model).toEqual(before);

    const result = api.apply(plan, {
      convertInvalidRelationshipsToAssociation: true,
      addDocumentationNote: true,
    }, store)!;
    const replacementElementId = result.idMap.actor;
    const replacementRelationshipId = result.idMap.assignment;
    expect(store.getState().model!.relationships[replacementRelationshipId]).toMatchObject({
      type: 'AssociationRelationship',
      sourceId: replacementElementId,
      targetId: 'role',
      documentation: '(Changed from Assignment)\n\nExisting relationship documentation',
    });
    expect(store.getState().selection.ids).toEqual([
      replacementElementId,
      replacementRelationshipId,
    ]);
  });

  it('reconciles every newly invalid relationship across an affected Junction', () => {
    const api = transformApi();
    if (!api) return;
    const model = ops.createEmptyModel('Junction reconciliation');
    putElement(model, 'actor', 'BusinessActor');
    putElement(model, 'junction', 'Junction');
    putElement(model, 'role', 'BusinessRole');
    putRelationship(model, 'left', 'AssignmentRelationship', 'actor', 'junction');
    putRelationship(model, 'right', 'AssignmentRelationship', 'junction', 'role');
    const store = createModelStore({ model, fileName: null });

    const plan = api.analyze(model, {
      conceptIds: ['actor'],
      targetType: 'BusinessObject',
    });
    expect(plan).toMatchObject({
      valid: true,
      invalidAdjacentRelationshipIds: ['left', 'right'],
      requiresConfirmation: true,
    });

    const result = api.apply(plan, {
      convertInvalidRelationshipsToAssociation: true,
    }, store);
    expect(result).not.toBeNull();
    const changed = store.getState().model!;
    expect(Object.values(changed.relationships)).toHaveLength(2);
    expect(Object.values(changed.relationships).every(
      (relationship) => ops.isRelationshipLegalInModel(changed, relationship),
    )).toBe(true);
  });

  it('reconciles a pre-existing invalid relationship adjacent to the changed element', () => {
    const api = transformApi();
    if (!api) return;
    const model = ops.createEmptyModel('Imported invalid relationship');
    putElement(model, 'passive', 'BusinessObject');
    putElement(model, 'role', 'BusinessRole');
    putRelationship(model, 'invalid', 'AssignmentRelationship', 'passive', 'role');
    putElement(model, 'unrelated-passive', 'BusinessObject');
    putElement(model, 'unrelated-role', 'BusinessRole');
    putRelationship(
      model,
      'unrelated-invalid',
      'AssignmentRelationship',
      'unrelated-passive',
      'unrelated-role',
    );
    const store = createModelStore({ model, fileName: null });

    const plan = api.analyze(model, {
      conceptIds: ['passive'],
      targetType: 'DataObject',
    });
    expect(plan).toMatchObject({
      valid: true,
      invalidAdjacentRelationshipIds: ['invalid'],
      requiresConfirmation: true,
    });

    const result = api.apply(plan, {
      convertInvalidRelationshipsToAssociation: true,
    }, store);
    expect(result).not.toBeNull();
    const changed = store.getState().model!;
    const converted = changed.relationships[result!.idMap.invalid];
    expect(converted.type).toBe('AssociationRelationship');
    expect(ops.isRelationshipLegalInModel(
      changed,
      converted,
    )).toBe(true);
    expect(changed.relationships['unrelated-invalid'].type).toBe('AssignmentRelationship');
  });

  it('is one undoable action, preserves adjacent documentation by default, and honors read-only stores', () => {
    const api = transformApi();
    if (!api) return;
    const model = ops.createEmptyModel('Atomic');
    putElement(model, 'actor', 'BusinessActor');
    putElement(model, 'role', 'BusinessRole');
    putRelationship(model, 'assignment', 'AssignmentRelationship', 'actor', 'role');
    model.relationships.assignment.documentation = 'Keep me';
    const store = createModelStore({ model, fileName: null });
    const before = structuredClone(model);
    const plan = api.analyze(model, {
      conceptIds: ['actor'],
      targetType: 'BusinessObject',
    });

    expect(api.apply(plan, { convertInvalidRelationshipsToAssociation: true }, store)).not.toBeNull();
    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0].label).toBe('Set Concept Type');
    const association = Object.values(store.getState().model!.relationships)[0];
    expect(association.documentation).toBe('Keep me');
    undo(store);
    expect(store.getState().model).toEqual(before);

    const readOnly = createModelStore({ model: structuredClone(model), fileName: null, readOnly: true });
    expect(api.apply(api.analyze(readOnly.getState().model!, plan.input), {
      convertInvalidRelationshipsToAssociation: true,
    }, readOnly)).toBeNull();
    expect(readOnly.getState().model).toEqual(model);
    expect(readOnly.getState().undoStack).toHaveLength(0);
  });

  it('isolates explicit stores', () => {
    const api = transformApi();
    if (!api) return;
    const firstModel = ops.createEmptyModel('First');
    const secondModel = ops.createEmptyModel('Second');
    putElement(firstModel, 'actor', 'BusinessActor');
    putElement(secondModel, 'actor', 'BusinessActor');
    const first = createModelStore({ model: firstModel, fileName: null });
    const second = createModelStore({ model: secondModel, fileName: null });

    expect(api.apply(api.analyze(firstModel, {
      conceptIds: ['actor'],
      targetType: 'BusinessRole',
    }), {}, first)).not.toBeNull();
    expect(Object.values(first.getState().model!.elements)[0].type).toBe('BusinessRole');
    expect(second.getState().model!.elements.actor.type).toBe('BusinessActor');
  });
});
