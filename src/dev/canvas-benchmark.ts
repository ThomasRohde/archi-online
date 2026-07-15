import { newId } from '../model/id';
import { createEmptyModel, defaultFolderId } from '../model/ops';
import type { ModelState } from '../model/types';

export interface CanvasBenchmarkModel {
  model: ModelState;
  viewId: string;
}

/** Deterministic-size model matching REVIEW.md's 400-node/200-connection drag case. */
export function createCanvasBenchmarkModel(): CanvasBenchmarkModel {
  const model = createEmptyModel('Canvas drag benchmark');
  const businessFolderId = defaultFolderId(model, 'business');
  const relationFolderId = defaultFolderId(model, 'relations');
  const viewFolderId = defaultFolderId(model, 'diagrams');
  const viewId = newId();
  model.views[viewId] = {
    id: viewId,
    kind: 'view',
    name: '400 nodes / 200 connections',
    documentation: 'Reproducible canvas drag performance benchmark.',
    properties: [],
    folderId: viewFolderId,
    childIds: [],
  };
  model.folders[viewFolderId].itemIds.push(viewId);

  const elementIds: string[] = [];
  const nodeIds: string[] = [];
  for (let index = 0; index < 400; index++) {
    const elementId = newId();
    const nodeId = newId();
    elementIds.push(elementId);
    nodeIds.push(nodeId);
    model.elements[elementId] = {
      id: elementId,
      kind: 'element',
      type: 'BusinessActor',
      name: `Actor ${String(index + 1).padStart(3, '0')}`,
      documentation: '',
      properties: [],
      profileIds: [],
      folderId: businessFolderId,
    };
    model.folders[businessFolderId].itemIds.push(elementId);
    model.nodes[nodeId] = {
      id: nodeId,
      viewId,
      parentId: viewId,
      bounds: {
        x: (index % 20) * 150,
        y: Math.floor(index / 20) * 90,
        width: 120,
        height: 55,
      },
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      nodeType: 'element',
      elementId,
    };
    model.views[viewId].childIds.push(nodeId);
  }

  for (let index = 0; index < 200; index++) {
    const sourceIndex = index * 2;
    const targetIndex = sourceIndex + 1;
    const relationshipId = newId();
    const connectionId = newId();
    model.relationships[relationshipId] = {
      id: relationshipId,
      kind: 'relationship',
      type: 'AssociationRelationship',
      name: '',
      documentation: '',
      properties: [],
      profileIds: [],
      folderId: relationFolderId,
      sourceId: elementIds[sourceIndex],
      targetId: elementIds[targetIndex],
    };
    model.folders[relationFolderId].itemIds.push(relationshipId);
    model.connections[connectionId] = {
      id: connectionId,
      viewId,
      connType: 'relationship',
      relationshipId,
      name: '',
      documentation: '',
      properties: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      sourceId: nodeIds[sourceIndex],
      targetId: nodeIds[targetIndex],
      bendpoints: [],
    };
    model.nodes[nodeIds[sourceIndex]].sourceConnectionIds.push(connectionId);
    model.nodes[nodeIds[targetIndex]].targetConnectionIds.push(connectionId);
  }

  return { model, viewId };
}
