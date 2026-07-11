import { useEffect, useRef, useState } from 'react';
import {
  DockviewReact,
  themeLight,
  type DockviewApi,
  type DockviewReadyEvent,
} from 'dockview-react';
import { extensionRegistry } from '../extensions/registry';
import { closeView } from '../model/store';
import { useStore, useWorkspaceStore } from './store-hooks';
import { activateModelSession, getModelSession } from '../model/workspace';
import { defaultKeyValueStore } from '../persistence/keyval';
import { registerLayoutBus } from './layout-bus';
import {
  DefaultTab,
  GroupControls,
  LAYOUT_KEY,
  TOOL_PANELS,
  VIEW_PREFIX,
  Watermark,
  applySidePanelConstraints,
  buildDefaultLayout,
  changedActiveViewPanelId,
  centerPosition,
  components,
  createViewPanelId,
  ensureHomeAnchor,
  ensurePropertiesDockedWithScripts,
  parseViewPanelId,
  restoreViewPanels,
  tabComponents,
} from './dock/layout-config';

let syncing = false;

function workspaceViewEntries() {
  const workspace = useWorkspaceStore.getState();
  return workspace.order.flatMap((sessionId) => {
    const session = workspace.sessions[sessionId];
    const state = session?.store.getState();
    if (!session || !state?.model) return [];
    const model = state.model;
    return state.openViewIds.flatMap((viewId) => {
      const view = model.views[viewId];
      return view
        ? [{ sessionId, viewId, session, title: `${view.name} — ${model.info.name}` }]
        : [];
    });
  });
}

function workspaceActiveViewSnapshot(): Record<string, string | null> {
  const workspace = useWorkspaceStore.getState();
  return Object.fromEntries(
    workspace.order.map((sessionId) => [
      sessionId,
      workspace.sessions[sessionId]?.store.getState().activeViewId ?? null,
    ]),
  );
}

export function DockLayout() {
  const [api, setApi] = useState<DockviewApi | null>(null);
  const [ready, setReady] = useState(false);
  const workspaceBooted = useWorkspaceStore((state) => state.booted);
  const workspaceRevision = useWorkspaceStore((state) => state.revision);
  const orderKey = useWorkspaceStore((state) => state.order.join(' '));
  const activeSessionId = useWorkspaceStore((state) => state.activeSessionId);
  const legacyBooted = useStore((state) => state.booted);
  const previousActiveViews = useRef<Record<string, string | null>>({});

  const onReady = (event: DockviewReadyEvent) => setApi(event.api);

  useEffect(() => {
    if (!api || (!workspaceBooted && !legacyBooted) || ready) return;
    let cancelled = false;
    const init = async () => {
      let restored = false;
      let raw: Parameters<DockviewApi['fromJSON']>[0] | undefined;
      try {
        raw = await defaultKeyValueStore().get<Parameters<DockviewApi['fromJSON']>[0]>(LAYOUT_KEY);
      } catch (error) {
        console.warn('layout restore failed', error);
      }
      if (cancelled) return;
      syncing = true;
      try {
        if (raw) {
          try {
            api.fromJSON(raw);
            ensurePropertiesDockedWithScripts(api);
            restored = true;
          } catch (error) {
            console.warn('layout restore failed', error);
          }
        }
        if (!restored) {
          api.clear();
          buildDefaultLayout(api);
        }

        // The workspace snapshot owns logical open-view state. Dockview only owns geometry.
        for (const panel of [...api.panels]) {
          if (!panel.id.startsWith(VIEW_PREFIX)) continue;
          const target = parseViewPanelId(panel.id);
          const session = target ? getModelSession(target.sessionId) : undefined;
          const state = session?.store.getState();
          if (
            !target ||
            !state?.model?.views[target.viewId] ||
            !state.openViewIds.includes(target.viewId)
          ) {
            api.removePanel(panel);
          }
        }
        restoreViewPanels(api);
        const active = activeSessionId ? getModelSession(activeSessionId)?.store.getState() : null;
        if (activeSessionId && active?.activeViewId) {
          api.getPanel(createViewPanelId(activeSessionId, active.activeViewId))?.api.setActive();
        }
        previousActiveViews.current = workspaceActiveViewSnapshot();
        ensureHomeAnchor(api);
        applySidePanelConstraints(api);
      } finally {
        syncing = false;
      }
      if (!cancelled) setReady(true);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [api, workspaceBooted, legacyBooted, ready, activeSessionId]);

  useEffect(() => {
    if (!api || !ready) return;
    const reset = () => {
      void defaultKeyValueStore().del(LAYOUT_KEY);
      syncing = true;
      try {
        api.clear();
        buildDefaultLayout(api);
        restoreViewPanels(api);
        applySidePanelConstraints(api);
      } finally {
        syncing = false;
      }
    };
    registerLayoutBus({
      getPanels() {
        return TOOL_PANELS.map((panel) => ({
          id: panel.id,
          title: panel.title,
          open: api.getPanel(panel.id) !== undefined,
        }));
      },
      showPanel(id: string) {
        const existing = api.getPanel(id);
        if (existing) {
          existing.api.setActive();
          return;
        }
        TOOL_PANELS.find((panel) => panel.id === id)?.add(api);
        applySidePanelConstraints(api);
      },
      showExtensionPanel(panelId: string) {
        const dockId = `extension:${panelId}`;
        const existing = api.getPanel(dockId);
        if (existing) {
          existing.api.setActive();
          return;
        }
        const panel = extensionRegistry.getPanel(panelId);
        if (!panel) return;
        api.addPanel({
          id: dockId,
          component: 'extension-panel',
          title: panel.title,
          params: { panelId },
          position: api.getPanel('extensions')
            ? { referencePanel: 'extensions', direction: 'within' }
            : centerPosition(api, dockId),
        });
      },
      reset,
    });
    const onReset = () => reset();
    window.addEventListener('archi:reset-layout', onReset);
    return () => {
      registerLayoutBus(null);
      window.removeEventListener('archi:reset-layout', onReset);
    };
  }, [api, ready]);

  useEffect(() => {
    if (!api || !ready) return;
    const remove = api.onDidRemovePanel((panel) => {
      if (syncing) return;
      const target = parseViewPanelId(panel.id);
      if (target) closeView(target.viewId, getModelSession(target.sessionId)?.store);
    });
    const activate = api.onDidActivePanelChange((event) => {
      if (syncing || !event.panel) return;
      const target = parseViewPanelId(event.panel.id);
      if (!target) return;
      activateModelSession(target.sessionId);
      const session = getModelSession(target.sessionId);
      if (session?.store.getState().activeViewId !== target.viewId) {
        session?.store.setState({ activeViewId: target.viewId });
      }
    });
    let saveTimer: number | undefined;
    const layout = api.onDidLayoutChange(() => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        if (api.hasMaximizedGroup()) return;
        try {
          void defaultKeyValueStore().set(LAYOUT_KEY, api.toJSON()).catch(() => undefined);
        } catch {
          // Layout persistence is best effort.
        }
      }, 500);
    });
    return () => {
      remove.dispose();
      activate.dispose();
      layout.dispose();
      if (saveTimer) clearTimeout(saveTimer);
    };
  }, [api, ready]);

  useEffect(() => {
    if (!api || !ready) return;
    const workspace = useWorkspaceStore.getState();
    const activeViews = workspaceActiveViewSnapshot();
    const panelToActivate = changedActiveViewPanelId(
      previousActiveViews.current,
      activeViews,
      workspace.activeSessionId,
    );
    previousActiveViews.current = activeViews;
    const entries = workspaceViewEntries();
    const expected = new Set(entries.map((entry) => createViewPanelId(entry.sessionId, entry.viewId)));
    syncing = true;
    try {
      for (const panel of [...api.panels]) {
        if (panel.id.startsWith(VIEW_PREFIX) && !expected.has(panel.id)) api.removePanel(panel);
      }
      for (const entry of entries) {
        const id = createViewPanelId(entry.sessionId, entry.viewId);
        const existing = api.getPanel(id);
        if (!existing) {
          api.addPanel({
            id,
            component: 'view',
            title: entry.title,
            params: { sessionId: entry.sessionId, viewId: entry.viewId },
            position: centerPosition(api, id),
          });
        } else if (existing.title !== entry.title) {
          existing.api.setTitle(entry.title);
        }
      }
      if (panelToActivate) api.getPanel(panelToActivate)?.api.setActive();
      ensureHomeAnchor(api);
    } finally {
      syncing = false;
    }
  }, [api, ready, workspaceRevision, orderKey]);

  return (
    <DockviewReact
      className="dock-root"
      theme={themeLight}
      components={components}
      tabComponents={tabComponents}
      defaultTabComponent={DefaultTab}
      watermarkComponent={Watermark}
      rightHeaderActionsComponent={GroupControls}
      onReady={onReady}
    />
  );
}
