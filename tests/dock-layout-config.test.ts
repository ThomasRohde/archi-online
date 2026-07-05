import { describe, expect, it } from 'vitest';
import {
  TOOL_PANELS,
  buildDefaultLayout,
  ensurePropertiesDockedWithScripts,
} from '../src/ui/dock/layout-config';

interface Group {
  id: string;
}

interface AddedPanel {
  id: string;
  component: string;
  title: string;
  position?: { referencePanel?: string; direction: string };
  initialHeight?: number;
  initialWidth?: number;
  group?: Group;
}

function createDockApi() {
  const added: AddedPanel[] = [];
  let groupCount = 0;
  let activePanelId: string | undefined;
  const api = {
    panels: added,
    addPanel(panel: AddedPanel) {
      const reference = panel.position?.referencePanel
        ? added.find((candidate) => candidate.id === panel.position?.referencePanel)
        : undefined;
      panel.group =
        panel.position?.direction === 'within' && reference?.group
          ? reference.group
          : { id: `group-${++groupCount}` };
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
