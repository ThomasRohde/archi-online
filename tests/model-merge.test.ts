import { describe, expect, it } from 'vitest';
import {
  addElement,
  addElementNodeToView,
  addConnectionToView,
  addFolder,
  addRelationship,
  addView,
  createEmptyModel,
} from '../src/model/ops';
import { createModelStore, undo } from '../src/model/store';
import {
  applyModelMergePlan,
  createModelMergePlan,
} from '../src/model/model-merge';

describe('model import and merge', () => {
  it('creates missing objects with source IDs, preserves target-only content, and undoes atomically', () => {
    const targetStore = createModelStore({ model: createEmptyModel('Target') });
    const targetOnly = addElement('BusinessActor', 'Target only', undefined, targetStore);
    const sourceStore = createModelStore({ model: createEmptyModel('Source') });
    const actor = addElement('BusinessActor', 'Actor', undefined, sourceStore);
    const role = addElement('BusinessRole', 'Role', undefined, sourceStore);
    const relationship = addRelationship(
      'AssignmentRelationship', actor, role, 'Assigned', undefined, sourceStore,
    )!;
    const view = addView('Imported view', undefined, sourceStore);
    addElementNodeToView(view, actor, view, { x: 10, y: 10, width: 120, height: 55 }, false, {}, sourceStore);
    addElementNodeToView(view, role, view, { x: 210, y: 10, width: 120, height: 55 }, true, {}, sourceStore);

    const plan = createModelMergePlan(targetStore.getState().model!, sourceStore.getState().model!, {
      updateExisting: false,
      updateModelInfo: false,
      updateFolderStructure: false,
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(plan.report.created).toBeGreaterThanOrEqual(4);
    applyModelMergePlan(targetStore, plan);

    const merged = targetStore.getState().model!;
    expect(merged.elements[actor]).toBeDefined();
    expect(merged.relationships[relationship]).toBeDefined();
    expect(merged.views[view]).toBeDefined();
    expect(merged.elements[targetOnly]).toBeDefined();
    expect(targetStore.getState().undoStack.at(-1)?.label).toBe('Import Model');
    const reimport = createModelMergePlan(merged, sourceStore.getState().model!, {
      updateExisting: false,
      updateModelInfo: false,
      updateFolderStructure: false,
    });
    expect(reimport.report.created).toBe(0);
    undo(targetStore);
    expect(targetStore.getState().model!.elements[actor]).toBeUndefined();
    expect(targetStore.getState().model!.elements[targetOnly]).toBeDefined();
  });

  it('replaces matched object fields and complete view contents only when enabled', () => {
    const target = createEmptyModel('Target');
    const source = structuredClone(target);
    const targetStore = createModelStore({ model: target });
    const actor = addElement('BusinessActor', 'Old', undefined, targetStore);
    const sourceFolder = Object.values(source.folders).find((folder) => folder.folderType === 'business')!;
    source.elements[actor] = {
      id: actor, kind: 'element', type: 'BusinessActor', name: 'New', documentation: 'Updated',
      properties: [{ key: 'owner', value: 'Phase 3' }], profileIds: [], folderId: sourceFolder.id,
    };
    sourceFolder.itemIds.push(actor);

    const unchanged = createModelMergePlan(targetStore.getState().model!, source, {
      updateExisting: false, updateModelInfo: false, updateFolderStructure: false,
    });
    expect(unchanged.merged.elements[actor].name).toBe('Old');
    const updated = createModelMergePlan(targetStore.getState().model!, source, {
      updateExisting: true, updateModelInfo: false, updateFolderStructure: false,
    });
    expect(updated.merged.elements[actor]).toMatchObject({
      name: 'New', documentation: 'Updated', properties: [{ key: 'owner', value: 'Phase 3' }],
    });
  });

  it('blocks same-ID/different-type conflicts and rejects stale or read-only plans', () => {
    const targetStore = createModelStore({ model: createEmptyModel('Target') });
    const elementId = addElement('BusinessActor', 'Actor', undefined, targetStore);
    const source = createEmptyModel('Source');
    const folder = Object.values(source.folders).find((candidate) => candidate.folderType === 'business')!;
    source.elements[elementId] = {
      id: elementId, kind: 'element', type: 'BusinessRole', name: 'Conflict', documentation: '',
      properties: [], profileIds: [], folderId: folder.id,
    };
    folder.itemIds.push(elementId);
    expect(() => createModelMergePlan(targetStore.getState().model!, source, {
      updateExisting: true, updateModelInfo: false, updateFolderStructure: false,
    })).toThrow(/different type/i);

    delete source.elements[elementId];
    folder.itemIds = [];
    const plan = createModelMergePlan(targetStore.getState().model!, source, {
      updateExisting: false, updateModelInfo: false, updateFolderStructure: false,
    });
    addElement('BusinessRole', 'Changed', undefined, targetStore);
    expect(() => applyModelMergePlan(targetStore, plan)).toThrow(/changed since the preview/i);
    targetStore.setState({ readOnly: true });
    expect(() => applyModelMergePlan(targetStore, createModelMergePlan(
      targetStore.getState().model!, source,
      { updateExisting: false, updateModelInfo: false, updateFolderStructure: false },
    ))).toThrow(/read-only/i);
  });

  it('matches profiles by case-insensitive type and name, deduplicates assets, and can move folders', () => {
    const targetStore = createModelStore({ model: createEmptyModel('Target') });
    const target = targetStore.getState().model!;
    const targetProfileId = 'profile-target';
    target.profiles[targetProfileId] = {
      id: targetProfileId, name: 'Important', conceptType: 'BusinessActor', specialization: true,
    };
    const bytes = new Uint8Array([1, 2, 3]);
    target.assets['images/existing.png'] = {
      path: 'images/existing.png', mediaType: 'image/png', bytes, renderMediaType: 'image/png',
      renderBytes: bytes, sha256: 'same',
    };
    const sourceStore = createModelStore({ model: createEmptyModel('Source') });
    let source = sourceStore.getState().model!;
    source.profiles['profile-source'] = {
      id: 'profile-source', name: 'important', conceptType: 'BusinessActor', specialization: true,
      imagePath: 'images/profile.png',
    };
    source.assets['images/profile.png'] = {
      path: 'images/profile.png', mediaType: 'image/png', bytes, renderMediaType: 'image/png',
      renderBytes: bytes, sha256: 'same',
    };
    const actor = addElement('BusinessActor', 'Actor', undefined, sourceStore);
    source = sourceStore.getState().model!;
    const businessRoot = Object.values(source.folders).find((folder) => folder.folderType === 'business')!;
    const subfolder = addFolder(businessRoot.id, 'Imported folder', sourceStore);
    source = structuredClone(sourceStore.getState().model!);
    source.elements[actor].profileIds = ['profile-source'];
    source.folders[businessRoot.id].itemIds = source.folders[businessRoot.id].itemIds.filter((id) => id !== actor);
    source.folders[subfolder].itemIds.push(actor);
    source.elements[actor].folderId = subfolder;

    const plan = createModelMergePlan(target, source, {
      updateExisting: true, updateModelInfo: false, updateFolderStructure: true,
    });
    expect(plan.merged.elements[actor].profileIds).toEqual([targetProfileId]);
    expect(plan.merged.profiles['profile-source']).toBeUndefined();
    expect(plan.merged.elements[actor].folderId).toBe(subfolder);
    expect(plan.report.created).toBeGreaterThan(0);
  });

  it('imports higher-order relationships independently of source record order', () => {
    const sourceStore = createModelStore({ model: createEmptyModel('Source') });
    const actor = addElement('BusinessActor', 'Actor', undefined, sourceStore);
    const role = addElement('BusinessRole', 'Role', undefined, sourceStore);
    const assignment = addRelationship(
      'AssignmentRelationship', actor, role, 'Assignment', undefined, sourceStore,
    )!;
    const higherOrder = addRelationship(
      'AssociationRelationship', assignment, role, 'Higher order', undefined, sourceStore,
    )!;
    const source = structuredClone(sourceStore.getState().model!);
    source.relationships = {
      [higherOrder]: source.relationships[higherOrder],
      [assignment]: source.relationships[assignment],
    };
    const relationFolder = Object.values(source.folders).find(
      (folder) => folder.folderType === 'relations',
    )!;
    relationFolder.itemIds = [higherOrder, assignment];

    const target = createEmptyModel('Target');
    const plan = createModelMergePlan(target, source, {
      updateExisting: true,
      updateModelInfo: false,
      updateFolderStructure: false,
    });
    expect(plan.merged.relationships[assignment]).toBeDefined();
    expect(plan.merged.relationships[higherOrder]).toMatchObject({
      sourceId: assignment,
      targetId: role,
    });
    expect(plan.report.skipped).toBe(0);
  });

  it('rejects relationship endpoint updates that invalidate retained view connections', () => {
    const targetStore = createModelStore({ model: createEmptyModel('Target') });
    const actor = addElement('BusinessActor', 'Actor', undefined, targetStore);
    const role = addElement('BusinessRole', 'Role', undefined, targetStore);
    const replacement = addElement('BusinessActor', 'Replacement', undefined, targetStore);
    const relationship = addRelationship(
      'AssociationRelationship', actor, role, 'Association', undefined, targetStore,
    )!;
    const view = addView('Target-only view', undefined, targetStore);
    const actorNode = addElementNodeToView(
      view, actor, view, { x: 10, y: 10, width: 120, height: 55 }, false, {}, targetStore,
    );
    const roleNode = addElementNodeToView(
      view, role, view, { x: 210, y: 10, width: 120, height: 55 }, false, {}, targetStore,
    );
    addConnectionToView(view, relationship, actorNode, roleNode, targetStore);

    const source = structuredClone(targetStore.getState().model!);
    const sourceView = source.views[view];
    delete source.views[view];
    for (const [id, node] of Object.entries(source.nodes)) {
      if (node.viewId === view) delete source.nodes[id];
    }
    for (const [id, connection] of Object.entries(source.connections)) {
      if (connection.viewId === view) delete source.connections[id];
    }
    source.folders[sourceView.folderId].itemIds = source.folders[sourceView.folderId].itemIds
      .filter((id) => id !== view);
    source.relationships[relationship].sourceId = replacement;

    expect(() => createModelMergePlan(targetStore.getState().model!, source, {
      updateExisting: true, updateModelInfo: false, updateFolderStructure: false,
    })).toThrow(/connection topology|semantic endpoint mismatch/i);
  });

  it('rejects profile IDs that collide with another global object kind', () => {
    const targetStore = createModelStore({ model: createEmptyModel('Target') });
    const elementId = addElement('BusinessActor', 'Actor', undefined, targetStore);
    const source = createEmptyModel('Source');
    source.profiles[elementId] = {
      id: elementId,
      name: 'Collision',
      conceptType: 'BusinessActor',
      specialization: true,
    };

    expect(() => createModelMergePlan(targetStore.getState().model!, source, {
      updateExisting: true, updateModelInfo: false, updateFolderStructure: false,
    })).toThrow(/different type/i);
  });

  it('rejects imported views whose connections disagree with retained relationships', () => {
    const targetStore = createModelStore({ model: createEmptyModel('Target') });
    const actor = addElement('BusinessActor', 'Actor', undefined, targetStore);
    const role = addElement('BusinessRole', 'Role', undefined, targetStore);
    const replacement = addElement('BusinessActor', 'Replacement', undefined, targetStore);
    const relationship = addRelationship(
      'AssociationRelationship', actor, role, 'Association', undefined, targetStore,
    )!;
    const sourceStore = createModelStore({ model: structuredClone(targetStore.getState().model!) });
    sourceStore.getState().model!.relationships[relationship].sourceId = replacement;
    const view = addView('Imported view', undefined, sourceStore);
    const replacementNode = addElementNodeToView(
      view, replacement, view, { x: 10, y: 10, width: 120, height: 55 }, false, {}, sourceStore,
    );
    const roleNode = addElementNodeToView(
      view, role, view, { x: 210, y: 10, width: 120, height: 55 }, false, {}, sourceStore,
    );
    addConnectionToView(view, relationship, replacementNode, roleNode, sourceStore);

    expect(() => createModelMergePlan(
      targetStore.getState().model!, sourceStore.getState().model!, {
        updateExisting: false, updateModelInfo: false, updateFolderStructure: false,
      },
    )).toThrow(/connection topology|semantic endpoint mismatch/i);
  });

  it('rejects a child folder ID that collides with a target root folder', () => {
    const target = createEmptyModel('Target');
    const targetBusinessRoot = Object.values(target.folders).find(
      (folder) => folder.folderType === 'business',
    )!;
    const source = createEmptyModel('Source');
    const sourceBusinessRoot = Object.values(source.folders).find(
      (folder) => folder.folderType === 'business',
    )!;
    source.folders[targetBusinessRoot.id] = {
      id: targetBusinessRoot.id,
      kind: 'folder',
      name: 'Conflicting child',
      documentation: '',
      properties: [],
      parentId: sourceBusinessRoot.id,
      folderIds: [],
      itemIds: [],
    };
    sourceBusinessRoot.folderIds.push(targetBusinessRoot.id);

    expect(() => createModelMergePlan(target, source, {
      updateExisting: true, updateModelInfo: false, updateFolderStructure: true,
    })).toThrow(/different type/i);
  });
});
