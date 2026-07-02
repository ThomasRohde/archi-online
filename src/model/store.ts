import { create } from 'zustand';
import {
  enablePatches,
  produceWithPatches,
  applyPatches,
  type Patch,
} from 'immer';
import type { ModelState } from './types';
import type { ElementType, RelationshipType } from './metamodel';

enablePatches();

export interface Transaction {
  label: string;
  patches: Patch[];
  inverse: Patch[];
}

export type Tool =
  | { kind: 'select' }
  | { kind: 'create-element'; type: ElementType }
  | { kind: 'create-relationship'; type: RelationshipType }
  | { kind: 'magic-connector' }
  | { kind: 'create-note' }
  | { kind: 'create-group' };

export interface SelectionState {
  /** Where the selection was made; properties panel follows either. */
  source: 'tree' | 'view';
  /** Selected model item ids (tree) or diagram node/connection ids (view). */
  ids: string[];
}

export interface AppState {
  model: ModelState | null;
  fileName: string | null;
  dirty: boolean;
  undoStack: Transaction[];
  redoStack: Transaction[];
  selection: SelectionState;
  openViewIds: string[];
  activeViewId: string | null;
  activeTool: Tool;
  /** Bumped on every model replacement (new/open) so editors can reset viewport. */
  modelEpoch: number;
}

export const useStore = create<AppState>(() => ({
  model: null,
  fileName: null,
  dirty: false,
  undoStack: [],
  redoStack: [],
  selection: { source: 'tree', ids: [] },
  openViewIds: [],
  activeViewId: null,
  activeTool: { kind: 'select' },
  modelEpoch: 0,
}));

/** File handle kept outside the store: not cloneable/immutable-friendly. */
export let currentFileHandle: FileSystemFileHandle | null = null;
export function setCurrentFileHandle(h: FileSystemFileHandle | null) {
  currentFileHandle = h;
}

const MAX_UNDO = 200;

let batchDepth = 0;
let batchLabel = '';
let batchPatches: Patch[] = [];
let batchInverse: Patch[] = [];

/**
 * Run a mutation against the model, recording an undo transaction.
 * Nested/batched calls (see runBatch) collapse into a single transaction.
 */
export function transact(label: string, recipe: (draft: ModelState) => void): void {
  const state = useStore.getState();
  if (!state.model) return;
  const [next, patches, inverse] = produceWithPatches(state.model, recipe);
  if (patches.length === 0) return;
  if (batchDepth > 0) {
    batchPatches.push(...patches);
    batchInverse.unshift(...inverse);
    useStore.setState({ model: next, dirty: true });
  } else {
    useStore.setState((s) => ({
      model: next,
      dirty: true,
      undoStack: [...s.undoStack, { label, patches, inverse }].slice(-MAX_UNDO),
      redoStack: [],
    }));
  }
  pruneSelection();
}

/** Group several transact() calls into one undo step (e.g. a script run). */
export function runBatch<T>(label: string, fn: () => T): T {
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
      const tx: Transaction = { label: batchLabel, patches: batchPatches, inverse: batchInverse };
      useStore.setState((s) => ({
        undoStack: [...s.undoStack, tx].slice(-MAX_UNDO),
        redoStack: [],
      }));
      batchPatches = [];
      batchInverse = [];
    }
  }
}

export function undo(): void {
  const s = useStore.getState();
  const tx = s.undoStack[s.undoStack.length - 1];
  if (!tx || !s.model) return;
  useStore.setState({
    model: applyPatches(s.model, tx.inverse),
    dirty: true,
    undoStack: s.undoStack.slice(0, -1),
    redoStack: [...s.redoStack, tx],
  });
  pruneSelection();
}

export function redo(): void {
  const s = useStore.getState();
  const tx = s.redoStack[s.redoStack.length - 1];
  if (!tx || !s.model) return;
  useStore.setState({
    model: applyPatches(s.model, tx.patches),
    dirty: true,
    undoStack: [...s.undoStack, tx],
    redoStack: s.redoStack.slice(0, -1),
  });
  pruneSelection();
}

/** Drop selection entries and open views that no longer exist (after undo/delete). */
function pruneSelection(): void {
  const s = useStore.getState();
  const m = s.model;
  if (!m) return;
  const exists = (id: string) =>
    id in m.elements ||
    id in m.relationships ||
    id in m.views ||
    id in m.folders ||
    id in m.nodes ||
    id in m.connections;
  const ids = s.selection.ids.filter(exists);
  const openViewIds = s.openViewIds.filter((id) => id in m.views);
  const activeViewId =
    s.activeViewId && openViewIds.includes(s.activeViewId)
      ? s.activeViewId
      : (openViewIds[openViewIds.length - 1] ?? null);
  if (
    ids.length !== s.selection.ids.length ||
    openViewIds.length !== s.openViewIds.length ||
    activeViewId !== s.activeViewId
  ) {
    useStore.setState({ selection: { ...s.selection, ids }, openViewIds, activeViewId });
  }
}

/** Replace the whole model (new / open file). Clears history and editor state. */
export function replaceModel(model: ModelState | null, fileName: string | null, dirty = false): void {
  useStore.setState((s) => ({
    model,
    fileName,
    dirty,
    undoStack: [],
    redoStack: [],
    selection: { source: 'tree', ids: [] },
    openViewIds: [],
    activeViewId: null,
    activeTool: { kind: 'select' },
    modelEpoch: s.modelEpoch + 1,
  }));
}

export function setSelection(source: 'tree' | 'view', ids: string[]): void {
  useStore.setState({ selection: { source, ids } });
}

export function openView(viewId: string): void {
  useStore.setState((s) => ({
    openViewIds: s.openViewIds.includes(viewId) ? s.openViewIds : [...s.openViewIds, viewId],
    activeViewId: viewId,
  }));
}

export function closeView(viewId: string): void {
  useStore.setState((s) => {
    const openViewIds = s.openViewIds.filter((id) => id !== viewId);
    return {
      openViewIds,
      activeViewId:
        s.activeViewId === viewId ? (openViewIds[openViewIds.length - 1] ?? null) : s.activeViewId,
    };
  });
}

export function setActiveTool(tool: Tool): void {
  useStore.setState({ activeTool: tool });
}
