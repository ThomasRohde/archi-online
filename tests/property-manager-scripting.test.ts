import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyModel } from '../src/model/ops';
import { createModelStore, undo } from '../src/model/store';
import {
  activateModelSession,
  addModelSession,
  getModelSession,
  resetWorkspaceForTests,
} from '../src/model/workspace';
import { JModel } from '../src/scripting/jarchi';
import { JARCHI_SCRIPT_DTS } from '../src/scripting/jarchi-dts';
import { runScript, type ConsoleEntry } from '../src/scripting/runner';

interface ScriptPropertyOccurrence {
  readonly id: string;
  readonly ownerKind: string;
  readonly value: string;
}

interface ScriptPropertyUsage {
  readonly key: string;
  readonly displayKey: string;
  readonly occurrenceCount: number;
  readonly ownerCount: number;
  readonly occurrences: readonly ScriptPropertyOccurrence[];
}

interface ScriptPropertyPreview {
  readonly valid: boolean;
  readonly error: string | null;
  readonly warning: string | null;
  readonly operation: 'rename' | 'delete';
  readonly occurrences: readonly ScriptPropertyOccurrence[];
}

interface ScriptPropertyModel {
  propertyUsage(search?: string): readonly ScriptPropertyUsage[];
  previewRenamePropertyKey(
    key: string,
    newKey: string,
    collisionAcknowledged?: boolean,
  ): ScriptPropertyPreview;
  renamePropertyKey(preview: ScriptPropertyPreview): number;
  previewDeletePropertyKey(key: string): ScriptPropertyPreview;
  deletePropertyKey(preview: ScriptPropertyPreview): number;
}

function modelWithProperties(name: string) {
  const model = createEmptyModel(name);
  model.info.properties = [
    { key: 'owner', value: 'Architecture' },
    { key: 'existing', value: 'keep' },
  ];
  return model;
}

beforeEach(() => resetWorkspaceForTests());

describe('jArchi global property manager wrappers', () => {
  it('inspects, previews, and renames through additive model APIs', () => {
    const sessionId = addModelSession({
      id: 'script-properties',
      model: modelWithProperties('Script model'),
      fileName: null,
    });
    const store = getModelSession(sessionId)!.store;
    const model = new JModel('model') as unknown as ScriptPropertyModel;

    const usage = model.propertyUsage();
    expect(usage.map((entry) => entry.key)).toEqual(['owner', 'existing']);
    expect(usage[0]).toMatchObject({ occurrenceCount: 1, ownerCount: 1 });
    expect(Object.isFrozen(usage)).toBe(true);
    const preview = model.previewRenamePropertyKey('owner', 'steward');
    expect(preview).toMatchObject({ valid: true, operation: 'rename' });
    expect('capture' in preview).toBe(false);
    expect('sourceModel' in preview).toBe(false);
    expect(model.renamePropertyKey(preview)).toBe(1);
    expect(store.getState().model!.info.properties[0]).toEqual({
      key: 'steward',
      value: 'Architecture',
    });
    expect(store.getState().undoStack.at(-1)?.label).toBe('Rename Property Key');
    undo(store);
    expect(store.getState().model!.info.properties[0].key).toBe('owner');
  });

  it('requires collision acknowledgement and a delete preview', () => {
    addModelSession({
      id: 'script-collision',
      model: modelWithProperties('Collision model'),
      fileName: null,
    });
    const model = new JModel('model') as unknown as ScriptPropertyModel;
    const collision = model.previewRenamePropertyKey('owner', 'existing');

    expect(collision.warning).toContain('already exists');
    expect(() => model.renamePropertyKey(collision)).toThrow(
      'Collision acknowledgement is required.',
    );
    const accepted = model.previewRenamePropertyKey('owner', 'existing', true);
    expect(model.renamePropertyKey(accepted)).toBe(1);

    const deletion = model.previewDeletePropertyKey('existing');
    expect(deletion.occurrences).toHaveLength(2);
    expect(model.deletePropertyKey(deletion)).toBe(2);
    expect(model.propertyUsage()).toEqual([]);
  });

  it('keeps previews bound to their captured active session', () => {
    const firstId = addModelSession({
      id: 'script-first',
      model: modelWithProperties('First'),
      fileName: null,
    });
    const model = new JModel('model') as unknown as ScriptPropertyModel;
    const preview = model.previewDeletePropertyKey('owner');
    const secondId = addModelSession({
      id: 'script-second',
      model: modelWithProperties('Second'),
      fileName: null,
    });

    expect(() => model.deletePropertyKey(preview)).toThrow('Preview is stale. Preview again.');
    expect(getModelSession(firstId)!.store.getState().model!.info.properties).toHaveLength(2);
    expect(getModelSession(secondId)!.store.getState().model!.info.properties).toHaveLength(2);
    activateModelSession(firstId);
  });

  it('rejects property previews applied through a model wrapper from another store', () => {
    const first = createModelStore({ model: modelWithProperties('First') });
    const second = createModelStore({ model: modelWithProperties('Second') });
    const firstModel = new JModel('model', first) as unknown as ScriptPropertyModel;
    const secondModel = new JModel('model', second) as unknown as ScriptPropertyModel;
    const rename = firstModel.previewRenamePropertyKey('owner', 'steward');
    const deletion = firstModel.previewDeletePropertyKey('owner');

    expect(() => secondModel.renamePropertyKey(rename)).toThrow(/different model session/i);
    expect(() => secondModel.deletePropertyKey(deletion)).toThrow(/different model session/i);
    expect(first.getState().model!.info.properties[0].key).toBe('owner');
    expect(second.getState().model!.info.properties[0].key).toBe('owner');
    expect(first.getState().undoStack).toHaveLength(0);
    expect(second.getState().undoStack).toHaveLength(0);
  });

  it('batches real runScript property mutations into one captured Script undo step', () => {
    const firstId = addModelSession({
      id: 'run-script-first',
      model: modelWithProperties('Run script first'),
      fileName: null,
    });
    const secondId = addModelSession({
      id: 'run-script-second',
      model: modelWithProperties('Run script second'),
      fileName: null,
    });
    activateModelSession(firstId);
    const logs: string[] = [];

    const result = runScript(`
      const rename = model.previewRenamePropertyKey('owner', 'steward');
      model.renamePropertyKey(rename);
      const deletion = model.previewDeletePropertyKey('existing');
      model.deletePropertyKey(deletion);
      console.log(model.propertyUsage().map((entry) => entry.key).join(','));
    `, (entry: ConsoleEntry) => logs.push(`${entry.level}:${entry.text}`));

    const first = getModelSession(firstId)!.store;
    const second = getModelSession(secondId)!.store;
    expect(result).toEqual({});
    expect(logs).toEqual(['log:steward']);
    expect(first.getState().model!.info.properties).toEqual([
      { key: 'steward', value: 'Architecture' },
    ]);
    expect(first.getState().undoStack.map((entry) => entry.label)).toEqual(['Script']);
    expect(second.getState().model!.info.properties).toEqual([
      { key: 'owner', value: 'Architecture' },
      { key: 'existing', value: 'keep' },
    ]);
    undo(first);
    expect(first.getState().model!.info.properties).toEqual([
      { key: 'owner', value: 'Architecture' },
      { key: 'existing', value: 'keep' },
    ]);
  });

  it('declares property usage, preview, rename, and delete contracts', () => {
    expect(JARCHI_SCRIPT_DTS).toContain('declare interface JPropertyOccurrence');
    expect(JARCHI_SCRIPT_DTS).toContain('declare interface JPropertyKeyUsage');
    expect(JARCHI_SCRIPT_DTS).toContain('declare interface JPropertyMutationPreview');
    expect(JARCHI_SCRIPT_DTS).toContain(
      'propertyUsage(search?: string): readonly JPropertyKeyUsage[];',
    );
    expect(JARCHI_SCRIPT_DTS).toContain(
      'previewRenamePropertyKey(key: string, newKey: string, collisionAcknowledged?: boolean): JPropertyMutationPreview;',
    );
    expect(JARCHI_SCRIPT_DTS).toContain(
      'renamePropertyKey(preview: JPropertyMutationPreview): number;',
    );
    expect(JARCHI_SCRIPT_DTS).toContain(
      'previewDeletePropertyKey(key: string): JPropertyMutationPreview;',
    );
    expect(JARCHI_SCRIPT_DTS).toContain(
      'deletePropertyKey(preview: JPropertyMutationPreview): number;',
    );
  });
});
