import { createEmptyModel } from '../../src/model/ops';
import { attachConnection } from '../../src/model/ops/draft';
import type { DiagramConnection, ModelState } from '../../src/model/types';

export function endpointConnection(
  id: string,
  sourceId: string,
  targetId: string,
  overrides: Partial<DiagramConnection> = {},
): DiagramConnection {
  return {
    id,
    viewId: 'view',
    connType: 'plain',
    name: id,
    documentation: `${id} documentation`,
    properties: [{ key: 'key', value: `${id} value` }],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    sourceId,
    targetId,
    bendpoints: [],
    ...overrides,
  };
}

export function connectionEndpointModel(): ModelState {
  const model = createEmptyModel('Connection endpoints');
  const diagrams = model.rootFolderIds
    .map((id) => model.folders[id])
    .find((folder) => folder.folderType === 'diagrams')!;
  model.views.view = {
    id: 'view',
    kind: 'view',
    name: 'Connection endpoints',
    documentation: '',
    properties: [],
    folderId: diagrams.id,
    childIds: ['node-a', 'node-b', 'node-c'],
  };
  diagrams.itemIds.push('view');
  model.nodes['node-a'] = {
    id: 'node-a',
    viewId: 'view',
    parentId: 'view',
    bounds: { x: 0, y: 0, width: 100, height: 40 },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    nodeType: 'note',
    content: 'A',
    properties: [],
  };
  model.nodes['node-b'] = {
    id: 'node-b',
    viewId: 'view',
    parentId: 'view',
    bounds: { x: 200, y: 0, width: 100, height: 40 },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    nodeType: 'note',
    content: 'B',
    properties: [],
  };
  model.nodes['node-c'] = {
    id: 'node-c',
    viewId: 'view',
    parentId: 'view',
    bounds: { x: 100, y: 160, width: 100, height: 40 },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    nodeType: 'note',
    content: 'C',
    properties: [],
  };
  attachConnection(model, endpointConnection('base', 'node-a', 'node-b'));
  attachConnection(model, endpointConnection('dependent', 'base', 'node-c'));
  return model;
}
