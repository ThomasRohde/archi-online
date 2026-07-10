import { useStore } from '../model/store';
import {
  getModelSession,
  useWorkspaceStore,
  type ModelSession,
} from '../model/workspace';
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
  const workspaceAtStart = useWorkspaceStore.getState();
  const sessionUnsubscribes = new Map<string, () => void>();
  const modelTimers = new Map<string, number>();

  const attachSession = (session: ModelSession) => {
    if (sessionUnsubscribes.has(session.id)) return;
    let previous = session.store.getState();
    sessionUnsubscribes.set(
      session.id,
      session.store.subscribe((state) => {
        const modelIdentity = identity(session);
        if (state.selection !== previous.selection) {
          void registry.emitEvent('selection.changed', {
            ...state.selection,
            ...modelIdentity,
          });
        }
        if (state.activeViewId !== previous.activeViewId) {
          void registry.emitEvent('view.activated', {
            viewId: state.activeViewId,
            ...modelIdentity,
          });
        }
        if (state.openViewIds !== previous.openViewIds) {
          const opened = state.openViewIds.filter((id) => !previous.openViewIds.includes(id));
          for (const viewId of opened) {
            void registry.emitEvent('view.opened', { viewId, ...modelIdentity });
          }
        }
        if (state.model !== previous.model) {
          const existing = modelTimers.get(session.id);
          if (existing) clearTimeout(existing);
          modelTimers.set(
            session.id,
            window.setTimeout(() => {
              modelTimers.delete(session.id);
              void registry.emitEvent('model.changed', {
                dirty: session.store.getState().dirty,
                ...identity(session),
              });
            }, modelChangedDelay),
          );
        }
        previous = state;
      }),
    );
  };

  Object.values(workspaceAtStart.sessions).forEach(attachSession);
  let previousWorkspace = workspaceAtStart;
  const unsubscribeWorkspace = useWorkspaceStore.subscribe((workspace) => {
    for (const id of workspace.order) {
      if (previousWorkspace.sessions[id] || !workspace.sessions[id]) continue;
      const session = workspace.sessions[id];
      attachSession(session);
      void registry.emitEvent('model.opened', identity(session));
    }
    for (const id of previousWorkspace.order) {
      if (workspace.sessions[id]) continue;
      const session = previousWorkspace.sessions[id];
      if (!session) continue;
      void registry.emitEvent('model.closed', identity(session));
      sessionUnsubscribes.get(id)?.();
      sessionUnsubscribes.delete(id);
      const timer = modelTimers.get(id);
      if (timer) clearTimeout(timer);
      modelTimers.delete(id);
    }
    if (
      workspace.activeSessionId &&
      workspace.activeSessionId !== previousWorkspace.activeSessionId
    ) {
      const active = workspace.sessions[workspace.activeSessionId];
      if (active) void registry.emitEvent('model.activated', identity(active));
    }
    previousWorkspace = workspace;
  });

  // Preserve the legacy single-store event contract for viewer/unit-test stores.
  let unsubscribeLegacy: (() => void) | undefined;
  let legacyTimer: number | undefined;
  if (workspaceAtStart.order.length === 0) {
    let previous = useStore.getState();
    unsubscribeLegacy = useStore.subscribe((state) => {
      if (state.selection !== previous.selection) {
        void registry.emitEvent('selection.changed', state.selection);
      }
      if (state.activeViewId !== previous.activeViewId) {
        void registry.emitEvent('view.activated', { viewId: state.activeViewId });
      }
      if (state.openViewIds !== previous.openViewIds) {
        for (const viewId of state.openViewIds.filter((id) => !previous.openViewIds.includes(id))) {
          void registry.emitEvent('view.opened', { viewId });
        }
      }
      if (state.modelEpoch !== previous.modelEpoch) {
        void registry.emitEvent('model.opened', { fileName: state.fileName });
      }
      if (state.model !== previous.model) {
        if (legacyTimer) clearTimeout(legacyTimer);
        legacyTimer = window.setTimeout(() => {
          void registry.emitEvent('model.changed', { dirty: useStore.getState().dirty });
        }, modelChangedDelay);
      }
      previous = state;
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
  const workspace = useWorkspaceStore.getState();
  for (const id of workspace.order) {
    const session = workspace.sessions[id];
    if (session) await registry.emitEvent('model.opened', identity(session));
  }
  const active = workspace.activeSessionId ? getModelSession(workspace.activeSessionId) : undefined;
  if (active) await registry.emitEvent('model.activated', identity(active));
}

export function emitModelSaved(sessionId?: string): void {
  const session = sessionId ? getModelSession(sessionId) : undefined;
  if (session) {
    void extensionRegistry.emitEvent('model.saved', identity(session));
    return;
  }
  void extensionRegistry.emitEvent('model.saved', { fileName: useStore.getState().fileName });
}
