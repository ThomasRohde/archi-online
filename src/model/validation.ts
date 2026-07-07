// Model Validator — a 1:1 port of Archi's Hammer validator
// (github.com/archimatetool/archi, master:
//  com.archimatetool.hammer/src/com/archimatetool/hammer/validation/).
// Each checker keeps Archi's severity, rule name, and message wording (templates
// transcribed from checkers/messages.properties, NLS '' unescaped to '). Pure
// functions over ModelState — no React, no store access. validateModel composes
// the checkers in the same order as Validator.validate().

import { modelRelations, viewsUsing } from './analysis';
import { isAllowedElementInViewpoint, viewpointName } from './data/viewpoints';
import { elementLabel, relationshipLabel, type RelationshipType } from './metamodel';
import { isAllowedRelationship } from './rules';
import {
  getConcept,
  type ArchimateElement,
  type Concept,
  type ElementNode,
  type ModelState,
} from './types';

export type Severity = 'error' | 'warning' | 'advice';

export interface ValidationIssue {
  severity: Severity;
  /** Stable rule id, e.g. 'invalid-relationship'. */
  rule: string;
  /** Ported wording with names interpolated. */
  message: string;
  /** Element/relationship to select in the tree. */
  conceptId?: string;
  /** View to open… */
  viewId?: string;
  /** …and diagram node/connection to select in it. */
  objectId?: string;
}

/** ArchiLabelProvider.getDefaultName(eClass): the concept type's display name. */
function defaultName(concept: Concept): string {
  return concept.kind === 'element'
    ? elementLabel(concept.type)
    : relationshipLabel(concept.type);
}

/** ArchiLabelProvider.getLabel: the concept's name, or its type default name if blank. */
function label(concept: Concept): string {
  return concept.name ? concept.name : defaultName(concept);
}

// Nesting relationship types per the ArchiMate spec (NestedElementsChecker).
const NESTED_RELATIONSHIP_TYPES: ReadonlySet<RelationshipType> = new Set<RelationshipType>([
  'CompositionRelationship',
  'AggregationRelationship',
  'AssignmentRelationship',
  'AccessRelationship',
  'RealizationRelationship',
  'SpecializationRelationship',
]);

function isNestedType(type: RelationshipType): boolean {
  return NESTED_RELATIONSHIP_TYPES.has(type);
}

/** InvalidRelationsChecker — ErrorType. Matrix check only (LEVELUP §6.1). */
function invalidRelationships(state: ModelState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const rel of Object.values(state.relationships)) {
    const source = getConcept(state, rel.sourceId);
    const target = getConcept(state, rel.targetId);
    if (!source || !target) continue;
    if (!isAllowedRelationship(rel.type, source.type, target.type)) {
      issues.push({
        severity: 'error',
        rule: 'invalid-relationship',
        message: `${relationshipLabel(rel.type)} is not allowed between '${label(source)}' and '${label(target)}'`,
        conceptId: rel.id,
      });
    }
  }
  return issues;
}

/** JunctionsChecker — ErrorType. A junction's relationships must all share a type. */
function junctions(state: ModelState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const element of Object.values(state.elements)) {
    if (element.type !== 'Junction') continue;
    const types = new Set(modelRelations(state, element.id).map((rel) => rel.type));
    if (types.size > 1) {
      issues.push({
        severity: 'error',
        rule: 'junction',
        message: `'${label(element)}' has different relationship types`,
        conceptId: element.id,
      });
    }
  }
  return issues;
}

/** DuplicateElementChecker — WarningType. Same name + type (Junctions excluded). */
function duplicateNames(state: ModelState): ValidationIssue[] {
  const elements = Object.values(state.elements);
  const dupes = new Set<ArchimateElement>();
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i];
      const b = elements[j];
      // Ignore Junctions — they share generic names like "Junction" / "Or".
      if (a.type === 'Junction' && b.type === 'Junction') continue;
      if (a.name === b.name && a.type === b.type) {
        dupes.add(a);
        dupes.add(b);
      }
    }
  }
  return Array.from(dupes).map((element) => ({
    severity: 'warning' as const,
    rule: 'duplicate-name',
    message: `The name '${element.name}' is used more than once for the type '${elementLabel(element.type)}'.`,
    conceptId: element.id,
  }));
}

/** UnusedElementsChecker — WarningType. Element not referenced in any view. */
function unusedElements(state: ModelState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const element of Object.values(state.elements)) {
    if (viewsUsing(state, element.id).length === 0) {
      issues.push({
        severity: 'warning',
        rule: 'unused-element',
        message: `'${label(element)}' is not used in a View`,
        conceptId: element.id,
      });
    }
  }
  return issues;
}

/** UnusedRelationsChecker — WarningType. Relationship not referenced in any view. */
function unusedRelationships(state: ModelState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const rel of Object.values(state.relationships)) {
    if (viewsUsing(state, rel.id).length === 0) {
      issues.push({
        severity: 'warning',
        rule: 'unused-relationship',
        message: `'${label(rel)}' is not used in a View`,
        conceptId: rel.id,
      });
    }
  }
  return issues;
}

/** EmptyViewsChecker — AdviceType. A view with no diagram objects. */
function emptyViews(state: ModelState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const view of Object.values(state.views)) {
    if (view.childIds.length === 0) {
      issues.push({
        severity: 'advice',
        rule: 'empty-view',
        message: `'${view.name}' is empty`,
        viewId: view.id,
      });
    }
  }
  return issues;
}

/** ViewpointChecker — WarningType. Element node not allowed by the view's viewpoint. */
function viewpointViolations(state: ModelState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const node of Object.values(state.nodes)) {
    if (node.nodeType !== 'element') continue;
    const view = state.views[node.viewId];
    const element = state.elements[node.elementId];
    if (!view || !element) continue;
    if (!isAllowedElementInViewpoint(view.viewpoint, element.type)) {
      issues.push({
        severity: 'warning',
        rule: 'viewpoint',
        message: `'${label(element)}' does not belong in '${view.name}' (${viewpointName(view.viewpoint)} Viewpoint)`,
        viewId: view.id,
        objectId: node.id,
      });
    }
  }
  return issues;
}

/** NestedElementsChecker — AdviceType. Visual nesting without a nesting relationship. */
function nestedElements(state: ModelState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const parent of Object.values(state.nodes)) {
    if (parent.nodeType !== 'element') continue;
    for (const childId of parent.childIds) {
      const child = state.nodes[childId];
      if (!child || child.nodeType !== 'element') continue;
      if (!isNestedWithoutValidRelation(state, parent, child)) continue;
      const parentEl = state.elements[parent.elementId];
      const childEl = state.elements[child.elementId];
      if (!parentEl || !childEl) continue;
      issues.push({
        severity: 'advice',
        rule: 'nested-elements',
        message: `'${label(childEl)}' is nested inside of '${label(parentEl)}' but there is a non-nesting relationship between them or no relationship.`,
        viewId: parent.viewId,
        objectId: child.id,
      });
    }
  }
  return issues;
}

function isNestedWithoutValidRelation(
  state: ModelState,
  parent: ElementNode,
  child: ElementNode,
): boolean {
  const parentEl = state.elements[parent.elementId];
  const childEl = state.elements[child.elementId];
  if (!parentEl || !childEl) return false;

  // Ignore nested Junctions.
  if (childEl.type === 'Junction') return false;

  // Diagram connections between the parent and child objects.
  for (const connId of [...parent.sourceConnectionIds, ...parent.targetConnectionIds]) {
    const conn = state.connections[connId];
    if (!conn || conn.connType !== 'relationship' || !conn.relationshipId) continue;
    if (conn.sourceId !== child.id && conn.targetId !== child.id) continue;
    const rel = state.relationships[conn.relationshipId];
    if (!rel) continue;

    // Non-nesting relationship type.
    if (!isNestedType(rel.type)) return true;

    // Specialization goes the other way around.
    if (rel.type === 'SpecializationRelationship') {
      if (rel.targetId === childEl.id) return true;
    }
    // Otherwise a reversed (child → parent) nesting relationship.
    else if (rel.sourceId === childEl.id) {
      return true;
    }
  }

  // A nesting-type relationship anywhere in the model between the two elements is fine.
  for (const rel of modelRelations(state, parentEl.id)) {
    if (
      (rel.targetId === childEl.id || rel.sourceId === childEl.id) &&
      isNestedType(rel.type)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Run every checker over the model, in Archi's Validator.validate() order.
 * Returns a flat list; callers group by severity for display.
 */
export function validateModel(state: ModelState): ValidationIssue[] {
  return [
    ...invalidRelationships(state),
    ...unusedElements(state),
    ...unusedRelationships(state),
    ...emptyViews(state),
    ...viewpointViolations(state),
    ...nestedElements(state),
    ...duplicateNames(state),
    ...junctions(state),
  ];
}
