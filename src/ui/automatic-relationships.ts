import { relationshipLabel } from '../model/metamodel';
import {
  analyzeNestingChange,
  applyNestingChange,
  type NestingApplyResult,
  type NestingChangeInput,
  type NestingChangePlan,
} from '../model/ops';
import type { ModelStore } from '../model/store';
import type { AutomaticRelationshipSettings } from '../model/automatic-relationships';
import { showNestingRelationshipDialog } from './AppDialog';
export { requestConnectionReconnection } from './connection-reconnection';

export interface AutomaticRelationshipResult {
  plan: NestingChangePlan;
  applied: NestingApplyResult;
}

/** Analyze, ask only for genuinely new relationships, then apply atomically. */
export async function requestNestingChange(
  input: NestingChangeInput,
  settings: AutomaticRelationshipSettings,
  store: ModelStore,
): Promise<AutomaticRelationshipResult | null> {
  const state = store.getState();
  if (!state.model || state.readOnly) return null;
  const modelSnapshot = state.model;
  const plan = analyzeNestingChange(modelSnapshot, input, settings);
  const rows = plan.children
    .filter((child) => child.candidates.length > 0)
    .map((child) => ({
      childId: child.childNodeId,
      childLabel: child.childLabel,
      choices: child.candidates.map((candidate) => {
        const sourceLabel =
          candidate.sourceElementId === child.parentElementId
            ? child.parentLabel
            : child.childLabel;
        const targetLabel =
          candidate.targetElementId === child.parentElementId
            ? child.parentLabel
            : child.childLabel;
        return {
          value: candidate.id,
          label: `${relationshipLabel(candidate.relationshipType)} — ${sourceLabel} to ${targetLabel}`,
        };
      }),
    }));
  let selections: Record<string, string | null> = {};
  if (rows.length > 0) {
    const parentLabel = plan.children.find((child) => child.candidates.length > 0)?.parentLabel ?? '';
    const chosen = await showNestingRelationshipDialog({ parentLabel, rows });
    if (chosen === null) return null;
    selections = chosen;
  }
  const latest = store.getState();
  if (latest.readOnly || latest.model !== modelSnapshot) return null;
  return { plan, applied: applyNestingChange(plan, selections, store) };
}
