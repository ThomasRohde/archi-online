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

/** Dynamic globals used only by long-lived extensions. Ordinary scripts stay store-captured. */
export function createExtensionJArchiGlobals() {
  let invocationStore: ModelStore | null = null;
  const resolveStore = () => invocationStore ?? getActiveModelStore();
  const model = new Proxy({} as JModel, {
    get(_target, property) {
      const receiver = new JModel('model', resolveStore());
      const value = Reflect.get(receiver, property, receiver) as unknown;
      return typeof value === 'function' ? value.bind(receiver) : value;
    },
    set(_target, property, value) {
      const receiver = new JModel('model', resolveStore());
      return Reflect.set(receiver, property, value, receiver);
    },
  });
  const $ = ((selector: string | JObject | JCollection) => {
    const store = resolveStore();
    return $$(selector, store);
  }) as Dollar;
  $.model = model;

  const invoke = <T>(store: ModelStore, callback: () => T): T => {
    const previous = invocationStore;
    invocationStore = store;
    try {
      return callback();
    } finally {
      // Deliberately restore when an async callback yields so concurrent invocations cannot cross-talk.
      invocationStore = previous;
    }
  };

  return { $, model, invoke, resolveStore };
}
