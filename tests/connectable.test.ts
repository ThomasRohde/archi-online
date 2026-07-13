import { describe, expect, it } from 'vitest';
import { addConnectionToView, createEmptyModel, deleteViewObjects } from '../src/model/ops';
import {
  attachConnection,
  detachConnection,
  rebuildConnectionAdjacency,
} from '../src/model/ops/draft';
import { createModelStore, replaceModel } from '../src/model/store';
import {
  connectableConceptId,
  getConnectable,
  resolveSemanticEndpoint,
  type DiagramConnection,
  type ModelState,
} from '../src/model/types';

function connection(
  id: string,
  sourceId: string,
  targetId: string,
  relationshipId?: string,
): DiagramConnection {
  return {
    id,
    viewId: 'view',
    connType: relationshipId ? 'relationship' : 'plain',
    relationshipId,
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

function connectableModel(): ModelState {
  const model = createEmptyModel('Connectables');
  const business = model.rootFolderIds.map((id) => model.folders[id])
    .find((folder) => folder.folderType === 'business')!;
  const relations = model.rootFolderIds.map((id) => model.folders[id])
    .find((folder) => folder.folderType === 'relations')!;
  const diagrams = model.rootFolderIds.map((id) => model.folders[id])
    .find((folder) => folder.folderType === 'diagrams')!;
  model.elements.a = {
    id: 'a',
    kind: 'element',
    type: 'BusinessActor',
    name: 'A',
    documentation: '',
    properties: [],
    profileIds: [],
    folderId: business.id,
  };
  model.elements.b = {
    id: 'b',
    kind: 'element',
    type: 'BusinessRole',
    name: 'B',
    documentation: '',
    properties: [],
    profileIds: [],
    folderId: business.id,
  };
  business.itemIds.push('a', 'b');
  model.relationships.rel = {
    id: 'rel',
    kind: 'relationship',
    type: 'AssignmentRelationship',
    name: '',
    documentation: '',
    properties: [],
    profileIds: [],
    folderId: relations.id,
    sourceId: 'a',
    targetId: 'b',
  };
  relations.itemIds.push('rel');
  model.views.view = {
    id: 'view',
    kind: 'view',
    name: 'View',
    documentation: '',
    properties: [],
    folderId: diagrams.id,
    childIds: ['node-a', 'node-b', 'note'],
  };
  diagrams.itemIds.push('view');
  model.nodes['node-a'] = {
    id: 'node-a',
    viewId: 'view',
    parentId: 'view',
    bounds: { x: 0, y: 0, width: 120, height: 55 },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    nodeType: 'element',
    elementId: 'a',
  };
  model.nodes['node-b'] = {
    id: 'node-b',
    viewId: 'view',
    parentId: 'view',
    bounds: { x: 200, y: 0, width: 120, height: 55 },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    nodeType: 'element',
    elementId: 'b',
  };
  model.nodes.note = {
    id: 'note',
    viewId: 'view',
    parentId: 'view',
    bounds: { x: 100, y: 120, width: 180, height: 80 },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    nodeType: 'note',
    content: '',
    properties: [],
  };
  return model;
}

describe('connectable topology', () => {
  it('looks up nodes and connections and resolves their semantic endpoints', () => {
    const model = connectableModel();
    const relationshipConnection = connection('relationship-connection', 'node-a', 'node-b', 'rel');
    const plainConnection = connection('plain-connection', 'note', 'relationship-connection');
    attachConnection(model, relationshipConnection);
    attachConnection(model, plainConnection);

    expect(getConnectable(model, 'node-a')).toBe(model.nodes['node-a']);
    expect(getConnectable(model, 'relationship-connection')).toBe(relationshipConnection);
    expect(resolveSemanticEndpoint(model, 'node-a')).toBe(model.elements.a);
    expect(resolveSemanticEndpoint(model, 'relationship-connection')).toBe(model.relationships.rel);
    expect(resolveSemanticEndpoint(model, 'plain-connection')).toBeUndefined();
    expect(connectableConceptId(model, 'node-a')).toBe('a');
    expect(connectableConceptId(model, 'relationship-connection')).toBe('rel');
    expect(connectableConceptId(model, 'plain-connection')).toBeUndefined();
  });

  it('rejects an authored relationship occurrence whose represented endpoints contradict its relationship', () => {
    const model = connectableModel();
    attachConnection(model, connection('base', 'node-a', 'node-b', 'rel'));
    const store = createModelStore({ model });

    expect(() => addConnectionToView('view', 'rel', 'base', 'node-b', store))
      .toThrow(/semantic endpoint mismatch/i);
    expect(Object.keys(store.getState().model!.connections)).toEqual(['base']);
  });

  it('accepts an authored relationship occurrence whose endpoint is another represented relationship', () => {
    const model = connectableModel();
    model.relationships.meta = {
      ...model.relationships.rel,
      id: 'meta',
      type: 'AssociationRelationship',
      sourceId: 'rel',
    };
    model.folders[model.relationships.meta.folderId].itemIds.push('meta');
    attachConnection(model, connection('base', 'node-a', 'node-b', 'rel'));
    const store = createModelStore({ model });

    expect(() => addConnectionToView('view', 'meta', 'base', 'node-b', store))
      .not.toThrow();
    expect(Object.values(store.getState().model!.connections))
      .toContainEqual(expect.objectContaining({ relationshipId: 'meta', sourceId: 'base' }));
  });

  it('attaches, detaches, and rebuilds ordered adjacency for every connectable', () => {
    const model = connectableModel();
    const first = connection('first', 'node-a', 'node-b');
    const second = connection('second', 'node-a', 'node-b');
    const dependent = connection('dependent', 'first', 'second');
    attachConnection(model, first);
    attachConnection(model, second);
    attachConnection(model, dependent);

    expect(model.nodes['node-a'].sourceConnectionIds).toEqual(['first', 'second']);
    expect(first.sourceConnectionIds).toEqual(['dependent']);
    expect(second.targetConnectionIds).toEqual(['dependent']);

    detachConnection(model, dependent);
    expect(first.sourceConnectionIds).toEqual([]);
    expect(second.targetConnectionIds).toEqual([]);
    expect(model.connections.dependent).toBe(dependent);

    model.nodes['node-a'].sourceConnectionIds = ['second', 'first'];
    model.nodes['node-b'].targetConnectionIds = ['second', 'first'];
    first.sourceConnectionIds = ['dependent'];
    second.targetConnectionIds = ['dependent'];
    rebuildConnectionAdjacency(model);

    expect(model.nodes['node-a'].sourceConnectionIds).toEqual(['second', 'first']);
    expect(model.nodes['node-b'].targetConnectionIds).toEqual(['second', 'first']);
    expect(first.sourceConnectionIds).toEqual(['dependent']);
    expect(second.targetConnectionIds).toEqual(['dependent']);
  });

  it('rejects an attachment that would create a recursive endpoint cycle', () => {
    const model = connectableModel();
    const root = connection('root', 'node-a', 'node-b');
    const dependent = connection('dependent', 'root', 'node-b');
    attachConnection(model, root);
    attachConnection(model, dependent);
    const cyclicReplacement = { ...root, targetId: 'dependent' };

    expect(() => attachConnection(model, cyclicReplacement)).toThrow(/cycle/i);
    expect(model.connections.root).toBe(root);
    expect(model.nodes['node-b'].targetConnectionIds).toEqual(['root', 'dependent']);
    expect(dependent.targetConnectionIds).toEqual([]);
  });

  it('preserves adjacency order when replacing a connection without changing endpoints', () => {
    const model = connectableModel();
    const first = connection('first', 'node-a', 'node-b');
    const second = connection('second', 'node-a', 'node-b');
    attachConnection(model, first);
    attachConnection(model, second);

    attachConnection(model, { ...first, name: 'Renamed' });

    expect(model.connections.first.name).toBe('Renamed');
    expect(model.nodes['node-a'].sourceConnectionIds).toEqual(['first', 'second']);
    expect(model.nodes['node-b'].targetConnectionIds).toEqual(['first', 'second']);
  });

  it('preserves attached connection order and deletion cascade when replacing endpoints', () => {
    const model = connectableModel();
    const root = connection('root', 'node-a', 'node-b');
    const outgoingFirst = connection('outgoing-first', 'root', 'node-b');
    const outgoingSecond = connection('outgoing-second', 'root', 'node-b');
    const incoming = connection('incoming', 'note', 'root');
    attachConnection(model, root);
    attachConnection(model, outgoingFirst);
    attachConnection(model, outgoingSecond);
    attachConnection(model, incoming);

    attachConnection(model, connection('root', 'node-a', 'note'));

    expect(model.connections.root.sourceConnectionIds).toEqual([
      'outgoing-first',
      'outgoing-second',
    ]);
    expect(model.connections.root.targetConnectionIds).toEqual(['incoming']);
    expect(model.nodes['node-b'].targetConnectionIds).toEqual([
      'outgoing-first',
      'outgoing-second',
    ]);
    expect(model.nodes.note.targetConnectionIds).toEqual(['root']);

    const store = createModelStore({ model });
    replaceModel(model, null, false, {}, store);
    deleteViewObjects(['root'], store);

    expect(Object.keys(store.getState().model!.connections)).toEqual([]);
  });

  it('recursively deletes connections attached to a deleted connection with cycle guards', () => {
    const model = connectableModel();
    const root = connection('root', 'node-a', 'dependent');
    const dependent = connection('dependent', 'root', 'node-b');
    const leaf = connection('leaf', 'note', 'root');
    const unrelated = connection('unrelated', 'node-a', 'node-b');
    model.connections = { root, dependent, leaf, unrelated };
    rebuildConnectionAdjacency(model);

    const store = createModelStore({ model });
    replaceModel(model, null, false, {}, store);
    deleteViewObjects(['root'], store);

    const result = store.getState().model!;
    expect(Object.keys(result.connections)).toEqual(['unrelated']);
    expect(result.nodes['node-a'].sourceConnectionIds).toEqual(['unrelated']);
    expect(result.nodes['node-b'].targetConnectionIds).toEqual(['unrelated']);
  });
});
