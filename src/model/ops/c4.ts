import {
  C4_ELEMENT_KIND_LABELS,
  C4_ELEMENT_TYPES,
  C4_PROPERTY_KEYS,
  C4_VISUAL_DEFAULTS,
  C4_VIEW_TYPE_LABELS,
  c4LegendText,
  c4PropertyValue,
  c4VisualStyleForElement,
  setC4PropertyValue,
  type C4ElementKind,
  type C4ViewType,
} from '../c4';
import { newId } from '../id';
import type { RelationshipType } from '../metamodel';
import { validRelationshipTypes } from '../rules';
import { getActiveModelStore, transact, type ModelStore } from '../store';
import type {
  ArchimateElement,
  ArchimateRelationship,
  Bounds,
  DiagramNode,
  ElementNode,
  ModelState,
  Property,
} from '../types';
import { defaultFolderId, folderForElementType } from './concepts';
import { attachConnection, attachNode } from './draft';
import type { DiagramNodeDefaults } from './view';

interface C4ElementInput {
  kind: C4ElementKind;
  name: string;
  documentation: string;
  technology?: string;
  tags?: string;
  external?: boolean;
  instanceOf?: string;
}

interface C4RelationshipInput {
  sourceId: string;
  targetId: string;
  name: string;
  technology?: string;
  order?: string;
  type?: RelationshipType;
}

interface C4NodeInput {
  elementId: string;
  bounds: Bounds;
  parentId?: string;
  defaults?: DiagramNodeDefaults;
}

export function createC4TemplateView(
  viewType: C4ViewType,
  folderId?: string,
  store?: ModelStore,
): string {
  const viewId = newId();
  transact(`Create C4 ${C4_VIEW_TYPE_LABELS[viewType]} View`, (draft) => {
    const fid = folderId ?? defaultFolderId(draft, 'diagrams');
    draft.views[viewId] = {
      id: viewId,
      kind: 'view',
      name: `C4 ${C4_VIEW_TYPE_LABELS[viewType]}`,
      documentation: c4LegendText(viewType),
      properties: [{ key: C4_PROPERTY_KEYS.viewType, value: viewType }],
      folderId: fid,
      childIds: [],
    };
    draft.folders[fid].itemIds.push(viewId);

    if (viewType === 'system-landscape') addSystemLandscapeTemplate(draft, viewId);
    else if (viewType === 'system-context') addSystemContextTemplate(draft, viewId);
    else if (viewType === 'container') addContainerTemplate(draft, viewId);
    else if (viewType === 'component') addComponentTemplate(draft, viewId);
    else if (viewType === 'deployment') addDeploymentTemplate(draft, viewId);
    else addDynamicTemplate(draft, viewId);

    addLegendNode(draft, viewId, 40, 420);
    applyC4VisualDefaultsToView(draft, viewId);
  }, store);
  return viewId;
}

export function createC4ElementOnView(
  kind: C4ElementKind,
  viewId: string,
  parentId: string,
  bounds: Bounds,
  name?: string,
  properties: Record<string, string> = {},
  defaults: DiagramNodeDefaults = {},
  store?: ModelStore,
): { elementId: string; nodeId: string } {
  const elementId = newId();
  const nodeId = newId();
  const type = C4_ELEMENT_TYPES[kind];
  const defaultName = defaultC4ElementName(kind, properties);
  transact(`Create C4 ${defaultName}`, (draft) => {
    if (!draft.views[viewId]) return;
    const fid = folderForElementType(draft, type);
    const c4Properties = elementProperties(kind, {
      technology: properties[C4_PROPERTY_KEYS.technology],
      tags: properties[C4_PROPERTY_KEYS.tags],
    });
    draft.elements[elementId] = {
      id: elementId,
      kind: 'element',
      type,
      name: name ?? defaultName,
      documentation: '',
      properties: c4Properties,
      profileIds: [],
      folderId: fid,
    };
    draft.folders[fid].itemIds.push(elementId);
    const node: ElementNode = {
      id: nodeId,
      viewId,
      parentId,
      bounds,
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      nodeType: 'element',
      elementId,
      textAlignment: 2,
      textPosition: 1,
      ...c4NodeVisualDefaults(draft.elements[elementId]),
      ...defaults,
    };
    attachNode(draft, node);
  }, store);
  return { elementId, nodeId };
}

export function setC4Properties(
  id: string,
  values: Partial<Record<string, string>>,
  store?: ModelStore,
): void {
  transact('Edit C4 Properties', (draft) => {
    const item = draft.elements[id] ?? draft.relationships[id] ?? draft.views[id];
    if (!item) return;
    let properties = item.properties;
    for (const [key, value] of Object.entries(values)) {
      properties = setC4PropertyValue(properties, key, value);
    }
    item.properties = properties;
  }, store);
}

export function insertOrUpdateC4Legend(
  viewId: string,
  store: ModelStore = getActiveModelStore(),
): string | null {
  const model = store.getState().model;
  const viewType = model ? c4PropertyValue(model.views[viewId]?.properties, C4_PROPERTY_KEYS.viewType) : undefined;
  if (!viewType) return null;
  const legendId = newId();
  transact('Insert C4 Legend', (draft) => {
    const view = draft.views[viewId];
    if (!view) return;
    const existing = Object.values(draft.nodes).find(
      (node) =>
        node.viewId === viewId &&
        node.nodeType === 'note' &&
        node.properties.some((property) => property.key === 'c4.legend' && property.value === 'true'),
    );
    if (existing?.nodeType === 'note') {
      existing.content = c4LegendText(viewType as C4ViewType);
      return;
    }
    addLegendNode(draft, viewId, 40, Math.max(120, view.childIds.length * 70));
  }, store);
  return legendId;
}

function addSystemLandscapeTemplate(draft: ModelState, viewId: string): void {
  const customer = createC4Element(draft, {
    kind: 'person',
    name: 'Customer',
    documentation: 'A person using the customer-facing digital services.',
  });
  const portal = createC4Element(draft, {
    kind: 'software-system',
    name: 'Customer Portal',
    documentation: 'Allows customers to browse products, place orders, and manage their profile.',
  });
  const payments = createC4Element(draft, {
    kind: 'software-system',
    name: 'Payment Gateway',
    documentation: 'External provider that authorizes and captures card payments.',
    external: true,
  });

  createC4Node(draft, viewId, { elementId: customer.id, bounds: { x: 80, y: 120, width: 170, height: 80 } });
  createC4Node(draft, viewId, { elementId: portal.id, bounds: { x: 360, y: 100, width: 210, height: 95 } });
  createC4Node(draft, viewId, { elementId: payments.id, bounds: { x: 680, y: 100, width: 210, height: 95 } });
  createC4RelationshipWithConnection(draft, viewId, {
    sourceId: customer.id,
    targetId: portal.id,
    name: 'Uses',
    technology: 'HTTPS/JSON',
  });
  createC4RelationshipWithConnection(draft, viewId, {
    sourceId: portal.id,
    targetId: payments.id,
    name: 'Takes payments with',
    technology: 'HTTPS/JSON',
  });
}

function addSystemContextTemplate(draft: ModelState, viewId: string): void {
  const customer = createC4Element(draft, {
    kind: 'person',
    name: 'Customer',
    documentation: 'A person placing and tracking orders.',
  });
  const portal = createC4Element(draft, {
    kind: 'software-system',
    name: 'Customer Portal',
    documentation: 'Primary system under design for customer self-service.',
  });
  const erp = createC4Element(draft, {
    kind: 'software-system',
    name: 'ERP System',
    documentation: 'Back-office system that receives confirmed orders.',
    external: true,
  });
  const email = createC4Element(draft, {
    kind: 'software-system',
    name: 'Email Service',
    documentation: 'External service used to send customer notifications.',
    external: true,
  });

  createC4Node(draft, viewId, { elementId: customer.id, bounds: { x: 70, y: 130, width: 170, height: 80 } });
  createC4Node(draft, viewId, { elementId: portal.id, bounds: { x: 350, y: 100, width: 230, height: 100 } });
  createC4Node(draft, viewId, { elementId: erp.id, bounds: { x: 690, y: 70, width: 210, height: 92 } });
  createC4Node(draft, viewId, { elementId: email.id, bounds: { x: 690, y: 220, width: 210, height: 92 } });
  createC4RelationshipWithConnection(draft, viewId, {
    sourceId: customer.id,
    targetId: portal.id,
    name: 'Uses',
    technology: 'HTTPS',
  });
  createC4RelationshipWithConnection(draft, viewId, {
    sourceId: portal.id,
    targetId: erp.id,
    name: 'Sends confirmed orders to',
    technology: 'REST/JSON',
  });
  createC4RelationshipWithConnection(draft, viewId, {
    sourceId: portal.id,
    targetId: email.id,
    name: 'Sends email through',
    technology: 'SMTP/API',
  });
}

function addContainerTemplate(draft: ModelState, viewId: string): void {
  const customer = createC4Element(draft, {
    kind: 'person',
    name: 'Customer',
    documentation: 'A person buying products and managing their account.',
  });
  const portal = createC4Element(draft, {
    kind: 'software-system',
    name: 'Customer Portal',
    documentation: 'The software system under design.',
  });
  const web = createC4Element(draft, {
    kind: 'container',
    name: 'Web Application',
    documentation: 'Delivers the browser experience for customers.',
    technology: 'React, TypeScript',
  });
  const api = createC4Element(draft, {
    kind: 'container',
    name: 'API Application',
    documentation: 'Handles customer journeys, order orchestration, and integrations.',
    technology: 'Node.js, Express',
  });
  const database = createC4Element(draft, {
    kind: 'container',
    name: 'Customer Database',
    documentation: 'Stores customer profiles, baskets, and order state.',
    technology: 'PostgreSQL',
    tags: 'database',
  });

  createC4Node(draft, viewId, { elementId: customer.id, bounds: { x: 60, y: 150, width: 170, height: 80 } });
  createC4Node(draft, viewId, { elementId: portal.id, bounds: { x: 310, y: 45, width: 640, height: 285 } });
  createC4Node(draft, viewId, {
    elementId: web.id,
    parentId: nodeIdForElement(draft, viewId, portal.id),
    bounds: { x: 40, y: 75, width: 190, height: 92 },
  });
  createC4Node(draft, viewId, {
    elementId: api.id,
    parentId: nodeIdForElement(draft, viewId, portal.id),
    bounds: { x: 285, y: 75, width: 190, height: 92 },
  });
  createC4Node(draft, viewId, {
    elementId: database.id,
    parentId: nodeIdForElement(draft, viewId, portal.id),
    bounds: { x: 530, y: 75, width: 190, height: 92 },
  });
  createC4RelationshipWithConnection(draft, viewId, {
    sourceId: customer.id,
    targetId: web.id,
    name: 'Uses',
    technology: 'HTTPS',
  });
  createC4RelationshipWithConnection(draft, viewId, {
    sourceId: web.id,
    targetId: api.id,
    name: 'Calls API',
    technology: 'HTTPS/JSON',
  });
  createC4RelationshipWithConnection(draft, viewId, {
    sourceId: api.id,
    targetId: database.id,
    name: 'Reads from and writes to',
    technology: 'SQL/TCP',
  });
}

function addComponentTemplate(draft: ModelState, viewId: string): void {
  const api = createC4Element(draft, {
    kind: 'container',
    name: 'API Application',
    documentation: 'Handles order and customer use cases for the Customer Portal.',
    technology: 'Node.js, Express',
  });
  const controller = createC4Element(draft, {
    kind: 'component',
    name: 'Order Controller',
    documentation: 'Accepts order requests from the web application.',
    technology: 'TypeScript module',
  });
  const service = createC4Element(draft, {
    kind: 'component',
    name: 'Order Service',
    documentation: 'Coordinates order validation, pricing, and submission.',
    technology: 'TypeScript module',
  });
  const repository = createC4Element(draft, {
    kind: 'component',
    name: 'Order Repository',
    documentation: 'Persists and retrieves order state.',
    technology: 'TypeScript module',
  });

  createC4Node(draft, viewId, { elementId: api.id, bounds: { x: 70, y: 60, width: 760, height: 300 } });
  const parentId = nodeIdForElement(draft, viewId, api.id);
  createC4Node(draft, viewId, { elementId: controller.id, parentId, bounds: { x: 45, y: 95, width: 190, height: 92 } });
  createC4Node(draft, viewId, { elementId: service.id, parentId, bounds: { x: 285, y: 95, width: 190, height: 92 } });
  createC4Node(draft, viewId, { elementId: repository.id, parentId, bounds: { x: 525, y: 95, width: 190, height: 92 } });
  createAssignment(draft, api.id, controller.id);
  createAssignment(draft, api.id, service.id);
  createAssignment(draft, api.id, repository.id);
  createC4RelationshipWithConnection(draft, viewId, {
    sourceId: controller.id,
    targetId: service.id,
    name: 'Delegates order handling to',
  });
  createC4RelationshipWithConnection(draft, viewId, {
    sourceId: service.id,
    targetId: repository.id,
    name: 'Reads and writes orders through',
  });
}

function addDeploymentTemplate(draft: ModelState, viewId: string): void {
  const customerDevice = createC4Element(draft, {
    kind: 'deployment-node',
    name: 'Customer Device',
    documentation: 'Browser-capable device used by customers.',
  });
  const cloud = createC4Element(draft, {
    kind: 'deployment-node',
    name: 'Cloud Platform',
    documentation: 'Managed runtime environment for the customer portal.',
  });
  const webInstance = createC4Element(draft, {
    kind: 'container-instance',
    name: 'Web Application Instance',
    documentation: 'Deployed browser-facing web application.',
    technology: 'Static web hosting',
    instanceOf: 'Web Application',
  });
  const apiInstance = createC4Element(draft, {
    kind: 'container-instance',
    name: 'API Application Instance',
    documentation: 'Deployed API runtime.',
    technology: 'Container runtime',
    instanceOf: 'API Application',
  });

  createC4Node(draft, viewId, { elementId: customerDevice.id, bounds: { x: 70, y: 90, width: 210, height: 110 } });
  createC4Node(draft, viewId, { elementId: cloud.id, bounds: { x: 380, y: 60, width: 460, height: 230 } });
  const cloudNodeId = nodeIdForElement(draft, viewId, cloud.id);
  createC4Node(draft, viewId, { elementId: webInstance.id, parentId: cloudNodeId, bounds: { x: 55, y: 85, width: 170, height: 80 } });
  createC4Node(draft, viewId, { elementId: apiInstance.id, parentId: cloudNodeId, bounds: { x: 265, y: 85, width: 170, height: 80 } });
  createC4RelationshipWithConnection(draft, viewId, {
    sourceId: customerDevice.id,
    targetId: webInstance.id,
    name: 'Loads',
    technology: 'HTTPS',
  });
  createC4RelationshipWithConnection(draft, viewId, {
    sourceId: webInstance.id,
    targetId: apiInstance.id,
    name: 'Calls',
    technology: 'HTTPS/JSON',
  });
}

function addDynamicTemplate(draft: ModelState, viewId: string): void {
  const customer = createC4Element(draft, {
    kind: 'person',
    name: 'Customer',
    documentation: 'A person placing an order.',
  });
  const web = createC4Element(draft, {
    kind: 'container',
    name: 'Web Application',
    documentation: 'Collects order details from the customer.',
    technology: 'React, TypeScript',
  });
  const api = createC4Element(draft, {
    kind: 'container',
    name: 'API Application',
    documentation: 'Submits and confirms the order.',
    technology: 'Node.js, Express',
  });

  createC4Node(draft, viewId, { elementId: customer.id, bounds: { x: 70, y: 120, width: 170, height: 80 } });
  createC4Node(draft, viewId, { elementId: web.id, bounds: { x: 340, y: 105, width: 190, height: 92 } });
  createC4Node(draft, viewId, { elementId: api.id, bounds: { x: 640, y: 105, width: 190, height: 92 } });
  createC4RelationshipWithConnection(draft, viewId, {
    sourceId: customer.id,
    targetId: web.id,
    name: 'Submits order',
    technology: 'HTTPS',
    order: '1',
  });
  createC4RelationshipWithConnection(draft, viewId, {
    sourceId: web.id,
    targetId: api.id,
    name: 'Creates order',
    technology: 'HTTPS/JSON',
    order: '2',
  });
}

function createC4Element(draft: ModelState, input: C4ElementInput): ArchimateElement {
  const type = C4_ELEMENT_TYPES[input.kind];
  const id = newId();
  const folderId = folderForElementType(draft, type);
  const element: ArchimateElement = {
    id,
    kind: 'element',
    type,
    name: input.name,
    documentation: input.documentation,
    properties: elementProperties(input.kind, input),
    profileIds: [],
    folderId,
  };
  draft.elements[id] = element;
  draft.folders[folderId].itemIds.push(id);
  return element;
}

function elementProperties(kind: C4ElementKind, input: Partial<C4ElementInput>): Property[] {
  let properties: Property[] = [{ key: C4_PROPERTY_KEYS.kind, value: kind }];
  properties = setC4PropertyValue(properties, C4_PROPERTY_KEYS.technology, input.technology);
  properties = setC4PropertyValue(properties, C4_PROPERTY_KEYS.tags, input.tags);
  properties = setC4PropertyValue(properties, C4_PROPERTY_KEYS.instanceOf, input.instanceOf);
  properties = setC4PropertyValue(properties, C4_PROPERTY_KEYS.external, input.external ? 'true' : undefined);
  return properties;
}

function createC4RelationshipWithConnection(
  draft: ModelState,
  viewId: string,
  input: C4RelationshipInput,
): ArchimateRelationship | null {
  const relationship = createC4Relationship(draft, input);
  if (!relationship) return null;
  const sourceNodeId = nodeIdForElement(draft, viewId, input.sourceId);
  const targetNodeId = nodeIdForElement(draft, viewId, input.targetId);
  if (!sourceNodeId || !targetNodeId) return relationship;
  attachConnection(draft, {
    id: newId(),
    viewId,
    connType: 'relationship',
    relationshipId: relationship.id,
    sourceId: sourceNodeId,
    targetId: targetNodeId,
    bendpoints: [],
  });
  return relationship;
}

function createC4Relationship(
  draft: ModelState,
  input: C4RelationshipInput,
): ArchimateRelationship | null {
  const source = draft.elements[input.sourceId];
  const target = draft.elements[input.targetId];
  if (!source || !target) return null;
  const type = input.type ?? pickRelationshipType(source.type, target.type);
  const id = newId();
  const folderId = defaultFolderId(draft, 'relations');
  const relationship: ArchimateRelationship = {
    id,
    kind: 'relationship',
    type,
    name: input.name,
    documentation: '',
    properties: relationshipProperties(input),
    profileIds: [],
    folderId,
    sourceId: source.id,
    targetId: target.id,
  };
  draft.relationships[id] = relationship;
  draft.folders[folderId].itemIds.push(id);
  return relationship;
}

function createAssignment(draft: ModelState, sourceId: string, targetId: string): void {
  createC4Relationship(draft, {
    sourceId,
    targetId,
    name: 'Assigned to',
    type: 'AssignmentRelationship',
  });
}

function relationshipProperties(input: C4RelationshipInput): Property[] {
  let properties: Property[] = [];
  properties = setC4PropertyValue(properties, C4_PROPERTY_KEYS.technology, input.technology);
  properties = setC4PropertyValue(properties, C4_PROPERTY_KEYS.order, input.order);
  return properties;
}

function pickRelationshipType(sourceType: string, targetType: string): RelationshipType {
  const allowed = validRelationshipTypes(sourceType, targetType);
  const preferred: RelationshipType[] = [
    'TriggeringRelationship',
    'FlowRelationship',
    'ServingRelationship',
    'AccessRelationship',
    'AssociationRelationship',
  ];
  return preferred.find((type) => allowed.includes(type)) ?? allowed[0] ?? 'AssociationRelationship';
}

function createC4Node(draft: ModelState, viewId: string, input: C4NodeInput): ElementNode {
  const node: ElementNode = {
    id: newId(),
    viewId,
    parentId: input.parentId ?? viewId,
    bounds: input.bounds,
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    nodeType: 'element',
    elementId: input.elementId,
    textAlignment: 2,
    textPosition: 1,
    ...input.defaults,
  };
  attachNode(draft, node);
  return node;
}

function applyC4VisualDefaultsToView(draft: ModelState, viewId: string): void {
  const view = draft.views[viewId];
  if (!view) return;

  const visitNode = (nodeId: string) => {
    const node = draft.nodes[nodeId];
    if (!node) return;
    if (node.nodeType === 'element') {
      const element = draft.elements[node.elementId];
      const visual = element ? c4VisualStyleForElement(element, node) : undefined;
      if (visual) {
        if (node.fillColor === undefined) node.fillColor = visual.fillColor;
        if (node.lineColor === undefined) node.lineColor = visual.lineColor;
        if (node.fontColor === undefined) node.fontColor = visual.fontColor;
      }
    }
    for (const childId of node.childIds) visitNode(childId);
  };

  for (const childId of view.childIds) visitNode(childId);
  for (const connection of Object.values(draft.connections)) {
    if (connection.viewId !== viewId || connection.connType !== 'relationship') continue;
    if (connection.lineColor === undefined) connection.lineColor = C4_VISUAL_DEFAULTS.relationshipLine;
    if (connection.fontColor === undefined) connection.fontColor = C4_VISUAL_DEFAULTS.relationshipText;
  }
}

function c4NodeVisualDefaults(element: ArchimateElement): DiagramNodeDefaults {
  const visual = c4VisualStyleForElement(element);
  return visual
    ? {
        fillColor: visual.fillColor,
        lineColor: visual.lineColor,
        fontColor: visual.fontColor,
      }
    : {};
}

function addLegendNode(draft: ModelState, viewId: string, x: number, y: number): void {
  const viewType = c4PropertyValue(draft.views[viewId]?.properties, C4_PROPERTY_KEYS.viewType);
  if (!viewType) return;
  const node: DiagramNode = {
    id: newId(),
    viewId,
    parentId: viewId,
    bounds: { x, y, width: 430, height: 130 },
    childIds: [],
    sourceConnectionIds: [],
    targetConnectionIds: [],
    nodeType: 'note',
    content: c4LegendText(viewType as C4ViewType),
    properties: [{ key: 'c4.legend', value: 'true' }],
    textAlignment: 1,
    textPosition: 0,
  };
  attachNode(draft, node);
}

function nodeIdForElement(draft: ModelState, viewId: string, elementId: string): string {
  return Object.values(draft.nodes).find(
    (node) => node.viewId === viewId && node.nodeType === 'element' && node.elementId === elementId,
  )?.id ?? '';
}

function defaultC4ElementName(kind: C4ElementKind, properties: Record<string, string> = {}): string {
  if (kind === 'container' && hasTagValue(properties[C4_PROPERTY_KEYS.tags], 'database')) return 'Database';
  return C4_ELEMENT_KIND_LABELS[kind];
}

function hasTagValue(tags: string | undefined, tag: string): boolean {
  return tags?.toLowerCase().split(/[,\s]+/).includes(tag.toLowerCase()) ?? false;
}
