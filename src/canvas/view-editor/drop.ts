import { addElementNodeToView, addRefNodeToView } from '../../model/ops';
import type { NestingChangeInput } from '../../model/ops';
import { newId } from '../../model/id';
import type { ModelStore } from '../../model/store';
import type { Bounds, ModelState } from '../../model/types';
import {
  defaultElementSize,
  defaultTextStyle,
  defaultViewReferenceSize,
  type AppSettings,
} from '../../settings/app-settings';
import type { Point } from '../geometry';
import { containerAt } from './bounds';

export function planDroppedItemsToView({
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
}): NestingChangeInput {
  const parentId = containerAt(model, viewId, absBounds, point, new Set()) ?? viewId;
  const parentAbs = parentId === viewId ? { x: 0, y: 0 } : absBounds.get(parentId)!;
  const defaults = defaultTextStyle(settings);
  const entries: NestingChangeInput['entries'] = [];
  let index = 0;
  for (const id of ids) {
    if (model.elements[id]) {
      const size = defaultElementSize(model.elements[id].type, settings);
      entries.push({
        kind: 'add-occurrence',
        nodeId: newId(),
        elementId: id,
        parentId,
        bounds: {
          x: snap(point.x - parentAbs.x - size.width / 2 + index * settings.dropOffset),
          y: snap(point.y - parentAbs.y - size.height / 2 + index * settings.dropOffset),
          width: size.width,
          height: size.height,
        },
        defaults,
      });
      index++;
    } else if (model.views[id] && id !== viewId) {
      const size = defaultViewReferenceSize(settings);
      entries.push({
        kind: 'add-view-reference',
        nodeId: newId(),
        refViewId: id,
        parentId,
        bounds: {
          x: snap(point.x - parentAbs.x + index * settings.dropOffset),
          y: snap(point.y - parentAbs.y + index * settings.dropOffset),
          width: size.width,
          height: size.height,
        },
        defaults,
      });
      index++;
    }
  }
  return { viewId, trigger: 'tree', entries };
}

export function addDroppedItemsToView({
  ids,
  model,
  viewId,
  absBounds,
  point,
  snap,
  settings,
  modelStore,
}: {
  ids: string[];
  model: ModelState;
  viewId: string;
  absBounds: Map<string, Bounds>;
  point: Point;
  snap: (value: number) => number;
  settings: AppSettings;
  modelStore: ModelStore;
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
          modelStore,
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
          modelStore,
        ),
      );
      i++;
    }
  }
  return created;
}
