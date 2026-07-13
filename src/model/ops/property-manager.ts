import {
  applyPropertyMutationPreview,
  preparePropertyMutation,
  type PropertyMutationPreview,
} from '../property-manager';

/** Rename one exact property key across its captured model in one undo transaction. */
export function renamePropertyKey(preview: PropertyMutationPreview | undefined): number {
  const prepared = preparePropertyMutation(preview, 'rename');
  let applied = 0;
  prepared.store.transact('Rename Property Key', (draft) => {
    applied = applyPropertyMutationPreview(draft, prepared.preview);
  });
  return applied;
}

/** Delete one exact property key across its captured model in one undo transaction. */
export function deletePropertyKey(preview: PropertyMutationPreview | undefined): number {
  const prepared = preparePropertyMutation(preview, 'delete');
  let applied = 0;
  prepared.store.transact('Delete Property Key', (draft) => {
    applied = applyPropertyMutationPreview(draft, prepared.preview);
  });
  return applied;
}
