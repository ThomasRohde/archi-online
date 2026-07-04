import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentFileHandle, replaceModel, setCurrentFileHandle, useStore } from '../src/model/store';
import { initLaunchQueue } from '../src/pwa/launch-queue';
import { resetBootSignalForTests, signalEditorRuntimeReady } from '../src/pwa/boot-signal';

const archisuranceXml = readFileSync(
  join(__dirname, 'fixtures', 'Archisurance.archimate'),
  'utf8',
);

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
  resetBootSignalForTests();
  replaceModel(null, null, false);
  setCurrentFileHandle(null);
});

afterEach(() => {
  Reflect.deleteProperty(window, 'launchQueue');
  setCurrentFileHandle(null);
  vi.restoreAllMocks();
});

describe('PWA launch queue', () => {
  it('is a no-op when the browser has no launchQueue', () => {
    expect(() => initLaunchQueue()).not.toThrow();
  });

  it('opens the launched file only after the editor runtime has booted', async () => {
    const queue = installLaunchQueue();
    initLaunchQueue();
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
});
