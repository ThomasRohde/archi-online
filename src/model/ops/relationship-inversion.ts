import { getActiveModelStore, transact, type ModelStore } from '../store';
import type { ModelState } from '../types';
import { isRelationshipLegalInModel } from './concept-transform';
import { attachConnection } from './draft';

export interface RelationshipInversionInput {
  ids: string[];
}

export interface RelationshipInversionPlan {
  valid: boolean;
  reason?: string;
  input: RelationshipInversionInput;
  relationshipIds: string[];
  occurrenceIds: string[];
}

export function analyzeRelationshipInversion(
  model: ModelState,
  input: RelationshipInversionInput,
): RelationshipInversionPlan {
  const ids = [...new Set(input.ids)];
  const relationshipIds: string[] = [];
  for (const id of ids) {
    const relationshipId = model.relationships[id]
      ? id
      : model.connections[id]?.relationshipId;
    if (relationshipId && model.relationships[relationshipId] && !relationshipIds.includes(relationshipId)) {
      relationshipIds.push(relationshipId);
    }
  }
  const occurrenceIds = Object.values(model.connections)
    .filter((connection) =>
      Boolean(connection.relationshipId && relationshipIds.includes(connection.relationshipId)),
    )
    .map((connection) => connection.id);
  const invalid = (reason: string): RelationshipInversionPlan => ({
    valid: false,
    reason,
    input: { ids },
    relationshipIds,
    occurrenceIds,
  });
  if (relationshipIds.length === 0) return invalid('No relationships selected');

  const finalModel = structuredClone(model);
  for (const relationshipId of relationshipIds) {
    const relationship = finalModel.relationships[relationshipId];
    [relationship.sourceId, relationship.targetId] = [relationship.targetId, relationship.sourceId];
  }
  const illegal = relationshipIds.filter(
    (relationshipId) =>
      !isRelationshipLegalInModel(finalModel, finalModel.relationships[relationshipId]),
  );
  if (illegal.length > 0) {
    return invalid(`Reversed relationship is not legal for: ${illegal.join(', ')}`);
  }
  return {
    valid: true,
    input: { ids },
    relationshipIds,
    occurrenceIds,
  };
}

export function applyRelationshipInversion(
  plan: RelationshipInversionPlan,
  store: ModelStore = getActiveModelStore(),
): boolean {
  const state = store.getState();
  if (!plan.valid || !state.model || state.readOnly) return false;
  const current = analyzeRelationshipInversion(state.model, plan.input);
  if (JSON.stringify(current) !== JSON.stringify(plan)) return false;

  let applied = false;
  transact('Invert Connection Direction', (draft) => {
    for (const relationshipId of plan.relationshipIds) {
      const relationship = draft.relationships[relationshipId];
      if (!relationship) return;
      [relationship.sourceId, relationship.targetId] = [
        relationship.targetId,
        relationship.sourceId,
      ];
    }
    for (const connectionId of plan.occurrenceIds) {
      const connection = draft.connections[connectionId];
      if (
        !connection ||
        !connection.relationshipId ||
        !plan.relationshipIds.includes(connection.relationshipId)
      ) {
        return;
      }
      attachConnection(draft, {
        ...connection,
        sourceConnectionIds: [...connection.sourceConnectionIds],
        targetConnectionIds: [...connection.targetConnectionIds],
        sourceId: connection.targetId,
        targetId: connection.sourceId,
        bendpoints: [...connection.bendpoints].reverse().map((bendpoint) => ({
          startX: bendpoint.endX,
          startY: bendpoint.endY,
          endX: bendpoint.startX,
          endY: bendpoint.startY,
        })),
        textPosition: connection.textPosition === 0
          ? 2
          : connection.textPosition === 2
            ? 0
            : connection.textPosition,
      });
    }
    applied = true;
  }, store);
  return applied;
}

export function invertRelationships(
  ids: string[],
  store: ModelStore = getActiveModelStore(),
): boolean {
  const model = store.getState().model;
  return model
    ? applyRelationshipInversion(analyzeRelationshipInversion(model, { ids }), store)
    : false;
}
