import { beforeEach, describe, expect, it } from 'vitest';
import { copyNodes, pasteNodes } from '../src/canvas/clipboard';
import { addView, deleteItems, duplicateItems, duplicateViewObjects } from '../src/model/ops';
import { attachConnection } from '../src/model/ops/draft';
import { replaceModel } from '../src/model/store';
import {
  createCanvasTransferBundle,
  createTreeTransferBundle,
  pasteTransferBundle,
} from '../src/model/transfer';
import { connectionGraphError, getConnectable } from '../src/model/types';
import {
  activateModelSession,
  addModelSession,
  getModelSession,
  resetWorkspaceForTests,
} from '../src/model/workspace';
import { useStore } from '../src/ui/store-hooks';
import {
  connectionEndpointModel,
  endpointConnection,
} from './helpers/connection-endpoints';

function assertCopiedConnectionChain(
  model: ReturnType<typeof connectionEndpointModel>,
  viewId: string,
): void {
  const connections = Object.values(model.connections).filter((item) => item.viewId === viewId);
  expect(connections).toHaveLength(2);
  const base = connections.find((item) => item.name === 'base')!;
  const dependent = connections.find((item) => item.name === 'dependent')!;
  expect(dependent.sourceId).toBe(base.id);
  expect(base.sourceConnectionIds).toEqual([dependent.id]);
  expect(getConnectable(model, base.sourceId)?.sourceConnectionIds).toContain(base.id);
  expect(getConnectable(model, dependent.targetId)?.targetConnectionIds).toContain(dependent.id);
}

beforeEach(() => {
  resetWorkspaceForTests();
});

describe('connection endpoint cloning', () => {
  it('preserves explicit node adjacency order when duplicating a view', () => {
    const source = connectionEndpointModel();
    attachConnection(source, endpointConnection('second', 'node-a', 'node-b'));
    source.nodes['node-a'].sourceConnectionIds = ['second', 'base'];
    source.nodes['node-b'].targetConnectionIds = ['second', 'base'];
    replaceModel(source, null);

    const [copyViewId] = duplicateItems(['view']);

    const copied = useStore.getState().model!;
    const copiedSource = Object.values(copied.nodes).find(
      (node) => node.viewId === copyViewId && node.nodeType === 'note' && node.content === 'A',
    )!;
    expect(
      copiedSource.sourceConnectionIds.map((id) => copied.connections[id].name),
    ).toEqual(['second', 'base']);
  });

  it('preserves explicit node adjacency order in cross-model transfer', () => {
    const source = connectionEndpointModel();
    attachConnection(source, endpointConnection('second', 'node-a', 'node-b'));
    source.nodes['node-a'].sourceConnectionIds = ['second', 'base'];
    source.nodes['node-b'].targetConnectionIds = ['second', 'base'];
    const bundle = createTreeTransferBundle('ordered-source', source, ['view']);
    const targetSessionId = addModelSession({
      model: (() => {
        const model = connectionEndpointModel();
        model.views = {};
        model.nodes = {};
        model.connections = {};
        for (const folder of Object.values(model.folders)) folder.itemIds = [];
        return model;
      })(),
      fileName: null,
    });
    const target = getModelSession(targetSessionId)!;

    const [viewId] = pasteTransferBundle(bundle, target.store, { targetSessionId });

    const pasted = target.store.getState().model!;
    const pastedSource = Object.values(pasted.nodes).find(
      (node) => node.viewId === viewId && node.nodeType === 'note' && node.content === 'A',
    )!;
    expect(
      pastedSource.sourceConnectionIds.map((id) => pasted.connections[id].name),
    ).toEqual(['second', 'base']);
  });

  it('does not materialize dependents of an invalid skipped connection', () => {
    const bundle = createTreeTransferBundle(
      'invalid-source',
      connectionEndpointModel(),
      ['view'],
    );
    Object.assign(bundle.connections.find((connection) => connection.id === 'base')!, {
      connType: 'relationship',
      relationshipId: 'missing-relationship',
    });
    const targetSessionId = addModelSession({
      model: (() => {
        const model = connectionEndpointModel();
        model.views = {};
        model.nodes = {};
        model.connections = {};
        for (const folder of Object.values(model.folders)) folder.itemIds = [];
        return model;
      })(),
      fileName: null,
    });
    const target = getModelSession(targetSessionId)!;

    pasteTransferBundle(bundle, target.store, { targetSessionId });

    const pasted = target.store.getState().model!;
    expect(Object.keys(pasted.connections)).toEqual([]);
    expect(connectionGraphError(pasted)).toBeUndefined();
  });

  it('duplicates a view in two passes and rebuilds connection adjacency', () => {
    replaceModel(connectionEndpointModel(), null);

    const [copyViewId] = duplicateItems(['view']);

    assertCopiedConnectionChain(useStore.getState().model!, copyViewId);
  });

  it('duplicates selected canvas nodes with their dependent connection chain', () => {
    replaceModel(connectionEndpointModel(), null);

    duplicateViewObjects('view', ['node-a', 'node-b', 'node-c'], 16);

    const copied = Object.values(useStore.getState().model!.connections)
      .filter((item) => item.id !== 'base' && item.id !== 'dependent');
    expect(copied).toHaveLength(2);
    const base = copied.find((item) => item.name === 'base')!;
    const dependent = copied.find((item) => item.name === 'dependent')!;
    expect(dependent.sourceId).toBe(base.id);
    expect(base.sourceConnectionIds).toEqual([dependent.id]);
  });

  it('does not duplicate dependents of a connection with a missing relationship', () => {
    const source = connectionEndpointModel();
    Object.assign(source.connections.base, {
      connType: 'relationship',
      relationshipId: 'missing-relationship',
    });
    replaceModel(source, null);

    duplicateViewObjects('view', ['node-a', 'node-b', 'node-c'], 16);

    const copied = Object.values(useStore.getState().model!.connections)
      .filter((item) => item.id !== 'base' && item.id !== 'dependent');
    expect(copied).toEqual([]);
    expect(connectionGraphError(useStore.getState().model!))
      .toMatch(/relationship connection has no semantic relationship: base/i);
  });

  it('collects and pastes a cross-model view connection chain', () => {
    const source = connectionEndpointModel();
    const bundle = createTreeTransferBundle('source', source, ['view']);
    const targetSessionId = addModelSession({
      model: connectionEndpointModel(),
      fileName: null,
    });
    const target = getModelSession(targetSessionId)!;
    replaceModel(
      (() => {
        const model = connectionEndpointModel();
        model.views = {};
        model.nodes = {};
        model.connections = {};
        for (const folder of Object.values(model.folders)) folder.itemIds = [];
        return model;
      })(),
      null,
      false,
      {},
      target.store,
    );

    expect(bundle.connections.map((item) => item.id)).toEqual(['base', 'dependent']);
    const [viewId] = pasteTransferBundle(bundle, target.store, {
      targetSessionId,
    });

    assertCopiedConnectionChain(target.store.getState().model!, viewId);
  });

  it('pastes semantic relationship endpoints required by the visual chain', () => {
    const source = connectionEndpointModel();
    const business = Object.values(source.folders).find(
      (folder) => folder.folderType === 'business',
    )!;
    const relations = Object.values(source.folders).find(
      (folder) => folder.folderType === 'relations',
    )!;
    for (const [id, type] of [
      ['element-a', 'BusinessActor'],
      ['element-b', 'BusinessRole'],
      ['element-c', 'BusinessCollaboration'],
    ] as const) {
      source.elements[id] = {
        id,
        kind: 'element',
        type,
        name: id,
        documentation: '',
        properties: [],
        profileIds: [],
        folderId: business.id,
      };
      business.itemIds.push(id);
    }
    source.relationships['base-rel'] = {
      id: 'base-rel',
      kind: 'relationship',
      type: 'AssociationRelationship',
      name: 'base semantic',
      documentation: '',
      properties: [],
      profileIds: [],
      folderId: relations.id,
      sourceId: 'element-a',
      targetId: 'element-b',
    };
    source.relationships['dependent-rel'] = {
      id: 'dependent-rel',
      kind: 'relationship',
      type: 'AssociationRelationship',
      name: 'dependent semantic',
      documentation: '',
      properties: [],
      profileIds: [],
      folderId: relations.id,
      sourceId: 'base-rel',
      targetId: 'element-c',
    };
    relations.itemIds.push('base-rel', 'dependent-rel');
    Object.assign(source.connections.dependent, {
      connType: 'relationship',
      relationshipId: 'dependent-rel',
    });
    const bundle = createTreeTransferBundle('semantic-source', source, ['view']);
    const targetSessionId = addModelSession({
      model: (() => {
        const model = connectionEndpointModel();
        model.views = {};
        model.nodes = {};
        model.connections = {};
        for (const folder of Object.values(model.folders)) folder.itemIds = [];
        return model;
      })(),
      fileName: null,
    });
    const target = getModelSession(targetSessionId)!;

    const [viewId] = pasteTransferBundle(bundle, target.store, { targetSessionId });

    const pasted = target.store.getState().model!;
    expect(Object.values(pasted.relationships)).toHaveLength(2);
    const dependentRelationship = Object.values(pasted.relationships).find(
      (relationship) => relationship.name === 'dependent semantic',
    )!;
    expect(pasted.relationships[dependentRelationship.sourceId]?.name).toBe('base semantic');
    assertCopiedConnectionChain(pasted, viewId);
  });

  it('remaps semantic relationship endpoints during same-view duplication', () => {
    const source = connectionEndpointModel();
    const business = Object.values(source.folders).find(
      (folder) => folder.folderType === 'business',
    )!;
    const relations = Object.values(source.folders).find(
      (folder) => folder.folderType === 'relations',
    )!;
    for (const [id, type] of [
      ['element-a', 'BusinessActor'],
      ['element-b', 'BusinessRole'],
      ['element-c', 'BusinessCollaboration'],
    ] as const) {
      source.elements[id] = {
        id,
        kind: 'element',
        type,
        name: id,
        documentation: '',
        properties: [],
        profileIds: [],
        folderId: business.id,
      };
      business.itemIds.push(id);
    }
    source.nodes['node-a'] = {
      ...source.nodes['node-a'],
      nodeType: 'element',
      elementId: 'element-a',
    };
    source.nodes['node-b'] = {
      ...source.nodes['node-b'],
      nodeType: 'element',
      elementId: 'element-b',
    };
    source.nodes['node-c'] = {
      ...source.nodes['node-c'],
      nodeType: 'element',
      elementId: 'element-c',
    };
    source.relationships['base-rel'] = {
      id: 'base-rel',
      kind: 'relationship',
      type: 'AssociationRelationship',
      name: 'base semantic',
      documentation: '',
      properties: [],
      profileIds: [],
      folderId: relations.id,
      sourceId: 'element-a',
      targetId: 'element-b',
    };
    source.relationships['dependent-rel'] = {
      id: 'dependent-rel',
      kind: 'relationship',
      type: 'AssociationRelationship',
      name: 'dependent semantic',
      documentation: '',
      properties: [],
      profileIds: [],
      folderId: relations.id,
      sourceId: 'base-rel',
      targetId: 'element-c',
    };
    relations.itemIds.push('base-rel', 'dependent-rel');
    Object.assign(source.connections.dependent, {
      connType: 'relationship',
      relationshipId: 'dependent-rel',
    });
    replaceModel(source, null);

    duplicateViewObjects('view', ['node-a', 'node-b', 'node-c'], 16);

    const copiedRelationships = Object.values(useStore.getState().model!.relationships)
      .filter((relationship) => relationship.id !== 'base-rel' && relationship.id !== 'dependent-rel');
    expect(copiedRelationships).toHaveLength(2);
    const copiedBase = copiedRelationships.find(
      (relationship) => relationship.name === 'base semantic',
    )!;
    const copiedDependent = copiedRelationships.find(
      (relationship) => relationship.name === 'dependent semantic',
    )!;
    expect(copiedDependent.sourceId).toBe(copiedBase.id);
  });

  it('recreates copied semantic endpoint relationships deleted before paste', () => {
    const source = connectionEndpointModel();
    const business = Object.values(source.folders).find(
      (folder) => folder.folderType === 'business',
    )!;
    const relations = Object.values(source.folders).find(
      (folder) => folder.folderType === 'relations',
    )!;
    for (const [id, type] of [
      ['element-a', 'BusinessActor'],
      ['element-b', 'BusinessRole'],
      ['element-c', 'BusinessCollaboration'],
    ] as const) {
      source.elements[id] = {
        id,
        kind: 'element',
        type,
        name: id,
        documentation: '',
        properties: [],
        profileIds: [],
        folderId: business.id,
      };
      business.itemIds.push(id);
    }
    source.relationships['base-rel'] = {
      id: 'base-rel',
      kind: 'relationship',
      type: 'AssociationRelationship',
      name: 'base semantic',
      documentation: '',
      properties: [],
      profileIds: [],
      folderId: relations.id,
      sourceId: 'element-a',
      targetId: 'element-b',
    };
    source.relationships['dependent-rel'] = {
      id: 'dependent-rel',
      kind: 'relationship',
      type: 'AssociationRelationship',
      name: 'dependent semantic',
      documentation: '',
      properties: [],
      profileIds: [],
      folderId: relations.id,
      sourceId: 'base-rel',
      targetId: 'element-c',
    };
    relations.itemIds.push('base-rel', 'dependent-rel');
    Object.assign(source.connections.dependent, {
      connType: 'relationship',
      relationshipId: 'dependent-rel',
    });
    const sessionId = addModelSession({ model: source, fileName: null });
    activateModelSession(sessionId);
    const session = getModelSession(sessionId)!;
    const bundle = createCanvasTransferBundle(
      sessionId,
      source,
      'view',
      ['node-a', 'node-b', 'node-c'],
    );
    deleteItems(['base-rel'], session.store);
    const targetViewId = addView('Target');

    pasteTransferBundle(bundle, session.store, {
      targetSessionId: sessionId,
      targetViewId,
    });

    const pasted = session.store.getState().model!;
    const restoredBase = Object.values(pasted.relationships).find(
      (relationship) => relationship.name === 'base semantic',
    )!;
    const restoredDependent = Object.values(pasted.relationships).find(
      (relationship) => relationship.name === 'dependent semantic',
    )!;
    expect(restoredDependent.sourceId).toBe(restoredBase.id);
    expect(
      Object.values(pasted.connections).filter((connection) => connection.viewId === targetViewId),
    ).toHaveLength(2);
  });

  it('preserves the chain through the shared cross-model clipboard', () => {
    const sourceSessionId = addModelSession({ model: connectionEndpointModel(), fileName: null });
    const source = getModelSession(sourceSessionId)!;
    copyNodes(['node-a', 'node-b', 'node-c'], source.store, sourceSessionId);

    const targetSessionId = addModelSession({
      model: (() => {
        const model = connectionEndpointModel();
        model.views = {};
        model.nodes = {};
        model.connections = {};
        for (const folder of Object.values(model.folders)) folder.itemIds = [];
        return model;
      })(),
      fileName: null,
    });
    activateModelSession(targetSessionId);
    const targetViewId = addView('Target');
    const target = getModelSession(targetSessionId)!;

    expect(pasteNodes(targetViewId, undefined, target.store, targetSessionId)).toHaveLength(3);
    assertCopiedConnectionChain(target.store.getState().model!, targetViewId);
  });
});
