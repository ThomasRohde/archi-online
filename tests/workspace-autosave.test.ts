import { beforeEach, describe, expect, it } from 'vitest';
import { addView, createEmptyModel } from '../src/model/ops';
import { serializeArchimate } from '../src/model/io/archimate-xml';
import { openView } from '../src/model/store';
import {
  activateModelSession,
  addModelSession,
  getModelSession,
  resetWorkspaceForTests,
  useWorkspaceStore,
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

  it('retains corrupt session XML through restore and the next complete persist', async () => {
    const corruptSession = {
      sessionId: 'corrupt-session',
      xml: '<archimate:model broken',
      fileName: 'corrupt.archimate',
      dirty: true,
      openViewIds: ['missing-view'],
      activeViewId: 'missing-view',
      savedAt: 123,
    };
    const validModel = createEmptyModel('Recovered model');
    const validSession = {
      sessionId: 'valid-session',
      xml: serializeArchimate(validModel),
      fileName: 'valid.archimate',
      dirty: false,
      openViewIds: [],
      activeViewId: null,
      savedAt: 456,
    };
    await keyValueStore.set('archi-online.workspace', {
      version: 1,
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
