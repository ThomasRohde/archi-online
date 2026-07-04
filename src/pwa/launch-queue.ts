export type LaunchedFileHandler = (handle: FileSystemFileHandle) => void;

const handlers = new Set<LaunchedFileHandler>();
const pendingHandles: FileSystemFileHandle[] = [];

/**
 * Consume OS file-handler launches (double-clicked .archimate files).
 * Chromium-only; a no-op elsewhere. Must be called before render so the
 * consumer is registered when Chromium flushes the queue.
 */
export function initLaunchQueue(): void {
  if (typeof window === 'undefined' || !window.launchQueue) return;
  window.launchQueue.setConsumer((params) => {
    const handle = params.files?.[0];
    if (!handle || handle.kind !== 'file') return;
    deliverLaunchedFile(handle as FileSystemFileHandle);
  });
}

export function subscribeLaunchedFiles(handler: LaunchedFileHandler): () => void {
  handlers.add(handler);
  while (pendingHandles.length > 0) {
    handler(pendingHandles.shift()!);
  }
  return () => {
    handlers.delete(handler);
  };
}

function deliverLaunchedFile(handle: FileSystemFileHandle): void {
  if (handlers.size === 0) {
    pendingHandles.push(handle);
    return;
  }
  for (const handler of handlers) {
    handler(handle);
  }
}

export function resetLaunchQueueForTests(): void {
  handlers.clear();
  pendingHandles.splice(0);
}
