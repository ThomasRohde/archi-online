import { describe, expect, it } from 'vitest';
import {
  TOOL_PANELS,
  applySidePanelConstraints,
  buildDefaultLayout,
  ensurePropertiesDockedWithScripts,
} from '../src/ui/dock/layout-config';

interface Constraints {
  minimumWidth?: number;
  maximumWidth?: number;
}

interface Group {
  id: string;
  constraints?: Constraints;
  api: { setConstraints: (value: Constraints) => void };
}

interface AddedPanel {
  id: string;
  component: string;
  title: string;
  tabComponent?: string;
  position?: { referencePanel?: string; direction: string };
  initialHeight?: number;
  initialWidth?: number;
  group?: Group;
}

function createDockApi() {
  const added: AddedPanel[] = [];
  let groupCount = 0;
  let activePanelId: string | undefined;
  const makeGroup = (): Group => {
    const group: Group = {
      id: `group-${++groupCount}`,
      api: { setConstraints: (value) => (group.constraints = value) },
    };
    return group;
  };
  const api = {
    panels: added,
    width: 1600,
    height: 1000,
    layout(_width: number, _height: number, _force?: boolean) {
      /* no-op: the mock has no real splitview to relayout */
    },
    addPanel(panel: AddedPanel) {
      const reference = panel.position?.referencePanel
        ? added.find((candidate) => candidate.id === panel.position?.referencePanel)
        : undefined;
      panel.group =
        panel.position?.direction === 'within' && reference?.group
          ? reference.group
          : makeGroup();
      added.push(panel);
      activePanelId = panel.id;
    },
    getPanel(id: string) {
      const panel = added.find((candidate) => candidate.id === id);
      if (!panel) return undefined;
      return {
        id,
        get title() {
          return panel.title;
        },
        api: {
          get group() {
            return panel.group;
          },
          setSize: () => undefined,
          setActive: () => {
            activePanelId = id;
          },
          moveTo: (options: { group: Group; skipSetActive?: boolean }) => {
            panel.group = options.group;
            if (!options.skipSetActive) activePanelId = id;
          },
        },
      };
    },
    get activePanel() {
      return activePanelId ? this.getPanel(activePanelId) : undefined;
    },
  };
  return { api, added };
}

describe('dock layout config', () => {
  it('places Properties with the Scripting panel by default', () => {
    const { api, added } = createDockApi();

    buildDefaultLayout(api as never);

    const scripts = added.find((panel) => panel.id === 'scripts');
    const properties = added.find((panel) => panel.id === 'properties');
    const settings = added.find((panel) => panel.id === 'settings');

    expect(scripts?.position).toEqual({ referencePanel: 'welcome', direction: 'below' });
    expect(properties?.position).toEqual({ referencePanel: 'scripts', direction: 'within' });
    expect(settings?.position).toEqual({ referencePanel: 'welcome', direction: 'right' });
  });

  it('pins the Welcome panel with the non-closeable Home tab', () => {
    const { api, added } = createDockApi();

    buildDefaultLayout(api as never);

    expect(added.find((panel) => panel.id === 'welcome')?.tabComponent).toBe('home');
    // Re-opening Welcome via the Views menu keeps it pinned too.
    const { api: api2, added: added2 } = createDockApi();
    TOOL_PANELS.find((panel) => panel.id === 'welcome')!.add(api2 as never);
    expect(added2.find((panel) => panel.id === 'welcome')?.tabComponent).toBe('home');
  });

  it('clamps the side-panel groups to width bands', () => {
    const { api } = createDockApi();

    buildDefaultLayout(api as never);
    applySidePanelConstraints(api as never);

    expect(api.getPanel('palette')?.api.group?.constraints).toEqual({
      minimumWidth: 60,
      maximumWidth: 160,
    });
    expect(api.getPanel('models')?.api.group?.constraints).toEqual({
      minimumWidth: 180,
      maximumWidth: 460,
    });
    expect(api.getPanel('settings')?.api.group?.constraints).toEqual({
      minimumWidth: 260,
      maximumWidth: 480,
    });
  });

  it('reopens Properties into the Scripting group when Scripting is present', () => {
    const { api } = createDockApi();
    api.addPanel({
      id: 'scripts',
      component: 'scripts',
      title: 'Scripting',
      position: { direction: 'below' },
    });

    TOOL_PANELS.find((panel) => panel.id === 'properties')!.add(api as never);
    TOOL_PANELS.find((panel) => panel.id === 'settings')!.add(api as never);

    expect(api.panels.find((panel) => panel.id === 'properties')?.position).toEqual({
      referencePanel: 'scripts',
      direction: 'within',
    });
    expect(api.panels.find((panel) => panel.id === 'settings')?.position).toEqual({
      direction: 'right',
    });
  });

  it('reopens Navigator with Models when Models is present and keeps it out of the default layout', () => {
    const { api, added } = createDockApi();

    buildDefaultLayout(api as never);
    TOOL_PANELS.find((panel) => panel.id === 'navigator')!.add(api as never);

    const navigator = added.find((panel) => panel.id === 'navigator');
    expect(navigator?.component).toBe('navigator');
    expect(navigator?.title).toBe('Navigator');
    expect(navigator?.position).toEqual({ referencePanel: 'models', direction: 'within' });
    expect(added.filter((panel) => panel.id === 'navigator')).toHaveLength(1);
  });

  it('reopens Navigator on the left when Models is unavailable', () => {
    const { api, added } = createDockApi();

    TOOL_PANELS.find((panel) => panel.id === 'navigator')!.add(api as never);

    expect(added.find((panel) => panel.id === 'navigator')?.position).toEqual({
      direction: 'left',
    });
  });

  it('migrates restored Properties into the Scripting group without stealing focus', () => {
    const { api, added } = createDockApi();
    api.addPanel({
      id: 'scripts',
      component: 'scripts',
      title: 'Scripting',
      position: { direction: 'below' },
    });
    api.addPanel({
      id: 'properties',
      component: 'properties',
      title: 'Properties',
      position: { direction: 'right' },
    });
    api.addPanel({
      id: 'settings',
      component: 'settings',
      title: 'Settings',
      position: { referencePanel: 'properties', direction: 'within' },
    });
    api.getPanel('settings')?.api.setActive();

    const scriptsGroup = added.find((panel) => panel.id === 'scripts')!.group;
    const oldPropertiesGroup = added.find((panel) => panel.id === 'properties')!.group;

    ensurePropertiesDockedWithScripts(api as never);

    expect(added.find((panel) => panel.id === 'properties')?.group).toBe(scriptsGroup);
    expect(added.find((panel) => panel.id === 'settings')?.group).toBe(oldPropertiesGroup);
    expect(api.activePanel?.id).toBe('settings');
  });
});
