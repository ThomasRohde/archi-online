import { describe, expect, it } from 'vitest';
import { addElement, addFolder, addView, createEmptyModel } from '../src/model/ops';
import { createModelStore } from '../src/model/store';
import {
  getTreeRowsForWindow,
  getTreeRowWindow,
  projectModelTreeRows,
} from '../src/ui/tree-row-projection';

describe('model tree row projection', () => {
  it('flattens model, folder, concept, and view rows with accessible levels', () => {
    const model = createEmptyModel('Projection');
    const store = createModelStore({ model });
    const diagrams = Object.values(model.folders).find((folder) => folder.folderType === 'diagrams')!;
    const business = Object.values(model.folders).find((folder) => folder.folderType === 'business')!;
    const nested = addFolder(business.id, 'Nested', store);
    const element = addElement('BusinessActor', 'Actor', nested, store);
    const secondElement = addElement('BusinessActor', 'Second actor', nested, store);
    const view = addView('View', diagrams.id, store);
    const current = store.getState().model!;

    const rows = projectModelTreeRows(current, new Set(), 'session', false, new Set());
    expect(rows[0]).toMatchObject({ id: current.info.id, kind: 'model', level: 1 });
    expect(rows.find((row) => row.id === nested)).toMatchObject({ kind: 'folder', level: 3 });
    expect(rows.find((row) => row.id === element)).toMatchObject({
      kind: 'element',
      level: 4,
      posInSet: 1,
      setSize: 2,
    });
    expect(rows.find((row) => row.id === secondElement)).toMatchObject({
      posInSet: 2,
      setSize: 2,
    });
    expect(rows.find((row) => row.id === view)).toMatchObject({ kind: 'view', level: 3 });
  });

  it('omits descendants of collapsed rows and bounds a 5,000-row DOM window', () => {
    const model = createEmptyModel('Large');
    const business = Object.values(model.folders).find((folder) => folder.folderType === 'business')!;
    const collapsed = new Set([`session:${business.id}`]);
    const rows = projectModelTreeRows(model, collapsed, 'session', false, new Set());
    expect(rows.some((row) => row.parentId === business.id)).toBe(false);

    const window = getTreeRowWindow(5_000, 22_000, 440);
    expect(window.end - window.start).toBeLessThanOrEqual(40);
    expect(window.start).toBeGreaterThan(0);

    const windowed = getTreeRowsForWindow(rows, { start: 1, end: 3, offset: 22, totalHeight: 66 }, rows[0].id);
    expect(windowed.map((entry) => entry.index)).toEqual([0, 1, 2]);
  });
});
