import { analyzeConnectionReconnection } from '../../model/ops';
import type { ModelState } from '../../model/types';

export type ReconnectIntent =
  | { kind: 'anchor'; targetId: string; targetLabel: string }
  | { kind: 'valid'; targetId: string; targetLabel: string }
  | { kind: 'invalid'; targetId: string | null; targetLabel: string | null }
  | { kind: 'cancelled'; targetId: null; targetLabel: null };

export type ReconnectFeedbackTone = 'anchor' | 'valid' | 'invalid';

function reconnectTargetLabel(model: ModelState, targetId: string): string {
  const node = model.nodes[targetId];
  if (node?.nodeType === 'element') {
    return model.elements[node.elementId]?.name || 'element';
  }
  if (node?.nodeType === 'group') return node.name || 'group';
  if (node?.nodeType === 'note') return node.content.trim() || 'note';
  if (node?.nodeType === 'ref') return model.views[node.refViewId]?.name || 'view reference';
  if (node?.nodeType === 'image') return 'image';
  const connection = model.connections[targetId];
  if (connection) {
    const relationship = connection.relationshipId
      ? model.relationships[connection.relationshipId]
      : undefined;
    return relationship?.name || connection.name || 'connection';
  }
  return 'target';
}

export function classifyReconnectIntent(
  model: ModelState,
  input: {
    connectionId: string;
    end: 'source' | 'target';
    targetId: string | null;
    allowAnchorMove: boolean;
  },
): ReconnectIntent {
  const connection = model.connections[input.connectionId];
  if (!connection) {
    return { kind: 'invalid', targetId: input.targetId, targetLabel: null };
  }
  const currentEndpointId =
    input.end === 'source' ? connection.sourceId : connection.targetId;
  if (input.targetId === currentEndpointId) {
    const targetLabel = reconnectTargetLabel(model, currentEndpointId);
    return input.allowAnchorMove && Boolean(model.nodes[currentEndpointId])
      ? { kind: 'anchor', targetId: currentEndpointId, targetLabel }
      : { kind: 'invalid', targetId: currentEndpointId, targetLabel };
  }
  if (!input.targetId) {
    return { kind: 'invalid', targetId: null, targetLabel: null };
  }
  const targetLabel = reconnectTargetLabel(model, input.targetId);
  const plan = analyzeConnectionReconnection(model, {
    connectionId: input.connectionId,
    end: input.end,
    endpointId: input.targetId,
  });
  return plan.valid
    ? { kind: 'valid', targetId: input.targetId, targetLabel }
    : { kind: 'invalid', targetId: input.targetId, targetLabel };
}

export function cancelledReconnectIntent(): ReconnectIntent {
  return { kind: 'cancelled', targetId: null, targetLabel: null };
}

export function reconnectIntentTone(
  intent: ReconnectIntent,
): ReconnectFeedbackTone | 'neutral' {
  return intent.kind === 'cancelled' ? 'neutral' : intent.kind;
}

export function reconnectIntentMessage(intent: ReconnectIntent): string {
  switch (intent.kind) {
    case 'anchor':
      return 'Move anchor';
    case 'valid':
      return `Reconnect to ${intent.targetLabel}`;
    case 'invalid':
      return intent.targetLabel
        ? `Cannot reconnect to ${intent.targetLabel}`
        : 'Cannot reconnect here';
    case 'cancelled':
      return 'Reconnect cancelled';
  }
}
