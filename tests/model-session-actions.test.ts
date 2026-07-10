import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyModel } from '../src/model/ops';
import {
  addModelSession,
  getModelSession,
  resetWorkspaceForTests,
  useWorkspaceStore,
} from '../src/model/workspace';
import {
  closeModelSession,
  closeModelSessions,
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
