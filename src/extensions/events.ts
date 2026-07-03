import { useStore } from '../model/store';
import { extensionRegistry, type ExtensionRegistry } from './registry';

export function startExtensionEventBridge(
  registry: ExtensionRegistry = extensionRegistry,
  modelChangedDelay = 150,
): () => void {
  let modelTimer: number | undefined;
  let previousModel = useStore.getState().model;
  let previousSelection = useStore.getState().selection;
  let previousActiveViewId = useStore.getState().activeViewId;
  let previousOpenViewIds = useStore.getState().openViewIds;
  let previousModelEpoch = useStore.getState().modelEpoch;

  const unsubscribe = useStore.subscribe((state) => {
    if (state.selection !== previousSelection) {
      previousSelection = state.selection;
      void registry.emitEvent('selection.changed', state.selection);
    }
    if (state.activeViewId !== previousActiveViewId) {
      previousActiveViewId = state.activeViewId;
      void registry.emitEvent('view.activated', { viewId: state.activeViewId });
    }
    if (state.openViewIds !== previousOpenViewIds) {
      const opened = state.openViewIds.filter((id) => !previousOpenViewIds.includes(id));
      previousOpenViewIds = state.openViewIds;
      for (const viewId of opened) void registry.emitEvent('view.opened', { viewId });
    }
    if (state.modelEpoch !== previousModelEpoch) {
      previousModelEpoch = state.modelEpoch;
      void registry.emitEvent('model.opened', { fileName: state.fileName });
    }
    if (state.model !== previousModel) {
      previousModel = state.model;
      if (modelTimer) clearTimeout(modelTimer);
      modelTimer = window.setTimeout(() => {
        void registry.emitEvent('model.changed', { dirty: useStore.getState().dirty });
      }, modelChangedDelay);
    }
  });

  return () => {
    unsubscribe();
    if (modelTimer) clearTimeout(modelTimer);
  };
}

export function emitModelSaved(): void {
  void extensionRegistry.emitEvent('model.saved', { fileName: useStore.getState().fileName });
}
