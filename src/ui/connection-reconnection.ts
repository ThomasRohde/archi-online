import {
  analyzeConnectionReconnection,
  applyConnectionReconnection,
  type ConnectionReconnectionInput,
  type ConnectionReconnectionPlan,
} from '../model/ops';
import type { ModelStore } from '../model/store';
import { showConfirmDialog } from './AppDialog';

export interface ConnectionReconnectionResult {
  plan: ConnectionReconnectionPlan;
}

/** Analyze first, warn for cross-view effects, then mutate once if accepted. */
export async function requestConnectionReconnection(
  input: ConnectionReconnectionInput,
  store: ModelStore,
): Promise<ConnectionReconnectionResult | null> {
  const state = store.getState();
  if (!state.model || state.readOnly) return null;
  const modelSnapshot = state.model;
  const plan = analyzeConnectionReconnection(modelSnapshot, input);
  if (!plan.valid) return null;

  if (plan.requiresConfirmation) {
    const connectionLabel = (connectionId: string) => {
      const connection = modelSnapshot.connections[connectionId];
      const relationship = connection?.relationshipId
        ? modelSnapshot.relationships[connection.relationshipId]
        : undefined;
      const label = connection?.name.trim() || relationship?.name.trim();
      return label ? `${label} [${connectionId}]` : connectionId;
    };
    const actionSummary = (action: string, connectionIds: string[]) =>
      connectionIds.length === 0
        ? `${action} 0`
        : `${action} ${connectionIds.length} (${connectionIds.map(connectionLabel).join(', ')})`;
    const confirmed = await showConfirmDialog({
      title: 'Reconnect relationship?',
      message: 'This changes the relationship in every affected view.',
      details: plan.affectedViews
        .map((view) => {
          const reconnect = actionSummary('reconnect', view.reconnectedConnectionIds);
          const remove = actionSummary('remove', view.removedConnectionIds);
          return `${view.viewName}: ${reconnect}, ${remove}`;
        })
        .join('\n'),
      intent: plan.removals.length > 0 ? 'danger' : 'default',
      confirmLabel: 'Reconnect',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return null;
  }

  const latest = store.getState();
  if (latest.readOnly || latest.model !== modelSnapshot) return null;
  return applyConnectionReconnection(plan, store) ? { plan } : null;
}
