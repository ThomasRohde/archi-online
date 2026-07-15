import { describe, expect, it, vi } from 'vitest';
import {
  createAutosaveSerializer,
  type AutosaveSerializeWorker,
} from '../src/persistence/autosave-serializer';
import { createEmptyModel } from '../src/model/ops';

class FakeWorker implements AutosaveSerializeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requests: Array<{ id: number; model: unknown }> = [];

  postMessage(message: { id: number; model: unknown }): void {
    this.requests.push(message);
  }

  terminate(): void {}
}

describe('autosave serialization client', () => {
  it('matches out-of-order worker results to their requests', async () => {
    const worker = new FakeWorker();
    const serializer = createAutosaveSerializer({ createWorker: () => worker });
    const first = serializer.serialize(createEmptyModel('First'));
    const second = serializer.serialize(createEmptyModel('Second'));

    worker.onmessage?.({ data: { id: 2, bytes: new Uint8Array([2]) } } as MessageEvent);
    worker.onmessage?.({ data: { id: 1, bytes: new Uint8Array([1]) } } as MessageEvent);

    await expect(first).resolves.toEqual(new Uint8Array([1]));
    await expect(second).resolves.toEqual(new Uint8Array([2]));
  });

  it('falls back through an idle callback when workers are unavailable', async () => {
    const serialize = vi.fn(async () => new Uint8Array([7]));
    const idle = vi.fn((callback: IdleRequestCallback) => {
      callback({ didTimeout: false, timeRemaining: () => 5 });
      return 1;
    });
    const serializer = createAutosaveSerializer({
      createWorker: () => null,
      serialize,
      requestIdleCallback: idle,
    });

    await expect(serializer.serialize(createEmptyModel('Idle'))).resolves.toEqual(new Uint8Array([7]));
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 1000 });
    expect(serialize).toHaveBeenCalledOnce();
  });

  it('moves pending requests to idle serialization after a worker failure', async () => {
    const worker = new FakeWorker();
    const serialize = vi.fn(async () => new Uint8Array([9]));
    const serializer = createAutosaveSerializer({
      createWorker: () => worker,
      serialize,
      requestIdleCallback: (callback) => {
        callback({ didTimeout: true, timeRemaining: () => 0 });
        return 1;
      },
    });
    const pending = serializer.serialize(createEmptyModel('Worker failure'));

    worker.onerror?.(new ErrorEvent('error'));

    await expect(pending).resolves.toEqual(new Uint8Array([9]));
    expect(serialize).toHaveBeenCalledOnce();
  });
});
