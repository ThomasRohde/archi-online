import { getActiveModelStore, type ModelStore } from '../../model/store';
import { JCollection } from './collection';
import { allObjects, matchesSelector } from './selectors';
import { JObject } from './wrappers';
import { boundModelStore } from './binding';

export function $$(
  selector: string | JObject | JCollection,
  modelStore?: ModelStore,
): JCollection {
  if (selector instanceof JCollection) {
    assertRequestedStore(boundModelStore(selector), modelStore);
    return selector.clone();
  }
  if (selector instanceof JObject) {
    const selectorStore = boundModelStore(selector);
    assertRequestedStore(selectorStore, modelStore);
    return new JCollection([selector], modelStore ?? selectorStore);
  }
  const store = modelStore ?? getActiveModelStore();
  if (typeof selector !== 'string') return new JCollection([], store);
  return new JCollection(
    allObjects(store).filter((o) => matchesSelector(o, selector)),
    store,
  );
}

function assertRequestedStore(actual: ModelStore, requested?: ModelStore): void {
  if (requested && actual !== requested) {
    throw new Error('Cannot mix jArchi wrappers from different model sessions');
  }
}
