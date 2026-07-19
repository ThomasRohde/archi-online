import { describe, expect, it } from 'vitest';
import { deriveCompositionTree, type CompositionTreeNode } from '../src/model/composition-tree';
import { createEmptyModel } from '../src/model/ops';
import type { ModelState } from '../src/model/types';
import type { ElementType, RelationshipType } from '../src/model/metamodel';

function addElement(model: ModelState, id: string, name = id, type: ElementType = 'Capability') {
  model.elements[id] = {
    id, kind: 'element', type, name, documentation: '', properties: [], profileIds: [],
    folderId: model.rootFolderIds[0],
  };
}

function addRel(
  model: ModelState,
  id: string,
  sourceId: string,
  targetId: string,
  type: RelationshipType = 'CompositionRelationship',
) {
  model.relationships[id] = {
    id, kind: 'relationship', type, name: '', documentation: '', properties: [],
    profileIds: [], folderId: model.rootFolderIds[0], sourceId, targetId,
  };
}

function flatten(node: CompositionTreeNode): string[] {
  return [node.elementId, ...node.children.flatMap(flatten)];
}

function childIds(node: CompositionTreeNode): string[] {
  return node.children.map((child) => child.elementId);
}

describe('deriveCompositionTree', () => {
  it('derives a chain hierarchy from composition relationships', () => {
    const model = createEmptyModel('t');
    for (const id of ['root', 'mid', 'deep']) addElement(model, id);
    addRel(model, 'r1', 'root', 'mid');
    addRel(model, 'r2', 'mid', 'deep');
    const result = deriveCompositionTree(model, { rootIds: ['root'] });
    expect(result.elementIds).toEqual(['root', 'mid', 'deep']);
    expect(result.parentOf).toEqual({ mid: 'root', deep: 'mid' });
    expect(result.roots[0].children[0].children[0].depth).toBe(2);
    expect(result.duplicates).toEqual({});
    expect(result.cyclesBroken).toEqual([]);
  });

  it('prefers Composition over Aggregation on diamond conflicts and reports duplicates', () => {
    const model = createEmptyModel('t');
    for (const id of ['root', 'a', 'b', 'shared']) addElement(model, id);
    addRel(model, 'r1', 'root', 'a');
    addRel(model, 'r2', 'root', 'b');
    addRel(model, 'r3', 'a', 'shared', 'AggregationRelationship');
    addRel(model, 'r4', 'b', 'shared', 'CompositionRelationship');
    const result = deriveCompositionTree(model, { rootIds: ['root'] });
    expect(result.parentOf['shared']).toBe('b');
    expect(result.duplicates).toEqual({ shared: ['a'] });
  });

  it('falls back to alphabetical parent order when relationship types tie', () => {
    const model = createEmptyModel('t');
    addElement(model, 'root');
    addElement(model, 'p1', 'Zulu');
    addElement(model, 'p2', 'Alpha');
    addElement(model, 'shared');
    addRel(model, 'r1', 'root', 'p1');
    addRel(model, 'r2', 'root', 'p2');
    addRel(model, 'r3', 'p1', 'shared');
    addRel(model, 'r4', 'p2', 'shared');
    const result = deriveCompositionTree(model, { rootIds: ['root'] });
    expect(result.parentOf['shared']).toBe('p2');
    expect(result.duplicates).toEqual({ shared: ['p1'] });
  });

  it('breaks self and mutual cycles', () => {
    const model = createEmptyModel('t');
    for (const id of ['root', 'a']) addElement(model, id);
    addRel(model, 'self', 'root', 'root');
    addRel(model, 'down', 'root', 'a');
    addRel(model, 'up', 'a', 'root');
    const result = deriveCompositionTree(model, { rootIds: ['root'] });
    expect(result.elementIds).toEqual(['root', 'a']);
    expect(result.cyclesBroken.map((entry) => entry.relationshipId).sort())
      .toEqual(['self', 'up']);
  });

  it('stops expanding at the depth limit', () => {
    const model = createEmptyModel('t');
    for (const id of ['root', 'mid', 'deep']) addElement(model, id);
    addRel(model, 'r1', 'root', 'mid');
    addRel(model, 'r2', 'mid', 'deep');
    const result = deriveCompositionTree(model, { rootIds: ['root'], depth: 1 });
    expect(result.elementIds).toEqual(['root', 'mid']);
  });

  it('filters children by element type, defaulting to the root types', () => {
    const model = createEmptyModel('t');
    addElement(model, 'root');
    addElement(model, 'cap');
    addElement(model, 'proc', 'proc', 'BusinessProcess');
    addRel(model, 'r1', 'root', 'cap');
    addRel(model, 'r2', 'root', 'proc');
    const byDefault = deriveCompositionTree(model, { rootIds: ['root'] });
    expect(byDefault.elementIds).toEqual(['root', 'cap']);
    const widened = deriveCompositionTree(model, {
      rootIds: ['root'],
      elementTypes: ['Capability', 'BusinessProcess'],
    });
    expect(widened.elementIds.sort()).toEqual(['cap', 'proc', 'root']);
  });

  it('supports target-is-parent direction', () => {
    const model = createEmptyModel('t');
    for (const id of ['root', 'part']) addElement(model, id);
    addRel(model, 'r1', 'part', 'root');
    const result = deriveCompositionTree(model, {
      rootIds: ['root'],
      direction: 'target-is-parent',
    });
    expect(result.parentOf['part']).toBe('root');
  });

  it('sorts children by name and returns a stable pre-order', () => {
    const model = createEmptyModel('t');
    addElement(model, 'root');
    addElement(model, 'c1', 'Zulu');
    addElement(model, 'c2', 'Alpha');
    addElement(model, 'c3', 'Mike');
    addRel(model, 'r1', 'root', 'c1');
    addRel(model, 'r2', 'root', 'c2');
    addRel(model, 'r3', 'root', 'c3');
    const result = deriveCompositionTree(model, { rootIds: ['root'] });
    expect(childIds(result.roots[0])).toEqual(['c2', 'c3', 'c1']);
    expect(flatten(result.roots[0])).toEqual(result.elementIds);
  });

  it('ignores unknown roots and de-duplicates repeated roots', () => {
    const model = createEmptyModel('t');
    addElement(model, 'root');
    const result = deriveCompositionTree(model, { rootIds: ['root', 'root', 'ghost'] });
    expect(result.elementIds).toEqual(['root']);
  });
});
