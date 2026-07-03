import { useEffect, useState } from 'react';
import type {
  DockviewApi,
  IDockviewHeaderActionsProps,
  IDockviewPanelProps,
} from 'dockview-react';
import { ViewEditor } from '../../canvas/ViewEditor';
import { useStore } from '../../model/store';
import { ModelTree } from '../ModelTree';
import { Palette } from '../Palette';
import { PropertiesPanel } from '../PropertiesPanel';
import { ScriptPanel } from '../ScriptPanel';
import { WelcomePanel } from '../WelcomePanel';

export const LAYOUT_KEY = 'archi-online.layout';
export const VIEW_PREFIX = 'view:';

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

export function buildDefaultLayout(api: DockviewApi): void {
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
export function restoreViewPanels(api: DockviewApi): void {
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
  scripts: () => (
    <div className="dock-panel">
      <ScriptPanel />
    </div>
  ),
  welcome: () => <WelcomePanel />,
  view: ViewPanel as React.FunctionComponent<IDockviewPanelProps>,
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
