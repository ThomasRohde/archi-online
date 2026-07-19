import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { extensionStorageKey } from '../src/extensions/app-api';
import { readExtensionArchive } from '../src/extensions/package-archive';
import { createExtensionRegistry, type ExtensionRegistry } from '../src/extensions/registry';
import { runInstalledPackage } from '../src/extensions/runtime';
import { addElement, addRelationship, createEmptyModel } from '../src/model/ops';
import { replaceModel } from '../src/model/store';
import { memoryKeyValueStore, setDefaultKeyValueStoreForTests } from '../src/persistence/keyval';
import { useStore } from '../src/ui/store-hooks';

const exampleFolder = join(process.cwd(), 'extensions', 'capability-map');

function archiveBytes(): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const visit = (dir: string, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const archivePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(path, archivePath);
      else files[archivePath] = readFileSync(path);
    }
  };
  visit(exampleFolder);
  return zipSync(files);
}

async function loadExtension(): Promise<ExtensionRegistry> {
  const pkg = await readExtensionArchive(archiveBytes(), 100);
  const registry = createExtensionRegistry();
  expect(runInstalledPackage(pkg, registry)).toEqual({});
  return registry;
}

async function until(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => window.setTimeout(resolve, 5));
  }
}

let persistenceStore = memoryKeyValueStore();

describe('capability-map extension', () => {
  beforeEach(() => {
    persistenceStore = memoryKeyValueStore();
    setDefaultKeyValueStoreForTests(persistenceStore);
    replaceModel(createEmptyModel('Capability Ext'), null);
  });

  it('registers commands, menus, and the panel', async () => {
    const registry = await loadExtension();
    const snapshot = registry.getSnapshot();
    expect(snapshot.commands.map((command) => command.id).sort()).toEqual([
      'examples.capability-map.generate',
      'examples.capability-map.heatmap',
      'examples.capability-map.open',
      'examples.capability-map.repack',
      'examples.capability-map.sync',
    ]);
    expect((snapshot.menus['model-tree.context'] ?? []).some((menu) =>
      menu.command === 'examples.capability-map.generate')).toBe(true);
    expect(snapshot.panels.some((panel) =>
      panel.id === 'examples.capability-map.panel')).toBe(true);
  });

  it('generates a packed capability map from a model-tree trigger', async () => {
    const registry = await loadExtension();
    const root = addElement('Capability', 'Insurance');
    const claims = addElement('Capability', 'Claims');
    const fraud = addElement('Capability', 'Fraud Detection');
    addRelationship('CompositionRelationship', root, claims);
    addRelationship('CompositionRelationship', claims, fraud);

    // The success dialog keeps the command promise pending in tests
    // (no dialog host is mounted), so observe the store instead of awaiting.
    void registry.runCommand(
      'examples.capability-map.generate',
      undefined,
      { targetId: root, selectionIds: [] },
    );
    await until(() => Object.keys(useStore.getState().model!.views).length > 0);

    const model = useStore.getState().model!;
    const view = Object.values(model.views)[0];
    expect(view.name).toBe('Insurance — Capability Map');
    const nodes = Object.values(model.nodes).filter((node) => node.viewId === view.id);
    expect(nodes).toHaveLength(3);
    expect(Object.values(model.connections)).toHaveLength(0);
  });

  it('ignores non-element ids in the generate trigger', async () => {
    const registry = await loadExtension();
    void registry.runCommand(
      'examples.capability-map.generate',
      undefined,
      { targetId: 'not-an-element', selectionIds: [] },
    );
    await new Promise((resolve) => window.setTimeout(resolve, 25));
    expect(Object.keys(useStore.getState().model!.views)).toHaveLength(0);
  });

  it('renders stored panel options after re-render', async () => {
    const registry = await loadExtension();
    await persistenceStore.set(extensionStorageKey('examples.capability-map'), {
      options: {
        mode: 'treemap',
        sort: 'weight',
        depth: 3,
        leafWidth: 100,
        leafHeight: 40,
        padding: 8,
        gutter: 6,
        targetAspect: 2,
        weightProperty: 'headcount',
        heatmapProperty: 'maturity',
        levelFills: '',
      },
    });
    const panel = registry
      .getSnapshot()
      .panels.find((candidate) => candidate.id === 'examples.capability-map.panel');
    const container = document.createElement('div');
    panel?.render(container);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect([...container.querySelectorAll('select')].map((select) => select.value))
      .toEqual(['treemap', 'weight']);
    expect([...container.querySelectorAll('input[type="text"]')].map(
      (input) => (input as HTMLInputElement).value,
    )).toEqual(['headcount', 'maturity', '']);
  });
});
