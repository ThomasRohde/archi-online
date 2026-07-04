import { emitModelSaved } from '../extensions/events';
import { parseArchimate, serializeArchimate } from '../model/io/archimate-xml';
import { isExchangeXml, parseExchange } from '../model/io/exchange-xml';
import {
  currentFileHandle,
  replaceModel,
  setCurrentFileHandle,
  useStore,
} from '../model/store';

const PICKER_TYPES = [
  {
    description: 'ArchiMate model',
    accept: { 'application/xml': ['.archimate' as const, '.xml' as const] },
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
  const format = loadModelText(await file.text(), file.name);
  // Open Exchange imports become a new unsaved model — never keep the .xml
  // handle, or Ctrl+S would overwrite it with .archimate content.
  if (format === 'archimate') {
    setCurrentFileHandle(handle); // after loadModelText, which clears the handle
  }
}

export function loadModelText(text: string, fileName: string): 'archimate' | 'exchange' {
  setCurrentFileHandle(null);
  if (isExchangeXml(text)) {
    // Like desktop Archi, an Open Exchange file imports as a new, unsaved model.
    replaceModel(parseExchange(text), null, true);
    return 'exchange';
  }
  replaceModel(parseArchimate(text), fileName, false);
  return 'archimate';
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

export interface BlobSaveType {
  description: string;
  accept: Record<string, `.${string}`[]>;
}

/**
 * Save an arbitrary blob (exported image, exchange file, CSV) to disk via
 * the save picker when available, falling back to a download. Does not touch
 * model dirty/fileName state. Returns false when the user cancelled.
 */
export async function saveBlobToDisk(
  blob: Blob,
  suggestedName: string,
  type: BlobSaveType,
): Promise<boolean> {
  if (supportsSaveFsAccess()) {
    let handle: FileSystemFileHandle;
    try {
      handle = await window.showSaveFilePicker({ suggestedName, types: [type] });
    } catch (error) {
      if (isUserCancelledFileDialog(error)) return false;
      if (shouldDownloadAfterSaveError(error)) {
        downloadBlob(blob, suggestedName);
        return true;
      }
      throw error;
    }
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  }
  downloadBlob(blob, suggestedName);
  return true;
}

/**
 * Save several files at once: one directory pick when the browser supports
 * it, otherwise a download per file. Returns false when the user cancelled.
 */
export async function saveFilesToDisk(
  files: { name: string; content: string }[],
): Promise<boolean> {
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (error) {
      if (isUserCancelledFileDialog(error)) return false;
      for (const f of files) downloadBlob(new Blob([f.content], { type: 'text/csv' }), f.name);
      return true;
    }
    for (const f of files) {
      const handle = await dir.getFileHandle(f.name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(f.content);
      await writable.close();
    }
    return true;
  }
  for (const f of files) downloadBlob(new Blob([f.content], { type: 'text/csv' }), f.name);
  return true;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
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

export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'model';
}
