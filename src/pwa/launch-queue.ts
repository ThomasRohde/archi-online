import { openModelFromHandle } from '../persistence/files';
import { showAlertDialog } from '../ui/AppDialog';
import { confirmDiscardChanges } from '../ui/Toolbar';
import { editorRuntimeReady } from './boot-signal';

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
    void openLaunchedFile(handle as FileSystemFileHandle);
  });
}

async function openLaunchedFile(handle: FileSystemFileHandle): Promise<void> {
  await editorRuntimeReady();
  if (!(await confirmDiscardChanges())) return;
  try {
    await openModelFromHandle(handle);
  } catch (error) {
    await showAlertDialog({
      title: 'Could not open model',
      message: error instanceof Error ? error.message : String(error),
      intent: 'error',
    });
  }
}
