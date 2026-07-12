import { newId } from '../id';
import {
  isElementType,
  isRelationshipType,
  relationshipLabel,
  type ConceptType as MetamodelConceptType,
} from '../metamodel';
import { enumerateRelationshipCandidates } from '../rules';
import { getActiveModelStore, transactWithSelection, type ModelStore } from '../store';
import {
  getConcept,
  type ArchimateElement,
  type ArchimateRelationship,
  type Concept,
  type ConceptType,
  type ModelState,
} from '../types';
import { defaultFolderId, folderForElementType } from './concepts';

export interface ConceptTypeChangeInput {
  conceptIds: string[];
  targetType: ConceptType;
}

export interface ConceptTypeChangePlan {
  valid: boolean;
  reason?: string;
  input: ConceptTypeChangeInput;
  kind: 'element' | 'relationship' | 'none';
  changedConceptIds: string[];
  invalidAdjacentRelationshipIds: string[];
  requiresConfirmation: boolean;
}

export interface ConceptTypeChangeOptions {
  convertInvalidRelationshipsToAssociation?: boolean;
  addDocumentationNote?: boolean;
}

export interface ConceptTypeChangeResult {
  idMap: Record<string, string>;
}

export function analyzeConceptTypeChange(
  model: ModelState,
  input: ConceptTypeChangeInput,
): ConceptTypeChangePlan {
  const conceptIds = [...new Set(input.conceptIds)];
  const capturedInput = { conceptIds, targetType: input.targetType };
  const targetKind = isElementType(input.targetType)
    ? 'element'
    : isRelationshipType(input.targetType)
      ? 'relationship'
      : 'none';
  const invalid = (reason: string): ConceptTypeChangePlan => ({
    valid: false,
    reason,
    input: capturedInput,
    kind: 'none',
    changedConceptIds: [],
    invalidAdjacentRelationshipIds: [],
    requiresConfirmation: false,
  });
  if (targetKind === 'none') return invalid(`Unknown concept type: ${input.targetType}`);
  if (conceptIds.length === 0) return invalid('No concepts selected');
  const concepts = conceptIds.map((id) => model.elements[id] ?? model.relationships[id]);
  if (concepts.some((concept) => !concept)) return invalid('A selected concept does not exist');
  if (concepts.some((concept) => concept!.kind !== targetKind)) {
    return invalid('Element and relationship types cannot be interchanged');
  }
  if (
    targetKind === 'element' &&
    (input.targetType === 'Junction' || concepts.some((concept) => concept!.type === 'Junction'))
  ) {
    return invalid('Junction types cannot be changed');
  }
  const changedConceptIds = concepts
    .filter((concept) => concept!.type !== input.targetType)
    .map((concept) => concept!.id);
  if (changedConceptIds.length === 0) return invalid('Concept type is unchanged');

  const finalModel = structuredClone(model);
  for (const conceptId of changedConceptIds) {
    if (isElementType(input.targetType)) {
      const element = finalModel.elements[conceptId];
      if (element) element.type = input.targetType;
    } else if (isRelationshipType(input.targetType)) {
      const relationship = finalModel.relationships[conceptId];
      if (relationship) relationship.type = input.targetType;
    }
  }

  if (targetKind === 'relationship') {
    const illegal = conceptIds.filter((id) => {
      const relationship = finalModel.relationships[id];
      return !relationship || !isRelationshipLegalInModel(finalModel, relationship);
    });
    if (illegal.length > 0) {
      return invalid(`Relationship type is not legal for: ${illegal.join(', ')}`);
    }
  }

  const invalidAdjacentRelationshipIds = targetKind === 'element'
    ? relationshipReconciliationIds(finalModel, changedConceptIds)
    : [];
  if (!invalidAdjacentRelationshipIds) {
    return invalid('Invalid relationships cannot be reconciled as Associations');
  }
  return {
    valid: true,
    input: capturedInput,
    kind: targetKind,
    changedConceptIds,
    invalidAdjacentRelationshipIds,
    requiresConfirmation: invalidAdjacentRelationshipIds.length > 0,
  };
}

function relationshipReconciliationIds(
  changed: ModelState,
  changedElementIds: string[],
): string[] | null {
  const affected = new Set<string>();
  const queue: string[] = [];
  const addAffected = (relationshipId: string) => {
    if (affected.has(relationshipId)) return;
    affected.add(relationshipId);
    queue.push(relationshipId);
  };
  const changedElements = new Set(changedElementIds);
  for (const relationship of Object.values(changed.relationships)) {
    if (
      changedElements.has(relationship.sourceId) ||
      changedElements.has(relationship.targetId)
    ) {
      addAffected(relationship.id);
    }
  }
  for (let index = 0; index < queue.length; index++) {
    const relationship = changed.relationships[queue[index]];
    if (!relationship) continue;
    for (const endpointId of [relationship.sourceId, relationship.targetId]) {
      if (changed.elements[endpointId]?.type !== 'Junction') continue;
      for (const candidate of Object.values(changed.relationships)) {
        if (candidate.sourceId === endpointId || candidate.targetId === endpointId) {
          addAffected(candidate.id);
        }
      }
    }
  }
  const affectedIds = Object.values(changed.relationships)
    .filter((relationship) => affected.has(relationship.id))
    .map((relationship) => relationship.id);
  const converted = new Set<string>();
  const reconciled = structuredClone(changed);

  while (true) {
    const invalidIds = affectedIds.filter((relationshipId) => {
      const relationship = reconciled.relationships[relationshipId];
      return !relationship || !isRelationshipLegalInModel(reconciled, relationship);
    });
    if (invalidIds.length === 0) {
      return affectedIds.filter((relationshipId) => converted.has(relationshipId));
    }
    const additions = invalidIds.filter((relationshipId) => !converted.has(relationshipId));
    if (additions.length === 0) return null;
    for (const relationshipId of additions) {
      converted.add(relationshipId);
      reconciled.relationships[relationshipId].type = 'AssociationRelationship';
    }
  }
}

export function applyConceptTypeChange(
  plan: ConceptTypeChangePlan,
  _options: ConceptTypeChangeOptions = {},
  store: ModelStore = getActiveModelStore(),
): ConceptTypeChangeResult | null {
  const state = store.getState();
  if (!plan.valid || !state.model || state.readOnly) return null;
  const current = analyzeConceptTypeChange(state.model, plan.input);
  if (!samePlan(plan, current)) return null;
  if (
    plan.invalidAdjacentRelationshipIds.length > 0 &&
    !_options.convertInvalidRelationshipsToAssociation
  ) {
    return null;
  }
  const replacements: Array<{ id: string; targetType: MetamodelConceptType; addNote: boolean }> = [
    ...plan.changedConceptIds.map((id) => ({
      id,
      targetType: plan.input.targetType,
      addNote: false,
    })),
    ...plan.invalidAdjacentRelationshipIds.map((id) => ({
      id,
      targetType: 'AssociationRelationship' as const,
      addNote: _options.addDocumentationNote === true,
    })),
  ];
  const idMap = Object.fromEntries(replacements.map(({ id }) => [id, newId()]));
  const previousSelection = state.selection;
  let applied = false;
  transactWithSelection('Set Concept Type', (draft) => {
    const staged: Array<{
      oldId: string;
      oldFolderId: string;
      replacement: Concept;
    }> = [];
    for (const spec of replacements) {
      const oldElement = draft.elements[spec.id];
      const oldRelationship = draft.relationships[spec.id];
      const oldConcept = oldElement ?? oldRelationship;
      if (!oldConcept) return;
      const replacementId = idMap[spec.id];
      const folderId = compatibleFolderId(draft, oldConcept, spec.targetType);
      if (oldElement) {
        if (!isElementType(spec.targetType)) return;
        const replacement = cloneConcept(oldElement) as ArchimateElement;
        replacement.id = replacementId;
        replacement.type = spec.targetType;
        replacement.profileIds = [];
        replacement.folderId = folderId;
        delete replacement.junctionType;
        staged.push({ oldId: spec.id, oldFolderId: oldElement.folderId, replacement });
      } else if (oldRelationship) {
        if (!isRelationshipType(spec.targetType)) return;
        const replacement = cloneConcept(oldRelationship) as ArchimateRelationship;
        replacement.id = replacementId;
        replacement.type = spec.targetType;
        replacement.profileIds = [];
        replacement.folderId = folderId;
        delete replacement.accessType;
        delete replacement.strength;
        delete replacement.directed;
        if (spec.addNote) {
          const note = `(Changed from ${relationshipLabel(oldRelationship.type)})`;
          replacement.documentation = `${note}${oldRelationship.documentation ? '\n\n' : ''}${oldRelationship.documentation}`;
        }
        staged.push({ oldId: spec.id, oldFolderId: oldRelationship.folderId, replacement });
      }
    }

    for (const item of staged) {
      const replacement = item.replacement;
      if (replacement.kind === 'element') draft.elements[replacement.id] = replacement;
      else draft.relationships[replacement.id] = replacement;
    }
    for (const item of staged) {
      delete draft.elements[item.oldId];
      delete draft.relationships[item.oldId];
      const oldFolder = draft.folders[item.oldFolderId];
      if (oldFolder) oldFolder.itemIds = oldFolder.itemIds.filter((id) => id !== item.oldId);
      draft.folders[item.replacement.folderId].itemIds.push(item.replacement.id);
    }

    for (const relationship of Object.values(draft.relationships)) {
      relationship.sourceId = idMap[relationship.sourceId] ?? relationship.sourceId;
      relationship.targetId = idMap[relationship.targetId] ?? relationship.targetId;
    }
    for (const node of Object.values(draft.nodes)) {
      if (node.nodeType !== 'element') continue;
      const replacementId = idMap[node.elementId];
      if (!replacementId) continue;
      node.elementId = replacementId;
      delete node.figureType;
    }
    for (const connection of Object.values(draft.connections)) {
      if (!connection.relationshipId) continue;
      connection.relationshipId = idMap[connection.relationshipId] ?? connection.relationshipId;
    }
    applied = true;
  }, {
    ...previousSelection,
    ids: previousSelection.ids.map((id) => idMap[id] ?? id),
  }, store);
  if (!applied) return null;
  return { idMap };
}

function samePlan(expected: ConceptTypeChangePlan, actual: ConceptTypeChangePlan): boolean {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function cloneConcept<T extends Concept>(concept: T): T {
  const clone = {
    ...concept,
    properties: concept.properties.map((property) => ({ ...property })),
  } as T & { features?: unknown };
  const features = (concept as T & { features?: unknown }).features;
  if (Array.isArray(features)) {
    clone.features = features.map((feature) =>
      typeof feature === 'object' && feature !== null ? { ...feature } : feature,
    );
  } else if (typeof features === 'object' && features !== null) {
    clone.features = { ...features };
  } else if (features !== undefined) {
    clone.features = features;
  }
  return clone;
}

function compatibleFolderId(
  model: ModelState,
  concept: Concept,
  targetType: MetamodelConceptType,
): string {
  const defaultId = isElementType(targetType)
    ? folderForElementType(model, targetType)
    : defaultFolderId(model, 'relations');
  let folderId: string | null = concept.folderId;
  while (folderId) {
    if (folderId === defaultId) return concept.folderId;
    folderId = model.folders[folderId]?.parentId ?? null;
  }
  return defaultId;
}

export function isRelationshipLegalInModel(
  model: ModelState,
  relationship: ArchimateRelationship,
): boolean {
  const source = getConcept(model, relationship.sourceId);
  const target = getConcept(model, relationship.targetId);
  if (!source || !target) return false;
  return enumerateRelationshipCandidates(
    { conceptId: source.id, conceptType: source.type },
    { conceptId: target.id, conceptType: target.type },
    undefined,
    [relationship.type],
    model,
  ).length === 1;
}
