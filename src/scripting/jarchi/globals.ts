import { getActiveModelStore, type ModelStore } from '../../model/store';
import { JCollection } from './collection';
import { $$ } from './query';
import { JModel, JObject } from './wrappers';

type Dollar = ((selector: string | JObject | JCollection) => JCollection) & { model: JModel };

export function createJArchiGlobals(
  modelStore: ModelStore = getActiveModelStore(),
) {
  const model = new JModel('model', modelStore);
  const $ = ((selector: string | JObject | JCollection) => {
    return $$(selector, modelStore);
  }) as Dollar;
  $.model = model;
  return { $, model };
}
