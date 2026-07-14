import { describe, expect, it } from 'vitest';
import { addElement, addFolder, addView, createEmptyModel } from '../src/model/ops';
import { createModelStore } from '../src/model/store';
import { validateModel, validateModelIntegrity } from '../src/model/validation';

describe('model-integrity validation', () => {
  it('reports key mismatches, duplicate IDs, missing references, folder errors, and view topology', () => {
    const store = createModelStore({ model: createEmptyModel('Broken') });
    const elementId = addElement('BusinessActor', 'Actor', undefined, store);
    const viewId = addView('View', undefined, store);
    const model = structuredClone(store.getState().model!);
    model.elements[elementId].id = 'wrong-key';
    model.views[viewId].id = 'wrong-key';
    model.elements[elementId].folderId = 'missing-folder';
    model.views[viewId].childIds.push('missing-node');
    model.connections.bad = {
      id: 'bad', viewId, connType: 'plain', name: '', documentation: '', properties: [],
      sourceConnectionIds: [], targetConnectionIds: [], sourceId: 'missing-source',
      targetId: 'missing-target', bendpoints: [],
    };

    const integrity = validateModel(model).filter((issue) => issue.source === 'integrity');
    expect([...new Set(integrity.map((issue) => issue.rule))]).toEqual(expect.arrayContaining([
      'integrity-id',
      'integrity-reference',
      'integrity-folder-membership',
      'integrity-view-ownership',
      'integrity-connection-topology',
    ]));
  });

  it('provides an unambiguous model-tree path and exact optional view target', () => {
    const store = createModelStore({ model: createEmptyModel('Locations') });
    const elementId = addElement('BusinessActor', 'Actor', undefined, store);
    const issue = validateModel(store.getState().model!).find(
      (candidate) => candidate.rule === 'unused-element',
    )!;

    expect(issue.location.modelTree.idPath.at(-1)).toBe(elementId);
    expect(issue.location.modelTree.labelPath.at(-1)).toBe('Actor');
    expect(issue.location.view).toBeUndefined();
  });

  it('reports a structurally consistent folder-parent cycle', () => {
    const store = createModelStore({ model: createEmptyModel('Folder cycle') });
    const businessRoot = Object.values(store.getState().model!.folders).find(
      (folder) => folder.folderType === 'business',
    )!;
    const first = addFolder(businessRoot.id, 'First', store);
    const second = addFolder(first, 'Second', store);
    const model = structuredClone(store.getState().model!);
    model.folders[businessRoot.id].folderIds = model.folders[businessRoot.id].folderIds
      .filter((id) => id !== first);
    model.folders[first].parentId = second;
    model.folders[second].folderIds.push(first);

    expect(validateModelIntegrity(model).some((issue) => /folder.*cycle/i.test(issue.message)))
      .toBe(true);
  });
});
