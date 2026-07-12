import { beforeEach, describe, expect, it } from 'vitest';
import { createAppApi } from '../src/extensions/app-api';
import { deleteViewObjects } from '../src/model/ops';
import { connectionGraphError } from '../src/model/types';
import { validateModel } from '../src/model/validation';
import { openView, replaceModel } from '../src/model/store';
import { useStore } from '../src/ui/store-hooks';
import { connectionEndpointModel } from './helpers/connection-endpoints';

beforeEach(() => {
  replaceModel(connectionEndpointModel(), null);
});

describe('connection endpoint integrity consumers', () => {
  it('cascades deletion through connection endpoints and prunes deleted-node assets', () => {
    const model = structuredClone(useStore.getState().model!);
    const path = 'images/node-a.png';
    const bytes = new Uint8Array([1, 2, 3]);
    model.assets[path] = {
      path,
      mediaType: 'image/png',
      bytes,
      renderMediaType: 'image/png',
      renderBytes: bytes,
      sha256: 'node-a',
    };
    model.nodes['node-a'].imagePath = path;
    replaceModel(model, null);

    deleteViewObjects(['node-a']);

    const after = useStore.getState().model!;
    expect(after.connections).toEqual({});
    expect(after.assets[path]).toBeUndefined();
  });

  it('validates a normalized connection-endpoint graph without node-only assumptions', () => {
    const model = useStore.getState().model!;

    expect(connectionGraphError(model)).toBeUndefined();
    expect(validateModel(model)).toEqual([]);
  });

  it('preserves endpoint-connected edges while excluding them from ELK routing', async () => {
    const model = structuredClone(useStore.getState().model!);
    model.connections.dependent.bendpoints = [
      { startX: 5, startY: 6, endX: 7, endY: 8 },
    ];
    replaceModel(model, null);
    openView('view');

    const result = await createAppApi('local.elk').layout.elk({
      scope: 'view',
      edgeRouting: 'orthogonal',
    });

    expect(result.connectionCount).toBe(1);
    expect(result.routedConnectionCount).toBe(1);
    expect(useStore.getState().model!.connections.dependent.bendpoints).toEqual([
      { startX: 5, startY: 6, endX: 7, endY: 8 },
    ]);
  });
});
