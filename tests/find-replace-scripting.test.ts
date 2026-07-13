import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyModel } from '../src/model/ops';
import { createModelStore, replaceModel, undo } from '../src/model/store';
import { JModel } from '../src/scripting/jarchi';
import { JARCHI_SCRIPT_DTS } from '../src/scripting/jarchi-dts';
import { resetWorkspaceForTests } from '../src/model/workspace';

interface ScriptFindReplaceRow {
  id: string;
  before: string;
  after: string;
  count: number;
}

interface ScriptFindReplacePreview {
  valid: boolean;
  error: string | null;
  rows: ScriptFindReplaceRow[];
}

interface ScriptFindReplaceModel {
  search(options: {
    find: string;
    scope?: 'model' | 'active-view';
    regex?: boolean;
  }): ScriptFindReplaceRow[];
  previewReplace(options: {
    find: string;
    replace: string;
    scope?: 'model' | 'active-view';
  }): ScriptFindReplacePreview;
  applyReplace(preview: ScriptFindReplacePreview, selectedRowIds?: readonly string[]): number;
}

beforeEach(() => {
  resetWorkspaceForTests();
  replaceModel(createEmptyModel('Alpha Alpha'), null);
});

describe('jArchi find and replace wrappers', () => {
  it('searches, previews, and applies through additive model methods', () => {
    const model = new JModel('model') as unknown as ScriptFindReplaceModel;
    expect(model.search).toBeTypeOf('function');
    expect(model.previewReplace).toBeTypeOf('function');
    expect(model.applyReplace).toBeTypeOf('function');
    if (!model.search || !model.previewReplace || !model.applyReplace) return;

    const matches = model.search({ find: 'Alpha' });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ before: 'Alpha Alpha', count: 2 });
    const preview = model.previewReplace({ find: 'Alpha', replace: 'Omega' });
    expect(preview).toMatchObject({ valid: true, error: null });
    expect('sourceModel' in preview).toBe(false);
    expect('capture' in preview).toBe(false);
    expect(Object.isFrozen(preview)).toBe(true);
    expect(Object.isFrozen(preview.rows)).toBe(true);
    expect(Object.isFrozen(preview.rows[0])).toBe(true);
    expect(model.applyReplace(preview)).toBe(1);
    expect(new JModel('model').name).toBe('Omega Omega');
    undo();
    expect(new JModel('model').name).toBe('Alpha Alpha');
  });

  it('distinguishes invalid searches from valid zero-result searches', () => {
    const model = new JModel('model') as unknown as ScriptFindReplaceModel;

    expect(model.search({ find: 'Missing' })).toEqual([]);
    expect(() => model.search({ find: '' })).toThrow('Find text is required.');
    expect(() => model.search({ find: '(', regex: true }))
      .toThrow('Invalid regular expression.');
    expect(() => model.search({ find: 'Alpha', scope: 'active-view' }))
      .toThrow('No active view.');
  });

  it('rejects applying a preview through a model wrapper from another store', () => {
    const first = createModelStore({ model: createEmptyModel('Alpha first') });
    const second = createModelStore({ model: createEmptyModel('Alpha second') });
    const firstModel = new JModel('model', first) as unknown as ScriptFindReplaceModel;
    const secondModel = new JModel('model', second) as unknown as ScriptFindReplaceModel;
    const preview = firstModel.previewReplace({ find: 'Alpha', replace: 'Omega' });

    expect(() => secondModel.applyReplace(preview)).toThrow(/different model session/i);
    expect(first.getState().model!.info.name).toBe('Alpha first');
    expect(second.getState().model!.info.name).toBe('Alpha second');
    expect(first.getState().undoStack).toHaveLength(0);
    expect(second.getState().undoStack).toHaveLength(0);
  });

  it('rejects a preview after same-reference model replacement advances the epoch', () => {
    const store = createModelStore({ model: createEmptyModel('Alpha model') });
    const model = new JModel('model', store) as unknown as ScriptFindReplaceModel;
    const preview = model.previewReplace({ find: 'Alpha', replace: 'Omega' });
    const sameModel = store.getState().model!;

    replaceModel(sameModel, null, false, {}, store);

    const freshModel = new JModel('model', store) as unknown as ScriptFindReplaceModel;
    expect(() => freshModel.applyReplace(preview)).toThrow('Preview is stale. Preview again.');
    expect(store.getState().model!.info.name).toBe('Alpha model');
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it('declares search, preview, row, and selective apply contracts', () => {
    expect(JARCHI_SCRIPT_DTS).toContain('declare interface JFindReplaceOptions');
    expect(JARCHI_SCRIPT_DTS).toContain('declare interface JFindReplaceRow');
    expect(JARCHI_SCRIPT_DTS).toContain('readonly rows: readonly JFindReplaceRow[];');
    expect(JARCHI_SCRIPT_DTS).toContain('search(options: JFindReplaceSearchOptions): JFindReplaceRow[];');
    expect(JARCHI_SCRIPT_DTS).toContain(
      'previewReplace(options: JFindReplaceOptions): JFindReplacePreview;',
    );
    expect(JARCHI_SCRIPT_DTS).toContain(
      'applyReplace(preview: JFindReplacePreview, selectedRowIds?: readonly string[]): number;',
    );
  });
});
