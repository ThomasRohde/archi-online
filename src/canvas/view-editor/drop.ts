import { ELEMENT_TYPE_MAP } from '../../model/metamodel';
import { addElementNodeToView, addRefNodeToView } from '../../model/ops';
import type { Bounds, ModelState } from '../../model/types';
import type { Point } from '../geometry';
import { containerAt } from './bounds';

export function addDroppedItemsToView({
  ids,
  model,
  viewId,
  absBounds,
  point,
  snap,
}: {
  ids: string[];
  model: ModelState;
  viewId: string;
  absBounds: Map<string, Bounds>;
  point: Point;
  snap: (value: number) => number;
}): string[] {
  const parentId = containerAt(model, viewId, absBounds, point, new Set()) ?? viewId;
  const parentAbs = parentId === viewId ? { x: 0, y: 0 } : absBounds.get(parentId)!;
  const created: string[] = [];
  let i = 0;
  for (const id of ids) {
    if (model.elements[id]) {
      const def = ELEMENT_TYPE_MAP[model.elements[id].type];
      created.push(
        addElementNodeToView(viewId, id, parentId, {
          x: snap(point.x - parentAbs.x - def.width / 2 + i * 16),
          y: snap(point.y - parentAbs.y - def.height / 2 + i * 16),
          width: def.width,
          height: def.height,
        }),
      );
      i++;
    } else if (model.views[id] && id !== viewId) {
      created.push(
        addRefNodeToView(viewId, id, parentId, {
          x: snap(point.x - parentAbs.x + i * 16),
          y: snap(point.y - parentAbs.y + i * 16),
          width: 200,
          height: 140,
        }),
      );
      i++;
    }
  }
  return created;
}
