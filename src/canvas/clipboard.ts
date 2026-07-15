import {
  createCanvasTransferBundle,
  createTreeTransferBundle,
  pasteTransferBundle,
  type ModelTransferBundle,
} from '../model/transfer';
import { deleteViewObjects } from '../model/ops';
import { getActiveModelStore, type ModelStore } from '../model/store';
import { getModelSessionForStore } from '../model/workspace';
import {
  defaultElementSize,
  defaultTextStyle,
  defaultViewReferenceSize,
  useSettingsStore,
} from '../settings/app-settings';

let clipboard: ModelTransferBundle | null = null;

function sessionIdForStore(store: ModelStore): string {
  return getModelSessionForStore(store)?.id ?? 'legacy-single-model';
}

export function copyNodes(
  ids: string[],
  store: ModelStore = getActiveModelStore(),
  sourceSessionId = sessionIdForStore(store),
): void {
  const model = store.getState().model;
  const firstNode = model && ids.map((id) => model.nodes[id]).find((node) => node !== undefined);
  if (!model || !firstNode) return;
  const bundle = createCanvasTransferBundle(sourceSessionId, model, firstNode.viewId, ids);
  if (bundle.roots.length > 0) clipboard = bundle;
}

export function cutNodes(
  ids: string[],
  store: ModelStore = getActiveModelStore(),
  sourceSessionId = sessionIdForStore(store),
): string[] {
  const state = store.getState();
  if (!state.model || state.readOnly) return [];
  const firstNode = ids.map((id) => state.model!.nodes[id]).find((node) => node !== undefined);
  if (!firstNode) return [];
  const bundle = createCanvasTransferBundle(sourceSessionId, state.model, firstNode.viewId, ids);
  const rootIds = bundle.roots.flatMap((root) => root.kind === 'node' ? [root.id] : []);
  if (rootIds.length === 0) return [];
  clipboard = bundle;
  store.runBatch('Cut', () => deleteViewObjects(rootIds, store));
  return rootIds;
}

export function copyTreeItems(
  store: ModelStore,
  sourceSessionId: string,
  ids: string[],
): void {
  const model = store.getState().model;
  if (!model) return;
  const bundle = createTreeTransferBundle(sourceSessionId, model, ids);
  if (bundle.roots.length > 0) clipboard = bundle;
}

export function hasClipboard(kind?: ModelTransferBundle['kind']): boolean {
  return clipboard !== null && (!kind || clipboard.kind === kind);
}

export function canPasteTo(destination: 'view' | 'tree'): boolean {
  if (!clipboard) return false;
  if (destination === 'view') {
    return clipboard.roots.some((root) =>
      clipboard?.kind === 'canvas' ? root.kind === 'node' : root.kind !== 'node',
    );
  }
  if (clipboard.kind === 'tree') return clipboard.roots.length > 0;
  return clipboard.roots.some((root) => {
    const node = clipboard?.nodes.find((item) => item.id === root.id);
    return node?.nodeType === 'element';
  });
}

export function canPasteAsReferenceTo(targetSessionId: string): boolean {
  return Boolean(
    clipboard &&
    clipboard.kind === 'canvas' &&
    clipboard.sourceSessionId === targetSessionId &&
    canPasteTo('view'),
  );
}

export function pasteNodes(
  viewId: string,
  at?: { x: number; y: number },
  store: ModelStore = getActiveModelStore(),
  targetSessionId = sessionIdForStore(store),
  mode: 'default' | 'reference' | 'duplicate' = 'default',
): string[] {
  if (!clipboard) return [];
  if (mode === 'reference' && clipboard.sourceSessionId !== targetSessionId) return [];
  const settings = useSettingsStore.getState().settings;
  return pasteTransferBundle(clipboard, store, {
    targetSessionId,
    targetViewId: viewId,
    sameModelMode: mode === 'default' ? 'archi' : mode,
    offset: settings.pasteOffset,
    at,
    visualDefaults: {
      elementSize: (element) => defaultElementSize(element.type, settings),
      viewReferenceSize: defaultViewReferenceSize(settings),
      textStyle: defaultTextStyle(settings),
    },
  });
}

export function pasteTreeItems(
  store: ModelStore,
  targetSessionId: string,
): string[] {
  if (!clipboard) return [];
  return pasteTransferBundle(clipboard, store, { targetSessionId });
}
