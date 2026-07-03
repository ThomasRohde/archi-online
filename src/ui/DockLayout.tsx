import { useEffect, useRef, useState } from 'react';
import {
  DockviewReact,
  themeLight,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelProps,
} from 'dockview-react';
import { ViewEditor } from '../canvas/ViewEditor';
import { closeView, useStore } from '../model/store';
import { registerLayoutBus, type DockPanelInfo } from './layout-bus';
import { ModelTree } from './ModelTree';
import { Palette } from './Palette';
import { PropertiesPanel } from './PropertiesPanel';
import { ScriptPanel } from './ScriptPanel';
import { WelcomePanel } from './WelcomePanel';

const LAYOUT_KEY = 'archi-online.layout';
const VIEW_PREFIX = 'view:';

interface ToolPanelDef {
  id: string;
  title: string;
  add(api: DockviewApi): void;
}

/** Where new ArchiMate view panels (and the welcome tab) go. */
function centerPosition(api: DockviewApi, excludeId: string) {
  const sibling = api.panels.find(
    (p) => (p.id.startsWith(VIEW_PREFIX) || p.id === 'welcome') && p.id !== excludeId,
  );
  if (sibling) return { referencePanel: sibling.id, direction: 'within' as const };
  if (api.getPanel('scripts')) {
    return { referencePanel: 'scripts', direction: 'above' as const };
  }
  return undefined;
}

/** Tool panels: how to (re)create each one at a sensible position. */
const TOOL_PANELS: ToolPanelDef[] = [
  {
    id: 'models',
    title: 'Models',
    add: (api) =>
      api.addPanel({
        id: 'models',
        component: 'models',
        title: 'Models',
        position: { direction: 'left' },
        initialWidth: 260,
      }),
  },
  {
    id: 'palette',
    title: 'Palette',
    add: (api) => {
      const center = centerPosition(api, 'palette');
      api.addPanel({
        id: 'palette',
        component: 'palette',
        title: 'Palette',
        position: center
          ? { referencePanel: center.referencePanel, direction: 'left' }
          : { direction: 'left' },
        initialWidth: 90,
      });
    },
  },
  {
    id: 'properties',
    title: 'Properties',
    add: (api) =>
      api.addPanel({
        id: 'properties',
        component: 'properties',
        title: 'Properties',
        position: { direction: 'right' },
        initialWidth: 300,
      }),
  },
  {
    id: 'scripts',
    title: 'Scripting',
    add: (api) =>
      api.addPanel({
        id: 'scripts',
        component: 'scripts',
        title: 'Scripting',
        position: { direction: 'below' },
        initialHeight: 230,
      }),
  },
  {
    id: 'welcome',
    title: 'Welcome',
    add: (api) =>
      api.addPanel({
        id: 'welcome',
        component: 'welcome',
        title: 'Welcome',
        position: centerPosition(api, 'welcome'),
      }),
  },
];

/** Set while this module itself mutates dockview, so event handlers don't echo back. */
let syncing = false;

function buildDefaultLayout(api: DockviewApi): void {
  api.addPanel({ id: 'models', component: 'models', title: 'Models' });
  api.addPanel({
    id: 'welcome',
    component: 'welcome',
    title: 'Welcome',
    position: { referencePanel: 'models', direction: 'right' },
  });
  api.addPanel({
    id: 'palette',
    component: 'palette',
    title: 'Palette',
    position: { referencePanel: 'welcome', direction: 'left' },
  });
  api.addPanel({
    id: 'properties',
    component: 'properties',
    title: 'Properties',
    position: { referencePanel: 'welcome', direction: 'right' },
  });
  api.addPanel({
    id: 'scripts',
    component: 'scripts',
    title: 'Scripting',
    position: { referencePanel: 'welcome', direction: 'below' },
    initialHeight: 230,
  });
  api.getPanel('models')?.api.setSize({ width: 250 });
  api.getPanel('palette')?.api.setSize({ width: 88 });
  api.getPanel('properties')?.api.setSize({ width: 300 });
}

/** Re-add open store views that have no dockview panel (used by reset). */
function restoreViewPanels(api: DockviewApi): void {
  const s = useStore.getState();
  for (const viewId of s.openViewIds) {
    const view = s.model?.views[viewId];
    if (!view) continue;
    const id = VIEW_PREFIX + viewId;
    if (!api.getPanel(id)) {
      api.addPanel({
        id,
        component: 'view',
        title: view.name,
        params: { viewId },
        position: centerPosition(api, id),
      });
    }
  }
}

function ViewPanel(props: IDockviewPanelProps<{ viewId: string }>) {
  return (
    <div className="view-panel">
      <ViewEditor viewId={props.params.viewId} />
    </div>
  );
}

const components: Record<string, React.FunctionComponent<IDockviewPanelProps>> = {
  models: () => (
    <div className="dock-panel">
      <ModelTree />
    </div>
  ),
  palette: () => (
    <div className="dock-panel">
      <Palette />
    </div>
  ),
  properties: () => (
    <div className="dock-panel">
      <PropertiesPanel />
    </div>
  ),
  scripts: () => (
    <div className="dock-panel">
      <ScriptPanel />
    </div>
  ),
  welcome: () => <WelcomePanel />,
  view: ViewPanel as React.FunctionComponent<IDockviewPanelProps>,
};

/** Standard group controls: float, open-in-window, maximize/restore. */
function GroupControls(props: IDockviewHeaderActionsProps) {
  const [maximized, setMaximized] = useState(() => props.api.isMaximized());

  useEffect(() => {
    const d = props.containerApi.onDidMaximizedGroupChange(() =>
      setMaximized(props.api.isMaximized()),
    );
    return () => d.dispose();
  }, [props.containerApi, props.api]);

  if (props.group.api.location.type !== 'grid') return null;
  // the palette group is deliberately narrow; controls would crowd out its tab
  if (props.panels.length === 1 && props.panels[0].id === 'palette') return null;

  return (
    <div className="group-controls">
      <button
        className="group-ctl"
        title="Float group"
        onClick={() => props.containerApi.addFloatingGroup(props.group)}
      >
        <svg viewBox="0 0 16 16" width="12" height="12">
          <path d="M3 6 H10 V13 H3 Z M6 6 V3 H13 V10 H10" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
      <button
        className="group-ctl"
        title="Open in new window"
        onClick={() => void props.containerApi.addPopoutGroup(props.group)}
      >
        <svg viewBox="0 0 16 16" width="12" height="12">
          <path d="M7 3 H3 V13 H13 V9 M9 3 H13 V7 M13 3 L7.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
      <button
        className="group-ctl"
        title={maximized ? 'Restore group' : 'Maximize group'}
        onClick={() => {
          if (props.api.isMaximized()) props.api.exitMaximized();
          else props.api.maximize();
        }}
      >
        {maximized ? (
          <svg viewBox="0 0 16 16" width="12" height="12">
            <path d="M5 8 H11 M8 5 V11" fill="none" stroke="none" />
            <path d="M3 8 H8 V13 H3 Z M8 8 L13 3 M13 3 H9.5 M13 3 V6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="12" height="12">
            <rect x="3" y="3" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        )}
      </button>
    </div>
  );
}

function Watermark() {
  return (
    <div className="dock-watermark">
      <p>All panels are closed.</p>
      <p>
        Use the <strong>Views</strong> menu in the toolbar to reopen panels, or
      </p>
      <button
        className="welcome-btn"
        onClick={() => {
          window.dispatchEvent(new Event('archi:reset-layout'));
        }}
      >
        Reset layout
      </button>
    </div>
  );
}

export function DockLayout() {
  const [api, setApi] = useState<DockviewApi | null>(null);
  const [ready, setReady] = useState(false);
  const booted = useStore((s) => s.booted);
  const openViewIds = useStore((s) => s.openViewIds);
  const activeViewId = useStore((s) => s.activeViewId);
  const modelEpoch = useStore((s) => s.modelEpoch);
  // open views' names, so tab titles follow renames
  const titlesKey = useStore((s) =>
    s.openViewIds.map((id) => s.model?.views[id]?.name ?? '').join(' '),
  );
  const epochRef = useRef(modelEpoch);

  const onReady = (event: DockviewReadyEvent) => {
    setApi(event.api);
  };

  // one-time init per dockview instance, after startup restore finished
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
      // drop restored view panels whose view no longer exists; adopt the rest
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

  // expose the layout bus for the toolbar Views menu
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
      getPanels(): DockPanelInfo[] {
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
      reset,
    });
    const onReset = () => reset();
    window.addEventListener('archi:reset-layout', onReset);
    return () => {
      registerLayoutBus(null);
      window.removeEventListener('archi:reset-layout', onReset);
    };
  }, [api, ready]);

  // dockview -> store
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
        // a maximized group serializes as a degenerate layout — skip until restored
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

  // store -> dockview: open/close/retitle/activate view panels
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

  // fresh model (new/open): bring the welcome tab back
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
