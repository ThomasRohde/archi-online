import {
  applyFindReplaceRows,
  prepareFindReplaceApply,
  type FindReplacePreview,
} from '../find-replace';
import type { ModelStore } from '../store';

/** Apply selected preview rows to their captured session in exactly one undo transaction. */
export function applyFindReplace(
  preview: FindReplacePreview | undefined,
  selectedRowIds?: readonly string[],
  expectedStore?: ModelStore,
): number {
  const prepared = prepareFindReplaceApply(preview, selectedRowIds, expectedStore);
  let applied = 0;
  prepared.store.transact('Find and Replace', (draft) => {
    applied = applyFindReplaceRows(draft, prepared.rows);
  });
  return applied;
}
