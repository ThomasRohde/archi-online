import { beforeEach, describe, expect, it } from 'vitest';
import * as findReplaceModule from '../src/model/find-replace';
import {
  captureFindReplaceSession,
  previewFindReplace,
  type FindReplaceOptions,
} from '../src/model/find-replace';
import { applyFindReplace, createEmptyModel } from '../src/model/ops';
import { DEFAULT_LEGEND_OPTIONS } from '../src/model/legend';
import { compileTextMatcher } from '../src/model/text-matcher';
import {
  createModelStore,
  redo,
  undo,
  type ModelStore,
} from '../src/model/store';
import type {
  DiagramConnection,
  DiagramNode,
  DiagramView,
  ModelState,
} from '../src/model/types';
import {
  activateModelSession,
  addModelSession,
  getModelSession,
  removeModelSession,
  resetWorkspaceForTests,
  setModelSessionFileHandle,
} from '../src/model/workspace';

function view(id: string, name: string): DiagramView {
  return {
    id,
    kind: 'view',
    name,
    documentation: '',
    properties: [],
    folderId: 'views-folder',
    childIds: [],
  };
}

function nodeBase(id: string, viewId: string, parentId = viewId) {
  return {
    id,
    viewId,
    parentId,
    bounds: { x: 0, y: 0, width: 120, height: 55 },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
  };
}

function connectionBase(id: string, viewId: string): Omit<DiagramConnection, 'connType'> {
  return {
    id,
    viewId,
    name: '',
    documentation: '',
    properties: [],
    sourceId: 'actor-node-1',
    targetId: 'actor-node-2',
    sourceConnectionIds: [],
    targetConnectionIds: [],
    bendpoints: [],
  };
}

function fixture(): ModelState {
  const model = createEmptyModel('Alpha model Alpha');
  model.info.id = 'shared-model';
  model.info.documentation = 'Model Alpha documentation';
  model.info.properties = [{ key: 'owner', value: 'Alpha property' }];

  const businessFolder = Object.values(model.folders)
    .find((folder) => folder.folderType === 'business')!;
  const viewsFolder = Object.values(model.folders)
    .find((folder) => folder.folderType === 'diagrams')!;
  const businessFolderId = businessFolder.id;
  const viewsFolderId = viewsFolder.id;
  businessFolder.id = 'business-folder';
  businessFolder.name = 'Alpha folder';
  delete model.folders[businessFolderId];
  model.folders[businessFolder.id] = businessFolder;
  model.rootFolderIds = model.rootFolderIds.map((id) =>
    id === businessFolderId ? businessFolder.id : id);
  viewsFolder.id = 'views-folder';
  delete model.folders[viewsFolderId];
  model.folders[viewsFolder.id] = viewsFolder;
  model.rootFolderIds = model.rootFolderIds.map((id) =>
    id === viewsFolderId ? viewsFolder.id : id);

  model.elements['shared-object'] = {
    id: 'shared-object',
    kind: 'element',
    type: 'BusinessActor',
    name: 'Alpha actor Alpha',
    documentation: 'Actor Alpha documentation',
    properties: [
      { key: 'tag', value: 'Alpha' },
      { key: 'tag', value: 'Alpha Alpha' },
    ],
    profileIds: [],
    folderId: businessFolder.id,
  };
  model.elements['other-object'] = {
    id: 'other-object',
    kind: 'element',
    type: 'BusinessRole',
    name: 'Alpha only in referenced view contents',
    documentation: '',
    properties: [],
    profileIds: [],
    folderId: businessFolder.id,
  };
  businessFolder.itemIds.push('shared-object', 'other-object');

  model.relationships['shared-relationship'] = {
    id: 'shared-relationship',
    kind: 'relationship',
    type: 'AssignmentRelationship',
    name: 'Alpha relationship',
    documentation: '',
    properties: [],
    profileIds: [],
    folderId: Object.values(model.folders).find((folder) => folder.folderType === 'relations')!.id,
    sourceId: 'shared-object',
    targetId: 'other-object',
  };
  model.folders[model.relationships['shared-relationship'].folderId].itemIds
    .push('shared-relationship');

  model.views['view-a'] = view('view-a', 'Alpha active view');
  model.views['view-a'].documentation = 'View Alpha documentation';
  model.views['view-b'] = view('view-b', 'Alpha referenced view');
  model.views['view-c'] = view('view-c', 'Alpha unrelated view');
  viewsFolder.itemIds.push('view-a', 'view-b', 'view-c');

  const nodes: DiagramNode[] = [
    { ...nodeBase('actor-node-1', 'view-a'), nodeType: 'element', elementId: 'shared-object' },
    { ...nodeBase('actor-node-2', 'view-a'), nodeType: 'element', elementId: 'shared-object' },
    {
      ...nodeBase('outer-group', 'view-a'),
      nodeType: 'group',
      name: 'Alpha outer group',
      documentation: '',
      properties: [],
      childIds: ['inner-group'],
    },
    {
      ...nodeBase('inner-group', 'view-a', 'outer-group'),
      nodeType: 'group',
      name: 'Nested group',
      documentation: 'Alpha nested documentation',
      properties: [],
      childIds: ['note-a'],
    },
    {
      ...nodeBase('note-a', 'view-a', 'inner-group'),
      nodeType: 'note',
      content: 'Alpha note Alpha',
      properties: [{ key: 'note-key', value: 'Alpha note property' }],
    },
    { ...nodeBase('ref-b', 'view-a'), nodeType: 'ref', refViewId: 'view-b' },
    { ...nodeBase('other-node', 'view-b'), nodeType: 'element', elementId: 'other-object' },
  ];
  for (const node of nodes) model.nodes[node.id] = node;
  model.views['view-a'].childIds = ['actor-node-1', 'actor-node-2', 'outer-group', 'ref-b'];
  model.views['view-b'].childIds = ['other-node'];

  model.connections['rel-connection-1'] = {
    ...connectionBase('rel-connection-1', 'view-a'),
    connType: 'relationship',
    relationshipId: 'shared-relationship',
  };
  model.connections['rel-connection-2'] = {
    ...connectionBase('rel-connection-2', 'view-a'),
    connType: 'relationship',
    relationshipId: 'shared-relationship',
  };
  model.connections['plain-a'] = {
    ...connectionBase('plain-a', 'view-a'),
    connType: 'plain',
    name: 'Alpha plain connection Alpha',
    documentation: 'Plain Alpha documentation',
    properties: [{ key: 'plain-key', value: 'Alpha plain property' }],
  };
  model.connections['plain-b'] = {
    ...connectionBase('plain-b', 'view-b'),
    connType: 'plain',
    name: 'Alpha outside active view',
  };
  return model;
}

function options(patch: Partial<FindReplaceOptions> = {}): FindReplaceOptions {
  return {
    find: 'Alpha',
    replace: 'Omega',
    scope: 'model',
    searchName: true,
    searchDocumentation: true,
    searchPropertyValues: false,
    matchCase: true,
    useRegex: false,
    ...patch,
  };
}

function preview(store: ModelStore, patch: Partial<FindReplaceOptions> = {}) {
  return previewFindReplace(captureFindReplaceSession(store), options(patch));
}

beforeEach(() => resetWorkspaceForTests());

describe('shared text matcher', () => {
  it('treats find and replacement dollars literally outside regex mode', () => {
    const matcher = compileTextMatcher({ find: '$', matchCase: true, useRegex: false });

    expect(matcher.valid).toBe(true);
    expect(matcher.replace('Cost $5 + $5', '$1/$&/$$')).toEqual({
      value: 'Cost $1/$&/$$5 + $1/$&/$$5',
      count: 2,
    });
  });

  it('uses global Unicode JavaScript capture replacement in regex mode', () => {
    const matcher = compileTextMatcher({
      find: '(\\p{L}+)-(\\d+)',
      matchCase: true,
      useRegex: true,
    });

    expect(matcher.replace('Ångström-12 Beta-7', '$2:$1:$&')).toEqual({
      value: '12:Ångström:Ångström-12 7:Beta:Beta-7',
      count: 2,
    });
  });

  it('rejects empty and invalid searches while allowing an empty replacement', () => {
    expect(compileTextMatcher({ find: '', matchCase: false, useRegex: false })).toMatchObject({
      valid: false,
      error: 'Find text is required.',
    });
    expect(compileTextMatcher({ find: '[', matchCase: false, useRegex: true })).toMatchObject({
      valid: false,
      error: 'Invalid regular expression.',
    });
    const matcher = compileTextMatcher({ find: 'Alpha', matchCase: true, useRegex: false });
    expect(matcher.replace('Alpha Alpha', '')).toEqual({ value: ' ', count: 2 });
  });

  it('handles case-insensitive and zero-width global Unicode matches deterministically', () => {
    const insensitive = compileTextMatcher({ find: 'ång', matchCase: false, useRegex: false });
    expect(insensitive.replace('ÅNG ång', 'x')).toEqual({ value: 'x x', count: 2 });
    const zeroWidth = compileTextMatcher({ find: '(?=\\p{L})', matchCase: true, useRegex: true });
    expect(zeroWidth.replace('ÅB', '·')).toEqual({ value: '·Å·B', count: 2 });
  });
});

describe('find and replace preview scopes', () => {
  it('covers model/tree metadata, recursive annotations, and plain connections', () => {
    const result = preview(createModelStore({ model: fixture(), activeViewId: 'view-a' }));

    expect(result.valid).toBe(true);
    expect(result.rows.map((row) => row.ownerKind)).toEqual(expect.arrayContaining([
      'model',
      'folder',
      'element',
      'relationship',
      'view',
      'group',
      'note',
      'plain-connection',
    ]));
    expect(result.rows.find((row) => row.ownerId === 'note-a' && row.field === 'Text'))
      .toMatchObject({ before: 'Alpha note Alpha', after: 'Omega note Omega', count: 2 });
    expect(result.rows.find((row) => row.ownerId === 'plain-a' && row.field === 'Name'))
      .toMatchObject({ count: 2, navigation: { kind: 'view', viewId: 'view-a', objectId: 'plain-a' } });
    expect(new Set(result.rows.map((row) => row.id)).size).toBe(result.rows.length);
  });

  it('limits active-view scope and deduplicates represented semantics and referenced views', () => {
    const result = preview(createModelStore({ model: fixture(), activeViewId: 'view-a' }), {
      scope: 'active-view',
    });

    expect(result.rows.some((row) => row.ownerId === 'shared-model')).toBe(false);
    expect(result.rows.some((row) => row.ownerId === 'business-folder')).toBe(false);
    expect(result.rows.some((row) => row.ownerId === 'other-object')).toBe(false);
    expect(result.rows.some((row) => row.ownerId === 'plain-b')).toBe(false);
    expect(result.rows.filter((row) => row.ownerId === 'shared-object' && row.field === 'Name'))
      .toHaveLength(1);
    expect(result.rows.filter((row) => row.ownerId === 'shared-relationship' && row.field === 'Name'))
      .toHaveLength(1);
    expect(result.rows.filter((row) => row.ownerId === 'view-b' && row.field === 'Name'))
      .toHaveLength(1);
    expect(result.rows.find((row) => row.ownerId === 'view-b')?.navigation)
      .toEqual({ kind: 'view', viewId: 'view-a', objectId: 'ref-b' });
    expect(result.rows.some((row) => row.ownerId === 'note-a')).toBe(true);
    expect(result.rows.some((row) => row.ownerId === 'plain-a')).toBe(true);
  });

  it('reports separate ordered property rows and duplicate occurrence counts', () => {
    const result = preview(createModelStore({ model: fixture() }), {
      searchName: false,
      searchDocumentation: false,
      searchPropertyValues: true,
    });
    const actorRows = result.rows.filter((row) => row.ownerId === 'shared-object');

    expect(actorRows.map((row) => [row.field, row.before, row.count])).toEqual([
      ['Property: tag', 'Alpha', 1],
      ['Property: tag', 'Alpha Alpha', 2],
    ]);
    expect(actorRows[0].id).not.toBe(actorRows[1].id);
  });

  it('treats live legends as Text owners without replacing their structural name', () => {
    const model = fixture();
    const legend = model.nodes['note-a'];
    if (legend.nodeType !== 'note') throw new Error('fixture note missing');
    legend.name = 'Legend';
    legend.content = 'Alpha legend';
    legend.legendOptions = { ...DEFAULT_LEGEND_OPTIONS };
    const result = preview(createModelStore({ model, activeViewId: 'view-a' }), {
      scope: 'active-view',
    });

    expect(result.rows.find((row) => row.ownerId === 'note-a')).toMatchObject({
      ownerType: 'Legend',
      field: 'Text',
      before: 'Alpha legend',
      after: 'Omega legend',
    });
    expect(result.rows.some((row) => row.ownerId === 'note-a' && row.before === 'Legend'))
      .toBe(false);
  });

  it('returns a valid empty preview for zero results and no active-view error without a view', () => {
    const store = createModelStore({ model: fixture() });
    expect(preview(store, { find: 'Absent' })).toMatchObject({ valid: true, rows: [] });
    expect(preview(store, { scope: 'active-view' })).toMatchObject({
      valid: false,
      error: 'No active view.',
      rows: [],
    });
  });

  it('rejects unsupported runtime scopes deliberately', () => {
    const store = createModelStore({ model: fixture(), activeViewId: 'view-a' });
    const result = previewFindReplace(captureFindReplaceSession(store), options({
      scope: 'workspace' as FindReplaceOptions['scope'],
    }));

    expect(result).toMatchObject({
      valid: false,
      error: 'Invalid find and replace scope.',
      rows: [],
    });
  });

  it('enumerates model connections a constant number of times across many views', () => {
    const model = fixture();
    const viewsFolder = model.folders['views-folder'];
    for (let index = 0; index < 40; index++) {
      const id = `extra-view-${index}`;
      model.views[id] = view(id, `Extra view ${index}`);
      viewsFolder.itemIds.push(id);
    }
    let connectionEnumerations = 0;
    model.connections = new Proxy(model.connections, {
      ownKeys(target) {
        connectionEnumerations++;
        return Reflect.ownKeys(target);
      },
    });

    const result = preview(createModelStore({ model, activeViewId: 'view-a' }));

    expect(result.valid).toBe(true);
    expect(connectionEnumerations).toBeLessThanOrEqual(2);
  });
});

describe('find and replace apply safety', () => {
  it('keeps preview source private and snapshots a mutable capture', () => {
    expect('findReplacePreviewSource' in findReplaceModule).toBe(false);
    const sourceStore = createModelStore({ model: fixture(), activeViewId: 'view-a' });
    const otherStore = createModelStore({ model: fixture(), activeViewId: 'view-a' });
    const capture = { store: sourceStore, sessionId: null };
    const result = previewFindReplace(capture, options({ searchDocumentation: false }));
    const actor = result.rows.find((row) => row.ownerId === 'shared-object' && row.field === 'Name')!;

    capture.store = otherStore;

    expect(applyFindReplace(result, [actor.id])).toBe(1);
    expect(sourceStore.getState().model!.elements['shared-object'].name).toBe('Omega actor Omega');
    expect(otherStore.getState().model!.elements['shared-object'].name).toBe('Alpha actor Alpha');
  });

  it('applies selected rows only in one undoable transaction and supports redo', () => {
    const store = createModelStore({ model: fixture(), activeViewId: 'view-a' });
    const result = preview(store, { replace: '' });
    const actor = result.rows.find((row) => row.ownerId === 'shared-object' && row.field === 'Name')!;
    const note = result.rows.find((row) => row.ownerId === 'note-a' && row.field === 'Text')!;

    expect(applyFindReplace(result, [actor.id, note.id])).toBe(2);
    expect(store.getState().model!.elements['shared-object'].name).toBe(' actor ');
    expect((store.getState().model!.nodes['note-a'] as { content: string }).content).toBe(' note ');
    expect(store.getState().model!.info.name).toBe('Alpha model Alpha');
    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0].label).toBe('Find and Replace');

    undo(store);
    expect(store.getState().model!.elements['shared-object'].name).toBe('Alpha actor Alpha');
    expect((store.getState().model!.nodes['note-a'] as { content: string }).content)
      .toBe('Alpha note Alpha');
    redo(store);
    expect(store.getState().model!.elements['shared-object'].name).toBe(' actor ');
  });

  it('rejects no preview, stale model content, and active-view changes', () => {
    expect(() => applyFindReplace(undefined as never)).toThrow('Preview is required.');

    const changedModelStore = createModelStore({ model: fixture(), activeViewId: 'view-a' });
    const changedModelPreview = preview(changedModelStore);
    changedModelStore.transact('External change', (draft) => {
      draft.info.name = 'Changed elsewhere';
    });
    expect(() => applyFindReplace(changedModelPreview)).toThrow('Preview is stale. Preview again.');

    const changedViewStore = createModelStore({ model: fixture(), activeViewId: 'view-a' });
    const changedViewPreview = preview(changedViewStore);
    changedViewStore.setState({ activeViewId: 'view-b' });
    expect(() => applyFindReplace(changedViewPreview)).toThrow('Preview is stale. Preview again.');
  });

  it('allows preview in read-only mode but refuses apply without dirtying history', () => {
    const store = createModelStore({ model: fixture(), activeViewId: 'view-a', readOnly: true });
    const result = preview(store);

    expect(result.rows.length).toBeGreaterThan(0);
    expect(() => applyFindReplace(result)).toThrow('Model is read-only.');
    expect(store.getState().model!.info.name).toBe('Alpha model Alpha');
    expect(store.getState().undoStack).toEqual([]);
    expect(store.getState().dirty).toBe(false);
  });

  it('keeps colliding object IDs isolated to the captured session', () => {
    const firstId = addModelSession({ id: 'first-session', model: fixture(), fileName: null });
    const secondId = addModelSession({ id: 'second-session', model: fixture(), fileName: null });
    const first = getModelSession(firstId)!;
    const second = getModelSession(secondId)!;
    const result = previewFindReplace(captureFindReplaceSession(first.store), options({
      searchDocumentation: false,
    }));
    const actor = result.rows.find((row) => row.ownerId === 'shared-object' && row.field === 'Name')!;
    activateModelSession(secondId);

    expect(applyFindReplace(result, [actor.id])).toBe(1);
    expect(first.store.getState().model!.elements['shared-object'].name).toBe('Omega actor Omega');
    expect(second.store.getState().model!.elements['shared-object'].name).toBe('Alpha actor Alpha');
  });

  it('keeps a preview current when only captured-session file metadata changes', () => {
    const sessionId = addModelSession({ id: 'saved-session', model: fixture(), fileName: null });
    const session = getModelSession(sessionId)!;
    const result = previewFindReplace(captureFindReplaceSession(session.store), options({
      searchDocumentation: false,
    }));
    const actor = result.rows.find((row) => row.ownerId === 'shared-object' && row.field === 'Name')!;

    setModelSessionFileHandle(sessionId, null);

    expect(getModelSession(sessionId)).not.toBe(session);
    expect(applyFindReplace(result, [actor.id])).toBe(1);
    expect(session.store.getState().model!.elements['shared-object'].name).toBe('Omega actor Omega');
  });

  it('rejects a closed session even when its session and object IDs are reused', () => {
    const sessionId = addModelSession({ id: 'reused-session', model: fixture(), fileName: null });
    const oldSession = getModelSession(sessionId)!;
    const result = previewFindReplace(captureFindReplaceSession(oldSession.store), options());
    removeModelSession(sessionId);
    addModelSession({ id: 'reused-session', model: fixture(), fileName: null });

    expect(() => applyFindReplace(result)).toThrow('Preview is stale. Preview again.');
  });

  it('creates no undo entry when regex replacement preserves every match', () => {
    const store = createModelStore({ model: fixture(), activeViewId: 'view-a' });
    const result = preview(store, { useRegex: true, replace: '$&' });

    expect(applyFindReplace(result)).toBe(0);
    expect(store.getState().undoStack).toEqual([]);
    expect(store.getState().dirty).toBe(false);
  });

  it('prevalidates every selected target before changing any row', () => {
    const store = createModelStore({ model: fixture(), activeViewId: 'view-a' });
    const result = preview(store, { searchDocumentation: false });
    const modelRow = result.rows.find((row) => row.ownerId === 'shared-model')!;
    const actorRow = result.rows.find((row) => row.ownerId === 'shared-object')!;
    store.getState().model!.elements['shared-object'].name = 'Corrupted';

    expect(() => applyFindReplace(result, [modelRow.id, actorRow.id]))
      .toThrow('Preview is stale. Preview again.');
    expect(store.getState().model!.info.name).toBe('Alpha model Alpha');
    expect(store.getState().undoStack).toEqual([]);
  });
});
