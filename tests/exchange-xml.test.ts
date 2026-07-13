import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeAbsBounds } from '../src/canvas/view-editor/bounds';
import { createConnectionRouteResolver } from '../src/canvas/geometry';
import { parseArchimate } from '../src/model/io/archimate-xml';
import {
  isExchangeXml,
  parseExchange,
  parseExchangeDocument,
  serializeExchange,
  validateExchangeXml,
} from '../src/model/io/exchange-xml';
import { createEmptyModel } from '../src/model/ops/concepts';
import { attachConnection } from '../src/model/ops/draft';
import type { ModelState } from '../src/model/types';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

const sample1 = fixture('exchange-sample1.xml');
const bendpointSample = fixture('exchange-bendpoint.xml');
const archisurance = fixture('Archisurance.archimate');

function folderOfType(m: ModelState, type: string) {
  return m.rootFolderIds.map((id) => m.folders[id]).find((f) => f.folderType === type)!;
}

function connectionPropertyModel(): ModelState {
  const m = createEmptyModel('Connection properties');
  m.info.id = 'connection-property-model';
  const business = folderOfType(m, 'business');
  for (const [id, type] of [
    ['actor', 'BusinessActor'],
    ['role', 'BusinessRole'],
    ['object', 'BusinessObject'],
  ] as const) {
    m.elements[id] = {
      id,
      kind: 'element',
      type,
      name: id,
      documentation: '',
      properties: [],
      profileIds: [],
      folderId: business.id,
    };
    business.itemIds.push(id);
  }

  const relations = folderOfType(m, 'relations');
  m.relationships['base-rel'] = {
    id: 'base-rel',
    kind: 'relationship',
    type: 'AssignmentRelationship',
    name: 'Base',
    documentation: '',
    properties: [],
    profileIds: [],
    folderId: relations.id,
    sourceId: 'actor',
    targetId: 'role',
  };
  m.relationships['dependent-rel'] = {
    id: 'dependent-rel',
    kind: 'relationship',
    type: 'AssociationRelationship',
    name: 'Dependent',
    documentation: '',
    properties: [],
    profileIds: [],
    folderId: relations.id,
    sourceId: 'base-rel',
    targetId: 'object',
  };
  relations.itemIds.push('base-rel', 'dependent-rel');

  const diagrams = folderOfType(m, 'diagrams');
  m.views.view = {
    id: 'view',
    kind: 'view',
    name: 'Connection properties',
    documentation: '',
    properties: [],
    folderId: diagrams.id,
    childIds: ['actor-node', 'role-node', 'object-node', 'note-node'],
  };
  diagrams.itemIds.push('view');
  for (const [id, elementId, x, y] of [
    ['actor-node', 'actor', 0, 0],
    ['role-node', 'role', 240, 0],
    ['object-node', 'object', 240, 180],
  ] as const) {
    m.nodes[id] = {
      id,
      viewId: 'view',
      parentId: 'view',
      bounds: { x, y, width: 100, height: 40 },
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      nodeType: 'element',
      elementId,
    };
  }
  m.nodes['note-node'] = {
    id: 'note-node',
    viewId: 'view',
    parentId: 'view',
    bounds: { x: 0, y: 180, width: 140, height: 70 },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    nodeType: 'note',
    content: 'Note',
    properties: [],
  };

  attachConnection(m, {
    id: 'base-connection',
    viewId: 'view',
    connType: 'relationship',
    relationshipId: 'base-rel',
    name: 'Base occurrence',
    documentation: '',
    properties: [
      { key: 'shared-key', value: 'semantic first' },
      { key: 'semantic-only', value: 'semantic middle' },
      { key: 'shared-key', value: 'semantic last' },
    ],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    sourceId: 'actor-node',
    targetId: 'role-node',
    bendpoints: [],
  });
  attachConnection(m, {
    id: 'dependent-connection',
    viewId: 'view',
    connType: 'relationship',
    relationshipId: 'dependent-rel',
    name: 'Dependent occurrence',
    documentation: '',
    properties: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    sourceId: 'base-connection',
    targetId: 'object-node',
    bendpoints: [{ startX: 30, startY: 60, endX: -90, endY: -40 }],
  });
  attachConnection(m, {
    id: 'plain-connection',
    viewId: 'view',
    connType: 'plain',
    name: 'Plain note connection',
    documentation: '',
    properties: [
      { key: 'plain-only', value: 'plain first' },
      { key: 'shared-key', value: 'plain last' },
    ],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    sourceId: 'note-node',
    targetId: 'actor-node',
    bendpoints: [],
  });
  return m;
}

function viewsOnlyExchange(diagrams: string, propertyDefinitions = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" identifier="model-malformed">
  <name xml:lang="en">Malformed views</name>
  <elements><element identifier="fixture-element" xsi:type="BusinessActor"><name xml:lang="en">Fixture</name></element></elements>
  ${propertyDefinitions}
  <views><diagrams>${diagrams}</diagrams></views>
</model>`;
}

function labelNode(id: string, x: number): string {
  return `<node identifier="${id}" xsi:type="Label" x="${x}" y="0" w="100" h="40"><label xml:lang="en">${id}</label></node>`;
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

describe('Open Exchange view-connection fidelity', () => {
  it('round-trips ordered properties on plain and relationship connections with shared definitions', async () => {
    const model = connectionPropertyModel();
    const xml = serializeExchange(model);
    const back = parseExchange(xml);

    expect(back.connections['plain-connection'].properties).toEqual(
      model.connections['plain-connection'].properties,
    );
    expect(back.connections['base-connection'].properties).toEqual(
      model.connections['base-connection'].properties,
    );

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const definitions = Array.from(doc.getElementsByTagNameNS('*', 'propertyDefinition'));
    const sharedDefinition = definitions.find(
      (definition) =>
        definition.getElementsByTagNameNS('*', 'name')[0]?.textContent === 'shared-key',
    );
    expect(sharedDefinition).toBeDefined();
    const sharedId = sharedDefinition!.getAttribute('identifier');
    const sharedReferences = Array.from(doc.getElementsByTagNameNS('*', 'property')).filter(
      (property) => property.getAttribute('propertyDefinitionRef') === sharedId,
    );
    expect(sharedReferences).toHaveLength(3);
    const diagnostics = await validateExchangeXml(xml);
    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
  });

  it('round-trips a manual route whose relationship endpoint is another connection', () => {
    const model = connectionPropertyModel();
    const beforeRoute = createConnectionRouteResolver(
      model,
      computeAbsBounds(model, 'view'),
    )('dependent-connection');

    const back = parseExchange(serializeExchange(model));
    const afterRoute = createConnectionRouteResolver(
      back,
      computeAbsBounds(back, 'view'),
    )('dependent-connection');

    expect(model.connections['dependent-connection'].bendpoints).not.toHaveLength(0);
    expect(back.connections['dependent-connection'].bendpoints).not.toHaveLength(0);
    expect(afterRoute).toEqual(beforeRoute);
  });

  it('counts annotation and connection properties in import diagnostics', () => {
    const propertyDefinitions = `<propertyDefinitions>
      <propertyDefinition identifier="annotation-property" type="string"><name xml:lang="en">annotation</name></propertyDefinition>
      <propertyDefinition identifier="connection-property" type="string"><name xml:lang="en">connection</name></propertyDefinition>
    </propertyDefinitions>`;
    const xml = viewsOnlyExchange(
      `<view identifier="view" xsi:type="Diagram"><name xml:lang="en">Properties</name>
        <node identifier="source" xsi:type="Label" x="0" y="0" w="100" h="40">
          <label xml:lang="en">Source</label>
          <properties><property propertyDefinitionRef="annotation-property"><value xml:lang="en">node value</value></property></properties>
        </node>
        ${labelNode('target', 200)}
        <connection identifier="line" xsi:type="Line" source="source" target="target">
          <properties><property propertyDefinitionRef="connection-property"><value xml:lang="en">connection value</value></property></properties>
        </connection>
      </view>`,
      propertyDefinitions,
    );

    const result = parseExchangeDocument(xml);

    expect(result.errors).toEqual([]);
    expect(result.model?.nodes.source).toMatchObject({
      properties: [{ key: 'annotation', value: 'node value' }],
    });
    expect(result.model?.connections.line).toMatchObject({
      properties: [{ key: 'connection', value: 'connection value' }],
    });
    expect(result.counts.properties).toBe(2);
  });
});

describe('Open Exchange diagram object identifiers', () => {
  it.each([
    [
      'duplicate nodes in one view',
      viewsOnlyExchange(
        `<view identifier="view" xsi:type="Diagram"><name xml:lang="en">View</name>${labelNode('duplicate', 0)}${labelNode('duplicate', 200)}</view>`,
      ),
    ],
    [
      'duplicate nodes across views',
      viewsOnlyExchange(
        `<view identifier="view-a" xsi:type="Diagram"><name xml:lang="en">A</name>${labelNode('duplicate', 0)}</view>
         <view identifier="view-b" xsi:type="Diagram"><name xml:lang="en">B</name>${labelNode('duplicate', 0)}</view>`,
      ),
    ],
    [
      'a node colliding with an earlier connection in another view',
      viewsOnlyExchange(
        `<view identifier="view-a" xsi:type="Diagram"><name xml:lang="en">A</name>
           ${labelNode('source', 0)}${labelNode('target', 200)}
           <connection identifier="duplicate" xsi:type="Line" source="source" target="target"/>
         </view>
         <view identifier="view-b" xsi:type="Diagram"><name xml:lang="en">B</name>${labelNode('duplicate', 0)}</view>`,
      ),
    ],
  ])('rejects %s', (_label, xml) => {
    expect(() => parseExchange(xml)).toThrow('Duplicate diagram object id: duplicate');
  });
});

describe('Open Exchange connectable connection endpoints', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" identifier="model-connectables">
  <name xml:lang="en">Connectables</name>
  <elements>
    <element identifier="a" xsi:type="BusinessActor"><name xml:lang="en">A</name></element>
    <element identifier="b" xsi:type="BusinessRole"><name xml:lang="en">B</name></element>
  </elements>
  <relationships>
    <relationship identifier="base" source="a" target="b" xsi:type="Assignment"/>
    <relationship identifier="meta" source="base" target="b" xsi:type="Association"/>
  </relationships>
  <views>
    <diagrams>
      <view identifier="view" xsi:type="Diagram">
        <name xml:lang="en">View</name>
        <node identifier="node-a" elementRef="a" xsi:type="Element" x="0" y="0" w="120" h="55"/>
        <node identifier="node-b" elementRef="b" xsi:type="Element" x="240" y="0" w="120" h="55"/>
        <node identifier="note" xsi:type="Label" x="120" y="120" w="180" h="80"><label xml:lang="en">Note</label></node>
        <connection identifier="meta-connection" relationshipRef="meta" xsi:type="Relationship" source="base-connection" target="node-b">
          <label xml:lang="en">Metadata link</label>
          <documentation xml:lang="en">Connection documentation</documentation>
        </connection>
        <connection identifier="line" xsi:type="Line" source="note" target="base-connection"/>
        <connection identifier="base-connection" relationshipRef="base" xsi:type="Relationship" source="node-a" target="node-b"/>
      </view>
    </diagrams>
  </views>
</model>`;

  it('resolves forward node-or-connection IDREF endpoints in two passes', () => {
    const model = parseExchange(xml);

    expect(model.connections['meta-connection']).toMatchObject({
      sourceId: 'base-connection',
      targetId: 'node-b',
      name: 'Metadata link',
      documentation: 'Connection documentation',
      properties: [],
    });
    expect(model.connections.line).toBeUndefined();
    expect(model.connections['base-connection'].sourceConnectionIds).toEqual(['meta-connection']);
    expect(model.connections['base-connection'].targetConnectionIds).toEqual([]);
  });

  it('serializes connection IDREF endpoints and editable fields losslessly', () => {
    const model = parseExchange(xml);
    const serialized = serializeExchange(model);
    const back = parseExchange(serialized);

    expect(serialized).toContain('source="base-connection" target="node-b"');
    expect(serialized).not.toContain('source="note" target="base-connection"');
    expect(back.connections['meta-connection']).toMatchObject({
      sourceId: 'base-connection',
      targetId: 'node-b',
      name: 'Metadata link',
      documentation: 'Connection documentation',
      properties: [],
    });
  });

  it('rejects missing connection endpoints instead of partially importing the view', () => {
    expect(() => parseExchange(xml.replace('target="base-connection"', 'target="missing"')))
      .toThrow(/endpoint.*missing/i);
  });

  it('rejects a relationship occurrence whose visual source represents another semantic concept', () => {
    const contradictory = xml.replace(
      'identifier="meta" source="base" target="b"',
      'identifier="meta" source="a" target="b"',
    );

    expect(() => parseExchange(contradictory)).toThrow(/semantic endpoint mismatch/i);
  });

  it('rejects export of a relationship occurrence whose visual endpoints contradict its relationship', () => {
    const model = parseExchange(xml);
    model.connections['meta-connection'].sourceId = 'node-a';

    expect(() => serializeExchange(model)).toThrow(/semantic endpoint mismatch/i);
  });
});
