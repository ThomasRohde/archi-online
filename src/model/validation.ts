// Archi 5.9 Hammer compatibility rules plus a separately identified model-integrity pass.
import { modelRelations, viewsUsing } from './analysis';
import { isAllowedElementInViewpoint, viewpointName } from './data/viewpoints';
import {
  ELEMENT_TYPE_MAP,
  elementLabel,
  relationshipLabel,
  type RelationshipType,
} from './metamodel';
import { isAllowedRelationship } from './rules';
import {
  connectionGraphError,
  getConcept,
  getConnectable,
  relationshipConnectionEndpointError,
  type ArchimateElement,
  type ArchimateRelationship,
  type Concept,
  type DiagramView,
  type ElementNode,
  type Folder,
  type FolderType,
  type ModelState,
} from './types';

export type Severity = 'error' | 'warning' | 'advice';
export type ValidationSource = 'hammer' | 'integrity';
export type ValidationRuleId =
  | 'invalid-relationship'
  | 'unused-element'
  | 'unused-relationship'
  | 'empty-view'
  | 'viewpoint'
  | 'nested-elements'
  | 'duplicate-name'
  | 'junction';

export interface ValidationRule {
  id: ValidationRuleId;
  name: string;
  severity: Severity;
}

export const VALIDATION_RULES: readonly ValidationRule[] = [
  { id: 'invalid-relationship', name: 'Invalid relationships', severity: 'error' },
  { id: 'unused-element', name: 'Unused elements', severity: 'warning' },
  { id: 'unused-relationship', name: 'Unused relationships', severity: 'warning' },
  { id: 'empty-view', name: 'Empty views', severity: 'advice' },
  { id: 'viewpoint', name: 'Viewpoint violations', severity: 'warning' },
  { id: 'nested-elements', name: 'Nested elements', severity: 'advice' },
  { id: 'duplicate-name', name: 'Duplicate element names', severity: 'warning' },
  { id: 'junction', name: 'Mixed junction relationships', severity: 'error' },
];

export interface ValidationConfig {
  version: 1;
  enabled: Record<ValidationRuleId, boolean>;
}

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  version: 1,
  enabled: Object.fromEntries(VALIDATION_RULES.map((rule) => [rule.id, true])) as Record<
    ValidationRuleId,
    boolean
  >,
};

export interface IssueLocation {
  modelTree: {
    idPath: string[];
    labelPath: string[];
  };
  view?: {
    viewId: string;
    objectId?: string;
  };
}

export interface ValidationIssue {
  severity: Severity;
  source: ValidationSource;
  rule: string;
  message: string;
  location: IssueLocation;
}

function defaultName(concept: Concept): string {
  return concept.kind === 'element'
    ? elementLabel(concept.type)
    : relationshipLabel(concept.type);
}

function label(concept: Concept): string {
  return concept.name || defaultName(concept);
}

function folderPath(state: ModelState, folderId: string): { ids: string[]; labels: string[] } {
  const ids: string[] = [];
  const labels: string[] = [];
  const visited = new Set<string>();
  let current: Folder | undefined = state.folders[folderId];
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    ids.unshift(current.id);
    labels.unshift(current.name || '(unnamed folder)');
    current = current.parentId ? state.folders[current.parentId] : undefined;
  }
  return { ids, labels };
}

function itemLocation(
  state: ModelState,
  id: string,
  view?: IssueLocation['view'],
): IssueLocation {
  if (id === state.info.id) {
    return { modelTree: { idPath: [id], labelPath: [state.info.name] }, ...(view ? { view } : {}) };
  }
  const folder = state.folders[id];
  if (folder) {
    const path = folderPath(state, id);
    return { modelTree: { idPath: path.ids, labelPath: path.labels }, ...(view ? { view } : {}) };
  }
  const item = (
    (state.elements[id] as ArchimateElement | undefined)
    ?? (state.relationships[id] as ArchimateRelationship | undefined)
    ?? (state.views[id] as DiagramView | undefined)
  );
  if (item) {
    const path = folderPath(state, item.folderId);
    let itemName: string;
    switch (item.kind) {
      case 'element':
        itemName = item.name || elementLabel(item.type);
        break;
      case 'relationship':
        itemName = item.name || relationshipLabel(item.type);
        break;
      case 'view':
        itemName = item.name || '(unnamed view)';
        break;
    }
    return {
      modelTree: {
        idPath: [...path.ids, id],
        labelPath: [...path.labels, itemName],
      },
      ...(view ? { view } : {}),
    };
  }
  const object = state.nodes[id] ?? state.connections[id];
  if (object) {
    const viewItem = state.views[object.viewId];
    const base = viewItem ? itemLocation(state, viewItem.id) : itemLocation(state, state.info.id);
    return {
      modelTree: base.modelTree,
      view: { viewId: object.viewId, objectId: id },
    };
  }
  return {
    modelTree: { idPath: [state.info.id, id], labelPath: [state.info.name, `(missing ${id})`] },
    ...(view ? { view } : {}),
  };
}

function hammerIssue(
  state: ModelState,
  rule: ValidationRuleId,
  message: string,
  targetId: string,
  view?: IssueLocation['view'],
): ValidationIssue {
  return {
    severity: VALIDATION_RULES.find((candidate) => candidate.id === rule)!.severity,
    source: 'hammer',
    rule,
    message,
    location: itemLocation(state, targetId, view),
  };
}

const NESTED_RELATIONSHIP_TYPES: ReadonlySet<RelationshipType> = new Set([
  'CompositionRelationship',
  'AggregationRelationship',
  'AssignmentRelationship',
  'AccessRelationship',
  'RealizationRelationship',
  'SpecializationRelationship',
]);

function invalidRelationships(state: ModelState): ValidationIssue[] {
  return Object.values(state.relationships).flatMap((relationship) => {
    const source = getConcept(state, relationship.sourceId);
    const target = getConcept(state, relationship.targetId);
    if (!source || !target || isAllowedRelationship(relationship.type, source.type, target.type)) {
      return [];
    }
    return [hammerIssue(
      state,
      'invalid-relationship',
      `${relationshipLabel(relationship.type)} is not allowed between '${label(source)}' and '${label(target)}'`,
      relationship.id,
    )];
  });
}

function junctions(state: ModelState): ValidationIssue[] {
  return Object.values(state.elements).flatMap((element) => {
    if (element.type !== 'Junction') return [];
    if (new Set(modelRelations(state, element.id).map((relationship) => relationship.type)).size <= 1) {
      return [];
    }
    return [hammerIssue(
      state,
      'junction',
      `'${label(element)}' has different relationship types`,
      element.id,
    )];
  });
}

function duplicateNames(state: ModelState): ValidationIssue[] {
  const elements = Object.values(state.elements);
  const duplicates = new Set<ArchimateElement>();
  for (let left = 0; left < elements.length; left++) {
    for (let right = left + 1; right < elements.length; right++) {
      const a = elements[left];
      const b = elements[right];
      if (a.type === 'Junction' && b.type === 'Junction') continue;
      if (a.name === b.name && a.type === b.type) {
        duplicates.add(a);
        duplicates.add(b);
      }
    }
  }
  return [...duplicates].map((element) => hammerIssue(
    state,
    'duplicate-name',
    `The name '${element.name}' is used more than once for the type '${elementLabel(element.type)}'.`,
    element.id,
  ));
}

function unusedElements(state: ModelState): ValidationIssue[] {
  return Object.values(state.elements)
    .filter((element) => viewsUsing(state, element.id).length === 0)
    .map((element) => hammerIssue(
      state, 'unused-element', `'${label(element)}' is not used in a View`, element.id,
    ));
}

function unusedRelationships(state: ModelState): ValidationIssue[] {
  return Object.values(state.relationships)
    .filter((relationship) => viewsUsing(state, relationship.id).length === 0)
    .map((relationship) => hammerIssue(
      state,
      'unused-relationship',
      `'${label(relationship)}' is not used in a View`,
      relationship.id,
    ));
}

function emptyViews(state: ModelState): ValidationIssue[] {
  return Object.values(state.views)
    .filter((view) => view.childIds.length === 0)
    .map((view) => hammerIssue(state, 'empty-view', `'${view.name}' is empty`, view.id, {
      viewId: view.id,
    }));
}

function viewpointViolations(state: ModelState): ValidationIssue[] {
  return Object.values(state.nodes).flatMap((node) => {
    if (node.nodeType !== 'element') return [];
    const view = state.views[node.viewId];
    const element = state.elements[node.elementId];
    if (!view || !element || isAllowedElementInViewpoint(view.viewpoint, element.type)) return [];
    return [hammerIssue(
      state,
      'viewpoint',
      `'${label(element)}' does not belong in '${view.name}' (${viewpointName(view.viewpoint)} Viewpoint)`,
      view.id,
      { viewId: view.id, objectId: node.id },
    )];
  });
}

function isNestedWithoutValidRelation(state: ModelState, parent: ElementNode, child: ElementNode) {
  const parentElement = state.elements[parent.elementId];
  const childElement = state.elements[child.elementId];
  if (!parentElement || !childElement || childElement.type === 'Junction') return false;
  for (const connectionId of [...parent.sourceConnectionIds, ...parent.targetConnectionIds]) {
    const connection = state.connections[connectionId];
    if (!connection?.relationshipId || (connection.sourceId !== child.id && connection.targetId !== child.id)) {
      continue;
    }
    const relationship = state.relationships[connection.relationshipId];
    if (!relationship) continue;
    if (!NESTED_RELATIONSHIP_TYPES.has(relationship.type)) return true;
    if (relationship.type === 'SpecializationRelationship') {
      if (relationship.targetId === childElement.id) return true;
    } else if (relationship.sourceId === childElement.id) return true;
  }
  return !modelRelations(state, parentElement.id).some((relationship) => (
    (relationship.targetId === childElement.id || relationship.sourceId === childElement.id)
    && NESTED_RELATIONSHIP_TYPES.has(relationship.type)
  ));
}

function nestedElements(state: ModelState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const parent of Object.values(state.nodes)) {
    if (parent.nodeType !== 'element') continue;
    for (const childId of parent.childIds) {
      const child = state.nodes[childId];
      if (!child || child.nodeType !== 'element' || !isNestedWithoutValidRelation(state, parent, child)) {
        continue;
      }
      const parentElement = state.elements[parent.elementId];
      const childElement = state.elements[child.elementId];
      if (!parentElement || !childElement) continue;
      issues.push(hammerIssue(
        state,
        'nested-elements',
        `'${label(childElement)}' is nested inside of '${label(parentElement)}' but there is a non-nesting relationship between them or no relationship.`,
        parent.viewId,
        { viewId: parent.viewId, objectId: child.id },
      ));
    }
  }
  return issues;
}

function integrityIssue(
  state: ModelState,
  rule: string,
  message: string,
  targetId: string,
  severity: Severity = 'error',
  view?: IssueLocation['view'],
): ValidationIssue {
  return {
    severity,
    source: 'integrity',
    rule,
    message,
    location: itemLocation(state, targetId, view),
  };
}

function integrityIds(state: ModelState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, string>();
  const records: Array<[string, Record<string, { id: string }>]> = [
    ['profile', state.profiles],
    ['folder', state.folders],
    ['element', state.elements],
    ['relationship', state.relationships],
    ['view', state.views],
    ['node', state.nodes],
    ['connection', state.connections],
  ];
  seen.set(state.info.id, 'model');
  for (const [kind, record] of records) {
    for (const [key, value] of Object.entries(record)) {
      if (value.id !== key) {
        issues.push(integrityIssue(
          state, 'integrity-id', `${kind} key '${key}' does not match id '${value.id}'`, key,
        ));
      }
      const previous = seen.get(value.id);
      if (previous) {
        issues.push(integrityIssue(
          state, 'integrity-id', `Duplicate id '${value.id}' is used by ${previous} and ${kind}`, key,
        ));
      } else seen.set(value.id, kind);
    }
  }
  return issues;
}

function integrityReferences(state: ModelState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const missing = (targetId: string, reference: string, ownerId: string) => {
    issues.push(integrityIssue(
      state, 'integrity-reference', `Missing ${reference} reference '${targetId}'`, ownerId,
    ));
  };
  for (const [id, folder] of Object.entries(state.folders)) {
    if (folder.parentId && !state.folders[folder.parentId]) missing(folder.parentId, 'folder parent', id);
    for (const childId of folder.folderIds) if (!state.folders[childId]) missing(childId, 'child folder', id);
    for (const itemId of folder.itemIds) {
      if (!state.elements[itemId] && !state.relationships[itemId] && !state.views[itemId]) {
        missing(itemId, 'folder item', id);
      }
    }
  }
  for (const item of [...Object.values(state.elements), ...Object.values(state.relationships)]) {
    if (!state.folders[item.folderId]) missing(item.folderId, 'owning folder', item.id);
    for (const profileId of item.profileIds) if (!state.profiles[profileId]) missing(profileId, 'profile', item.id);
  }
  for (const relationship of Object.values(state.relationships)) {
    if (!getConcept(state, relationship.sourceId)) missing(relationship.sourceId, 'relationship source', relationship.id);
    if (!getConcept(state, relationship.targetId)) missing(relationship.targetId, 'relationship target', relationship.id);
  }
  for (const view of Object.values(state.views)) {
    if (!state.folders[view.folderId]) missing(view.folderId, 'owning folder', view.id);
    for (const childId of view.childIds) if (!state.nodes[childId]) missing(childId, 'view child', view.id);
  }
  for (const node of Object.values(state.nodes)) {
    if (!state.views[node.viewId]) missing(node.viewId, 'owning view', node.id);
    if (node.parentId !== node.viewId && !state.nodes[node.parentId]) missing(node.parentId, 'node parent', node.id);
    if (node.nodeType === 'element' && !state.elements[node.elementId]) missing(node.elementId, 'element', node.id);
    if (node.nodeType === 'ref' && !state.views[node.refViewId]) missing(node.refViewId, 'referenced view', node.id);
  }
  for (const connection of Object.values(state.connections)) {
    if (!state.views[connection.viewId]) missing(connection.viewId, 'owning view', connection.id);
    if (!getConnectable(state, connection.sourceId)) missing(connection.sourceId, 'connection source', connection.id);
    if (!getConnectable(state, connection.targetId)) missing(connection.targetId, 'connection target', connection.id);
    if (connection.connType === 'relationship' && (!connection.relationshipId || !state.relationships[connection.relationshipId])) {
      missing(connection.relationshipId ?? '(empty)', 'semantic relationship', connection.id);
    }
  }
  return issues;
}

function integrityFolders(state: ModelState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const memberships = new Map<string, string[]>();
  const reportedCycles = new Set<string>();
  for (const folder of Object.values(state.folders)) {
    const path: string[] = [];
    const positions = new Map<string, number>();
    let current: Folder | undefined = folder;
    while (current) {
      const position = positions.get(current.id);
      if (position !== undefined) {
        const cycle = path.slice(position);
        const key = [...cycle].sort().join('|');
        if (!reportedCycles.has(key)) {
          reportedCycles.add(key);
          issues.push(integrityIssue(
            state,
            'integrity-folder-membership',
            `Folder parent cycle contains ${cycle.map((id) => `'${id}'`).join(', ')}`,
            current.id,
          ));
        }
        break;
      }
      positions.set(current.id, path.length);
      path.push(current.id);
      current = current.parentId ? state.folders[current.parentId] : undefined;
    }
  }
  for (const [folderId, folder] of Object.entries(state.folders)) {
    for (const itemId of folder.itemIds) {
      const owners = memberships.get(itemId) ?? [];
      owners.push(folderId);
      memberships.set(itemId, owners);
      const item = state.elements[itemId] ?? state.relationships[itemId] ?? state.views[itemId];
      if (item && item.folderId !== folderId) {
        issues.push(integrityIssue(
          state, 'integrity-folder-membership', `Folder membership disagrees with '${itemId}' owning folder`, itemId, 'warning',
        ));
      }
    }
    for (const childId of folder.folderIds) {
      const child = state.folders[childId];
      if (child && child.parentId !== folderId) {
        issues.push(integrityIssue(
          state, 'integrity-folder-membership', `Child folder '${childId}' has a different parent`, childId, 'warning',
        ));
      }
    }
  }
  for (const item of [
    ...Object.values(state.elements),
    ...Object.values(state.relationships),
    ...Object.values(state.views),
  ]) {
    const owners = memberships.get(item.id) ?? [];
    if (owners.length !== 1 || owners[0] !== item.folderId) {
      issues.push(integrityIssue(
        state,
        'integrity-folder-membership',
        owners.length > 1 ? `Item '${item.id}' belongs to multiple folders` : `Item '${item.id}' is missing from its owning folder`,
        item.id,
        'warning',
      ));
    }
  }
  return issues;
}

const LAYER_FOLDER: Record<string, FolderType> = {
  strategy: 'strategy',
  business: 'business',
  application: 'application',
  technology: 'technology',
  physical: 'technology',
  motivation: 'motivation',
  implementation_migration: 'implementation_migration',
  other: 'other',
};

function rootType(state: ModelState, folderId: string): FolderType | undefined {
  const visited = new Set<string>();
  let folder = state.folders[folderId];
  while (folder && folder.parentId && !visited.has(folder.id)) {
    visited.add(folder.id);
    folder = state.folders[folder.parentId];
  }
  return folder?.folderType;
}

function integrityRoots(state: ModelState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const rootId of state.rootFolderIds) {
    const root = state.folders[rootId];
    if (!root || root.parentId !== null || !root.folderType) {
      issues.push(integrityIssue(
        state, 'integrity-root-folder', `Invalid root-folder entry '${rootId}'`, rootId, 'warning',
      ));
    }
  }
  const expected = (item: Concept | ModelState['views'][string]): FolderType => {
    if (item.kind === 'relationship') return 'relations';
    if (item.kind === 'view') return 'diagrams';
    return LAYER_FOLDER[ELEMENT_TYPE_MAP[item.type].layer];
  };
  for (const item of [
    ...Object.values(state.elements),
    ...Object.values(state.relationships),
    ...Object.values(state.views),
  ]) {
    const actual = rootType(state, item.folderId);
    if (actual && actual !== expected(item)) {
      issues.push(integrityIssue(
        state,
        'integrity-root-folder',
        `'${item.id}' is under the '${actual}' root instead of '${expected(item)}'`,
        item.id,
        'warning',
      ));
    }
  }
  return issues;
}

function integrityViews(state: ModelState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const view of Object.values(state.views)) {
    for (const childId of view.childIds) {
      const child = state.nodes[childId];
      if (!child) {
        issues.push(integrityIssue(
          state, 'integrity-view-ownership', `View '${view.id}' owns missing node '${childId}'`, view.id,
        ));
        continue;
      }
      if (child && (child.viewId !== view.id || child.parentId !== view.id)) {
        issues.push(integrityIssue(
          state, 'integrity-view-ownership', `Top-level node '${childId}' has inconsistent view ownership`, view.id, 'error', { viewId: view.id, objectId: childId },
        ));
      }
    }
  }
  for (const node of Object.values(state.nodes)) {
    const parent = state.nodes[node.parentId];
    if (parent && (parent.viewId !== node.viewId || !parent.childIds.includes(node.id))) {
      issues.push(integrityIssue(
        state, 'integrity-view-ownership', `Node '${node.id}' is not owned by its declared parent`, node.id,
      ));
    }
    if (!parent && state.views[node.viewId] && !state.views[node.viewId].childIds.includes(node.id)) {
      issues.push(integrityIssue(
        state, 'integrity-view-ownership', `Node '${node.id}' is not owned by its declared view`, node.id,
      ));
    }
  }
  for (const connection of Object.values(state.connections)) {
    for (const endpointId of [connection.sourceId, connection.targetId]) {
      const endpoint = getConnectable(state, endpointId);
      if (endpoint && endpoint.viewId !== connection.viewId) {
        issues.push(integrityIssue(
          state, 'integrity-view-ownership', `Connection '${connection.id}' crosses view ownership`, connection.id,
        ));
      }
    }
  }
  return issues;
}

function integrityConnections(state: ModelState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const connection of Object.values(state.connections)) {
    if (!getConnectable(state, connection.sourceId) || !getConnectable(state, connection.targetId)) {
      issues.push(integrityIssue(
        state, 'integrity-connection-topology', `Connection '${connection.id}' has a missing endpoint`, connection.id,
      ));
      continue;
    }
    const semantic = relationshipConnectionEndpointError(state, connection);
    if (semantic) issues.push(integrityIssue(state, 'integrity-connection-topology', semantic, connection.id));
  }
  const graphError = connectionGraphError(state);
  if (graphError && !issues.some((issue) => issue.message === graphError)) {
    issues.push(integrityIssue(
      state, 'integrity-connection-topology', graphError, Object.keys(state.connections)[0] ?? state.info.id,
    ));
  }
  return issues;
}

export function validateModelIntegrity(state: ModelState): ValidationIssue[] {
  return [
    ...integrityIds(state),
    ...integrityReferences(state),
    ...integrityFolders(state),
    ...integrityRoots(state),
    ...integrityViews(state),
    ...integrityConnections(state),
  ];
}

const CHECKERS: Record<ValidationRuleId, (state: ModelState) => ValidationIssue[]> = {
  'invalid-relationship': invalidRelationships,
  'unused-element': unusedElements,
  'unused-relationship': unusedRelationships,
  'empty-view': emptyViews,
  viewpoint: viewpointViolations,
  'nested-elements': nestedElements,
  'duplicate-name': duplicateNames,
  junction: junctions,
};

/** Run enabled Desktop Hammer rules in Archi order, then the separately labelled integrity pass. */
export function validateModel(
  state: ModelState,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG,
): ValidationIssue[] {
  const hammer = VALIDATION_RULES.flatMap((rule) => (
    config.enabled[rule.id] === false ? [] : CHECKERS[rule.id](state)
  ));
  return [...hammer, ...validateModelIntegrity(state)];
}
