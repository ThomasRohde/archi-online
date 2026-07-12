import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { C4_PROPERTY_KEYS, c4KindForConcept, c4PropertyValue, c4ViewType } from '../src/model/c4';
import { parseArchimate, serializeArchimate } from '../src/model/io/archimate-xml';
import { createEmptyModel } from '../src/model/ops';
import type { ModelState } from '../src/model/types';

const archisurance = readFileSync(join(__dirname, 'fixtures', 'Archisurance.archimate'), 'utf8');
const archiOnlineCapabilityModel = readFileSync(
  join(__dirname, '..', 'public', 'examples', 'archi-online-capability-model.archimate'),
  'utf8',
);
const c4CustomerPortalModel = readFileSync(
  join(__dirname, '..', 'public', 'examples', 'c4-customer-portal.archimate'),
  'utf8',
);

describe('.archimate parsing', () => {
  const m = parseArchimate(archisurance);

  it('reads model header and purpose', () => {
    expect(m.info.name).toBe('Archisurance');
    expect(m.info.id).toBe('11f5304f');
    expect(m.info.documentation).toContain('fictional Insurance company');
  });

  it('reads the folder structure', () => {
    expect(m.rootFolderIds.length).toBeGreaterThanOrEqual(8);
    const names = m.rootFolderIds.map((id) => m.folders[id].name);
    expect(names).toContain('Business');
    expect(names).toContain('Views');
    const business = Object.values(m.folders).find((f) => f.folderType === 'business')!;
    expect(business.folderIds.length).toBeGreaterThan(0);
  });

  it('reads elements and relationships', () => {
    expect(Object.keys(m.elements).length).toBeGreaterThan(100);
    expect(Object.keys(m.relationships).length).toBeGreaterThan(100);
    const claim = Object.values(m.elements).find((e) => e.name === 'Damage Claim');
    expect(claim?.type).toBe('BusinessObject');
    const access = m.relationships['695'];
    expect(access.type).toBe('AccessRelationship');
    expect(access.accessType).toBe(1);
    expect(access.sourceId).toBe('572');
  });

  it('reads views with nested nodes, styles and connections', () => {
    expect(Object.keys(m.views).length).toBeGreaterThan(5);
    const goalView = Object.values(m.views).find((v) => v.name === 'Goal and Principle View')!;
    expect(goalView.viewpoint).toBe('goal_realization');
    const group = m.nodes['ecc8b6ec'];
    expect(group.nodeType).toBe('group');
    expect(group.bounds).toEqual({ x: 36, y: 12, width: 400, height: 196 });
    expect(group.childIds).toHaveLength(3);
    const child = m.nodes[group.childIds[0]];
    expect(child.parentId).toBe('ecc8b6ec');

    const conn = m.connections['3757'];
    expect(conn.relationshipId).toBe('1778');
    expect(conn.bendpoints).toEqual([{ startX: -107, startY: 13, endX: 109, endY: 23 }]);
    expect(m.nodes[conn.sourceId].sourceConnectionIds).toContain('3757');
    expect(m.nodes[conn.targetId].targetConnectionIds).toContain('3757');

    const ref = m.nodes['3657'];
    expect(ref.nodeType).toBe('ref');
    if (ref.nodeType === 'ref') expect(ref.refViewId).toBe('3944');
    expect(ref.fillColor).toBe('#80ffff');
  });

  it('every node/connection reference resolves', () => {
    expectReferencesResolve(m);
  });
});

describe('Archi Online capability model example', () => {
  const m = parseArchimate(archiOnlineCapabilityModel);

  it('is detailed enough to exercise gist-backed sharing', () => {
    expect(m.info.name).toBe('Archi Online Capability Model');
    expect(Object.keys(m.elements)).toHaveLength(80);
    expect(Object.keys(m.relationships)).toHaveLength(85);
    expect(Object.keys(m.views)).toHaveLength(4);
    expect(Object.keys(m.connections)).toHaveLength(61);
  });

  it('contains the expected model-sharing views', () => {
    const viewNames = Object.values(m.views).map((view) => view.name);

    expect(viewNames).toContain('01 - Product Goals and Requirements');
    expect(viewNames).toContain('02 - Application Component Map');
    expect(viewNames).toContain('03 - Share and Read-only Viewer Flow');
    expect(viewNames).toContain('04 - Runtime and Persistence Context');
  });

  it('has no dangling references', () => {
    expectReferencesResolve(m);
  });
});

describe('C4 customer portal example', () => {
  const m = parseArchimate(c4CustomerPortalModel);

  it('loads as standard ArchiMate with C4 profile metadata', () => {
    expect(m.info.name).toBe('C4 Customer Portal Example');
    expect(Object.keys(m.elements)).toHaveLength(6);
    expect(Object.keys(m.relationships)).toHaveLength(4);
    expect(Object.keys(m.views)).toHaveLength(1);

    const view = Object.values(m.views)[0];
    expect(c4ViewType(view)).toBe('container');
    expect(Object.values(m.elements).map((element) => [element.name, c4KindForConcept(element)]))
      .toContainEqual(['Web Application', 'container']);
    expect(Object.values(m.elements).map((element) => [
      element.name,
      c4PropertyValue(element.properties, C4_PROPERTY_KEYS.external),
    ])).toContainEqual(['Payment Gateway', 'true']);
    expect(Object.values(m.relationships).map((relationship) =>
      c4PropertyValue(relationship.properties, C4_PROPERTY_KEYS.technology),
    )).toContain('HTTPS/JSON');
  });

  it('has no dangling references', () => {
    expectReferencesResolve(m);
  });
});

function normalize(state: ModelState): ModelState {
  // JSON round-trip drops undefined optional fields for a stable comparison
  return JSON.parse(JSON.stringify(state));
}

describe('.archimate round-trip', () => {
  it('parse -> serialize -> parse is lossless for Archisurance', () => {
    const m1 = parseArchimate(archisurance);
    const xml = serializeArchimate(m1);
    const m2 = parseArchimate(xml);
    expect(normalize(m2)).toEqual(normalize(m1));
  });

  it('serialize is deterministic', () => {
    const m1 = parseArchimate(archisurance);
    expect(serializeArchimate(m1)).toBe(serializeArchimate(m1));
  });

  it('round-trips an empty model with default folders', () => {
    const m1 = createEmptyModel('Empty');
    const m2 = parseArchimate(serializeArchimate(m1));
    expect(normalize(m2)).toEqual(normalize(m1));
  });

  it('escapes special characters in names and documentation', () => {
    const m1 = createEmptyModel('A & B <"model">');
    m1.info.documentation = 'line1\nline2 & <tag> "quoted"';
    const m2 = parseArchimate(serializeArchimate(m1));
    expect(m2.info.name).toBe('A & B <"model">');
    expect(m2.info.documentation).toBe('line1\nline2 & <tag> "quoted"');
  });

  it('rejects non-archimate XML', () => {
    expect(() => parseArchimate('<foo/>')).toThrow();
    expect(() => parseArchimate('not xml at all')).toThrow();
  });
});

describe('.archimate connectable connections', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<archimate:model xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:archimate="http://www.archimatetool.com/archimate" name="Connectables" id="model" version="5.0.0">
  <folder name="Views" id="diagrams" type="diagrams">
    <element xsi:type="archimate:ArchimateDiagramModel" name="View" id="view" connectionRouterType="2">
      <child xsi:type="archimate:Note" id="n1">
        <bounds x="10" y="10" width="180" height="80"/>
        <sourceConnection xsi:type="archimate:Connection" id="c1" name="Root line" type="65" targetConnections="c4 c3" source="n1" target="n2">
          <sourceConnection xsi:type="archimate:Connection" id="c2" source="c1" target="n2"/>
          <documentation>Connection docs</documentation>
          <property key="ordered" value="first"/>
          <property key="ordered" value="second"/>
        </sourceConnection>
      </child>
      <child xsi:type="archimate:Note" id="n2" targetConnections="c2 c1">
        <bounds x="300" y="10" width="180" height="80"/>
        <sourceConnection xsi:type="archimate:Connection" id="c3" source="n2" target="c1"/>
        <sourceConnection xsi:type="archimate:Connection" id="c4" source="n2" target="c1"/>
      </child>
    </element>
  </folder>
</archimate:model>`;

  it('parses recursive source containment and ordered adjacency on nodes and connections', () => {
    const model = parseArchimate(xml);

    expect(model.views.view.connectionRouterType).toBe(2);
    expect(model.nodes.n1.sourceConnectionIds).toEqual(['c1']);
    expect(model.connections.c1.sourceConnectionIds).toEqual(['c2']);
    expect(model.nodes.n2.sourceConnectionIds).toEqual(['c3', 'c4']);
    expect(model.nodes.n2.targetConnectionIds).toEqual(['c2', 'c1']);
    expect(model.connections.c1.targetConnectionIds).toEqual(['c4', 'c3']);
    expect(model.connections.c1).toMatchObject({
      name: 'Root line',
      documentation: 'Connection docs',
      properties: [
        { key: 'ordered', value: 'first' },
        { key: 'ordered', value: 'second' },
      ],
      connectionType: 65,
    });
  });

  it('serializes each connection beneath its source and round-trips all ordering', () => {
    const model = parseArchimate(xml);
    const serialized = serializeArchimate(model);
    const doc = new DOMParser().parseFromString(serialized, 'application/xml');
    const c1 = doc.querySelector('sourceConnection[id="c1"]')!;
    const n2 = doc.querySelector('child[id="n2"]')!;

    expect(Array.from(c1.children).filter((child) => child.localName === 'sourceConnection')
      .map((child) => child.getAttribute('id'))).toEqual(['c2']);
    expect(c1.getAttribute('targetConnections')).toBe('c4 c3');
    expect(n2.getAttribute('targetConnections')).toBe('c2 c1');
    expect(normalize(parseArchimate(serialized))).toEqual(normalize(model));
  });

  it('rejects missing connection endpoints atomically', () => {
    expect(() => parseArchimate(xml.replace('target="n2"', 'target="missing"')))
      .toThrow(/endpoint.*missing/i);
  });

  it('rejects recursive endpoint cycles atomically', () => {
    const cyclic = xml.replace('target="n2">\n          <sourceConnection', 'target="c2">\n          <sourceConnection');
    expect(() => parseArchimate(cyclic)).toThrow(/cycle/i);
  });
});

function expectReferencesResolve(m: ModelState): void {
  for (const rel of Object.values(m.relationships)) {
    expect(m.elements[rel.sourceId] ?? m.relationships[rel.sourceId], rel.id).toBeDefined();
    expect(m.elements[rel.targetId] ?? m.relationships[rel.targetId], rel.id).toBeDefined();
  }
  for (const node of Object.values(m.nodes)) {
    if (node.nodeType === 'element') expect(m.elements[node.elementId], node.id).toBeDefined();
    if (node.nodeType === 'ref') expect(m.views[node.refViewId], node.id).toBeDefined();
    expect(m.views[node.viewId], node.id).toBeDefined();
  }
  for (const conn of Object.values(m.connections)) {
    if (conn.relationshipId) expect(m.relationships[conn.relationshipId], conn.id).toBeDefined();
    expect(m.nodes[conn.sourceId] ?? m.connections[conn.sourceId], conn.id).toBeDefined();
    expect(m.nodes[conn.targetId] ?? m.connections[conn.targetId], conn.id).toBeDefined();
  }
}
