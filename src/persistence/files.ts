import { emitModelSaved } from '../extensions/events';
import { parseArchimate, serializeArchimate } from '../model/io/archimate-xml';
import {
  currentFileHandle,
  replaceModel,
  setCurrentFileHandle,
  useStore,
} from '../model/store';

const PICKER_TYPES = [
  {
    description: 'ArchiMate model',
    accept: { 'application/xml': ['.archimate' as const] },
  },
];

function supportsOpenFsAccess(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

function supportsSaveFsAccess(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

export async function openModelFromDisk(): Promise<void> {
  if (supportsOpenFsAccess()) {
    let handles: FileSystemFileHandle[];
    try {
      handles = await window.showOpenFilePicker({ types: PICKER_TYPES });
    } catch {
      return; // user cancelled
    }
    await openModelFromHandle(handles[0]);
  } else {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.archimate,.xml';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) loadModelText(await file.text(), file.name);
    };
    input.click();
  }
}

/** Open a model from a FileSystemFileHandle (picker or PWA launch queue),
 * keeping the handle so silent Ctrl+S re-save works. */
export async function openModelFromHandle(handle: FileSystemFileHandle): Promise<void> {
  const file = await handle.getFile();
  loadModelText(await file.text(), file.name);
  setCurrentFileHandle(handle); // after loadModelText, which clears the handle
}

export function loadModelText(text: string, fileName: string): void {
  const model = parseArchimate(text);
  replaceModel(model, fileName, false);
  setCurrentFileHandle(null);
}

export async function saveModelToDisk(saveAs = false): Promise<void> {
  const s = useStore.getState();
  if (!s.model) return;
  const xml = serializeArchimate(s.model);
  const suggested = s.fileName ?? sanitizeFileName(s.model.info.name) + '.archimate';

  if (supportsSaveFsAccess()) {
    let handle = currentFileHandle;
    if (!handle || saveAs) {
      try {
        handle = await window.showSaveFilePicker({
          suggestedName: suggested,
          types: PICKER_TYPES,
        });
      } catch (error) {
        if (isUserCancelledFileDialog(error)) return;
        if (shouldDownloadAfterSaveError(error)) {
          setCurrentFileHandle(null);
          downloadModel(xml, suggested);
          return;
        }
        throw error;
      }
      setCurrentFileHandle(handle);
    }
    try {
      const writable = await handle.createWritable();
      await writable.write(xml);
      await writable.close();
      useStore.setState({ dirty: false, fileName: handle.name });
      emitModelSaved();
    } catch (error) {
      if (shouldDownloadAfterSaveError(error)) {
        setCurrentFileHandle(null);
        downloadModel(xml, suggested);
        return;
      }
      throw error;
    }
  } else {
    downloadModel(xml, suggested);
  }
}

function downloadModel(xml: string, fileName: string): void {
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  useStore.setState({ dirty: false, fileName });
  emitModelSaved();
}

function isUserCancelledFileDialog(error: unknown): boolean {
  return domExceptionName(error) === 'AbortError';
}

function shouldDownloadAfterSaveError(error: unknown): boolean {
  if (isUserCancelledFileDialog(error)) return false;
  const name = domExceptionName(error);
  if (name === 'SecurityError' || name === 'NotAllowedError') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /\b(blocked|denied|disallowed|permission|policy)\b/i.test(`${name} ${message}`);
}

function domExceptionName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error) {
    return String((error as { name: unknown }).name);
  }
  return '';
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'model';
}
