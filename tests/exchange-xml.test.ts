import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArchimate } from '../src/model/io/archimate-xml';
import { isExchangeXml, parseExchange, serializeExchange } from '../src/model/io/exchange-xml';
import { createEmptyModel } from '../src/model/ops/concepts';
import type { ModelState } from '../src/model/types';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

const sample1 = fixture('exchange-sample1.xml');
const bendpointSample = fixture('exchange-bendpoint.xml');
const archisurance = fixture('Archisurance.archimate');

function folderOfType(m: ModelState, type: string) {
  return m.rootFolderIds.map((id) => m.folders[id]).find((f) => f.folderType === type)!;
}

describe('isExchangeXml', () => {
  it('distinguishes exchange files from .archimate files', () => {
    expect(isExchangeXml(sample1)).toBe(true);
    expect(isExchangeXml(archisurance)).toBe(false);
  });
});

describe('parseExchange — Sample1 (Archi test data)', () => {
  const m = parseExchange(sample1);

  it('reads the model header', () => {
    expect(m.info.id).toBe('id-11f5304f');
    expect(m.info.name).toBe('Test');
  });

  it('reads elements into their layer folders', () => {
    const role = m.elements['id-37d5bc4b'];
    expect(role.type).toBe('BusinessRole');
    expect(role.name).toBe('Sales Person');
    expect(role.documentation).toBe('A description of a sales person');
    const business = folderOfType(m, 'business');
    expect(business.itemIds).toContain(role.id);
    expect(m.elements['id-89c22226'].type).toBe('BusinessProcess');
  });

  it('reads relationships with endpoints', () => {
    const rel = m.relationships['id-52b86b7b'];
    expect(rel.type).toBe('AssignmentRelationship');
    expect(rel.sourceId).toBe('id-37d5bc4b');
    expect(rel.targetId).toBe('id-89c22226');
    expect(folderOfType(m, 'relations').itemIds).toContain(rel.id);
  });
});

describe('parseExchange — bendpoint attachments (Archi test data)', () => {
  const m = parseExchange(bendpointSample);

  it('reads nodes with absolute bounds', () => {
    const node = m.nodes['id-019dd58c-3116-72be-8618-072b804c1e6d'];
    expect(node.bounds).toEqual({ x: 0, y: 0, width: 200, height: 70 });
  });

  it('converts source/target attachments into a midpoint bendpoint', () => {
    const conn = m.connections['id-019dd58d-4fcc-7b66-bbe6-ad9d4c3efc06'];
    expect(conn.bendpoints.length).toBe(1);
    // Midpoint of (35,138)-(35,70) is (35,104); source node center is (100,173).
    expect(conn.bendpoints[0].startX).toBe(35 - 100);
    expect(conn.bendpoints[0].startY).toBe(104 - 173);
  });

  it('registers connections on their nodes', () => {
    const src = m.nodes['id-019dd58c-3116-72be-8618-072b804c1e6d'];
    expect(src.sourceConnectionIds.length).toBe(1);
    expect(src.targetConnectionIds.length).toBe(1);
  });
});

describe('Open Exchange round-trip of Archisurance', () => {
  const original = parseArchimate(archisurance);
  const xml = serializeExchange(original);
  const roundTripped = parseExchange(xml);

  // Archisurance ids start with digits, so export prefixes them (per Archi).
  const xid = (id: string) => (/^\d/.test(id) ? `id-${id}` : id);

  it('produces a namespaced exchange document', () => {
    expect(xml).toContain('xmlns="http://www.opengroup.org/xsd/archimate/3.0/"');
    expect(xml).toContain(`identifier="${xid(original.info.id)}"`);
  });

  it('preserves every element with name and type', () => {
    expect(Object.keys(roundTripped.elements).length).toBe(Object.keys(original.elements).length);
    for (const el of Object.values(original.elements)) {
      const back = roundTripped.elements[xid(el.id)];
      expect(back, `element ${el.id} (${el.name})`).toBeTruthy();
      expect(back.type).toBe(el.type);
      expect(back.name).toBe(el.name.replace(/\s+/g, ' ').trim());
      expect(back.junctionType ?? 'and').toBe(el.junctionType ?? 'and');
    }
  });

  it('preserves relationships including access/influence/directed extras', () => {
    expect(Object.keys(roundTripped.relationships).length).toBe(
      Object.keys(original.relationships).length,
    );
    for (const rel of Object.values(original.relationships)) {
      const back = roundTripped.relationships[xid(rel.id)];
      expect(back, `relationship ${rel.id}`).toBeTruthy();
      expect(back.type).toBe(rel.type);
      expect(back.sourceId).toBe(xid(rel.sourceId));
      expect(back.targetId).toBe(xid(rel.targetId));
      if (rel.type === 'AccessRelationship') {
        expect(back.accessType ?? 0).toBe(rel.accessType ?? 0);
      }
      if (rel.strength) expect(back.strength).toBe(rel.strength);
      if (rel.directed) expect(back.directed).toBe(true);
    }
  });

  it('preserves views and their node geometry', () => {
    expect(Object.keys(roundTripped.views).length).toBe(Object.keys(original.views).length);
    for (const view of Object.values(original.views)) {
      const back = roundTripped.views[xid(view.id)];
      expect(back, `view ${view.name}`).toBeTruthy();
      expect(back.name).toBe(view.name.replace(/\s+/g, ' ').trim());
      // Same node population.
      const originalNodes = Object.values(original.nodes).filter((n) => n.viewId === view.id);
      const backNodes = Object.values(roundTripped.nodes).filter((n) => n.viewId === back.id);
      expect(backNodes.length).toBe(originalNodes.length);
      for (const node of originalNodes) {
        const backNode = roundTripped.nodes[xid(node.id)];
        expect(backNode, `node ${node.id} in ${view.name}`).toBeTruthy();
        expect(backNode.bounds.width).toBe(node.bounds.width);
        expect(backNode.bounds.height).toBe(node.bounds.height);
        expect(backNode.nodeType).toBe(node.nodeType);
      }
    }
  });

  it('preserves relative positions of sibling nodes (offset compensation)', () => {
    for (const view of Object.values(original.views)) {
      const tops = view.childIds.map((id) => original.nodes[id]).filter(Boolean);
      if (tops.length < 2) continue;
      const [a, b] = tops;
      const backA = roundTripped.nodes[xid(a.id)];
      const backB = roundTripped.nodes[xid(b.id)];
      expect(backA.bounds.x - backB.bounds.x).toBe(a.bounds.x - b.bounds.x);
      expect(backA.bounds.y - backB.bounds.y).toBe(a.bounds.y - b.bounds.y);
    }
  });

  it('preserves the folder organization including subfolders', () => {
    const subfolderNames = (m: ModelState, type: string): string[] => {
      const names: string[] = [];
      const walk = (fid: string) => {
        const f = m.folders[fid];
        if (!f) return;
        for (const sub of f.folderIds) {
          names.push(m.folders[sub]?.name ?? '');
          walk(sub);
        }
      };
      const top = m.rootFolderIds.map((id) => m.folders[id]).find((f) => f.folderType === type);
      if (top) walk(top.id);
      return names.sort();
    };
    for (const type of ['business', 'application', 'technology', 'relations', 'diagrams']) {
      expect(subfolderNames(roundTripped, type)).toEqual(subfolderNames(original, type));
    }
    // Objects land in the same-named folders.
    for (const el of Object.values(original.elements)) {
      const origFolder = original.folders[el.folderId];
      const backFolder = roundTripped.folders[roundTripped.elements[xid(el.id)].folderId];
      expect(backFolder.name).toBe(origFolder.name);
    }
  });

  it('preserves properties through the propertyDefinitions table', () => {
    for (const el of Object.values(original.elements)) {
      if (el.properties.length === 0) continue;
      const back = roundTripped.elements[xid(el.id)];
      expect(back.properties).toEqual(el.properties);
    }
    expect(roundTripped.info.properties).toEqual(original.info.properties);
  });

  it('preserves viewpoints through the name mapping', () => {
    for (const view of Object.values(original.views)) {
      if (!view.viewpoint) continue;
      const back = roundTripped.views[xid(view.id)];
      expect(back.viewpoint, `viewpoint of ${view.name}`).toBe(view.viewpoint);
    }
  });

  it('keeps non-digit ids stable', () => {
    for (const el of Object.values(original.elements)) {
      if (!/^\d/.test(el.id)) {
        expect(roundTripped.elements[el.id]).toBeTruthy();
      }
    }
  });
});

describe('Open Exchange round-trip of editable non-concept properties', () => {
  it('preserves folder, group, and note properties', () => {
    const m = createEmptyModel('Properties');
    m.info.id = 'model-props';

    const business = folderOfType(m, 'business');
    m.elements.actor = {
      id: 'actor',
      kind: 'element',
      type: 'BusinessActor',
      name: 'Actor',
      documentation: '',
      properties: [],
      profileIds: [],
      folderId: business.id,
    };
    business.itemIds.push('actor');

    const diagrams = folderOfType(m, 'diagrams');
    m.folders['folder-props'] = {
      id: 'folder-props',
      kind: 'folder',
      name: 'Folder Props',
      documentation: '',
      properties: [{ key: 'folder-key', value: 'folder-value' }],
      parentId: diagrams.id,
      folderIds: [],
      itemIds: ['view-props'],
    };
    diagrams.folderIds.push('folder-props');

    m.views['view-props'] = {
      id: 'view-props',
      kind: 'view',
      name: 'Property View',
      documentation: '',
      properties: [],
      folderId: 'folder-props',
      childIds: ['group-props', 'note-props'],
    };
    m.nodes['group-props'] = {
      id: 'group-props',
      viewId: 'view-props',
      parentId: 'view-props',
      bounds: { x: 10, y: 20, width: 200, height: 120 },
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      nodeType: 'group',
      name: 'Group Props',
      documentation: '',
      properties: [{ key: 'group-key', value: 'group-value' }],
    };
    m.nodes['note-props'] = {
      id: 'note-props',
      viewId: 'view-props',
      parentId: 'view-props',
      bounds: { x: 250, y: 20, width: 150, height: 80 },
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      nodeType: 'note',
      content: 'Note Props',
      properties: [{ key: 'note-key', value: 'note-value' }],
    };

    const back = parseExchange(serializeExchange(m));
    const backFolder = Object.values(back.folders).find((f) => f.name === 'Folder Props');

    expect(backFolder?.properties).toEqual([{ key: 'folder-key', value: 'folder-value' }]);
    expect(back.nodes['group-props']).toMatchObject({
      properties: [{ key: 'group-key', value: 'group-value' }],
    });
    expect(back.nodes['note-props']).toMatchObject({
      properties: [{ key: 'note-key', value: 'note-value' }],
    });
  });
});
