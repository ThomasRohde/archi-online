import { describe, expect, it, beforeEach } from 'vitest';
import {
  C4_PROPERTY_KEYS,
  C4_VISUAL_DEFAULTS,
  c4ElementLabelParts,
  c4KindForConcept,
  c4LabelForElement,
  c4LabelForRelationship,
  c4PropertyValue,
  c4RelationshipLabelParts,
  c4VisualStyleForElement,
  c4ViewType,
  setC4PropertyValue,
  validateC4View,
} from '../src/model/c4';
import { parseArchimate, serializeArchimate } from '../src/model/io/archimate-xml';
import { applyCsvImport, serializeCsv } from '../src/model/io/csv';
import { createC4TemplateView } from '../src/model/ops';
import { createEmptyModel } from '../src/model/ops/concepts';
import { cloneModelForEditing, replaceModel, undo, useStore } from '../src/model/store';
import type { ArchimateElement, ArchimateRelationship } from '../src/model/types';

function model() {
  return useStore.getState().model!;
}

beforeEach(() => {
  replaceModel(createEmptyModel('C4 Test'), null);
});

describe('C4 profile helpers', () => {
  it('maps ArchiMate concepts to C4 metadata and labels', () => {
    const element: ArchimateElement = {
      id: 'web',
      kind: 'element',
      type: 'ApplicationComponent',
      name: 'Web Application',
      documentation: 'Delivers the browser experience for customers.',
      folderId: 'app',
      properties: [
        { key: C4_PROPERTY_KEYS.kind, value: 'container' },
        { key: C4_PROPERTY_KEYS.technology, value: 'React, TypeScript' },
      ],
    };
    const relationship: ArchimateRelationship = {
      id: 'rel',
      kind: 'relationship',
      type: 'TriggeringRelationship',
      name: 'Submits order',
      documentation: '',
      folderId: 'relations',
      sourceId: 'user',
      targetId: 'web',
      properties: [
        { key: C4_PROPERTY_KEYS.technology, value: 'HTTPS/JSON' },
        { key: C4_PROPERTY_KEYS.order, value: '1' },
      ],
    };

    expect(c4KindForConcept(element)).toBe('container');
    expect(c4PropertyValue(element.properties, C4_PROPERTY_KEYS.technology)).toBe('React, TypeScript');
    expect(c4LabelForElement(element)).toBe(
      'Web Application\n[Container: React, TypeScript]\nDelivers the browser experience for customers.',
    );
    expect(c4LabelForRelationship(relationship)).toBe('1. Submits order\n[HTTPS/JSON]');
    expect(c4ElementLabelParts(element)).toEqual({
      name: 'Web Application',
      kind: 'container',
      kindLabel: 'Container',
      technology: 'React, TypeScript',
      description: 'Delivers the browser experience for customers.',
    });
    expect(c4RelationshipLabelParts(relationship)).toEqual({
      order: '1',
      label: 'Submits order',
      technology: 'HTTPS/JSON',
    });
  });

  it('updates C4 properties without creating duplicate keys', () => {
    let properties = setC4PropertyValue([], C4_PROPERTY_KEYS.kind, 'software-system');
    properties = setC4PropertyValue(properties, C4_PROPERTY_KEYS.kind, 'container');
    properties = setC4PropertyValue(properties, C4_PROPERTY_KEYS.technology, 'PostgreSQL');
    properties = setC4PropertyValue(properties, C4_PROPERTY_KEYS.technology, '');

    expect(properties).toEqual([{ key: C4_PROPERTY_KEYS.kind, value: 'container' }]);
  });

  it('derives Structurizr-style visual defaults from C4 metadata', () => {
    const container: ArchimateElement = {
      id: 'web',
      kind: 'element',
      type: 'ApplicationComponent',
      name: 'Web Application',
      documentation: '',
      folderId: 'app',
      properties: [
        { key: C4_PROPERTY_KEYS.kind, value: 'container' },
        { key: C4_PROPERTY_KEYS.technology, value: 'React' },
      ],
    };
    const externalSystem: ArchimateElement = {
      ...container,
      id: 'payment',
      name: 'Payment Gateway',
      properties: [
        { key: C4_PROPERTY_KEYS.kind, value: 'software-system' },
        { key: C4_PROPERTY_KEYS.external, value: 'true' },
      ],
    };
    const database: ArchimateElement = {
      ...container,
      id: 'db',
      name: 'Customer Database',
      properties: [
        { key: C4_PROPERTY_KEYS.kind, value: 'container' },
        { key: C4_PROPERTY_KEYS.tags, value: 'database' },
      ],
    };

    expect(c4VisualStyleForElement(container)).toMatchObject({
      fillColor: C4_VISUAL_DEFAULTS.elementFill,
      lineColor: C4_VISUAL_DEFAULTS.elementLine,
      fontColor: C4_VISUAL_DEFAULTS.textOnDark,
      shape: 'box',
      boundary: false,
    });
    expect(c4VisualStyleForElement(externalSystem)).toMatchObject({
      fillColor: C4_VISUAL_DEFAULTS.externalFill,
      lineColor: C4_VISUAL_DEFAULTS.externalLine,
    });
    expect(c4VisualStyleForElement(database)).toMatchObject({
      shape: 'database',
    });
    expect(
      c4VisualStyleForElement(container, {
        id: 'node',
        viewId: 'view',
        parentId: 'view',
        bounds: { x: 0, y: 0, width: 200, height: 100 },
        childIds: ['child'],
        sourceConnectionIds: [],
        targetConnectionIds: [],
        nodeType: 'element',
        elementId: 'web',
      }),
    ).toMatchObject({
      fillColor: C4_VISUAL_DEFAULTS.boundaryFill,
      lineColor: C4_VISUAL_DEFAULTS.boundaryLine,
      fontColor: C4_VISUAL_DEFAULTS.textOnLight,
      shape: 'boundary',
      boundary: true,
    });
  });
});

describe('C4 template generation and validation', () => {
  it('creates a container view template as one undoable ArchiMate model change', () => {
    const viewId = createC4TemplateView('container');
    const m = model();
    const view = m.views[viewId];
    const kinds = Object.values(m.elements).map((element) => c4KindForConcept(element));

    expect(c4ViewType(view)).toBe('container');
    expect(view.properties).toContainEqual({ key: C4_PROPERTY_KEYS.viewType, value: 'container' });
    expect(kinds).toEqual(
      expect.arrayContaining(['person', 'software-system', 'container', 'container']),
    );
    expect(Object.values(m.relationships).every((rel) => rel.name.trim().length > 0)).toBe(true);
    expect(validateC4View(m, viewId)).toEqual([]);
    expect(Object.values(m.nodes).some((node) => node.fillColor === C4_VISUAL_DEFAULTS.elementFill)).toBe(true);
    expect(Object.values(m.nodes).some((node) => node.fillColor === C4_VISUAL_DEFAULTS.boundaryFill)).toBe(true);
    expect(Object.values(m.connections).every((conn) => conn.lineColor === C4_VISUAL_DEFAULTS.relationshipLine)).toBe(true);
    expect(useStore.getState().undoStack).toHaveLength(1);

    undo();
    expect(Object.keys(model().views)).toHaveLength(0);
    expect(Object.keys(model().elements)).toHaveLength(0);
  });

  it('reports missing C4 element metadata, descriptions, relationship labels, and protocols', () => {
    const viewId = createC4TemplateView('container');
    const m = cloneModelForEditing(model());
    const container = Object.values(m.elements).find(
      (element) => c4KindForConcept(element) === 'container',
    )!;
    const relationship = Object.values(m.relationships)[0];

    container.documentation = '';
    container.properties = container.properties.filter(
      (property) => property.key !== C4_PROPERTY_KEYS.technology,
    );
    relationship.name = '';
    relationship.properties = relationship.properties.filter(
      (property) => property.key !== C4_PROPERTY_KEYS.technology,
    );

    expect(validateC4View(m, viewId).map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'C4 container "Web Application" should specify c4.technology.',
        'C4 container "Web Application" should have a short documentation description.',
        'C4 relationship from Customer to Web Application should have a label.',
        'Container-level relationship from Customer to Web Application should specify c4.technology.',
      ]),
    );
  });
});

describe('C4 profile persistence', () => {
  it('round-trips C4 metadata through native .archimate XML', () => {
    const viewId = createC4TemplateView('component');
    const parsed = parseArchimate(serializeArchimate(model()));

    expect(c4ViewType(parsed.views[viewId])).toBe('component');
    expect(
      Object.values(parsed.elements).map((element) => [
        element.name,
        c4KindForConcept(element),
        c4PropertyValue(element.properties, C4_PROPERTY_KEYS.technology),
      ]),
    ).toContainEqual(['Order Controller', 'component', 'TypeScript module']);
  });

  it('round-trips C4 concept metadata through Archi CSV properties', () => {
    createC4TemplateView('system-landscape');
    const files = serializeCsv(model());
    const target = createEmptyModel('Imported');

    applyCsvImport(target, {
      elements: files[0].content,
      relations: files[1].content,
      properties: files[2].content,
    });

    expect(
      Object.values(target.elements).map((element) => [
        element.name,
        c4KindForConcept(element),
      ]),
    ).toContainEqual(['Customer Portal', 'software-system']);
    expect(
      Object.values(target.relationships).map((relationship) =>
        c4PropertyValue(relationship.properties, C4_PROPERTY_KEYS.technology),
      ),
    ).toContain('HTTPS/JSON');
  });
});
