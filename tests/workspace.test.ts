import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyModel } from '../src/model/ops';
import { getActiveModelStore, transact } from '../src/model/store';
import { useWorkspaceStore } from '../src/ui/store-hooks';
import {
  activateModelSession,
  addModelSession,
  clearWorkspace,
  getActiveModelSession,
  getModelSession,
  removeModelSession,
  resetWorkspaceForTests,
} from '../src/model/workspace';

beforeEach(() => {
  resetWorkspaceForTests();
});

describe('multi-model workspace', () => {
  it('keeps model state and undo history isolated per session', () => {
    const firstId = addModelSession({ model: createEmptyModel('First'), fileName: 'first.archimate' });
    const secondId = addModelSession({ model: createEmptyModel('Second'), fileName: 'second.archimate' });
    const first = getModelSession(firstId)!;
    const second = getModelSession(secondId)!;

    transact('Rename first', (draft) => {
      draft.info.name = 'Changed First';
    }, first.store);

    expect(first.store.getState().model?.info.name).toBe('Changed First');
    expect(first.store.getState().undoStack).toHaveLength(1);
    expect(second.store.getState().model?.info.name).toBe('Second');
    expect(second.store.getState().undoStack).toHaveLength(0);
    expect(useWorkspaceStore.getState().activeSessionId).toBe(secondId);
  });

  it('activates sessions and falls back to the most recently active remaining model', () => {
    const firstId = addModelSession({ model: createEmptyModel('First'), fileName: null });
    const secondId = addModelSession({ model: createEmptyModel('Second'), fileName: null });
    const thirdId = addModelSession({ model: createEmptyModel('Third'), fileName: null });

    activateModelSession(firstId);
    activateModelSession(thirdId);
    removeModelSession(thirdId);

    expect(getActiveModelSession()?.id).toBe(firstId);
    expect(useWorkspaceStore.getState().order).toEqual([firstId, secondId]);
  });

  it('stores a file handle on its owning session', () => {
    const handle = { name: 'one.archimate' } as FileSystemFileHandle;
    const firstId = addModelSession({
      model: createEmptyModel('First'),
      fileName: handle.name,
      fileHandle: handle,
    });
    const secondId = addModelSession({ model: createEmptyModel('Second'), fileName: null });

    expect(getModelSession(firstId)?.fileHandle).toBe(handle);
    expect(getModelSession(secondId)?.fileHandle).toBeNull();
  });

  it('supports sessions whose Archi object ids collide', () => {
    const shared = createEmptyModel('Shared ids');
    const firstId = addModelSession({ model: structuredClone(shared), fileName: 'first.archimate' });
    const secondId = addModelSession({ model: structuredClone(shared), fileName: 'second.archimate' });

    transact('Rename only first', (draft) => {
      draft.info.name = 'First copy';
    }, getModelSession(firstId)?.store);

    expect(getModelSession(firstId)?.store.getState().model?.info.id).toBe(shared.info.id);
    expect(getModelSession(secondId)?.store.getState().model?.info.id).toBe(shared.info.id);
    expect(getModelSession(firstId)?.store.getState().model?.info.name).toBe('First copy');
    expect(getModelSession(secondId)?.store.getState().model?.info.name).toBe('Shared ids');
  });

  it('fully resets the shared empty store when the workspace is cleared', () => {
    const emptyStore = getActiveModelStore();
    const transaction = { label: 'Leaked', patches: [], inverse: [] };
    emptyStore.setState({
      model: createEmptyModel('Leaked model'),
      fileName: 'leaked.archimate',
      dirty: true,
      readOnly: true,
      undoStack: [transaction],
      redoStack: [transaction],
      selection: { source: 'view', ids: ['leaked-id'] },
      openViewIds: ['leaked-view'],
      activeViewId: 'leaked-view',
      activeTool: { kind: 'create-note' },
      modelEpoch: 9,
      booted: true,
    });

    clearWorkspace();

    expect(getActiveModelStore()).toBe(emptyStore);
    expect(emptyStore.getState()).toEqual({
      model: null,
      fileName: null,
      dirty: false,
      readOnly: false,
      undoStack: [],
      redoStack: [],
      selection: { source: 'tree', ids: [] },
      openViewIds: [],
      activeViewId: null,
      activeTool: { kind: 'select' },
      modelEpoch: 0,
      booted: false,
    });
  });
});
