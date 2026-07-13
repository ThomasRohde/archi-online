import { getActiveModelStore, type ModelStore } from '../../model/store';
import { captureThen, promiseFromCapturedThen } from '../../model/promise-like';
import {
  getModelStoreWorkspaceLease,
  isModelStoreWorkspaceLeaseOpen,
} from '../../model/workspace';
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

interface ExtensionInvocationRuntime {
  running: boolean;
  store: ModelStore | null;
  children: Set<Promise<void>>;
}

interface QueuedExtensionInvocation {
  runtime: ExtensionInvocationRuntime;
  store: ModelStore;
  start: () => unknown;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

interface SynchronousExtensionInvocation {
  runtime: ExtensionInvocationRuntime;
  store: ModelStore;
}

interface ExtensionInvocationOptions {
  caller?: object;
  requireImmediate?: boolean;
}

export class ExtensionInvocationBusyError extends Error {
  constructor() {
    super('Extension invocation cannot start because the model store is busy.');
    this.name = 'ExtensionInvocationBusyError';
  }
}

const activeExtensionInvocationStores = new Set<ModelStore>();
const extensionInvocationQueue: QueuedExtensionInvocation[] = [];
const synchronousExtensionInvocations: SynchronousExtensionInvocation[] = [];
const extensionInvokerRuntimes = new WeakMap<object, ExtensionInvocationRuntime>();
let drainingExtensionInvocations = false;

export function assertExtensionInvocationStoreAvailable(store: ModelStore): void {
  if (
    activeExtensionInvocationStores.has(store)
    || extensionInvocationQueue.some((queued) => queued.store === store)
  ) {
    throw new ExtensionInvocationBusyError();
  }
}

export function assertExtensionInvocationSystemIdle(): void {
  if (activeExtensionInvocationStores.size > 0 || extensionInvocationQueue.length > 0) {
    throw new ExtensionInvocationBusyError();
  }
}

function drainExtensionInvocations(): void {
  if (drainingExtensionInvocations) return;
  drainingExtensionInvocations = true;
  try {
    const blockedRuntimes = new Set<ExtensionInvocationRuntime>();
    const blockedStores = new Set<ModelStore>();
    let index = 0;
    while (index < extensionInvocationQueue.length) {
      const next = extensionInvocationQueue[index];
      if (
        next.runtime.running
        || activeExtensionInvocationStores.has(next.store)
        || blockedRuntimes.has(next.runtime)
        || blockedStores.has(next.store)
      ) {
        blockedRuntimes.add(next.runtime);
        blockedStores.add(next.store);
        index += 1;
        continue;
      }
      extensionInvocationQueue.splice(index, 1);
      try {
        const result = next.start();
        void Promise.resolve(result).then(next.resolve, next.reject);
      } catch (error) {
        next.reject(error);
      }
    }
  } finally {
    drainingExtensionInvocations = false;
  }
}

function hasQueuedInvocationConflict(
  runtime: ExtensionInvocationRuntime,
  store: ModelStore,
): boolean {
  return extensionInvocationQueue.some(
    (queued) => queued.runtime === runtime || queued.store === store,
  );
}

function trackInvocationChild(
  runtime: ExtensionInvocationRuntime,
  promise: Promise<unknown>,
): void {
  const children = runtime.children;
  const settlement = promise
    .then(() => undefined, () => undefined)
    .finally(() => children.delete(settlement));
  children.add(settlement);
}

async function waitForInvocationChildren(runtime: ExtensionInvocationRuntime): Promise<void> {
  while (runtime.children.size > 0) {
    await Promise.all([...runtime.children]);
  }
}

/** Dynamic globals used only by long-lived extensions. Ordinary scripts stay store-captured. */
export function createExtensionJArchiGlobals() {
  const runtime: ExtensionInvocationRuntime = {
    running: false,
    store: null,
    children: new Set(),
  };
  let synchronousDepth = 0;
  const resolveStore = () => runtime.store ?? getActiveModelStore();
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

  const runCallback = <T>(store: ModelStore, callback: () => T): T => {
    synchronousDepth += 1;
    synchronousExtensionInvocations.push({
      runtime,
      store,
    });
    try {
      return callback();
    } finally {
      synchronousExtensionInvocations.pop();
      synchronousDepth -= 1;
    }
  };

  const finish = (store: ModelStore, ownsStoreLease: boolean) => {
    runtime.store = null;
    runtime.running = false;
    runtime.children = new Set();
    if (ownsStoreLease) activeExtensionInvocationStores.delete(store);
    drainExtensionInvocations();
  };

  const start = <T>(
    store: ModelStore,
    callback: () => T,
    ownsStoreLease = true,
  ): T | Promise<Awaited<T>> => {
    runtime.running = true;
    if (ownsStoreLease) activeExtensionInvocationStores.add(store);
    runtime.store = store;
    runtime.children = new Set();
    let result: T;
    try {
      result = runCallback(store, callback);
    } catch (error) {
      if (runtime.children.size === 0) {
        finish(store, ownsStoreLease);
        throw error;
      }
      return waitForInvocationChildren(runtime)
        .then(() => { throw error; })
        .finally(() => finish(store, ownsStoreLease)) as Promise<Awaited<T>>;
    }
    let resultPromise: Promise<Awaited<T>> | null = null;
    try {
      if (runtime.children.size > 0) {
        resultPromise = Promise.resolve(result);
      } else {
        const capturedThen = captureThen(result);
        if (capturedThen) resultPromise = promiseFromCapturedThen<T>(capturedThen);
      }
    } catch (error) {
      if (runtime.children.size === 0) {
        finish(store, ownsStoreLease);
        throw error;
      }
      return waitForInvocationChildren(runtime)
        .then(() => { throw error; })
        .finally(() => finish(store, ownsStoreLease)) as Promise<Awaited<T>>;
    }
    if (resultPromise) {
      return resultPromise
        .then(
          async (value) => {
            await waitForInvocationChildren(runtime);
            return value;
          },
          async (error) => {
            await waitForInvocationChildren(runtime);
            throw error;
          },
        )
        .finally(() => finish(store, ownsStoreLease)) as Promise<Awaited<T>>;
    }
    finish(store, ownsStoreLease);
    return result;
  };

  const trackNestedResult = <T>(
    parentRuntime: ExtensionInvocationRuntime,
    result: T,
  ): T | Promise<Awaited<T>> => {
    const capturedThen = captureThen(result);
    if (!capturedThen) return result;
    const promise = promiseFromCapturedThen<T>(capturedThen);
    trackInvocationChild(parentRuntime, promise);
    return promise;
  };

  const enqueue = <T>(
    store: ModelStore,
    callback: () => T,
  ): Promise<Awaited<T>> => {
    const modelEpoch = store.getState().modelEpoch;
    const workspaceLease = getModelStoreWorkspaceLease(store) ?? null;
    const assertCurrentBinding = () => {
      const currentLease = getModelStoreWorkspaceLease(store) ?? null;
      if (
        currentLease !== workspaceLease
        || (
          workspaceLease !== null
          && !isModelStoreWorkspaceLeaseOpen(
            store,
            workspaceLease,
          )
        )
      ) {
        throw new Error('Queued extension model session is no longer available.');
      }
      if (store.getState().modelEpoch !== modelEpoch) {
        throw new Error('Queued extension model context changed before invocation.');
      }
    };
    return new Promise((resolve, reject) => {
      extensionInvocationQueue.push({
        runtime,
        store,
        start: () => {
          assertCurrentBinding();
          return start(store, callback);
        },
        resolve: (value) => resolve(value as Awaited<T>),
        reject,
      });
      drainExtensionInvocations();
    });
  };

  const invoke = <T>(
    store: ModelStore,
    callback: () => T,
    options?: ExtensionInvocationOptions,
  ): T | Promise<Awaited<T>> => {
    const callerRuntime = options?.caller
      ? extensionInvokerRuntimes.get(options.caller)
      : undefined;
    if (options?.requireImmediate) {
      assertExtensionInvocationStoreAvailable(store);
      if (
        runtime.running
        || hasQueuedInvocationConflict(runtime, store)
      ) {
        throw new ExtensionInvocationBusyError();
      }
    }
    if (
      runtime.running
      && synchronousDepth > 0
      && store === runtime.store
      && (!callerRuntime || callerRuntime === runtime)
    ) {
      const result = runCallback(store, callback);
      return trackNestedResult(runtime, result);
    }
    const synchronousParent = synchronousExtensionInvocations.at(-1);
    if (
      !runtime.running
      && synchronousParent?.store === store
      && activeExtensionInvocationStores.has(store)
    ) {
      const result = start(store, callback, false);
      if (result instanceof Promise) trackInvocationChild(synchronousParent.runtime, result);
      return result;
    }
    if (callerRuntime?.running && callerRuntime.store === store) {
      if (runtime === callerRuntime) {
        const result = runCallback(store, callback);
        return trackNestedResult(runtime, result);
      }
      if (!runtime.running) {
        const result = start(store, callback, false);
        if (result instanceof Promise) trackInvocationChild(callerRuntime, result);
        return result;
      }
      const reason = runtime.store === store
        ? 'Extension invocation cycle detected on the current model.'
        : 'Extension runtime is already active on another model.';
      return Promise.reject(new Error(reason));
    }
    if (
      !runtime.running
      && !activeExtensionInvocationStores.has(store)
      && !hasQueuedInvocationConflict(runtime, store)
    ) {
      return start(store, callback);
    }
    return enqueue(store, callback);
  };

  extensionInvokerRuntimes.set(invoke, runtime);

  return { $, model, invoke, resolveStore };
}
