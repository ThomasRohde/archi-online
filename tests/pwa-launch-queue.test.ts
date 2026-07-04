import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../src/App';
import { currentFileHandle, replaceModel, setCurrentFileHandle, useStore } from '../src/model/store';
import { createEmptyModel } from '../src/model/ops';
import { openModelFromHandle } from '../src/persistence/files';
import { encodeModelToInlineShare } from '../src/persistence/share';
import {
  memoryKeyValueStore,
  setDefaultKeyValueStoreForTests,
} from '../src/persistence/keyval';
import {
  initLaunchQueue,
  resetLaunchQueueForTests,
  subscribeLaunchedFiles,
} from '../src/pwa/launch-queue';
import {
  editorRuntimeReady,
  resetBootSignalForTests,
  signalEditorRuntimeReady,
} from '../src/pwa/boot-signal';

const archisuranceXml = readFileSync(
  join(__dirname, 'fixtures', 'Archisurance.archimate'),
  'utf8',
);

let restoreStore: (() => void) | undefined;

function installLaunchQueue(): { fire: (params: LaunchParams) => void } {
  let consumer: ((params: LaunchParams) => void) | undefined;
  Object.defineProperty(window, 'launchQueue', {
    configurable: true,
    value: {
      setConsumer(fn: (params: LaunchParams) => void) {
        consumer = fn;
      },
    },
  });
  return {
    fire: (params) => {
      expect(consumer).toBeDefined();
      consumer!(params);
    },
  };
}

function fakeFileHandle(name: string, text: string): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: async () => ({ name, text: async () => text }) as File,
  } as unknown as FileSystemFileHandle;
}

beforeEach(() => {
  restoreStore = setDefaultKeyValueStoreForTests(memoryKeyValueStore());
  resetLaunchQueueForTests();
  resetBootSignalForTests();
  replaceModel(null, null, false);
  setCurrentFileHandle(null);
  history.replaceState(null, '', '/');
});

afterEach(() => {
  Reflect.deleteProperty(window, 'launchQueue');
  resetLaunchQueueForTests();
  setCurrentFileHandle(null);
  restoreStore?.();
  restoreStore = undefined;
  history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('PWA launch queue', () => {
  it('is a no-op when the browser has no launchQueue', () => {
    expect(() => initLaunchQueue()).not.toThrow();
  });

  it('opens the launched file only after the editor runtime has booted', async () => {
    const queue = installLaunchQueue();
    initLaunchQueue();
    subscribeLaunchedFiles((handle) => {
      void (async () => {
        await editorRuntimeReady();
        await openModelFromHandle(handle);
      })();
    });
    queue.fire({ files: [fakeFileHandle('launch.archimate', archisuranceXml)] });

    // Not applied yet: boot (autosave restore) has not finished.
    await new Promise((r) => setTimeout(r, 20));
    expect(useStore.getState().fileName).toBeNull();

    signalEditorRuntimeReady();
    await vi.waitFor(() => {
      expect(useStore.getState().fileName).toBe('launch.archimate');
    });
    expect(useStore.getState().model).not.toBeNull();
    expect(useStore.getState().dirty).toBe(false);
    // Handle retained so silent Ctrl+S re-save targets the launched file.
    expect(currentFileHandle).not.toBeNull();
    expect(currentFileHandle?.name).toBe('launch.archimate');
  });

  it('ignores launches without a file handle', async () => {
    const queue = installLaunchQueue();
    initLaunchQueue();
    queue.fire({ files: [] });
    signalEditorRuntimeReady();
    await new Promise((r) => setTimeout(r, 20));
    expect(useStore.getState().fileName).toBeNull();
  });

  it('opens a launched file when an existing viewer window is focused', async () => {
    const queue = installLaunchQueue();
    initLaunchQueue();
    const viewerHref = encodeModelToInlineShare(createEmptyModel('Shared Viewer')).href;
    history.replaceState(null, '', viewerHref);

    const host = document.createElement('div');
    const root: Root = createRoot(host);
    await act(async () => {
      root.render(createElement(App));
    });

    await vi.waitFor(() => {
      expect(useStore.getState().readOnly).toBe(true);
    });

    queue.fire({ files: [fakeFileHandle('launch.archimate', archisuranceXml)] });

    await vi.waitFor(() => {
      expect(useStore.getState().fileName).toBe('launch.archimate');
    });
    expect(useStore.getState().readOnly).toBe(false);
    expect(currentFileHandle?.name).toBe('launch.archimate');

    await act(async () => {
      root.unmount();
    });
  });
});
