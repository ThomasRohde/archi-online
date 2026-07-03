import { JCollection } from './collection';
import { allObjects, matchesSelector } from './selectors';
import { JObject } from './wrappers';

export function $$(selector: string | JObject | JCollection): JCollection {
  if (selector instanceof JCollection) return selector.clone();
  if (selector instanceof JObject) return new JCollection([selector]);
  if (typeof selector !== 'string') return new JCollection();
  return new JCollection(allObjects().filter((o) => matchesSelector(o, selector)));
}
