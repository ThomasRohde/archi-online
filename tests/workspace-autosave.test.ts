import { beforeEach, describe, expect, it } from 'vitest';
import { addView, createEmptyModel } from '../src/model/ops';
import { serializeArchimate, serializeArchimateDocument } from '../src/model/io/archimate-xml';
import { openView } from '../src/model/store';
import { useWorkspaceStore } from '../src/ui/store-hooks';
import {
  activateModelSession,
  addModelSession,
  getModelSession,
  resetWorkspaceForTests,
} from '../src/model/workspace';
import {
  flushAutosaveNow,
  restoreWorkspace,
} from '../src/persistence/autosave';
import {
  memoryKeyValueStore,
  setDefaultKeyValueStoreForTests,
} from '../src/persistence/keyval';

let restoreKeyValueStore: (() => void) | undefined;
let keyValueStore: ReturnType<typeof memoryKeyValueStore>;

beforeEach(() => {
  resetWorkspaceForTests();
  restoreKeyValueStore?.();
  keyValueStore = memoryKeyValueStore();
  restoreKeyValueStore = setDefaultKeyValueStoreForTests(keyValueStore);
});

describe('workspace autosave', () => {
  it('restores every model and the active/MRU workspace state', async () => {
    const firstId = addModelSession({
      model: createEmptyModel('First'),
      fileName: 'first.archimate',
      dirty: true,
    });
    const firstViewId = addView('First View');
    openView(firstViewId, getModelSession(firstId)?.store);
    const secondId = addModelSession({
      model: createEmptyModel('Second'),
      fileName: 'second.archimate',
      dirty: false,
    });
    activateModelSession(firstId);

    await flushAutosaveNow();
    resetWorkspaceForTests();
    const result = await restoreWorkspace();

    expect(result).toEqual({ restored: 2, failed: 0 });
    expect(useWorkspaceStore.getState().order).toEqual([firstId, secondId]);
    expect(useWorkspaceStore.getState().activeSessionId).toBe(firstId);
    expect(getModelSession(firstId)?.store.getState()).toMatchObject({
      fileName: 'first.archimate',
      dirty: true,
      openViewIds: [firstViewId],
      activeViewId: firstViewId,
    });
    expect(getModelSession(secondId)?.store.getState()).toMatchObject({
      fileName: 'second.archimate',
      dirty: false,
    });
    expect(getModelSession(firstId)?.store.getState().model?.info.name).toBe('First');
    expect(getModelSession(secondId)?.store.getState().model?.info.name).toBe('Second');
  });

  it('restores image-bearing version 2 document bytes', async () => {
    const model = createEmptyModel('Asset model');
    const path = 'images/_abcdefghijklmnopqrstuv.png';
    const bytes = new Uint8Array([9, 8, 7]);
    model.assets[path] = {
      path,
      mediaType: 'image/png',
      bytes,
      renderMediaType: 'image/png',
      renderBytes: bytes,
      sha256: 'hash',
    };
    model.profiles.profile = {
      id: 'profile',
      name: 'Asset profile',
      conceptType: 'BusinessActor',
      specialization: true,
      imagePath: path,
    };
    const sessionId = addModelSession({ model, fileName: 'asset.archimate' });
    await flushAutosaveNow();
    resetWorkspaceForTests();

    expect(await restoreWorkspace()).toEqual({ restored: 1, failed: 0 });
    expect(Array.from(getModelSession(sessionId)!.store.getState().model!.assets[path].bytes))
      .toEqual([9, 8, 7]);
  });

  it('does not read or migrate greenfield version 1 records', async () => {
    await keyValueStore.set('archi-online.workspace', {
      version: 1,
      order: ['legacy'],
      activeSessionId: 'legacy',
      activationOrder: ['legacy'],
      sessions: [{
        sessionId: 'legacy',
        xml: serializeArchimate(createEmptyModel('Legacy')),
        fileName: 'legacy.archimate',
        dirty: false,
        openViewIds: [],
        activeViewId: null,
        savedAt: 1,
      }],
    });

    expect(await restoreWorkspace()).toEqual({ restored: 0, failed: 0 });
    expect(useWorkspaceStore.getState().order).toEqual([]);
  });

  it('retains corrupt version 2 document bytes through restore and the next persist', async () => {
    const corruptSession = {
      sessionId: 'corrupt-session',
      documentBytes: new TextEncoder().encode('<archimate:model broken'),
      fileName: 'corrupt.archimate',
      dirty: true,
      openViewIds: ['missing-view'],
      activeViewId: 'missing-view',
      savedAt: 123,
    };
    const validModel = createEmptyModel('Recovered model');
    const validSession = {
      sessionId: 'valid-session',
      documentBytes: await serializeArchimateDocument(validModel),
      fileName: 'valid.archimate',
      dirty: false,
      openViewIds: [],
      activeViewId: null,
      savedAt: 456,
    };
    await keyValueStore.set('archi-online.workspace', {
      version: 2,
      order: [corruptSession.sessionId, validSession.sessionId],
      activeSessionId: validSession.sessionId,
      activationOrder: [corruptSession.sessionId, validSession.sessionId],
      sessions: [corruptSession, validSession],
    });

    expect(await restoreWorkspace()).toEqual({ restored: 1, failed: 1 });
    await flushAutosaveNow();
    const persisted = await keyValueStore.get<{
      order: string[];
      sessions: typeof corruptSession[];
    }>('archi-online.workspace');

    expect(persisted?.order).toEqual([corruptSession.sessionId, validSession.sessionId]);
    expect(
      persisted?.sessions.find((session) => session.sessionId === corruptSession.sessionId),
    ).toEqual(corruptSession);
    expect(getModelSession(validSession.sessionId)?.store.getState().model?.info.name).toBe(
      'Recovered model',
    );
  });
});
