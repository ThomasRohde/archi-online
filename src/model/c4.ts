import type { ElementType } from './metamodel';
import type {
  ArchimateElement,
  ArchimateRelationship,
  Concept,
  DiagramNode,
  DiagramView,
  ModelState,
  Property,
} from './types';

export type C4ElementKind =
  | 'person'
  | 'software-system'
  | 'container'
  | 'component'
  | 'deployment-node'
  | 'infrastructure-node'
  | 'software-system-instance'
  | 'container-instance';

export type C4ViewType =
  | 'system-landscape'
  | 'system-context'
  | 'container'
  | 'component'
  | 'deployment'
  | 'dynamic';

export interface C4ValidationIssue {
  id: string;
  severity: 'warning' | 'error';
  message: string;
}

export type C4VisualShape = 'box' | 'database' | 'boundary';

export interface C4ElementLabelParts {
  name: string;
  kind: C4ElementKind;
  kindLabel: string;
  technology?: string;
  description?: string;
}

export interface C4RelationshipLabelParts {
  order?: string;
  label: string;
  technology?: string;
}

export interface C4VisualStyle {
  fillColor: string;
  lineColor: string;
  fontColor: string;
  shape: C4VisualShape;
  boundary: boolean;
}

export const C4_PROPERTY_KEYS = {
  kind: 'c4.kind',
  viewType: 'c4.viewType',
  scopeId: 'c4.scopeId',
  technology: 'c4.technology',
  tags: 'c4.tags',
  external: 'c4.external',
  instanceOf: 'c4.instanceOf',
  order: 'c4.order',
} as const;

export const C4_ELEMENT_KIND_LABELS: Record<C4ElementKind, string> = {
  person: 'Person',
  'software-system': 'Software System',
  container: 'Container',
  component: 'Component',
  'deployment-node': 'Deployment Node',
  'infrastructure-node': 'Infrastructure Node',
  'software-system-instance': 'Software System Instance',
  'container-instance': 'Container Instance',
};

export const C4_ELEMENT_KINDS = Object.keys(C4_ELEMENT_KIND_LABELS) as C4ElementKind[];

export const C4_VIEW_TYPE_LABELS: Record<C4ViewType, string> = {
  'system-landscape': 'System Landscape',
  'system-context': 'System Context',
  container: 'Container',
  component: 'Component',
  deployment: 'Deployment',
  dynamic: 'Dynamic',
};

export const C4_VIEW_TYPES = Object.keys(C4_VIEW_TYPE_LABELS) as C4ViewType[];

export const C4_ELEMENT_TYPES: Record<C4ElementKind, ElementType> = {
  person: 'BusinessActor',
  'software-system': 'ApplicationComponent',
  container: 'ApplicationComponent',
  component: 'ApplicationFunction',
  'deployment-node': 'Node',
  'infrastructure-node': 'Node',
  'software-system-instance': 'Artifact',
  'container-instance': 'Artifact',
};

export const C4_PALETTE_KINDS: C4ElementKind[] = [
  'person',
  'software-system',
  'container',
  'component',
  'deployment-node',
  'infrastructure-node',
];

export const C4_VISUAL_DEFAULTS = {
  personFill: '#08427B',
  personLine: '#052E56',
  elementFill: '#1168BD',
  elementLine: '#0D4F91',
  externalFill: '#999999',
  externalLine: '#6B7280',
  boundaryFill: '#F7FBFF',
  boundaryLine: '#8DB9DD',
  textOnDark: '#FFFFFF',
  textOnLight: '#253149',
  relationshipLine: '#4A5568',
  relationshipText: '#253149',
} as const;

const C4_ELEMENT_KIND_SET = new Set<C4ElementKind>(C4_ELEMENT_KINDS);
const C4_VIEW_TYPE_SET = new Set<C4ViewType>(C4_VIEW_TYPES);

export function c4PropertyValue(
  properties: Property[] | undefined,
  key: string,
): string | undefined {
  const value = properties?.find((property) => property.key === key)?.value.trim();
  return value ? value : undefined;
}

export function setC4PropertyValue(
  properties: Property[],
  key: string,
  value: string | undefined,
): Property[] {
  const next = properties.filter((property) => property.key !== key);
  const trimmed = value?.trim() ?? '';
  return trimmed ? [...next, { key, value: trimmed }] : next;
}

export function c4KindForConcept(concept: Concept | undefined): C4ElementKind | undefined {
  if (!concept || concept.kind !== 'element') return undefined;
  const kind = c4PropertyValue(concept.properties, C4_PROPERTY_KEYS.kind);
  return kind && C4_ELEMENT_KIND_SET.has(kind as C4ElementKind)
    ? (kind as C4ElementKind)
    : undefined;
}

export function c4ViewType(view: DiagramView | undefined): C4ViewType | undefined {
  const viewType = c4PropertyValue(view?.properties, C4_PROPERTY_KEYS.viewType);
  return viewType && C4_VIEW_TYPE_SET.has(viewType as C4ViewType)
    ? (viewType as C4ViewType)
    : undefined;
}

export function isC4Concept(concept: Concept | undefined): boolean {
  return (
    !!c4KindForConcept(concept) ||
    !!c4PropertyValue(concept?.properties, C4_PROPERTY_KEYS.technology) ||
    !!c4PropertyValue(concept?.properties, C4_PROPERTY_KEYS.order)
  );
}

export function c4ElementLabelParts(element: ArchimateElement): C4ElementLabelParts | undefined {
  const kind = c4KindForConcept(element);
  if (!kind) return undefined;
  const technology = c4PropertyValue(element.properties, C4_PROPERTY_KEYS.technology);
  const description = firstDocumentationLine(element.documentation);
  return {
    name: element.name,
    kind,
    kindLabel: C4_ELEMENT_KIND_LABELS[kind],
    ...(technology ? { technology } : {}),
    ...(description ? { description } : {}),
  };
}

export function c4RelationshipLabelParts(
  relationship: ArchimateRelationship,
): C4RelationshipLabelParts {
  const order = c4PropertyValue(relationship.properties, C4_PROPERTY_KEYS.order);
  const technology = c4PropertyValue(relationship.properties, C4_PROPERTY_KEYS.technology);
  const label = relationship.name.trim();
  return {
    ...(order ? { order } : {}),
    label,
    ...(technology ? { technology } : {}),
  };
}

export function c4VisualStyleForElement(
  element: ArchimateElement,
  node?: DiagramNode,
): C4VisualStyle | undefined {
  const kind = c4KindForConcept(element);
  if (!kind) return undefined;

  if (isC4BoundaryNode(kind, node)) {
    return {
      fillColor: C4_VISUAL_DEFAULTS.boundaryFill,
      lineColor: C4_VISUAL_DEFAULTS.boundaryLine,
      fontColor: C4_VISUAL_DEFAULTS.textOnLight,
      shape: 'boundary',
      boundary: true,
    };
  }

  const shape: C4VisualShape = hasC4Tag(element, 'database') ? 'database' : 'box';
  if (isExternalC4Element(element)) {
    return {
      fillColor: C4_VISUAL_DEFAULTS.externalFill,
      lineColor: C4_VISUAL_DEFAULTS.externalLine,
      fontColor: C4_VISUAL_DEFAULTS.textOnDark,
      shape,
      boundary: false,
    };
  }
  if (kind === 'person') {
    return {
      fillColor: C4_VISUAL_DEFAULTS.personFill,
      lineColor: C4_VISUAL_DEFAULTS.personLine,
      fontColor: C4_VISUAL_DEFAULTS.textOnDark,
      shape,
      boundary: false,
    };
  }
  return {
    fillColor: C4_VISUAL_DEFAULTS.elementFill,
    lineColor: C4_VISUAL_DEFAULTS.elementLine,
    fontColor: C4_VISUAL_DEFAULTS.textOnDark,
    shape,
    boundary: false,
  };
}

export function c4LabelForElement(element: ArchimateElement): string {
  const parts = c4ElementLabelParts(element);
  if (!parts) return element.name;
  return [parts.name, c4ElementTypeLine(parts), parts.description].filter(Boolean).join('\n');
}

export function c4LabelForRelationship(relationship: ArchimateRelationship): string {
  const parts = c4RelationshipLabelParts(relationship);
  if (!parts.technology && !parts.order) return relationship.name;
  return [c4RelationshipIntentLine(parts), c4RelationshipTechnologyLine(parts)].filter(Boolean).join('\n');
}

export function c4LegendText(viewType: C4ViewType): string {
  return [
    `C4 ${C4_VIEW_TYPE_LABELS[viewType]} View`,
    'Blue elements are internal; grey elements are external.',
    'Database containers render as cylinders.',
    'Dashed boxes are parent boundaries.',
    'Relationships are directed and labeled with intent plus optional [technology/protocol].',
  ].join('\n');
}

export function validateC4View(model: ModelState, viewId: string): C4ValidationIssue[] {
  const view = model.views[viewId];
  const viewType = c4ViewType(view);
  if (!view || !viewType) return [];

  const issues: C4ValidationIssue[] = [];
  const nodeIds = collectViewNodeIds(model, view);

  for (const nodeId of nodeIds) {
    const node = model.nodes[nodeId];
    if (!node || node.nodeType !== 'element') continue;
    const element = model.elements[node.elementId];
    const kind = c4KindForConcept(element);
    if (!element || !kind) continue;

    if (requiresTechnology(kind) && !c4PropertyValue(element.properties, C4_PROPERTY_KEYS.technology)) {
      issues.push({
        id: `${element.id}:technology`,
        severity: 'warning',
        message: `C4 ${kind} "${element.name}" should specify c4.technology.`,
      });
    }
    if (requiresDocumentation(kind) && !firstDocumentationLine(element.documentation)) {
      issues.push({
        id: `${element.id}:documentation`,
        severity: 'warning',
        message: `C4 ${kind} "${element.name}" should have a short documentation description.`,
      });
    }
  }

  for (const connection of Object.values(model.connections)) {
    if (connection.viewId !== viewId || connection.connType !== 'relationship' || !connection.relationshipId) {
      continue;
    }
    const relationship = model.relationships[connection.relationshipId];
    if (!relationship) continue;
    const sourceName = connectionEndpointName(model, connection.sourceId);
    const targetName = connectionEndpointName(model, connection.targetId);
    if (!relationship.name.trim()) {
      issues.push({
        id: `${relationship.id}:name`,
        severity: 'warning',
        message: `C4 relationship from ${sourceName} to ${targetName} should have a label.`,
      });
    }
    if (
      viewType === 'container' &&
      !c4PropertyValue(relationship.properties, C4_PROPERTY_KEYS.technology)
    ) {
      issues.push({
        id: `${relationship.id}:technology`,
        severity: 'warning',
        message: `Container-level relationship from ${sourceName} to ${targetName} should specify c4.technology.`,
      });
    }
  }

  return issues;
}

function requiresTechnology(kind: C4ElementKind): boolean {
  return kind === 'container' || kind === 'component' || kind === 'container-instance';
}

function requiresDocumentation(kind: C4ElementKind): boolean {
  return (
    kind === 'person' ||
    kind === 'software-system' ||
    kind === 'container' ||
    kind === 'component'
  );
}

function firstDocumentationLine(documentation: string): string {
  return documentation
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? '';
}

function c4ElementTypeLine(parts: C4ElementLabelParts): string {
  return parts.technology
    ? `[${parts.kindLabel}: ${parts.technology}]`
    : `[${parts.kindLabel}]`;
}

function c4RelationshipIntentLine(parts: C4RelationshipLabelParts): string {
  return parts.order && parts.label ? `${parts.order}. ${parts.label}` : parts.label;
}

function c4RelationshipTechnologyLine(parts: C4RelationshipLabelParts): string {
  return parts.technology ? `[${parts.technology}]` : '';
}

function c4Tags(element: ArchimateElement): Set<string> {
  const tags = c4PropertyValue(element.properties, C4_PROPERTY_KEYS.tags);
  return new Set(
    (tags ?? '')
      .split(/[,\s]+/)
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
  );
}

function hasC4Tag(element: ArchimateElement, tag: string): boolean {
  return c4Tags(element).has(tag.toLowerCase());
}

function isExternalC4Element(element: ArchimateElement): boolean {
  return (
    c4PropertyValue(element.properties, C4_PROPERTY_KEYS.external)?.toLowerCase() === 'true' ||
    hasC4Tag(element, 'external')
  );
}

function isC4BoundaryNode(kind: C4ElementKind, node: DiagramNode | undefined): boolean {
  if (!node || node.nodeType !== 'element' || node.childIds.length === 0) return false;
  return (
    kind === 'software-system' ||
    kind === 'container' ||
    kind === 'deployment-node' ||
    kind === 'infrastructure-node'
  );
}

function collectViewNodeIds(model: ModelState, view: DiagramView): string[] {
  const ids: string[] = [];
  const visit = (nodeId: string) => {
    ids.push(nodeId);
    const node = model.nodes[nodeId];
    if (!node) return;
    for (const childId of node.childIds) visit(childId);
  };
  for (const childId of view.childIds) visit(childId);
  return ids;
}

function connectionEndpointName(model: ModelState, nodeId: string): string {
  const node = model.nodes[nodeId];
  if (!node) return 'Unknown';
  if (node.nodeType === 'element') return model.elements[node.elementId]?.name ?? 'Unknown';
  if (node.nodeType === 'group') return node.name;
  if (node.nodeType === 'note') return node.content.split(/\r?\n/)[0] || 'Note';
  return model.views[node.refViewId]?.name ?? 'View';
}
