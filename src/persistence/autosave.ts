import { del, get, set } from 'idb-keyval';
import { parseArchimate, serializeArchimate } from '../model/io/archimate-xml';
import { replaceModel, useStore } from '../model/store';

const KEY = 'archi-online.autosave';

interface AutosaveRecord {
  xml: string;
  fileName: string | null;
  dirty: boolean;
  savedAt: number;
}

let timer: number | undefined;

/** Start debounced autosave of the open model to IndexedDB. Call once at startup. */
export function startAutosave(): void {
  useStore.subscribe((s, prev) => {
    if (s.model === prev.model) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = window.setTimeout(persist, 800);
  });
}

async function persist(): Promise<void> {
  const s = useStore.getState();
  try {
    if (!s.model) {
      await del(KEY);
      return;
    }
    const rec: AutosaveRecord = {
      xml: serializeArchimate(s.model),
      fileName: s.fileName,
      dirty: s.dirty,
      savedAt: Date.now(),
    };
    await set(KEY, rec);
  } catch (e) {
    console.warn('autosave failed', e);
  }
}

/** Restore the autosaved workspace, if any. Returns true when a model was restored. */
export async function restoreAutosave(): Promise<boolean> {
  try {
    const rec = await get<AutosaveRecord>(KEY);
    if (!rec) return false;
    const model = parseArchimate(rec.xml);
    replaceModel(model, rec.fileName, rec.dirty);
    return true;
  } catch (e) {
    console.warn('autosave restore failed', e);
    return false;
  }
}
