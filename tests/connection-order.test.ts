import { describe, expect, it, vi } from 'vitest';
import {
  createConnectionOrderIndex,
  orderedConnectableConnectionIds,
  orderedViewConnectionIds,
  type ConnectionOrderIndex,
} from '../src/model/connection-order';
import { createEmptyModel } from '../src/model/ops';
import type { DiagramConnection, ModelState } from '../src/model/types';

const VIEW_COUNT = 800;
const CONNECTIONS_PER_VIEW = 25;

function largeMultiViewModel(): {
  model: ModelState;
  connectionIdsByView: string[][];
} {
  const model = createEmptyModel('Connection ordering');
  const diagramsFolder = Object.values(model.folders)
    .find((folder) => folder.folderType === 'diagrams')!;
  const connectionIdsByView: string[][] = [];

  for (let viewIndex = 0; viewIndex < VIEW_COUNT; viewIndex += 1) {
    const viewId = `view-${viewIndex}`;
    const nodeId = `node-${viewIndex}`;
    const connectionIds = Array.from(
      { length: CONNECTIONS_PER_VIEW },
      (_, connectionIndex) => `connection-${viewIndex}-${connectionIndex}`,
    );
    connectionIdsByView.push(connectionIds);
    model.views[viewId] = {
      id: viewId,
      kind: 'view',
      name: `View ${viewIndex}`,
      documentation: '',
      properties: [],
      folderId: diagramsFolder.id,
      childIds: [nodeId],
    };
    diagramsFolder.itemIds.push(viewId);
    model.nodes[nodeId] = {
      id: nodeId,
      nodeType: 'note',
      viewId,
      parentId: viewId,
      content: '',
      properties: [],
      bounds: { x: 0, y: 0, width: 120, height: 60 },
      childIds: [],
      sourceConnectionIds: [connectionIds[24], connectionIds[0], connectionIds[24], 'missing'],
      targetConnectionIds: [],
    };
    for (const connectionId of connectionIds) {
      const connection: DiagramConnection = {
        id: connectionId,
        connType: 'plain',
        viewId,
        name: '',
        documentation: '',
        properties: [],
        sourceId: nodeId,
        targetId: nodeId,
        sourceConnectionIds: [],
        targetConnectionIds: [],
        bendpoints: [],
      };
      model.connections[connectionId] = connection;
    }
  }

  return { model, connectionIdsByView };
}

describe('connection order index', () => {
  it('indexes 20,000 connections by view once for linear multi-view traversal', () => {
    const { model, connectionIdsByView } = largeMultiViewModel();
    let connectionRecordEnumerations = 0;
    model.connections = new Proxy(model.connections, {
      ownKeys(target) {
        connectionRecordEnumerations += 1;
        return Reflect.ownKeys(target);
      },
    });

    const index = createConnectionOrderIndex(model);
    expect(connectionRecordEnumerations).toBe(1);
    expect(index.byView.get('view-799')).toEqual(connectionIdsByView[799]);

    connectionRecordEnumerations = 0;
    const orderedByView = Object.keys(model.views).map((viewId) => (
      orderedViewConnectionIds(model, viewId, index)
    ));

    expect(connectionRecordEnumerations).toBe(0);
    expect(orderedByView[0]).toEqual([
      connectionIdsByView[0][24],
      connectionIdsByView[0][0],
      ...connectionIdsByView[0].slice(1, 24),
    ]);
    expect(orderedByView[799]).toEqual([
      connectionIdsByView[799][24],
      connectionIdsByView[799][0],
      ...connectionIdsByView[799].slice(1, 24),
    ]);
  });

  it('orders high fan-out adjacency without repeated linear array searches', () => {
    const connectionIds = Array.from(
      { length: 12_000 },
      (_, connectionIndex) => `fan-out-${connectionIndex}`,
    );
    const explicitIds = [
      ...connectionIds.slice(8_000).reverse(),
      connectionIds[11_999],
      'stale-connection',
    ];
    let indexOfCalls = 0;
    const preferredIds = new Proxy(explicitIds, {
      get(target, property, receiver) {
        if (property === 'indexOf') indexOfCalls += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const index: ConnectionOrderIndex = {
      bySource: new Map([['hub', connectionIds]]),
      byTarget: new Map(),
      byView: new Map(),
    };
    const includesSpy = vi.spyOn(Array.prototype, 'includes');

    const ordered = orderedConnectableConnectionIds({
      id: 'hub',
      sourceConnectionIds: preferredIds,
      targetConnectionIds: [],
    }, 'source', index);
    const includesCalls = includesSpy.mock.calls.length;
    includesSpy.mockRestore();

    expect(indexOfCalls).toBe(0);
    expect(includesCalls).toBe(0);
    expect(ordered).toEqual([
      ...connectionIds.slice(8_000).reverse(),
      ...connectionIds.slice(0, 8_000),
    ]);
  });
});
