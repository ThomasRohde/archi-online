import { del, get, set } from 'idb-keyval';

export interface AsyncKeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
}

export const indexedDbStore: AsyncKeyValueStore = { get, set, del };

let defaultStore: AsyncKeyValueStore = indexedDbStore;

export function defaultKeyValueStore(): AsyncKeyValueStore {
  return defaultStore;
}

export function setDefaultKeyValueStoreForTests(store: AsyncKeyValueStore): () => void {
  const previous = defaultStore;
  defaultStore = store;
  return () => {
    defaultStore = previous;
  };
}

export function memoryKeyValueStore(initial?: Iterable<[string, unknown]>): AsyncKeyValueStore & {
  data: Map<string, unknown>;
} {
  const data = new Map(initial);
  return {
    data,
    async get<T>(key: string) {
      return data.get(key) as T | undefined;
    },
    async set<T>(key: string, value: T) {
      data.set(key, value);
    },
    async del(key: string) {
      data.delete(key);
    },
  };
}
