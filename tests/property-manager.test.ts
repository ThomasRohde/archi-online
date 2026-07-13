import { beforeEach, describe, expect, it } from 'vitest';
import {
  capturePropertyManagerSession,
  displayPropertyKey,
  inspectPropertyUsage,
  previewPropertyDelete,
  previewPropertyRename,
  preparePropertyNavigation,
  type PropertyMutationPreview,
} from '../src/model/property-manager';
import {
  deletePropertyKey,
  renamePropertyKey,
} from '../src/model/ops';
import {
  createModelStore,
  openView,
  redo,
  replaceModel,
  setSelection,
  undo,
} from '../src/model/store';
import type { DiagramConnection, ModelState, Property } from '../src/model/types';
import {
  activateModelSession,
  addModelSession,
  getModelSession,
  removeModelSession,
  resetWorkspaceForTests,
  setModelSessionFileHandle,
} from '../src/model/workspace';

function fixture(): ModelState {
  return {
    info: {
      id: 'model',
      name: 'Property ledger',
      documentation: '',
      properties: [
        { key: 'shared', value: 'model value' },
        { key: '', value: 'blank value' },
      ],
      metadata: [],
    },
    profiles: {},
    assets: {},
    rootFolderIds: ['business-folder', 'views-folder'],
    folders: {
      'business-folder': {
        id: 'business-folder',
        kind: 'folder',
        name: 'Business',
        documentation: '',
        properties: [
          { key: 'shared', value: 'folder value' },
          { key: 'duplicate', value: 'folder duplicate' },
        ],
        parentId: null,
        folderIds: ['nested-folder'],
        itemIds: ['element'],
      },
      'nested-folder': {
        id: 'nested-folder',
        kind: 'folder',
        name: 'Nested',
        documentation: '',
        properties: [{ key: 'Case', value: 'upper' }],
        parentId: 'business-folder',
        folderIds: [],
        itemIds: [],
      },
      'views-folder': {
        id: 'views-folder',
        kind: 'folder',
        name: 'Views',
        documentation: '',
        properties: [{ key: 'case', value: 'lower' }],
        parentId: null,
        folderIds: [],
        itemIds: ['relationship', 'view'],
      },
    },
    elements: {
      element: {
        id: 'element',
        kind: 'element',
        type: 'BusinessActor',
        name: 'Actor',
        documentation: '',
        properties: [
          { key: 'shared', value: 'element value' },
          { key: 'duplicate', value: 'same' },
          { key: 'duplicate', value: 'same' },
        ],
        profileIds: [],
        folderId: 'business-folder',
      },
    },
    relationships: {
      relationship: {
        id: 'relationship',
        kind: 'relationship',
        type: 'AssociationRelationship',
        name: 'Rel',
        documentation: '',
        properties: [{ key: 'shared', value: 'relationship value' }],
        profileIds: [],
        folderId: 'views-folder',
        sourceId: 'element',
        targetId: 'element',
      },
    },
    views: {
      view: {
        id: 'view',
        kind: 'view',
        name: 'Landscape',
        documentation: '',
        properties: [{ key: 'shared', value: 'view value' }],
        folderId: 'views-folder',
        childIds: ['group'],
      },
    },
    nodes: {
      group: {
        id: 'group',
        nodeType: 'group',
        viewId: 'view',
        parentId: 'view',
        name: 'Boundary',
        documentation: '',
        properties: [{ key: 'shared', value: 'group value' }],
        bounds: { x: 10, y: 10, width: 300, height: 220 },
        childIds: ['note', 'legend'],
        sourceConnectionIds: [],
        targetConnectionIds: [],
      },
      note: {
        id: 'note',
        nodeType: 'note',
        viewId: 'view',
        parentId: 'group',
        content: 'Note',
        properties: [{ key: 'shared', value: 'note value' }],
        bounds: { x: 10, y: 10, width: 120, height: 60 },
        childIds: [],
        sourceConnectionIds: ['plain'],
        targetConnectionIds: [],
      },
      legend: {
        id: 'legend',
        nodeType: 'note',
        viewId: 'view',
        parentId: 'group',
        name: 'Legend',
        content: '',
        properties: [{ key: 'shared', value: 'legend value' }],
        legendOptions: {
          displayElements: true,
          displayRelations: true,
          displaySpecializationElements: true,
          displaySpecializationRelations: true,
          rowsPerColumn: 15,
          widthOffset: 0,
          colorScheme: 1,
          sortMethod: 1,
        },
        bounds: { x: 150, y: 10, width: 120, height: 60 },
        childIds: [],
        sourceConnectionIds: [],
        targetConnectionIds: ['plain'],
      },
    },
    connections: {
      plain: {
        id: 'plain',
        connType: 'plain',
        viewId: 'view',
        name: 'Explanation',
        documentation: '',
        properties: [{ key: 'shared', value: 'plain value' }],
        sourceId: 'note',
        targetId: 'legend',
        sourceConnectionIds: [],
        targetConnectionIds: [],
        bendpoints: [],
      },
      'visual-relationship': {
        id: 'visual-relationship',
        connType: 'relationship',
        relationshipId: 'relationship',
        viewId: 'view',
        name: '',
        documentation: '',
        properties: [{ key: 'must-not-appear', value: 'diagram relationship property' }],
        sourceId: 'note',
        targetId: 'legend',
        sourceConnectionIds: [],
        targetConnectionIds: [],
        bendpoints: [],
      },
    },
  };
}

function orderedPlainConnection(
  id: string,
  sourceId: string,
  targetId: string,
): DiagramConnection {
  return {
    id,
    connType: 'plain',
    viewId: 'view',
    name: id,
    documentation: '',
    properties: [{ key: 'connection-order', value: id }],
    sourceId,
    targetId,
    sourceConnectionIds: [],
    targetConnectionIds: [],
    bendpoints: [],
  };
}

beforeEach(() => resetWorkspaceForTests());

describe('global property inspection', () => {
  it('enumerates exact keys and duplicate occurrences in normalized model/tree/view order', () => {
    const capture = capturePropertyManagerSession(createModelStore({ model: fixture() }));
    const usage = inspectPropertyUsage(capture);

    expect(usage.map((entry) => entry.key)).toEqual([
      'shared',
      '',
      'duplicate',
      'Case',
      'case',
    ]);
    const shared = usage[0];
    expect(shared).toMatchObject({
      key: 'shared',
      displayKey: 'shared',
      occurrenceCount: 9,
      ownerCount: 9,
    });
    expect(shared.occurrences.map((entry) => entry.ownerKind)).toEqual([
      'model',
      'folder',
      'element',
      'relationship',
      'view',
      'group',
      'note',
      'note',
      'plain-connection',
    ]);
    expect(shared.occurrences.map((entry) => entry.value)).toEqual([
      'model value',
      'folder value',
      'element value',
      'relationship value',
      'view value',
      'group value',
      'note value',
      'legend value',
      'plain value',
    ]);
    expect(shared.occurrences.map((entry) => entry.id)).toEqual([
      'model:model:0',
      'folder:business-folder:0',
      'element:element:0',
      'relationship:relationship:0',
      'view:view:0',
      'group:group:0',
      'note:note:0',
      'note:legend:0',
      'plain-connection:plain:0',
    ]);
    expect(shared.occurrences.map((entry) => entry.ownerType)).toEqual([
      'Model', 'Folder', 'Business Actor', 'Association', 'View', 'Group', 'Note', 'Legend',
      'Plain Connection',
    ]);
    expect(shared.occurrences.every((entry) => entry.location.length > 0)).toBe(true);
    expect(shared.occurrences.at(-1)?.navigation).toEqual({
      kind: 'view',
      viewId: 'view',
      objectId: 'plain',
    });
    expect(usage.find((entry) => entry.key === 'duplicate')).toMatchObject({
      occurrenceCount: 3,
      ownerCount: 2,
      occurrences: [
        expect.objectContaining({ value: 'folder duplicate', propertyIndex: 1 }),
        expect.objectContaining({ value: 'same', propertyIndex: 1 }),
        expect.objectContaining({ value: 'same', propertyIndex: 2 }),
      ],
    });
    expect(usage.some((entry) => entry.key === 'must-not-appear')).toBe(false);
    expect(displayPropertyKey('')).toBe('(blank)');
    expect(displayPropertyKey('(blank)')).toBe('"(blank)"');
    expect(displayPropertyKey(' ')).toBe('" "');
    expect(displayPropertyKey('\t')).toBe('"\\t"');
    expect(Object.isFrozen(usage)).toBe(true);
    expect(Object.isFrozen(shared.occurrences)).toBe(true);
    expect(Object.isFrozen(shared.occurrences[0])).toBe(true);
  });

  it('keeps exact case-sensitive key identities and searches blank keys by their display label', () => {
    const capture = capturePropertyManagerSession(createModelStore({ model: fixture() }));

    expect(inspectPropertyUsage(capture, 'case').map((entry) => entry.key)).toEqual(['Case', 'case']);
    expect(inspectPropertyUsage(capture, 'BLANK').map((entry) => entry.key)).toEqual(['']);
    expect(inspectPropertyUsage(capture, 'shared').map((entry) => entry.key)).toEqual(['shared']);
  });

  it('orders plain connections by native adjacency topology before deterministic orphans', () => {
    const model = fixture();
    const orphan = orderedPlainConnection('orphan', 'missing-source', 'missing-target');
    const nested = orderedPlainConnection('nested', 'dependent', 'legend');
    const second = orderedPlainConnection('second', 'note', 'legend');
    const dependent = orderedPlainConnection('dependent', 'first', 'legend');
    const first = orderedPlainConnection('first', 'note', 'legend');
    first.sourceConnectionIds = ['dependent'];
    dependent.sourceConnectionIds = ['nested'];
    model.connections = { orphan, nested, second, dependent, first };
    model.nodes.note.sourceConnectionIds = ['first', 'second'];
    model.nodes.legend.targetConnectionIds = ['second', 'nested', 'dependent', 'first'];

    const usage = inspectPropertyUsage(
      capturePropertyManagerSession(createModelStore({ model })),
    ).find((entry) => entry.key === 'connection-order')!;

    expect(usage.occurrences.map((entry) => entry.ownerId)).toEqual([
      'first',
      'dependent',
      'nested',
      'second',
      'orphan',
    ]);
  });
});

describe('global property mutations', () => {
  it('renames exact matching keys in place with a mandatory immutable preview and one undo', () => {
    const store = createModelStore({ model: fixture() });
    const capture = capturePropertyManagerSession(store);
    expect(() => renamePropertyKey(undefined)).toThrow('Preview is required.');

    const preview = previewPropertyRename(capture, 'shared', 'renamed');
    expect(preview).toMatchObject({ valid: true, operation: 'rename', key: 'shared', newKey: 'renamed' });
    expect(preview.occurrences).toHaveLength(9);
    expect(Object.isFrozen(preview)).toBe(true);
    expect(Object.isFrozen(preview.occurrences)).toBe(true);
    expect(renamePropertyKey(preview)).toBe(9);

    const model = store.getState().model!;
    expect(model.info.properties).toEqual([
      { key: 'renamed', value: 'model value' },
      { key: '', value: 'blank value' },
    ]);
    expect(model.elements.element.properties).toEqual([
      { key: 'renamed', value: 'element value' },
      { key: 'duplicate', value: 'same' },
      { key: 'duplicate', value: 'same' },
    ]);
    expect(store.getState().undoStack.map((entry) => entry.label)).toEqual(['Rename Property Key']);
    undo(store);
    expect(store.getState().model!.info.properties[0].key).toBe('shared');
    redo(store);
    expect(store.getState().model!.info.properties[0].key).toBe('renamed');
  });

  it('requires explicit collision acknowledgement and never merges duplicate rows', () => {
    const store = createModelStore({ model: fixture() });
    const capture = capturePropertyManagerSession(store);
    const warning = previewPropertyRename(capture, 'shared', 'duplicate');

    expect(warning).toMatchObject({
      valid: true,
      collision: true,
      collisionAcknowledged: false,
    });
    expect(warning.warning).toContain('duplicate');
    expect(() => renamePropertyKey(warning)).toThrow('Collision acknowledgement is required.');
    expect(store.getState().undoStack).toEqual([]);

    const accepted = previewPropertyRename(capture, 'shared', 'duplicate', true);
    expect(renamePropertyKey(accepted)).toBe(9);
    expect(store.getState().model!.elements.element.properties).toEqual([
      { key: 'duplicate', value: 'element value' },
      { key: 'duplicate', value: 'same' },
      { key: 'duplicate', value: 'same' },
    ]);
  });

  it('rejects empty or no-op rename keys without trimming exact whitespace', () => {
    const capture = capturePropertyManagerSession(createModelStore({ model: fixture() }));

    expect(previewPropertyRename(capture, 'shared', '')).toMatchObject({
      valid: false,
      error: 'New property key is required.',
    });
    expect(previewPropertyRename(capture, 'shared', 'shared')).toMatchObject({
      valid: false,
      error: 'New property key must differ from the current key.',
    });
    expect(previewPropertyRename(capture, 'shared', ' ').valid).toBe(true);
  });

  it('deletes all exact occurrences while preserving every other property row order', () => {
    const store = createModelStore({ model: fixture() });
    const preview = previewPropertyDelete(capturePropertyManagerSession(store), 'duplicate');

    expect(preview).toMatchObject({ valid: true, operation: 'delete', key: 'duplicate' });
    expect(preview.occurrences).toHaveLength(3);
    expect(deletePropertyKey(preview)).toBe(3);
    expect(store.getState().model!.folders['business-folder'].properties).toEqual([
      { key: 'shared', value: 'folder value' },
    ]);
    expect(store.getState().model!.elements.element.properties).toEqual([
      { key: 'shared', value: 'element value' },
    ]);
    expect(store.getState().model!.folders['nested-folder'].properties).toEqual([
      { key: 'Case', value: 'upper' },
    ]);
    expect(store.getState().undoStack.map((entry) => entry.label)).toEqual(['Delete Property Key']);
    undo(store);
    expect(store.getState().model!.elements.element.properties).toHaveLength(3);
  });

  it('rejects forged and stale previews atomically before any coordinate mutates', () => {
    const model = fixture();
    const store = createModelStore({ model });
    const capture = capturePropertyManagerSession(store);
    const preview = previewPropertyRename(capture, 'shared', 'renamed');
    const forged = { ...preview } as PropertyMutationPreview;

    expect(() => renamePropertyKey(forged)).toThrow('Preview is invalid. Preview again.');
    model.connections.plain.properties[0].key = 'externally changed';
    expect(() => renamePropertyKey(preview)).toThrow('Preview is stale. Preview again.');
    expect(model.info.properties[0].key).toBe('shared');
    expect(store.getState().undoStack).toEqual([]);
  });

  it('rejects a rename when the previewed collision state changes in place', () => {
    const model = fixture();
    const store = createModelStore({ model });
    const preview = previewPropertyRename(
      capturePropertyManagerSession(store),
      'shared',
      'appeared-later',
    );
    expect(preview.collision).toBe(false);
    model.folders['nested-folder'].properties.push({
      key: 'appeared-later',
      value: 'external value',
    });

    expect(() => renamePropertyKey(preview)).toThrow('Preview is stale. Preview again.');
    expect(model.info.properties[0].key).toBe('shared');
    expect(store.getState().undoStack).toEqual([]);
  });

  it('keeps inspection available read-only but explicitly rejects mutation', () => {
    const store = createModelStore({ model: fixture(), readOnly: true });
    const capture = capturePropertyManagerSession(store);
    expect(inspectPropertyUsage(capture)).not.toHaveLength(0);
    const preview = previewPropertyDelete(capture, 'shared');
    expect(preview.valid).toBe(true);
    expect(() => deletePropertyKey(preview)).toThrow('Model is read-only.');
    expect(store.getState().undoStack).toEqual([]);
  });
});

describe('property manager session and navigation isolation', () => {
  it('reuses the captured occurrence index for O(1) navigation with coordinate validation', () => {
    const model = fixture();
    let propertyReads = 0;
    const owners: Array<{ properties: Property[] }> = [
      model.info,
      ...Object.values(model.folders),
      ...Object.values(model.elements),
      ...Object.values(model.relationships),
      ...Object.values(model.views),
      ...Object.values(model.nodes).filter(
        (node): node is Extract<typeof node, { nodeType: 'group' | 'note' }> =>
          node.nodeType === 'group' || node.nodeType === 'note',
      ),
      ...Object.values(model.connections),
    ];
    for (const owner of owners) {
      let properties = owner.properties;
      Object.defineProperty(owner, 'properties', {
        configurable: true,
        get: () => {
          propertyReads++;
          return properties;
        },
        set: (next: Property[]) => {
          properties = next;
        },
      });
    }
    const capture = capturePropertyManagerSession(createModelStore({ model }));
    const occurrence = inspectPropertyUsage(capture)[0].occurrences[0];
    propertyReads = 0;

    const target = preparePropertyNavigation(capture, occurrence.id);

    expect(target?.occurrence).toBe(occurrence);
    expect(propertyReads).toBe(1);
    model.info.properties[0].value = 'changed outside the store';
    expect(preparePropertyNavigation(capture, occurrence.id)).toBeUndefined();
  });

  it('invalidates capture inspection and navigation when replaceModel reuses the model object', () => {
    const model = fixture();
    const store = createModelStore({ model });
    const capture = capturePropertyManagerSession(store);
    const occurrenceId = inspectPropertyUsage(capture)[0].occurrences[0].id;

    replaceModel(model, null, false, {}, store);

    expect(() => inspectPropertyUsage(capture)).toThrow(
      'Property manager session is stale. Open it again.',
    );
    expect(preparePropertyNavigation(capture, occurrenceId)).toBeUndefined();
  });

  it('rejects a preview atomically when replaceModel reuses the model object', () => {
    const model = fixture();
    const store = createModelStore({ model });
    const preview = previewPropertyRename(
      capturePropertyManagerSession(store),
      'shared',
      'renamed',
    );

    replaceModel(model, null, false, {}, store);

    expect(() => renamePropertyKey(preview)).toThrow('Preview is stale. Preview again.');
    expect(model.info.properties[0].key).toBe('shared');
    expect(store.getState().undoStack).toEqual([]);
  });

  it('survives same-model navigation and file metadata replacement', () => {
    const sessionId = addModelSession({ id: 'saved', model: fixture(), fileName: null });
    const session = getModelSession(sessionId)!;
    const capture = capturePropertyManagerSession(session.store);
    const preview = previewPropertyRename(capture, 'shared', 'renamed');

    setSelection('tree', ['element'], session.store);
    openView('view', session.store);
    setModelSessionFileHandle(sessionId, null);

    expect(renamePropertyKey(preview)).toBe(9);
  });

  it('rejects previews after any active-session activation change', () => {
    const firstId = addModelSession({ id: 'first', model: fixture(), fileName: null });
    const first = getModelSession(firstId)!;
    const preview = previewPropertyDelete(capturePropertyManagerSession(first.store), 'shared');
    addModelSession({ id: 'second', model: fixture(), fileName: null });
    activateModelSession(firstId);

    expect(() => deletePropertyKey(preview)).toThrow('Preview is stale. Preview again.');
    expect(first.store.getState().undoStack).toEqual([]);
  });

  it('rejects a reused session id backed by a different store', () => {
    const id = addModelSession({ id: 'collision', model: fixture(), fileName: null });
    const original = getModelSession(id)!;
    const preview = previewPropertyDelete(capturePropertyManagerSession(original.store), 'shared');
    removeModelSession(id);
    addModelSession({ id: 'collision', model: fixture(), fileName: null });

    expect(() => deletePropertyKey(preview)).toThrow('Preview is stale. Preview again.');
    expect(getModelSession(id)!.store.getState().undoStack).toEqual([]);
  });

  it('prepares session-safe tree and view navigation without invalidating mutation preview', () => {
    const id = addModelSession({ id: 'navigate', model: fixture(), fileName: null });
    const session = getModelSession(id)!;
    const capture = capturePropertyManagerSession(session.store);
    const preview = previewPropertyDelete(capture, 'shared');
    const usage = inspectPropertyUsage(capture).find((entry) => entry.key === 'shared')!;
    const tree = usage.occurrences.find((entry) => entry.ownerKind === 'element')!;
    const view = usage.occurrences.find((entry) => entry.ownerKind === 'note')!;

    expect(preparePropertyNavigation(capture, tree.id)).toMatchObject({
      store: session.store,
      sessionId: id,
      occurrence: tree,
    });
    expect(preparePropertyNavigation(capture, view.id)).toMatchObject({ occurrence: view });
    setSelection('view', ['note'], session.store);
    openView('view', session.store);
    expect(deletePropertyKey(preview)).toBe(9);
  });
});
