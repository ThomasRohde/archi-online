import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { extensionStorageKey } from '../src/extensions/app-api';
import { readExtensionArchive } from '../src/extensions/package-archive';
import { createExtensionRegistry, type ExtensionRegistry } from '../src/extensions/registry';
import { runInstalledPackage } from '../src/extensions/runtime';
import {
  addElement,
  addRelationship,
  createEmptyModel,
  deleteItems,
  layoutView,
  renameItem,
} from '../src/model/ops';
import { replaceModel } from '../src/model/store';
import type { ElementNode } from '../src/model/types';
import { memoryKeyValueStore, setDefaultKeyValueStoreForTests } from '../src/persistence/keyval';
import { useStore } from '../src/ui/store-hooks';

const extensionFolder = join(process.cwd(), 'extensions', 'capability-map');

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
  visit(extensionFolder);
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
      'archi-online.capability-map.generate',
      'archi-online.capability-map.heatmap',
      'archi-online.capability-map.open',
      'archi-online.capability-map.repack',
      'archi-online.capability-map.sync',
    ]);
    expect((snapshot.menus['model-tree.context'] ?? []).some((menu) =>
      menu.command === 'archi-online.capability-map.generate')).toBe(true);
    expect(snapshot.panels.some((panel) =>
      panel.id === 'archi-online.capability-map.panel')).toBe(true);
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
      'archi-online.capability-map.generate',
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
      'archi-online.capability-map.generate',
      undefined,
      { targetId: 'not-an-element', selectionIds: [] },
    );
    await new Promise((resolve) => window.setTimeout(resolve, 25));
    expect(Object.keys(useStore.getState().model!.views)).toHaveLength(0);
  });

  it('uses the frontier engine for generate and explicitly repacks roots', async () => {
    const registry = await loadExtension();
    const insurance = addElement('Capability', 'Insurance');
    const claims = addElement('Capability', 'Claims');
    const people = addElement('Capability', 'People');
    const workforce = addElement('Capability', 'Workforce Planning');
    addRelationship('CompositionRelationship', insurance, claims);
    addRelationship('CompositionRelationship', people, workforce);

    void registry.runCommand(
      'archi-online.capability-map.generate',
      undefined,
      { targetId: insurance, selectionIds: [insurance, people] },
    );
    await until(() => Object.keys(useStore.getState().model!.views).length > 0);
    const generated = useStore.getState().model!;
    const view = Object.values(generated.views)[0];
    const rootNodes = Object.values(generated.nodes).filter((node) =>
      node.viewId === view.id && node.nodeType === 'element' && node.parentId === view.id);
    expect(rootNodes).toHaveLength(2);
    expect(rootNodes.some((node) => node.bounds.width !== 120 || node.bounds.height !== 55)).toBe(true);

    const moved = rootNodes[1];
    layoutView([{
      id: moved.id,
      bounds: { ...moved.bounds, x: moved.bounds.x + 1000 },
    }], []);
    const movedX = useStore.getState().model!.nodes[moved.id].bounds.x;
    await registry.runCommand('archi-online.capability-map.repack');
    expect(useStore.getState().model!.nodes[moved.id].bounds.x).not.toBe(movedX);
  });

  it('syncs add, remove, reparent, and rename changes as one command action', async () => {
    const registry = await loadExtension();
    const root = addElement('Capability', 'Insurance');
    const claims = addElement('Capability', 'Claims');
    const billing = addElement('Capability', 'Billing');
    const servicing = addElement('Capability', 'Servicing');
    const fraud = addElement('Capability', 'Fraud');
    addRelationship('CompositionRelationship', root, claims);
    addRelationship('CompositionRelationship', root, billing);
    const servicingRelationship = addRelationship('CompositionRelationship', root, servicing);
    const fraudRelationship = addRelationship('CompositionRelationship', claims, fraud);

    void registry.runCommand(
      'archi-online.capability-map.generate',
      undefined,
      { targetId: root, selectionIds: [] },
    );
    await until(() => Object.keys(useStore.getState().model!.views).length > 0);

    const analytics = addElement('Capability', 'Analytics');
    addRelationship('CompositionRelationship', root, analytics);
    expect(servicingRelationship).not.toBeNull();
    expect(fraudRelationship).not.toBeNull();
    deleteItems([servicingRelationship!, fraudRelationship!]);
    addRelationship('CompositionRelationship', billing, fraud);
    renameItem(claims, 'Claims and Case Management');
    const before = useStore.getState().undoStack.length;

    await registry.runCommand('archi-online.capability-map.sync');

    const current = useStore.getState();
    expect(current.undoStack).toHaveLength(before + 1);
    const view = Object.values(current.model!.views)[0];
    const nodes = Object.values(current.model!.nodes).filter((node): node is ElementNode =>
      node.viewId === view.id && node.nodeType === 'element');
    expect(nodes.map((node) => node.elementId).sort())
      .toEqual([root, claims, billing, fraud, analytics].sort());
    const billingNode = nodes.find((node) => node.elementId === billing)!;
    const fraudNode = nodes.find((node) => node.elementId === fraud)!;
    expect(fraudNode.parentId).toBe(billingNode.id);
    expect(current.model!.elements[claims].name).toBe('Claims and Case Management');
  });

  it('renders stored panel options after re-render', async () => {
    const registry = await loadExtension();
    await persistenceStore.set(extensionStorageKey('archi-online.capability-map'), {
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
      .panels.find((candidate) => candidate.id === 'archi-online.capability-map.panel');
    const container = document.createElement('div');
    panel?.render(container);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect([...container.querySelectorAll('select')].map((select) => select.value))
      .toEqual(['treemap', 'frontier', 'text-aware', 'weight']);
    expect([...container.querySelectorAll('input[type="text"]')].map(
      (input) => (input as HTMLInputElement).value,
    )).toEqual(['headcount', 'maturity', '']);
  });

  it('preserves explicit legacy grid settings in extension storage', async () => {
    const registry = await loadExtension();
    await persistenceStore.set(extensionStorageKey('archi-online.capability-map'), {
      options: {
        mode: 'grid',
        gridAlgorithm: 'balanced-rows',
        leafSizing: 'fixed',
        sort: 'name',
      },
    });
    const panel = registry
      .getSnapshot()
      .panels.find((candidate) => candidate.id === 'archi-online.capability-map.panel');
    const container = document.createElement('div');
    panel?.render(container);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect([...container.querySelectorAll('select')].map((select) => select.value))
      .toEqual(['grid', 'balanced-rows', 'fixed', 'name']);
  });
});
