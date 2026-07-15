import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyModel } from '../src/model/ops';
import { getModelSession, addModelSession, resetWorkspaceForTests } from '../src/model/workspace';
import { useWorkspaceStore } from '../src/ui/store-hooks';
import {
  loadModelBytes,
  loadModelText,
  openModelFromDisk,
  openModelFromHandle,
  saveModelToDisk,
} from '../src/persistence/files';
import { serializeArchimate } from '../src/model/io/archimate-xml';

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalShowSaveFilePicker = window.showSaveFilePicker;
const originalShowOpenFilePicker = window.showOpenFilePicker;

function installDownloadSpies() {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:archimate-model'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
  return click;
}

function restoreUrlHelpers() {
  if (originalCreateObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    });
  } else {
    Reflect.deleteProperty(URL, 'createObjectURL');
  }
  if (originalRevokeObjectURL) {
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  } else {
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  }
}

function setSavePicker(picker: typeof window.showSaveFilePicker | undefined) {
  if (picker) {
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: picker,
    });
  } else {
    Reflect.deleteProperty(window, 'showSaveFilePicker');
  }
}

function setOpenPicker(picker: typeof window.showOpenFilePicker | undefined) {
  if (picker) {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: picker,
    });
  } else {
    Reflect.deleteProperty(window, 'showOpenFilePicker');
  }
}

beforeEach(() => {
  resetWorkspaceForTests();
});

afterEach(() => {
  resetWorkspaceForTests();
  setSavePicker(originalShowSaveFilePicker);
  setOpenPicker(originalShowOpenFilePicker);
  restoreUrlHelpers();
  vi.restoreAllMocks();
});

describe('file persistence', () => {
  it('downloads the model when the save picker is blocked by policy', async () => {
    const sessionId = addModelSession({ model: createEmptyModel('Blocked Save'), fileName: null, dirty: true });
    const click = installDownloadSpies();
    const picker = vi
      .fn<typeof window.showSaveFilePicker>()
      .mockRejectedValue(new DOMException('Blocked by policy', 'SecurityError'));
    setSavePicker(picker);

    await saveModelToDisk(sessionId);

    expect(picker).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(getModelSession(sessionId)?.store.getState().dirty).toBe(false);
    expect(getModelSession(sessionId)?.store.getState().fileName).toBe('Blocked Save.archimate');
  });

  it('does not download when the user cancels the save picker', async () => {
    const sessionId = addModelSession({ model: createEmptyModel('Blocked Save'), fileName: null, dirty: true });
    const click = installDownloadSpies();
    const picker = vi
      .fn<typeof window.showSaveFilePicker>()
      .mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'));
    setSavePicker(picker);

    await saveModelToDisk(sessionId);

    expect(picker).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
    expect(getModelSession(sessionId)?.store.getState().dirty).toBe(true);
    expect(getModelSession(sessionId)?.store.getState().fileName).toBeNull();
  });

  it('does not disturb existing session handles when opening invalid XML fails', async () => {
    const handle = { name: 'existing.archimate' } as FileSystemFileHandle;
    const sessionId = addModelSession({
      model: createEmptyModel('Existing'),
      fileName: handle.name,
      fileHandle: handle,
    });

    await expect(loadModelBytes(new TextEncoder().encode('<archimate:model'), 'broken.archimate'))
      .rejects.toThrow();

    expect(getModelSession(sessionId)?.fileHandle).toBe(handle);
  });

  it('keeps the text-loading compatibility boundary asynchronous', async () => {
    const loading = loadModelText(serializeArchimate(createEmptyModel('Text load')), 'text.archimate');

    expect(loading).toBeInstanceOf(Promise);
    const result = await loading;
    expect(result.format).toBe('archimate');
    expect(getModelSession(result.sessionId)?.store.getState().fileName).toBe('text.archimate');
  });

  it('saves only the requested session through its own handle', async () => {
    const writes: ArrayBuffer[] = [];
    const firstHandle = {
      name: 'first.archimate',
      createWritable: async () => ({
        write: async (document: ArrayBuffer) => writes.push(document),
        close: async () => {},
      }),
    } as unknown as FileSystemFileHandle;
    const firstId = addModelSession({
      model: createEmptyModel('First'),
      fileName: firstHandle.name,
      fileHandle: firstHandle,
      dirty: true,
    });
    const secondId = addModelSession({ model: createEmptyModel('Second'), fileName: null, dirty: true });

    await saveModelToDisk(firstId);

    expect(writes).toHaveLength(1);
    expect(new TextDecoder().decode(writes[0])).toContain('First');
    expect(getModelSession(firstId)?.store.getState().dirty).toBe(false);
    expect(getModelSession(secondId)?.store.getState().dirty).toBe(true);
  });

  it('activates an already-open handle instead of opening it twice', async () => {
    const existingHandle = { name: 'same.archimate' } as FileSystemFileHandle;
    const existingId = addModelSession({
      model: createEmptyModel('Existing'),
      fileName: existingHandle.name,
      fileHandle: existingHandle,
    });
    const getFile = vi.fn();
    const incomingHandle = {
      name: 'same.archimate',
      isSameEntry: async (other: FileSystemFileHandle) => other === existingHandle,
      getFile,
    } as unknown as FileSystemFileHandle;

    const openedId = await openModelFromHandle(incomingHandle);

    expect(openedId).toBe(existingId);
    expect(getFile).not.toHaveBeenCalled();
  });

  it('keeps successful legacy file-input opens and reports malformed files', async () => {
    setOpenPicker(undefined);
    const validXml = serializeArchimate(createEmptyModel('Valid fallback model'));
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      Object.defineProperty(this, 'files', {
        configurable: true,
        value: [
          {
            name: 'valid.archimate',
            arrayBuffer: async () => new TextEncoder().encode(validXml).buffer,
          },
          {
            name: 'broken.archimate',
            arrayBuffer: async () => new TextEncoder().encode('<archimate:model broken').buffer,
          },
        ],
      });
      this.dispatchEvent(new Event('change'));
    });

    await expect(openModelFromDisk()).rejects.toBeInstanceOf(AggregateError);

    expect(click).toHaveBeenCalledTimes(1);
    expect(getModelSession(useWorkspaceStore.getState().order[0])?.store.getState().model?.info.name)
      .toBe('Valid fallback model');
    expect(useWorkspaceStore.getState().order).toHaveLength(1);
  });
});
