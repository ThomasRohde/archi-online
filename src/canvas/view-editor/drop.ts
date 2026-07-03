import { addElementNodeToView, addRefNodeToView } from '../../model/ops';
import type { Bounds, ModelState } from '../../model/types';
import {
  defaultElementSize,
  defaultTextStyle,
  defaultViewReferenceSize,
  type AppSettings,
} from '../../settings/app-settings';
import type { Point } from '../geometry';
import { containerAt } from './bounds';

export function addDroppedItemsToView({
  ids,
  model,
  viewId,
  absBounds,
  point,
  snap,
  settings,
}: {
  ids: string[];
  model: ModelState;
  viewId: string;
  absBounds: Map<string, Bounds>;
  point: Point;
  snap: (value: number) => number;
  settings: AppSettings;
}): string[] {
  const parentId = containerAt(model, viewId, absBounds, point, new Set()) ?? viewId;
  const parentAbs = parentId === viewId ? { x: 0, y: 0 } : absBounds.get(parentId)!;
  const created: string[] = [];
  const textDefaults = defaultTextStyle(settings);
  let i = 0;
  for (const id of ids) {
    if (model.elements[id]) {
      const def = defaultElementSize(model.elements[id].type, settings);
      created.push(
        addElementNodeToView(
          viewId,
          id,
          parentId,
          {
            x: snap(point.x - parentAbs.x - def.width / 2 + i * settings.dropOffset),
            y: snap(point.y - parentAbs.y - def.height / 2 + i * settings.dropOffset),
            width: def.width,
            height: def.height,
          },
          true,
          textDefaults,
        ),
      );
      i++;
    } else if (model.views[id] && id !== viewId) {
      const def = defaultViewReferenceSize(settings);
      created.push(
        addRefNodeToView(
          viewId,
          id,
          parentId,
          {
            x: snap(point.x - parentAbs.x + i * settings.dropOffset),
            y: snap(point.y - parentAbs.y + i * settings.dropOffset),
            width: def.width,
            height: def.height,
          },
          textDefaults,
        ),
      );
      i++;
    }
  }
  return created;
}
