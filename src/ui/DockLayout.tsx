import { useEffect, useRef, useState } from 'react';
import {
  DockviewReact,
  themeLight,
  type DockviewApi,
  type DockviewReadyEvent,
} from 'dockview-react';
import { extensionRegistry } from '../extensions/registry';
import { closeView, useStore } from '../model/store';
import { registerLayoutBus } from './layout-bus';
import {
  GroupControls,
  LAYOUT_KEY,
  TOOL_PANELS,
  VIEW_PREFIX,
  Watermark,
  buildDefaultLayout,
  centerPosition,
  components,
  restoreViewPanels,
} from './dock/layout-config';

/** Set while this module itself mutates dockview, so event handlers don't echo back. */
let syncing = false;

export function DockLayout() {
  const [api, setApi] = useState<DockviewApi | null>(null);
  const [ready, setReady] = useState(false);
  const booted = useStore((s) => s.booted);
  const openViewIds = useStore((s) => s.openViewIds);
  const activeViewId = useStore((s) => s.activeViewId);
  const modelEpoch = useStore((s) => s.modelEpoch);
  // Open views' names, so tab titles follow renames.
  const titlesKey = useStore((s) =>
    s.openViewIds.map((id) => s.model?.views[id]?.name ?? '').join(' '),
  );
  const epochRef = useRef(modelEpoch);

  const onReady = (event: DockviewReadyEvent) => {
    setApi(event.api);
  };

  // One-time init per dockview instance, after startup restore finished.
  useEffect(() => {
    if (!api || !booted || ready) return;
    syncing = true;
    try {
      let restored = false;
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (raw) {
        try {
          api.fromJSON(JSON.parse(raw));
          restored = true;
        } catch (e) {
          console.warn('layout restore failed', e);
        }
      }
      if (!restored) {
        api.clear();
        buildDefaultLayout(api);
      }
      // Drop restored view panels whose view no longer exists; adopt the rest.
      const model = useStore.getState().model;
      const openIds: string[] = [];
      for (const p of [...api.panels]) {
        if (!p.id.startsWith(VIEW_PREFIX)) continue;
        const viewId = p.id.slice(VIEW_PREFIX.length);
        if (model?.views[viewId]) openIds.push(viewId);
        else api.removePanel(p);
      }
      const active = api.activePanel?.id.startsWith(VIEW_PREFIX)
        ? api.activePanel.id.slice(VIEW_PREFIX.length)
        : (openIds[openIds.length - 1] ?? null);
      useStore.setState({ openViewIds: openIds, activeViewId: active });
    } finally {
      syncing = false;
    }
    setReady(true);
  }, [api, booted, ready]);

  // Expose the layout bus for the toolbar Views menu.
  useEffect(() => {
    if (!api || !ready) return;
    const reset = () => {
      localStorage.removeItem(LAYOUT_KEY);
      syncing = true;
      try {
        api.clear();
        buildDefaultLayout(api);
        restoreViewPanels(api);
      } finally {
        syncing = false;
      }
    };
    registerLayoutBus({
      getPanels() {
        return TOOL_PANELS.map((t) => ({
          id: t.id,
          title: t.title,
          open: api.getPanel(t.id) !== undefined,
        }));
      },
      showPanel(id: string) {
        const existing = api.getPanel(id);
        if (existing) {
          existing.api.setActive();
          return;
        }
        TOOL_PANELS.find((t) => t.id === id)?.add(api);
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

  // Dockview -> store.
  useEffect(() => {
    if (!api || !ready) return;
    const d1 = api.onDidRemovePanel((p) => {
      if (!syncing && p.id.startsWith(VIEW_PREFIX)) closeView(p.id.slice(VIEW_PREFIX.length));
    });
    const d2 = api.onDidActivePanelChange((e) => {
      const p = e.panel;
      if (syncing || !p?.id.startsWith(VIEW_PREFIX)) return;
      const viewId = p.id.slice(VIEW_PREFIX.length);
      if (useStore.getState().activeViewId !== viewId) useStore.setState({ activeViewId: viewId });
    });
    let saveTimer: number | undefined;
    const d3 = api.onDidLayoutChange(() => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        // A maximized group serializes as a degenerate layout; skip until restored.
        if (api.hasMaximizedGroup()) return;
        try {
          localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON()));
        } catch {
          /* quota/serialization issues are non-fatal */
        }
      }, 500);
    });
    return () => {
      d1.dispose();
      d2.dispose();
      d3.dispose();
      if (saveTimer) clearTimeout(saveTimer);
    };
  }, [api, ready]);

  // Store -> dockview: open/close/retitle/activate view panels.
  useEffect(() => {
    if (!api || !ready) return;
    const model = useStore.getState().model;
    syncing = true;
    try {
      for (const p of [...api.panels]) {
        if (
          p.id.startsWith(VIEW_PREFIX) &&
          !openViewIds.includes(p.id.slice(VIEW_PREFIX.length))
        ) {
          api.removePanel(p);
        }
      }
      for (const viewId of openViewIds) {
        const id = VIEW_PREFIX + viewId;
        const title = model?.views[viewId]?.name ?? 'View';
        const existing = api.getPanel(id);
        if (!existing) {
          api.addPanel({
            id,
            component: 'view',
            title,
            params: { viewId },
            position: centerPosition(api, id),
          });
        } else if (existing.title !== title) {
          existing.api.setTitle(title);
        }
      }
      if (activeViewId) {
        const p = api.getPanel(VIEW_PREFIX + activeViewId);
        if (p && api.activePanel !== p) p.api.setActive();
      }
    } finally {
      syncing = false;
    }
  }, [api, ready, openViewIds, activeViewId, titlesKey]);

  // Fresh model (new/open): bring the welcome tab back.
  useEffect(() => {
    if (!api || !ready || epochRef.current === modelEpoch) return;
    epochRef.current = modelEpoch;
    if (!api.getPanel('welcome')) {
      syncing = true;
      try {
        TOOL_PANELS.find((t) => t.id === 'welcome')?.add(api);
      } finally {
        syncing = false;
      }
    }
  }, [api, ready, modelEpoch]);

  return (
    <DockviewReact
      className="dock-root"
      theme={themeLight}
      components={components}
      watermarkComponent={Watermark}
      rightHeaderActionsComponent={GroupControls}
      onReady={onReady}
    />
  );
}
