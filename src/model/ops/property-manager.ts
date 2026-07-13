import {
  applyPropertyMutationPreview,
  preparePropertyMutation,
  type PropertyMutationPreview,
} from '../property-manager';
import type { ModelStore } from '../store';

/** Rename one exact property key across its captured model in one undo transaction. */
export function renamePropertyKey(
  preview: PropertyMutationPreview | undefined,
  expectedStore?: ModelStore,
): number {
  const prepared = preparePropertyMutation(preview, 'rename', expectedStore);
  let applied = 0;
  prepared.store.transact('Rename Property Key', (draft) => {
    applied = applyPropertyMutationPreview(draft, prepared.preview);
  });
  return applied;
}

/** Delete one exact property key across its captured model in one undo transaction. */
export function deletePropertyKey(
  preview: PropertyMutationPreview | undefined,
  expectedStore?: ModelStore,
): number {
  const prepared = preparePropertyMutation(preview, 'delete', expectedStore);
  let applied = 0;
  prepared.store.transact('Delete Property Key', (draft) => {
    applied = applyPropertyMutationPreview(draft, prepared.preview);
  });
  return applied;
}
