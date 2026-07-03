import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyModel } from '../src/model/ops';
import { replaceModel, setCurrentFileHandle, useStore } from '../src/model/store';
import { saveModelToDisk } from '../src/persistence/files';

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalShowSaveFilePicker = window.showSaveFilePicker;

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

beforeEach(() => {
  replaceModel(createEmptyModel('Blocked Save'), null, true);
  setCurrentFileHandle(null);
});

afterEach(() => {
  setCurrentFileHandle(null);
  setSavePicker(originalShowSaveFilePicker);
  restoreUrlHelpers();
  vi.restoreAllMocks();
});

describe('file persistence', () => {
  it('downloads the model when the save picker is blocked by policy', async () => {
    const click = installDownloadSpies();
    const picker = vi
      .fn<typeof window.showSaveFilePicker>()
      .mockRejectedValue(new DOMException('Blocked by policy', 'SecurityError'));
    setSavePicker(picker);

    await saveModelToDisk();

    expect(picker).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(useStore.getState().dirty).toBe(false);
    expect(useStore.getState().fileName).toBe('Blocked Save.archimate');
  });

  it('does not download when the user cancels the save picker', async () => {
    const click = installDownloadSpies();
    const picker = vi
      .fn<typeof window.showSaveFilePicker>()
      .mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'));
    setSavePicker(picker);

    await saveModelToDisk();

    expect(picker).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
    expect(useStore.getState().dirty).toBe(true);
    expect(useStore.getState().fileName).toBeNull();
  });
});
