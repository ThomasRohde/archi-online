import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyModel } from '../src/model/ops';
import { addModelSession, getModelSession, resetWorkspaceForTests, useWorkspaceStore } from '../src/model/workspace';
import { loadExampleModel } from '../src/ui/WelcomePanel';

beforeEach(() => resetWorkspaceForTests());

describe('workspace entry flows', () => {
  it('loads an example as another model session', async () => {
    const existingId = addModelSession({ model: createEmptyModel('Existing'), fileName: null });
    const xml = readFileSync(join(__dirname, 'fixtures', 'Archisurance.archimate'), 'utf8');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ text: async () => xml } as Response);

    const exampleId = await loadExampleModel('Archisurance.archimate');

    expect(useWorkspaceStore.getState().order).toEqual([existingId, exampleId]);
    expect(getModelSession(exampleId)?.store.getState().fileName).toBe('Archisurance.archimate');
    expect(useWorkspaceStore.getState().activeSessionId).toBe(exampleId);
  });
});
