import { serializeArchimateDocument } from '../model/io/archimate-xml';
import type { ModelState } from '../model/types';
import type { SerializeRequest, SerializeResponse } from './autosave.worker';

export interface AutosaveSerializeWorker {
  onmessage: ((event: MessageEvent<SerializeResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: SerializeRequest): void;
  terminate(): void;
}

interface PendingRequest {
  model: ModelState;
  resolve(bytes: Uint8Array): void;
  reject(error: Error): void;
}

interface AutosaveSerializerOptions {
  createWorker?: () => AutosaveSerializeWorker | null;
  serialize?: (model: ModelState) => Promise<Uint8Array>;
  requestIdleCallback?: typeof window.requestIdleCallback;
}

export interface AutosaveSerializer {
  serialize(model: ModelState): Promise<Uint8Array>;
  dispose(): void;
}

function defaultWorker(): AutosaveSerializeWorker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./autosave.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

export function createAutosaveSerializer(
  options: AutosaveSerializerOptions = {},
): AutosaveSerializer {
  const serialize = options.serialize ?? serializeArchimateDocument;
  const requestIdle = options.requestIdleCallback
    ?? (typeof window !== 'undefined' ? window.requestIdleCallback?.bind(window) : undefined);
  let worker = (options.createWorker ?? defaultWorker)();
  let nextId = 1;
  const pending = new Map<number, PendingRequest>();

  const serializeWhenIdle = (model: ModelState): Promise<Uint8Array> => {
    if (!requestIdle) return serialize(model);
    return new Promise((resolve, reject) => {
      requestIdle(() => {
        void serialize(model).then(resolve, reject);
      }, { timeout: 1000 });
    });
  };

  const disableWorker = (): void => {
    const failedWorker = worker;
    worker = null;
    failedWorker?.terminate();
    const waiting = [...pending.values()];
    pending.clear();
    waiting.forEach(({ model, resolve, reject }) => {
      void serializeWhenIdle(model).then(resolve, reject);
    });
  };

  if (worker) {
    worker.onmessage = ({ data }) => {
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if ('error' in data) request.reject(new Error(data.error));
      else request.resolve(data.bytes);
    };
    worker.onerror = () => disableWorker();
  }

  return {
    serialize(model) {
      if (!worker) return serializeWhenIdle(model);
      const id = nextId++;
      return new Promise<Uint8Array>((resolve, reject) => {
        pending.set(id, { model, resolve, reject });
        try {
          worker?.postMessage({ id, model });
        } catch {
          disableWorker();
        }
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      const error = new Error('Autosave serializer disposed');
      pending.forEach(({ reject }) => reject(error));
      pending.clear();
    },
  };
}

const autosaveSerializer = createAutosaveSerializer();

export function serializeModelForAutosave(model: ModelState): Promise<Uint8Array> {
  return autosaveSerializer.serialize(model);
}
