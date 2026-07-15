import { describe, expect, it } from 'vitest';
import { createCanvasBenchmarkModel } from '../src/dev/canvas-benchmark';
import { validateModelIntegrity } from '../src/model/validation';

describe('canvas drag benchmark model', () => {
  it('reproduces the reviewed 400-node and 200-connection scenario', () => {
    const { model, viewId } = createCanvasBenchmarkModel();
    expect(model.views[viewId].childIds).toHaveLength(400);
    expect(Object.values(model.connections).filter((connection) => connection.viewId === viewId))
      .toHaveLength(200);
    expect(validateModelIntegrity(model)).toEqual([]);
  });
});
