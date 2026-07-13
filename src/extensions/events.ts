import { getActiveModelStore } from '../model/store';
import { workspaceStore, getModelSession, type ModelSession } from '../model/workspace';
import { extensionRegistry, type ExtensionRegistry } from './registry';

function identity(session: ModelSession) {
  const state = session.store.getState();
  return {
    sessionId: session.id,
    modelId: state.model?.info.id ?? null,
    fileName: state.fileName,
  };
}

export function startExtensionEventBridge(
  registry: ExtensionRegistry = extensionRegistry,
  modelChangedDelay = 150,
): () => void {
  const workspaceAtStart = workspaceStore.getState();
  const sessionUnsubscribes = new Map<string, () => void>();
  const modelTimers = new Map<string, number>();

  const attachSession = (session: ModelSession) => {
    if (sessionUnsubscribes.has(session.id)) return;
    let previous = session.store.getState();
    sessionUnsubscribes.set(
      session.id,
      session.store.subscribe((state) => {
        const prior = previous;
        // Advance first because handlers may synchronously mutate this same store.
        previous = state;
        const modelIdentity = identity(session);
        if (state.selection !== prior.selection) {
          void registry.emitEvent('selection.changed', {
            ...state.selection,
            ...modelIdentity,
          }, session.store);
        }
        if (state.activeViewId !== prior.activeViewId) {
          void registry.emitEvent('view.activated', {
            viewId: state.activeViewId,
            ...modelIdentity,
          }, session.store);
        }
        if (state.openViewIds !== prior.openViewIds) {
          const opened = state.openViewIds.filter((id) => !prior.openViewIds.includes(id));
          for (const viewId of opened) {
            void registry.emitEvent('view.opened', { viewId, ...modelIdentity }, session.store);
          }
        }
        if (state.model !== prior.model) {
          const existing = modelTimers.get(session.id);
          if (existing) clearTimeout(existing);
          modelTimers.set(
            session.id,
            window.setTimeout(() => {
              modelTimers.delete(session.id);
              void registry.emitEvent('model.changed', {
                dirty: session.store.getState().dirty,
                ...identity(session),
              }, session.store);
            }, modelChangedDelay),
          );
        }
      }),
    );
  };

  Object.values(workspaceAtStart.sessions).forEach(attachSession);
  let previousWorkspace = workspaceAtStart;
  const unsubscribeWorkspace = workspaceStore.subscribe((workspace) => {
    const previous = previousWorkspace;
    // Advance first because extension handlers may synchronously mutate a surviving model.
    previousWorkspace = workspace;
    for (const id of workspace.order) {
      if (previous.sessions[id] || !workspace.sessions[id]) continue;
      const session = workspace.sessions[id];
      attachSession(session);
      void registry.emitEvent('model.opened', identity(session), session.store);
    }
    for (const id of previous.order) {
      if (workspace.sessions[id]) continue;
      const session = previous.sessions[id];
      if (!session) continue;
      const active = workspace.activeSessionId
        ? workspace.sessions[workspace.activeSessionId]
        : undefined;
      void registry.emitEvent('model.closed', identity(session), active?.store ?? getActiveModelStore());
      sessionUnsubscribes.get(id)?.();
      sessionUnsubscribes.delete(id);
      const timer = modelTimers.get(id);
      if (timer) clearTimeout(timer);
      modelTimers.delete(id);
    }
    if (
      workspace.activeSessionId &&
      workspace.activeSessionId !== previous.activeSessionId
    ) {
      const active = workspace.sessions[workspace.activeSessionId];
      if (active) void registry.emitEvent('model.activated', identity(active), active.store);
    }
  });

  // Preserve the legacy single-store event contract for viewer/unit-test stores.
  let unsubscribeLegacy: (() => void) | undefined;
  let legacyTimer: number | undefined;
  if (workspaceAtStart.order.length === 0) {
    const legacyStore = getActiveModelStore();
    let previous = legacyStore.getState();
    unsubscribeLegacy = legacyStore.subscribe((state) => {
      const prior = previous;
      previous = state;
      if (state.selection !== prior.selection) {
        void registry.emitEvent('selection.changed', state.selection, legacyStore);
      }
      if (state.activeViewId !== prior.activeViewId) {
        void registry.emitEvent('view.activated', { viewId: state.activeViewId }, legacyStore);
      }
      if (state.openViewIds !== prior.openViewIds) {
        for (const viewId of state.openViewIds.filter((id) => !prior.openViewIds.includes(id))) {
          void registry.emitEvent('view.opened', { viewId }, legacyStore);
        }
      }
      if (state.modelEpoch !== prior.modelEpoch) {
        void registry.emitEvent('model.opened', { fileName: state.fileName }, legacyStore);
      }
      if (state.model !== prior.model) {
        if (legacyTimer) clearTimeout(legacyTimer);
        legacyTimer = window.setTimeout(() => {
          void registry.emitEvent(
            'model.changed',
            { dirty: legacyStore.getState().dirty },
            legacyStore,
          );
        }, modelChangedDelay);
      }
    });
  }

  return () => {
    unsubscribeWorkspace();
    unsubscribeLegacy?.();
    sessionUnsubscribes.forEach((unsubscribe) => unsubscribe());
    modelTimers.forEach((timer) => clearTimeout(timer));
    if (legacyTimer) clearTimeout(legacyTimer);
  };
}

export async function emitWorkspaceStartupEvents(
  registry: ExtensionRegistry = extensionRegistry,
): Promise<void> {
  const workspace = workspaceStore.getState();
  for (const id of workspace.order) {
    const session = workspace.sessions[id];
    if (session) await registry.emitEvent('model.opened', identity(session), session.store);
  }
  const active = workspace.activeSessionId ? getModelSession(workspace.activeSessionId) : undefined;
  if (active) await registry.emitEvent('model.activated', identity(active), active.store);
}

export function emitModelSaved(sessionId?: string): void {
  const session = sessionId ? getModelSession(sessionId) : undefined;
  if (session) {
    void extensionRegistry.emitEvent('model.saved', identity(session), session.store);
    return;
  }
  void extensionRegistry.emitEvent('model.saved', { fileName: getActiveModelStore().getState().fileName });
}
