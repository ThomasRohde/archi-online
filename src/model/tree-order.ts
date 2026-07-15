import type { ModelState } from './types';
import { labelForModelTreeItem } from './label-expression';

/** Views in the same subfolder-first, alphabetic order shown by the model tree. */
export function viewsInTreeOrder(model: ModelState): string[] {
  const result: string[] = [];
  const walk = (folderId: string) => {
    const folder = model.folders[folderId];
    if (!folder) return;
    const subfolders = [...folder.folderIds].sort((a, b) =>
      (model.folders[a]?.name ?? '').localeCompare(model.folders[b]?.name ?? ''),
    );
    subfolders.forEach(walk);
    [...folder.itemIds]
      .sort((a, b) => labelForModelTreeItem(model, a).localeCompare(labelForModelTreeItem(model, b)))
      .forEach((id) => {
        if (model.views[id]) result.push(id);
      });
  };
  model.rootFolderIds.forEach(walk);
  return result;
}
