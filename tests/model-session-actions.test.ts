import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addView, createEmptyModel } from '../src/model/ops';
import { createModelStore } from '../src/model/store';
import { addModelSession, getModelSession, resetWorkspaceForTests } from '../src/model/workspace';
import { useWorkspaceStore } from '../src/ui/store-hooks';
import {
  closeModelSession,
  closeModelSessions,
  createEditableModelCopySession,
  createNewModelSession,
} from '../src/ui/model-session-actions';

beforeEach(() => resetWorkspaceForTests());

describe('model session actions', () => {
  it('creates and activates a new model without replacing existing sessions', () => {
    const existingId = addModelSession({ model: createEmptyModel('Existing'), fileName: null });

    const newId = createNewModelSession();

    expect(useWorkspaceStore.getState().order).toEqual([existingId, newId]);
    expect(useWorkspaceStore.getState().activeSessionId).toBe(newId);
    expect(getModelSession(newId)?.store.getState().model?.info.name).toBe('New ArchiMate Model');
  });

  it('opens an editable shared-model copy on the viewer-selected view', () => {
    const sourceStore = createModelStore({ model: createEmptyModel('Shared') });
    const firstViewId = addView('First', undefined, sourceStore);
    const selectedViewId = addView('Selected', undefined, sourceStore);
    const source = sourceStore.getState().model!;

    const sessionId = createEditableModelCopySession(source, selectedViewId);

    const state = getModelSession(sessionId)!.store.getState();
    expect(state.model).not.toBe(source);
    expect(state.model?.info.name).toBe('Shared');
    expect(state.readOnly).toBe(false);
    expect(state.dirty).toBe(true);
    expect(state.openViewIds).toEqual([selectedViewId]);
    expect(state.activeViewId).toBe(selectedViewId);
    expect(state.activeViewId).not.toBe(firstViewId);
    expect(useWorkspaceStore.getState().activeSessionId).toBe(sessionId);
  });

  it('keeps a dirty model open when close is cancelled', async () => {
    const sessionId = addModelSession({
      model: createEmptyModel('Dirty'),
      fileName: null,
      dirty: true,
    });

    const closed = await closeModelSession(sessionId, {
      chooseDirtyAction: async () => 'cancel',
      save: async () => true,
      flush: async () => undefined,
    });

    expect(closed).toBe(false);
    expect(getModelSession(sessionId)).toBeDefined();
  });

  it('saves before closing and aborts when Save As is cancelled', async () => {
    const sessionId = addModelSession({
      model: createEmptyModel('Dirty'),
      fileName: null,
      dirty: true,
    });
    const save = vi.fn(async () => false);

    const closed = await closeModelSession(sessionId, {
      chooseDirtyAction: async () => 'save',
      save,
      flush: async () => undefined,
    });

    expect(save).toHaveBeenCalledWith(sessionId);
    expect(closed).toBe(false);
    expect(getModelSession(sessionId)).toBeDefined();
  });

  it('keeps a dirty model open when saving fails', async () => {
    const sessionId = addModelSession({
      model: createEmptyModel('Dirty'),
      fileName: 'dirty.archimate',
      dirty: true,
    });

    const closed = await closeModelSession(sessionId, {
      chooseDirtyAction: async () => 'save',
      save: async () => {
        throw new Error('disk full');
      },
      flush: async () => undefined,
    });

    expect(closed).toBe(false);
    expect(getModelSession(sessionId)).toBeDefined();
  });

  it('closes models in order and stops at the first cancellation', async () => {
    const firstId = addModelSession({ model: createEmptyModel('First'), fileName: null, dirty: true });
    const secondId = addModelSession({ model: createEmptyModel('Second'), fileName: null, dirty: true });
    const choices = ['discard', 'cancel'] as const;
    let index = 0;

    const closed = await closeModelSessions([firstId, secondId], {
      chooseDirtyAction: async () => choices[index++],
      save: async () => true,
      flush: async () => undefined,
    });

    expect(closed).toBe(false);
    expect(getModelSession(firstId)).toBeUndefined();
    expect(getModelSession(secondId)).toBeDefined();
  });
});
