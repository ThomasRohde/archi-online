import { useEffect, useState } from 'react';
import { DockviewDefaultTab } from 'dockview-react';
import type {
  DockviewApi,
  IDockviewHeaderActionsProps,
  IDockviewPanelHeaderProps,
  IDockviewPanelProps,
} from 'dockview-react';
import { ViewEditor } from '../../canvas/ViewEditor';
import { closeView } from '../../model/store';
import { ModelStoreProvider, useStore, useWorkspaceStore } from '../store-hooks';
import { activateModelSession, getModelSession } from '../../model/workspace';
import { showContextMenu, type MenuItem } from '../ContextMenu';
import { ExtensionPanelHost } from '../ExtensionPanelHost';
import { ExtensionsPanel } from '../ExtensionsPanel';
import { ModelTree } from '../ModelTree';
import { NavigatorPanel } from '../NavigatorPanel';
import { VisualiserPanel } from '../VisualiserPanel';
import { OutlinePanel } from '../OutlinePanel';
import { Palette } from '../Palette';
import { PropertiesPanel } from '../PropertiesPanel';
import { SettingsPanel } from '../SettingsPanel';
import { ScriptPanel } from '../ScriptPanel';
import { ValidatorPanel } from '../ValidatorPanel';
import { WelcomePanel } from '../WelcomePanel';

export const LAYOUT_KEY = 'archi-online.layout';
export const VIEW_PREFIX = 'view:';

export interface ViewPanelParams {
  sessionId: string;
  viewId: string;
}

export function createViewPanelId(sessionId: string, viewId: string): string {
  return `${VIEW_PREFIX}${encodeURIComponent(sessionId)}:${encodeURIComponent(viewId)}`;
}

export function changedActiveViewPanelId(
  previous: Record<string, string | null>,
  current: Record<string, string | null>,
  activeSessionId: string | null,
): string | null {
  if (!activeSessionId) return null;
  const activeViewId = current[activeSessionId];
  if (!activeViewId || previous[activeSessionId] === activeViewId) return null;
  return createViewPanelId(activeSessionId, activeViewId);
}

export function parseViewPanelId(panelId: string): ViewPanelParams | null {
  if (!panelId.startsWith(VIEW_PREFIX)) return null;
  const encoded = panelId.slice(VIEW_PREFIX.length);
  const separator = encoded.indexOf(':');
  if (separator < 1 || separator === encoded.length - 1) return null;
  try {
    return {
      sessionId: decodeURIComponent(encoded.slice(0, separator)),
      viewId: decodeURIComponent(encoded.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

interface ToolPanelDef {
  id: string;
  title: string;
  add(api: DockviewApi): void;
}

/** Where new ArchiMate view panels (and the welcome tab) go. */
export function centerPosition(api: DockviewApi, excludeId: string) {
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
export const TOOL_PANELS: ToolPanelDef[] = [
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
    id: 'navigator',
    title: 'Navigator',
    add: (api) =>
      api.addPanel({
        id: 'navigator',
        component: 'navigator',
        title: 'Navigator',
        position: api.getPanel('models')
          ? { referencePanel: 'models', direction: 'within' }
          : { direction: 'left' },
        initialWidth: 260,
      }),
  },
  {
    id: 'visualiser',
    title: 'Visualiser',
    add: (api) =>
      api.addPanel({
        id: 'visualiser',
        component: 'visualiser',
        title: 'Visualiser',
        position: centerPosition(api, 'visualiser'),
      }),
  },
  {
    id: 'outline',
    title: 'Outline',
    add: (api) =>
      api.addPanel({
        id: 'outline',
        component: 'outline',
        title: 'Outline',
        position: api.getPanel('models')
          ? { referencePanel: 'models', direction: 'within' }
          : { direction: 'left' },
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
        position: api.getPanel('scripts')
          ? { referencePanel: 'scripts', direction: 'within' }
          : { direction: 'below' },
      }),
  },
  {
    id: 'settings',
    title: 'Settings',
    add: (api) =>
      api.addPanel({
        id: 'settings',
        component: 'settings',
        title: 'Settings',
        position: { direction: 'right' },
        initialWidth: 340,
      }),
  },
  {
    id: 'extensions',
    title: 'Extensions',
    add: (api) =>
      api.addPanel({
        id: 'extensions',
        component: 'extensions',
        title: 'Extensions',
        position: api.getPanel('settings')
          ? { referencePanel: 'settings', direction: 'within' }
          : { direction: 'right' },
        initialWidth: 380,
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
    id: 'validator',
    title: 'Validator',
    add: (api) =>
      api.addPanel({
        id: 'validator',
        component: 'validator',
        title: 'Validator',
        position: api.getPanel('scripts')
          ? { referencePanel: 'scripts', direction: 'within' }
          : { direction: 'below' },
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
        tabComponent: 'home',
        position: centerPosition(api, 'welcome'),
      }),
  },
];

export function buildDefaultLayout(api: DockviewApi): void {
  api.addPanel({ id: 'models', component: 'models', title: 'Models' });
  api.addPanel({
    id: 'welcome',
    component: 'welcome',
    title: 'Welcome',
    tabComponent: 'home',
    position: { referencePanel: 'models', direction: 'right' },
  });
  api.addPanel({
    id: 'palette',
    component: 'palette',
    title: 'Palette',
    position: { referencePanel: 'welcome', direction: 'left' },
  });
  api.addPanel({
    id: 'scripts',
    component: 'scripts',
    title: 'Scripting',
    position: { referencePanel: 'welcome', direction: 'below' },
    initialHeight: 230,
  });
  api.addPanel({
    id: 'properties',
    component: 'properties',
    title: 'Properties',
    position: { referencePanel: 'scripts', direction: 'within' },
  });
  api.addPanel({
    id: 'settings',
    component: 'settings',
    title: 'Settings',
    position: { referencePanel: 'welcome', direction: 'right' },
  });
  api.addPanel({
    id: 'extensions',
    component: 'extensions',
    title: 'Extensions',
    position: { referencePanel: 'settings', direction: 'within' },
  });
  api.getPanel('models')?.api.setSize({ width: 250 });
  api.getPanel('palette')?.api.setSize({ width: 88 });
  api.getPanel('properties')?.api.setActive();
}

/**
 * Width bands for the side-panel groups. dockview redistributes freed space
 * proportionally to each group's size; capping the sides keeps that space on the
 * canvas (and neighbouring side panels) rather than ballooning the Model tree /
 * Palette / Settings when a panel is toggled, floated, or popped out. Groups are
 * shared (Navigator docks with Models, Extensions with Settings), so one entry per
 * host group covers its tenants.
 */
const SIDE_CONSTRAINTS: Record<string, { minimumWidth: number; maximumWidth: number }> = {
  palette: { minimumWidth: 60, maximumWidth: 160 },
  models: { minimumWidth: 180, maximumWidth: 460 },
  settings: { minimumWidth: 260, maximumWidth: 480 },
};

/** Clamp the side-panel groups to sensible widths. Idempotent; only clamps. */
export function applySidePanelConstraints(api: DockviewApi): void {
  let changed = false;
  for (const [id, constraints] of Object.entries(SIDE_CONSTRAINTS)) {
    const group = api.getPanel(id)?.api.group;
    if (group) {
      group.api.setConstraints(constraints);
      changed = true;
    }
  }
  // setConstraints only records the min/max; force a relayout so an over-max
  // group is clamped now (freed width flows to the flexible center) rather than
  // waiting for the next container resize.
  if (changed) api.layout(api.width, api.height, true);
}

/**
 * Keep a flexible occupant in the center: while a model is open, ensure the pinned
 * Home (welcome) panel exists so closing the last view never empties the center group
 * (which would force the freed width onto the side panels). Also migrates older
 * persisted layouts that were saved with the welcome tab closed.
 */
export function ensureHomeAnchor(api: DockviewApi): void {
  if (useWorkspaceStore.getState().order.length === 0 && !useStore.getState().model) return;
  if (api.getPanel('welcome')) return;
  TOOL_PANELS.find((t) => t.id === 'welcome')?.add(api);
}

export function ensurePropertiesDockedWithScripts(api: DockviewApi): void {
  const properties = api.getPanel('properties');
  const scripts = api.getPanel('scripts');
  if (!properties || !scripts || properties.api.group === scripts.api.group) return;

  const activePanelId = api.activePanel?.id;
  properties.api.moveTo({
    group: scripts.api.group,
    position: 'center',
    skipSetActive: true,
  });
  if (activePanelId) api.getPanel(activePanelId)?.api.setActive();
}

/** Re-add open store views that have no dockview panel (used by reset). */
export function restoreViewPanels(api: DockviewApi): void {
  const workspace = useWorkspaceStore.getState();
  for (const sessionId of workspace.order) {
    const session = workspace.sessions[sessionId];
    const state = session?.store.getState();
    if (!state?.model) continue;
    for (const viewId of state.openViewIds) {
      const view = state.model.views[viewId];
      if (!view) continue;
      const id = createViewPanelId(sessionId, viewId);
      if (!api.getPanel(id)) {
        api.addPanel({
          id,
          component: 'view',
          title: `${view.name} — ${state.model.info.name}`,
          params: { sessionId, viewId } satisfies ViewPanelParams,
          position: centerPosition(api, id),
        });
      }
    }
  }
}

function ViewPanel(props: IDockviewPanelProps<ViewPanelParams>) {
  const session = getModelSession(props.params.sessionId);
  if (!session) return null;
  return (
    <ModelStoreProvider store={session.store}>
      <div
        className="view-panel"
        onPointerDownCapture={() => activateModelSession(props.params.sessionId)}
      >
        <ViewEditor viewId={props.params.viewId} />
      </div>
    </ModelStoreProvider>
  );
}

export const components: Record<string, React.FunctionComponent<IDockviewPanelProps>> = {
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
  navigator: () => (
    <div className="dock-panel">
      <NavigatorPanel />
    </div>
  ),
  visualiser: () => (
    <div className="dock-panel">
      <VisualiserPanel />
    </div>
  ),
  outline: () => (
    <div className="dock-panel">
      <OutlinePanel />
    </div>
  ),
  settings: () => (
    <div className="dock-panel">
      <SettingsPanel />
    </div>
  ),
  extensions: () => (
    <div className="dock-panel">
      <ExtensionsPanel />
    </div>
  ),
  scripts: () => (
    <div className="dock-panel">
      <ScriptPanel />
    </div>
  ),
  validator: () => (
    <div className="dock-panel">
      <ValidatorPanel />
    </div>
  ),
  welcome: () => <WelcomePanel />,
  view: ViewPanel as React.FunctionComponent<IDockviewPanelProps>,
  'extension-panel': ExtensionPanelHost as React.FunctionComponent<IDockviewPanelProps>,
};

/** Non-closeable tab for the pinned Home (welcome) anchor. */
function HomeTab(props: IDockviewPanelHeaderProps) {
  return <DockviewDefaultTab {...props} hideClose />;
}

/** Default tab; view tabs get a Close / Close Others / Close All context menu. */
export function DefaultTab(props: IDockviewPanelHeaderProps) {
  const target = parseViewPanelId(props.api.id);
  if (!target) return <DockviewDefaultTab {...props} />;
  return (
    <DockviewDefaultTab
      {...props}
      onContextMenu={(e: React.MouseEvent) => {
        e.preventDefault();
        const workspace = useWorkspaceStore.getState();
        const open = workspace.order.flatMap((sessionId) => {
          const session = workspace.sessions[sessionId];
          return (session?.store.getState().openViewIds ?? []).map((viewId) => ({
            session,
            viewId,
          }));
        });
        const items: MenuItem[] = [
          {
            label: 'Close',
            onClick: () => closeView(target.viewId, getModelSession(target.sessionId)?.store),
          },
          {
            label: 'Close Others',
            disabled: open.length < 2,
            onClick: () =>
              open
                .filter(
                  (entry) =>
                    entry.session?.id !== target.sessionId || entry.viewId !== target.viewId,
                )
                .forEach((entry) => closeView(entry.viewId, entry.session?.store)),
          },
          {
            label: 'Close All',
            onClick: () => open.forEach((entry) => closeView(entry.viewId, entry.session?.store)),
          },
        ];
        showContextMenu(e.clientX, e.clientY, items);
      }}
    />
  );
}

export const tabComponents: Record<
  string,
  React.FunctionComponent<IDockviewPanelHeaderProps>
> = {
  home: HomeTab,
};

/** Standard group controls: float, open-in-window, maximize/restore. */
export function GroupControls(props: IDockviewHeaderActionsProps) {
  const [maximized, setMaximized] = useState(() => props.api.isMaximized());

  useEffect(() => {
    const d = props.containerApi.onDidMaximizedGroupChange(() =>
      setMaximized(props.api.isMaximized()),
    );
    return () => d.dispose();
  }, [props.containerApi, props.api]);

  if (props.group.api.location.type !== 'grid') return null;
  // The palette group is deliberately narrow; controls would crowd out its tab.
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
        onClick={() =>
          void props.containerApi.addPopoutGroup(props.group, {
            // Resolve popout.html against the deploy base (default '/', or the
            // GitHub Pages subpath) instead of dockview's root-absolute default.
            popoutUrl: `${import.meta.env.BASE_URL}popout.html`,
          })
        }
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

export function Watermark() {
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
