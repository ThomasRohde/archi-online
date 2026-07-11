// React bindings for the model-layer stores. The stores themselves are vanilla
// zustand stores in src/model (which stays free of React imports); components
// get to them through these hooks. Imperative (non-React) code should use
// getActiveModelStore() / workspaceStore directly instead.
import { createContext, createElement, useContext, type ReactNode } from 'react';
import { useStore as useZustandStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import { getActiveModelStore, type AppState, type ModelStore } from '../model/store';
import { workspaceStore, type WorkspaceState } from '../model/workspace';

const ModelStoreContext = createContext<ModelStore | null>(null);

export function ModelStoreProvider({
  store,
  children,
}: {
  store: ModelStore;
  children: ReactNode;
}) {
  return createElement(ModelStoreContext.Provider, { value: store }, children);
}

export function useModelStoreApi(): ModelStore {
  return useContext(ModelStoreContext) ?? getActiveModelStore();
}

type BoundModelStoreHook = {
  <T>(selector: (state: AppState) => T): T;
  getState(): AppState;
  setState: StoreApi<AppState>['setState'];
  subscribe: StoreApi<AppState>['subscribe'];
};

function useStoreHook<T>(selector: (state: AppState) => T): T {
  const store = useModelStoreApi();
  return useZustandStore(store, selector);
}

const proxySetState: StoreApi<AppState>['setState'] = (partial, replace) => {
  if (replace === true) getActiveModelStore().setState(partial as AppState, true);
  else getActiveModelStore().setState(partial, false);
};

/**
 * Bound hook for the *active* model session's store (or the store supplied by
 * the nearest ModelStoreProvider). The statics proxy to the active store so
 * imperative call sites and tests can use getState/setState/subscribe.
 */
export const useStore = Object.assign(useStoreHook, {
  getState: () => getActiveModelStore().getState(),
  setState: proxySetState,
  subscribe: (listener: Parameters<StoreApi<AppState>['subscribe']>[0]) =>
    getActiveModelStore().subscribe(listener),
}) as BoundModelStoreHook;

function useWorkspaceStoreHook<T>(selector: (state: WorkspaceState) => T): T {
  return useZustandStore(workspaceStore, selector);
}

/** Bound hook for the workspace (open model sessions) store. */
export const useWorkspaceStore = Object.assign(useWorkspaceStoreHook, {
  getState: () => workspaceStore.getState(),
  setState: workspaceStore.setState,
  subscribe: workspaceStore.subscribe,
});
