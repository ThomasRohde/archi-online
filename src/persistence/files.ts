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

function supportsFsAccess(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

export async function openModelFromDisk(): Promise<void> {
  if (supportsFsAccess()) {
    let handles: FileSystemFileHandle[];
    try {
      handles = await window.showOpenFilePicker({ types: PICKER_TYPES });
    } catch {
      return; // user cancelled
    }
    const file = await handles[0].getFile();
    loadModelText(await file.text(), file.name);
    setCurrentFileHandle(handles[0]);
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

function loadModelText(text: string, fileName: string): void {
  const model = parseArchimate(text);
  replaceModel(model, fileName, false);
  setCurrentFileHandle(null);
}

export async function saveModelToDisk(saveAs = false): Promise<void> {
  const s = useStore.getState();
  if (!s.model) return;
  const xml = serializeArchimate(s.model);
  const suggested = s.fileName ?? sanitizeFileName(s.model.info.name) + '.archimate';

  if (supportsFsAccess()) {
    let handle = currentFileHandle;
    if (!handle || saveAs) {
      try {
        handle = await window.showSaveFilePicker({
          suggestedName: suggested,
          types: PICKER_TYPES,
        });
      } catch {
        return; // user cancelled
      }
      setCurrentFileHandle(handle);
    }
    const writable = await handle.createWritable();
    await writable.write(xml);
    await writable.close();
    useStore.setState({ dirty: false, fileName: handle.name });
  } else {
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggested;
    a.click();
    URL.revokeObjectURL(url);
    useStore.setState({ dirty: false, fileName: suggested });
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'model';
}
