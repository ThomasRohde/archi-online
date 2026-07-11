import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  enablePatches,
  produceWithPatches,
  applyPatches,
  type Patch,
} from 'immer';
import type { ModelState } from './types';
import type { ElementType, RelationshipType } from './metamodel';
import type { C4ElementKind } from './c4';

enablePatches();

export interface Transaction {
  label: string;
  patches: Patch[];
  inverse: Patch[];
}

export type Tool =
  | { kind: 'select' }
  | { kind: 'create-element'; type: ElementType }
  | { kind: 'create-c4-element'; c4Kind: C4ElementKind; c4Properties?: Record<string, string> }
  | { kind: 'create-relationship'; type: RelationshipType }
  | { kind: 'magic-connector' }
  | { kind: 'create-note' }
  | { kind: 'create-group' };

export interface SelectionState {
  source: 'tree' | 'view';
  ids: string[];
}

export interface AppState {
  model: ModelState | null;
  fileName: string | null;
  dirty: boolean;
  readOnly: boolean;
  undoStack: Transaction[];
  redoStack: Transaction[];
  selection: SelectionState;
  openViewIds: string[];
  activeViewId: string | null;
  activeTool: Tool;
  modelEpoch: number;
  /** Retained for viewer/test compatibility; editor boot state lives in the workspace. */
  booted: boolean;
}

export interface ReplaceModelOptions {
  readOnly?: boolean;
}

export interface ModelStore extends StoreApi<AppState> {
  transact(label: string, recipe: (draft: ModelState) => void): void;
  runBatch<T>(label: string, fn: () => T): T;
}

const MAX_UNDO = 200;

function initialState(overrides: Partial<AppState> = {}): AppState {
  return {
    model: null,
    fileName: null,
    dirty: false,
    readOnly: false,
    undoStack: [],
    redoStack: [],
    selection: { source: 'tree', ids: [] },
    openViewIds: [],
    activeViewId: null,
    activeTool: { kind: 'select' },
    modelEpoch: 0,
    booted: false,
    ...overrides,
  };
}

export function createModelStore(overrides: Partial<AppState> = {}): ModelStore {
  const api = createStore<AppState>()(() => initialState(overrides));
  let batchDepth = 0;
  let batchLabel = '';
  let batchPatches: Patch[] = [];
  let batchInverse: Patch[] = [];

  const modelStore = api as ModelStore;

  modelStore.transact = (label, recipe) => {
    const state = api.getState();
    if (!state.model || state.readOnly) return;
    const [next, patches, inverse] = produceWithPatches(state.model, recipe);
    if (patches.length === 0) return;
    if (batchDepth > 0) {
      batchPatches.push(...patches);
      batchInverse.unshift(...inverse);
      api.setState({ model: next, dirty: true });
    } else {
      api.setState((current) => ({
        model: next,
        dirty: true,
        undoStack: [...current.undoStack, { label, patches, inverse }].slice(-MAX_UNDO),
        redoStack: [],
      }));
    }
    pruneSelection(modelStore);
  };

  modelStore.runBatch = (label, fn) => {
    if (batchDepth === 0) {
      batchLabel = label;
      batchPatches = [];
      batchInverse = [];
    }
    batchDepth++;
    try {
      return fn();
    } finally {
      batchDepth--;
      if (batchDepth === 0 && batchPatches.length > 0) {
        const tx: Transaction = {
          label: batchLabel,
          patches: batchPatches,
          inverse: batchInverse,
        };
        api.setState((current) => ({
          undoStack: [...current.undoStack, tx].slice(-MAX_UNDO),
          redoStack: [],
        }));
        batchPatches = [];
        batchInverse = [];
      }
    }
  };

  return modelStore;
}

const emptyModelStore = createModelStore();
let activeModelStore: ModelStore = emptyModelStore;

export function setActiveModelStore(store: ModelStore | null): void {
  activeModelStore = store ?? emptyModelStore;
}

export function getActiveModelStore(): ModelStore {
  return activeModelStore;
}

export function resetEmptyModelStore(): void {
  emptyModelStore.setState(initialState(), true);
}

function targetStore(store?: ModelStore): ModelStore {
  return store ?? activeModelStore;
}

export function transact(
  label: string,
  recipe: (draft: ModelState) => void,
  store?: ModelStore,
): void {
  targetStore(store).transact(label, recipe);
}

export function runBatch<T>(label: string, fn: () => T, store?: ModelStore): T {
  return targetStore(store).runBatch(label, fn);
}

export function undo(store?: ModelStore): void {
  const target = targetStore(store);
  const state = target.getState();
  if (state.readOnly) return;
  const tx = state.undoStack[state.undoStack.length - 1];
  if (!tx || !state.model) return;
  target.setState({
    model: applyPatches(state.model, tx.inverse),
    dirty: true,
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, tx],
  });
  pruneSelection(target);
}

export function redo(store?: ModelStore): void {
  const target = targetStore(store);
  const state = target.getState();
  if (state.readOnly) return;
  const tx = state.redoStack[state.redoStack.length - 1];
  if (!tx || !state.model) return;
  target.setState({
    model: applyPatches(state.model, tx.patches),
    dirty: true,
    undoStack: [...state.undoStack, tx],
    redoStack: state.redoStack.slice(0, -1),
  });
  pruneSelection(target);
}

function pruneSelection(store: ModelStore): void {
  const state = store.getState();
  const model = state.model;
  if (!model) return;
  const exists = (id: string) =>
    id in model.elements ||
    id in model.relationships ||
    id in model.views ||
    id in model.folders ||
    id in model.nodes ||
    id in model.connections;
  const ids = state.selection.ids.filter(exists);
  const openViewIds = state.openViewIds.filter((id) => id in model.views);
  const activeViewId =
    state.activeViewId && openViewIds.includes(state.activeViewId)
      ? state.activeViewId
      : (openViewIds[openViewIds.length - 1] ?? null);
  if (
    ids.length !== state.selection.ids.length ||
    openViewIds.length !== state.openViewIds.length ||
    activeViewId !== state.activeViewId
  ) {
    store.setState({ selection: { ...state.selection, ids }, openViewIds, activeViewId });
  }
}

export function replaceModel(
  model: ModelState | null,
  fileName: string | null,
  dirty = false,
  options: ReplaceModelOptions = {},
  store?: ModelStore,
): void {
  const target = targetStore(store);
  target.setState((state) => ({
    model,
    fileName,
    dirty,
    readOnly: options.readOnly ?? false,
    undoStack: [],
    redoStack: [],
    selection: { source: 'tree', ids: [] },
    openViewIds: [],
    activeViewId: null,
    activeTool: { kind: 'select' },
    modelEpoch: state.modelEpoch + 1,
  }));
}

export function setSelection(
  source: 'tree' | 'view',
  ids: string[],
  store?: ModelStore,
): void {
  targetStore(store).setState({ selection: { source, ids } });
}

export function openView(viewId: string, store?: ModelStore): void {
  targetStore(store).setState((state) => ({
    openViewIds: state.openViewIds.includes(viewId)
      ? state.openViewIds
      : [...state.openViewIds, viewId],
    activeViewId: viewId,
  }));
}

export function closeView(viewId: string, store?: ModelStore): void {
  targetStore(store).setState((state) => {
    const openViewIds = state.openViewIds.filter((id) => id !== viewId);
    return {
      openViewIds,
      activeViewId:
        state.activeViewId === viewId
          ? (openViewIds[openViewIds.length - 1] ?? null)
          : state.activeViewId,
    };
  });
}

export function setActiveTool(tool: Tool, store?: ModelStore): void {
  const target = targetStore(store);
  if (target.getState().readOnly && tool.kind !== 'select') return;
  target.setState({ activeTool: tool });
}

export function cloneModelForEditing(model: ModelState): ModelState {
  return typeof structuredClone === 'function'
    ? structuredClone(model)
    : JSON.parse(JSON.stringify(model));
}
