import { createStore } from 'zustand/vanilla';
import { newId } from './id';
import {
  createModelStore,
  resetEmptyModelStore,
  setActiveModelStore,
  type ModelStore,
  type ViewViewport,
} from './store';
import type { ModelState } from './types';

export type ModelSessionId = string;

/** Opaque provenance token retained after a workspace session closes. */
export type ModelStoreWorkspaceLease = object;

interface WorkspaceLeaseState {
  readonly token: ModelStoreWorkspaceLease;
  open: boolean;
}

const workspaceLeases = new WeakMap<ModelStore, WorkspaceLeaseState>();

export function getModelStoreWorkspaceLease(
  store: ModelStore,
): ModelStoreWorkspaceLease | undefined {
  return workspaceLeases.get(store)?.token;
}

export function isModelStoreWorkspaceLeaseOpen(
  store: ModelStore,
  token: ModelStoreWorkspaceLease,
): boolean {
  const lease = workspaceLeases.get(store);
  return lease?.token === token && lease.open;
}

function openWorkspaceLease(store: ModelStore): void {
  workspaceLeases.set(store, { token: Object.freeze({}), open: true });
}

function closeWorkspaceLease(store: ModelStore): void {
  const lease = workspaceLeases.get(store);
  if (lease) lease.open = false;
}

export interface ModelSession {
  id: ModelSessionId;
  store: ModelStore;
  fileHandle: FileSystemFileHandle | null;
  unsubscribe: () => void;
}

export interface AddModelSessionOptions {
  id?: ModelSessionId;
  model: ModelState;
  fileName: string | null;
  dirty?: boolean;
  readOnly?: boolean;
  fileHandle?: FileSystemFileHandle | null;
  openViewIds?: string[];
  activeViewId?: string | null;
  viewportsByViewId?: Record<string, ViewViewport>;
}

export interface WorkspaceState {
  sessions: Record<ModelSessionId, ModelSession>;
  order: ModelSessionId[];
  activeSessionId: ModelSessionId | null;
  activationOrder: ModelSessionId[];
  booted: boolean;
  revision: number;
  /** Changes only when persistent model content changes, not for transient UI state. */
  modelRevision: number;
}

const EMPTY_WORKSPACE: WorkspaceState = {
  sessions: {},
  order: [],
  activeSessionId: null,
  activationOrder: [],
  booted: false,
  revision: 0,
  modelRevision: 0,
};

export const workspaceStore = createStore<WorkspaceState>()(() => ({ ...EMPTY_WORKSPACE }));

export function addModelSession(options: AddModelSessionOptions): ModelSessionId {
  const id = options.id ?? newId();
  const store = createModelStore({
    model: options.model,
    fileName: options.fileName,
    dirty: options.dirty ?? false,
    readOnly: options.readOnly ?? false,
    openViewIds: options.openViewIds ?? [],
    activeViewId: options.activeViewId ?? null,
    viewportsByViewId: options.viewportsByViewId ?? {},
  });
  openWorkspaceLease(store);
  const session: ModelSession = {
    id,
    store,
    fileHandle: options.fileHandle ?? null,
    unsubscribe: () => undefined,
  };
  session.unsubscribe = store.subscribe((next, previous) => {
    workspaceStore.setState((state) => ({
      revision: state.revision + 1,
      modelRevision: state.modelRevision + (next.model === previous.model ? 0 : 1),
    }));
  });
  workspaceStore.setState((state) => ({
    sessions: { ...state.sessions, [id]: session },
    order: [...state.order, id],
  }));
  activateModelSession(id);
  return id;
}

export function getModelSession(id: ModelSessionId): ModelSession | undefined {
  return workspaceStore.getState().sessions[id];
}

export function getActiveModelSession(): ModelSession | null {
  const state = workspaceStore.getState();
  return state.activeSessionId ? state.sessions[state.activeSessionId] ?? null : null;
}

export function getModelSessionForStore(store: ModelStore): ModelSession | undefined {
  return Object.values(workspaceStore.getState().sessions).find(
    (session) => session.store === store,
  );
}

export function requireActiveModelSession(): ModelSession {
  const session = getActiveModelSession();
  if (!session) throw new Error('No model is open');
  return session;
}

export function activateModelSession(id: ModelSessionId): void {
  const state = workspaceStore.getState();
  const session = state.sessions[id];
  if (!session) return;
  setActiveModelStore(session.store);
  workspaceStore.setState({
    activeSessionId: id,
    activationOrder: [...state.activationOrder.filter((entry) => entry !== id), id],
  });
}

export function removeModelSession(id: ModelSessionId): void {
  const state = workspaceStore.getState();
  if (!state.sessions[id]) return;
  const sessions = { ...state.sessions };
  state.sessions[id].unsubscribe();
  closeWorkspaceLease(state.sessions[id].store);
  delete sessions[id];
  const order = state.order.filter((entry) => entry !== id);
  const activationOrder = state.activationOrder.filter((entry) => entry !== id);
  const activeSessionId =
    state.activeSessionId === id
      ? (activationOrder[activationOrder.length - 1] ?? order[order.length - 1] ?? null)
      : state.activeSessionId;
  setActiveModelStore(activeSessionId ? sessions[activeSessionId]?.store ?? null : null);
  workspaceStore.setState({ sessions, order, activationOrder, activeSessionId });
}

export function setModelSessionFileHandle(
  id: ModelSessionId,
  fileHandle: FileSystemFileHandle | null,
): void {
  const state = workspaceStore.getState();
  const session = state.sessions[id];
  if (!session) return;
  workspaceStore.setState({
    sessions: {
      ...state.sessions,
      [id]: { ...session, fileHandle },
    },
  });
}

export function setWorkspaceBooted(booted: boolean): void {
  workspaceStore.setState({ booted });
}

export function clearWorkspace(): void {
  for (const session of Object.values(workspaceStore.getState().sessions)) {
    session.unsubscribe();
    closeWorkspaceLease(session.store);
  }
  workspaceStore.setState({ ...EMPTY_WORKSPACE });
  setActiveModelStore(null);
  resetEmptyModelStore();
}

export function resetWorkspaceForTests(): void {
  clearWorkspace();
}
