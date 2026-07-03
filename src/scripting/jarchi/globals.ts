import { JCollection } from './collection';
import { $$ } from './query';
import { JModel, JObject } from './wrappers';

type Dollar = ((selector: string | JObject | JCollection) => JCollection) & { model: JModel };

export function createJArchiGlobals() {
  const model = new JModel('model');
  const $ = ((selector: string | JObject | JCollection) => $$(selector)) as Dollar;
  $.model = model;
  return { $, model };
}
