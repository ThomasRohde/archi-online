import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArchimate } from '../src/model/io/archimate-xml';
import { createEmptyModel } from '../src/model/ops';
import { viewsInTreeOrder } from '../src/ui/PresentationMode';

const archisurance = readFileSync(join(__dirname, 'fixtures', 'Archisurance.archimate'), 'utf8');
const model = parseArchimate(archisurance);

describe('viewsInTreeOrder', () => {
  const order = viewsInTreeOrder(model);

  it('includes every view exactly once', () => {
    expect(order.length).toBe(Object.keys(model.views).length);
    expect(new Set(order).size).toBe(order.length);
  });

  it('walks folders the way the model tree displays them', () => {
    // Views directly under the same folder must appear in alphabetical order.
    const byFolder = new Map<string, string[]>();
    for (const id of order) {
      const view = model.views[id];
      const list = byFolder.get(view.folderId) ?? [];
      list.push(view.name);
      byFolder.set(view.folderId, list);
    }
    for (const names of byFolder.values()) {
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      expect(names).toEqual(sorted);
    }
  });

  it('uses the same evaluated labels as the model tree', () => {
    const labelled = createEmptyModel('Labelled order');
    const folder = Object.values(labelled.folders).find((candidate) => candidate.folderType === 'diagrams')!;
    folder.labelExpression = '${property:sort}';
    labelled.views.first = {
      id: 'first',
      kind: 'view',
      name: 'A raw name',
      documentation: '',
      properties: [{ key: 'sort', value: 'Zulu' }],
      folderId: folder.id,
      childIds: [],
    };
    labelled.views.second = {
      id: 'second',
      kind: 'view',
      name: 'Z raw name',
      documentation: '',
      properties: [{ key: 'sort', value: 'Alpha' }],
      folderId: folder.id,
      childIds: [],
    };
    folder.itemIds.push('first', 'second');

    expect(viewsInTreeOrder(labelled)).toEqual(['second', 'first']);
  });
});
