import { getActiveModelStore, transact, type ModelStore } from '../store';
import {
  connectableConceptId,
  getConnectable,
  type ModelState,
} from '../types';
import { isRelationshipLegalInModel } from './concept-transform';
import { attachConnection, deleteConnectionFromDraft } from './draft';
import { canCreatePlainConnection } from './plain-connection';

export type ConnectionReconnectionEnd = 'source' | 'target';

export interface ConnectionReconnectionInput {
  connectionId: string;
  end: ConnectionReconnectionEnd;
  endpointId: string;
}

export interface ConnectionReconnectionChange {
  connectionId: string;
  viewId: string;
  previousEndpointId: string;
  nextEndpointId: string;
}

export interface ConnectionReconnectionRemoval {
  connectionId: string;
  viewId: string;
}

export interface ConnectionReconnectionAffectedView {
  viewId: string;
  viewName: string;
  reconnectedConnectionIds: string[];
  removedConnectionIds: string[];
}

export interface ConnectionReconnectionPlan {
  valid: boolean;
  reason?: string;
  scope: 'none' | 'occurrence' | 'semantic';
  input: ConnectionReconnectionInput;
  relationshipId?: string;
  previousConceptId?: string;
  nextConceptId?: string;
  changes: ConnectionReconnectionChange[];
  removals: ConnectionReconnectionRemoval[];
  affectedViews: ConnectionReconnectionAffectedView[];
  requiresConfirmation: boolean;
}

export function analyzeConnectionReconnection(
  model: ModelState,
  input: ConnectionReconnectionInput,
): ConnectionReconnectionPlan {
  const capturedInput = { ...input };
  const invalid = (reason: string): ConnectionReconnectionPlan => ({
    valid: false,
    reason,
    scope: 'none',
    input: capturedInput,
    changes: [],
    removals: [],
    affectedViews: [],
    requiresConfirmation: false,
  });
  const connection = model.connections[input.connectionId];
  if (!connection) return invalid(`Connection ${input.connectionId} does not exist`);
  const endpoint = getConnectable(model, input.endpointId);
  if (!endpoint) return invalid(`Endpoint ${input.endpointId} does not exist`);
  if (endpoint.viewId !== connection.viewId) {
    return invalid(`Endpoint ${input.endpointId} belongs to another view`);
  }
  const previousEndpointId = input.end === 'source' ? connection.sourceId : connection.targetId;
  if (previousEndpointId === input.endpointId) return invalid('Connection endpoint is unchanged');
  if (wouldCreateConnectionCycle(model, connection.id, input.endpointId)) {
    return invalid(`Connection endpoint cycle: ${connection.id}`);
  }

  if (connection.connType === 'plain') {
    const sourceId = input.end === 'source' ? input.endpointId : connection.sourceId;
    const targetId = input.end === 'target' ? input.endpointId : connection.targetId;
    if (!canCreatePlainConnection(model, connection.viewId, sourceId, targetId)) {
      return invalid('A plain connection requires at least one Note endpoint');
    }
    const changes = [{
      connectionId: connection.id,
      viewId: connection.viewId,
      previousEndpointId,
      nextEndpointId: input.endpointId,
    }];
    return validPlan(model, capturedInput, 'occurrence', changes, []);
  }

  const relationship = connection.relationshipId
    ? model.relationships[connection.relationshipId]
    : undefined;
  if (!relationship) return invalid('Relationship connection has no semantic relationship');
  const nextConceptId = connectableConceptId(model, input.endpointId);
  if (!nextConceptId) return invalid('A relationship connection requires a semantic endpoint');
  const previousConceptId = input.end === 'source'
    ? relationship.sourceId
    : relationship.targetId;
  const sourceConceptId = input.end === 'source' ? nextConceptId : relationship.sourceId;
  const targetConceptId = input.end === 'target' ? nextConceptId : relationship.targetId;
  const stagedRelationship = {
    ...relationship,
    sourceId: sourceConceptId,
    targetId: targetConceptId,
  };
  const stagedModel = {
    ...model,
    relationships: {
      ...model.relationships,
      [relationship.id]: stagedRelationship,
    },
  };
  if (!isRelationshipLegalInModel(stagedModel, stagedRelationship)) {
    return invalid('The relationship is not valid for the proposed semantic endpoints');
  }

  if (nextConceptId === previousConceptId) {
    const changes = [{
      connectionId: connection.id,
      viewId: connection.viewId,
      previousEndpointId,
      nextEndpointId: input.endpointId,
    }];
    return {
      ...validPlan(model, capturedInput, 'occurrence', changes, []),
      relationshipId: relationship.id,
      previousConceptId,
      nextConceptId,
    };
  }

  const changes: ConnectionReconnectionChange[] = [];
  const removals: ConnectionReconnectionRemoval[] = [];
  const removedIds = new Set<string>();
  const occurrences = Object.values(model.connections).filter(
    (candidate) => candidate.relationshipId === relationship.id,
  );
  for (const occurrence of occurrences) {
    const nextEndpointId = occurrence.viewId === connection.viewId
      ? input.endpointId
      : firstConceptOccurrence(model, occurrence.viewId, nextConceptId);
    if (!nextEndpointId) {
      collectConnectionRemovalClosure(model, occurrence.id, removedIds, removals);
      continue;
    }
    const oldEndpointId = input.end === 'source' ? occurrence.sourceId : occurrence.targetId;
    if (oldEndpointId === nextEndpointId) continue;
    if (wouldCreateConnectionCycle(model, occurrence.id, nextEndpointId)) {
      return invalid(`Connection endpoint cycle: ${occurrence.id}`);
    }
    changes.push({
      connectionId: occurrence.id,
      viewId: occurrence.viewId,
      previousEndpointId: oldEndpointId,
      nextEndpointId,
    });
  }

  return {
    ...validPlan(model, capturedInput, 'semantic', changes, removals),
    relationshipId: relationship.id,
    previousConceptId,
    nextConceptId,
  };
}

export function applyConnectionReconnection(
  plan: ConnectionReconnectionPlan,
  store: ModelStore = getActiveModelStore(),
): boolean {
  const state = store.getState();
  if (!plan.valid || !state.model || state.readOnly) return false;
  const currentPlan = analyzeConnectionReconnection(state.model, plan.input);
  if (!sameMutationPlan(plan, currentPlan)) return false;

  let applied = false;
  transact('Reconnect Connection', (draft) => {
    if (plan.scope === 'semantic' && plan.relationshipId && plan.nextConceptId) {
      const relationship = draft.relationships[plan.relationshipId];
      if (!relationship) return;
      if (plan.input.end === 'source') relationship.sourceId = plan.nextConceptId;
      else relationship.targetId = plan.nextConceptId;
    }
    for (const change of plan.changes) {
      const connection = draft.connections[change.connectionId];
      if (!connection) return;
      attachConnection(draft, {
        ...connection,
        sourceConnectionIds: [...connection.sourceConnectionIds],
        targetConnectionIds: [...connection.targetConnectionIds],
        sourceId: plan.input.end === 'source' ? change.nextEndpointId : connection.sourceId,
        targetId: plan.input.end === 'target' ? change.nextEndpointId : connection.targetId,
        bendpoints: connection.bendpoints.map((bendpoint) => ({ ...bendpoint })),
      });
    }
    for (const removal of plan.removals) {
      deleteConnectionFromDraft(draft, removal.connectionId);
    }
    applied = true;
  }, store);
  return applied;
}

function validPlan(
  model: ModelState,
  input: ConnectionReconnectionInput,
  scope: 'occurrence' | 'semantic',
  changes: ConnectionReconnectionChange[],
  removals: ConnectionReconnectionRemoval[],
): ConnectionReconnectionPlan {
  const affectedViews = Object.values(model.views).flatMap((view) => {
    const reconnectedConnectionIds = changes
      .filter((change) => change.viewId === view.id)
      .map((change) => change.connectionId);
    const removedConnectionIds = removals
      .filter((removal) => removal.viewId === view.id)
      .map((removal) => removal.connectionId);
    return reconnectedConnectionIds.length === 0 && removedConnectionIds.length === 0
      ? []
      : [{
          viewId: view.id,
          viewName: view.name,
          reconnectedConnectionIds,
          removedConnectionIds,
        }];
  });
  const originViewId = model.connections[input.connectionId]?.viewId;
  return {
    valid: true,
    scope,
    input,
    changes,
    removals,
    affectedViews,
    requiresConfirmation: affectedViews.some((view) => view.viewId !== originViewId),
  };
}

function firstConceptOccurrence(
  model: ModelState,
  viewId: string,
  conceptId: string,
): string | undefined {
  for (const node of Object.values(model.nodes)) {
    if (node.viewId === viewId && connectableConceptId(model, node.id) === conceptId) {
      return node.id;
    }
  }
  for (const connection of Object.values(model.connections)) {
    if (
      connection.viewId === viewId &&
      connectableConceptId(model, connection.id) === conceptId
    ) {
      return connection.id;
    }
  }
  return undefined;
}

function collectConnectionRemovalClosure(
  model: ModelState,
  connectionId: string,
  removedIds: Set<string>,
  removals: ConnectionReconnectionRemoval[],
): void {
  const connection = model.connections[connectionId];
  if (!connection || removedIds.has(connectionId)) return;
  removedIds.add(connectionId);
  removals.push({ connectionId, viewId: connection.viewId });
  for (const attachedId of [
    ...connection.sourceConnectionIds,
    ...connection.targetConnectionIds,
  ]) {
    collectConnectionRemovalClosure(model, attachedId, removedIds, removals);
  }
}

function wouldCreateConnectionCycle(
  model: ModelState,
  connectionId: string,
  endpointId: string,
): boolean {
  if (!model.connections[endpointId]) return false;
  const visit = (id: string, visited: Set<string>): boolean => {
    if (id === connectionId) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    const connection = model.connections[id];
    return Boolean(
      connection &&
      [connection.sourceId, connection.targetId].some(
        (nextId) => Boolean(model.connections[nextId]) && visit(nextId, visited),
      ),
    );
  };
  return visit(endpointId, new Set());
}

function sameMutationPlan(
  expected: ConnectionReconnectionPlan,
  actual: ConnectionReconnectionPlan,
): boolean {
  const signature = (plan: ConnectionReconnectionPlan) => JSON.stringify({
    valid: plan.valid,
    scope: plan.scope,
    input: plan.input,
    relationshipId: plan.relationshipId,
    previousConceptId: plan.previousConceptId,
    nextConceptId: plan.nextConceptId,
    changes: plan.changes,
    removals: plan.removals,
  });
  return signature(expected) === signature(actual);
}
