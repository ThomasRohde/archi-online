import type { ModelState } from '../model/types';
import { serializeArchimateDocument } from '../model/io/archimate-xml';

export interface SerializeRequest {
  id: number;
  model: ModelState;
}

export type SerializeResponse =
  | { id: number; bytes: Uint8Array }
  | { id: number; error: string };

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<SerializeRequest>) => void) | null;
  postMessage(message: SerializeResponse, transfer?: Transferable[]): void;
};

workerScope.onmessage = (event) => {
  const { id, model } = event.data;
  void serializeArchimateDocument(model).then(
    (bytes) => {
      const transferable = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? bytes
        : bytes.slice();
      workerScope.postMessage({ id, bytes: transferable }, [transferable.buffer]);
    },
    (error: unknown) => {
      workerScope.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  );
};
