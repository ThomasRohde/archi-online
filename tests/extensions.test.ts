import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_EXTENSION_TEMPLATE,
  EXTENSIONS_STORAGE_KEY,
  createExtensionRecord,
  loadExtensionRecords,
  normalizeExtensionRecords,
  persistExtensionRecords,
} from '../src/extensions/extension-store';
import { createAppApi } from '../src/extensions/app-api';
import { startExtensionEventBridge } from '../src/extensions/events';
import { makeInstalledPackage } from '../src/extensions/package-validation';
import {
  createExtensionRegistry,
  extensionRegistry,
} from '../src/extensions/registry';
import { runExtensionRecord, runInstalledPackage } from '../src/extensions/runtime';
import {
  addElement,
  addElementNodeToView,
  addView,
  createEmptyModel,
} from '../src/model/ops';
import { openView, replaceModel, setSelection, useStore } from '../src/model/store';

function storage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(EXTENSIONS_STORAGE_KEY, initial);
  return {
    data,
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

function browserStorage() {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

describe('extension records', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', browserStorage());
    localStorage.clear();
  });

  it('loads no extensions when storage is empty', () => {
    expect(loadExtensionRecords(storage())).toEqual([]);
  });

  it('normalizes valid persisted records and ignores unknown fields', () => {
    const records = normalizeExtensionRecords([
      {
        id: 'local.audit',
        name: 'Audit',
        version: '0.1.0',
        enabled: true,
        source: 'app.extension({ id: "local.audit", name: "Audit", version: "0.1.0" });',
        createdAt: 10,
        updatedAt: 20,
        unknown: 'ignored',
      },
    ]);

    expect(records).toEqual([
      {
        id: 'local.audit',
        name: 'Audit',
        version: '0.1.0',
        enabled: true,
        source: 'app.extension({ id: "local.audit", name: "Audit", version: "0.1.0" });',
        createdAt: 10,
        updatedAt: 20,
      },
    ]);
  });

  it('falls back to no extensions for invalid JSON', () => {
    expect(loadExtensionRecords(storage('{broken'))).toEqual([]);
  });

  it('creates a manifest-shaped template extension', () => {
    const record = createExtensionRecord('local.my-extension', 'My extension', 1234);

    expect(record).toEqual({
      id: 'local.my-extension',
      name: 'My extension',
      version: '0.1.0',
      enabled: true,
      source: DEFAULT_EXTENSION_TEMPLATE,
      createdAt: 1234,
      updatedAt: 1234,
    });
  });

  it('persists normalized records', () => {
    const s = storage();
    const record = createExtensionRecord('local.saved', 'Saved', 100);

    persistExtensionRecords([record], s);

    expect(JSON.parse(s.data.get(EXTENSIONS_STORAGE_KEY) ?? '[]')).toEqual([record]);
  });
});

describe('extension registry', () => {
  beforeEach(() => {
    extensionRegistry.clearAll();
    replaceModel(null, null, false);
  });

  it('registers commands and runs them through the command API', async () => {
    const registry = createExtensionRegistry();
    const calls: unknown[] = [];

    registry.registerCommand('local.audit', {
      id: 'local.audit.count',
      title: 'Count',
      run: (_context, args) => calls.push(args),
    });

    await registry.runCommand('local.audit.count', { answer: 42 });

    expect(calls).toEqual([{ answer: 42 }]);
    expect(registry.getSnapshot().commands.map((command) => command.id)).toEqual([
      'local.audit.count',
    ]);
  });

  it('rejects duplicate contribution ids', () => {
    const registry = createExtensionRegistry();
    registry.registerCommand('local.one', {
      id: 'local.shared.command',
      title: 'One',
      run: () => undefined,
    });

    expect(() =>
      registry.registerCommand('local.two', {
        id: 'local.shared.command',
        title: 'Two',
        run: () => undefined,
      }),
    ).toThrow(/Duplicate command id/);
  });

  it('clears all live contributions for one extension', () => {
    const registry = createExtensionRegistry();
    registry.registerCommand('local.audit', {
      id: 'local.audit.count',
      title: 'Count',
      run: () => undefined,
    });
    registry.addToolbarButton('local.audit', {
      id: 'local.audit.button',
      label: 'Count',
      command: 'local.audit.count',
    });

    registry.clearExtension('local.audit');

    expect(registry.getSnapshot().commands).toEqual([]);
    expect(registry.getSnapshot().toolbarButtons).toEqual([]);
  });

  it('notifies subscribers when contributions change', () => {
    const registry = createExtensionRegistry();
    let seen = 0;
    const unsubscribe = registry.subscribe(() => {
      seen += 1;
    });

    registry.registerCommand('local.audit', {
      id: 'local.audit.count',
      title: 'Count',
      run: () => undefined,
    });
    unsubscribe();
    registry.clearExtension('local.audit');

    expect(seen).toBe(1);
  });

  it('returns a stable snapshot object between registry changes', () => {
    const registry = createExtensionRegistry();
    const before = registry.getSnapshot();

    expect(registry.getSnapshot()).toBe(before);

    registry.registerCommand('local.audit', {
      id: 'local.audit.count',
      title: 'Count',
      run: () => undefined,
    });
    const after = registry.getSnapshot();

    expect(after).not.toBe(before);
    expect(registry.getSnapshot()).toBe(after);
  });

  it('exposes a singleton registry for UI surfaces', () => {
    expect(extensionRegistry.getSnapshot().commands).toEqual([]);
  });
});

describe('extension app API and runtime', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', browserStorage());
    localStorage.clear();
    extensionRegistry.clearAll();
    replaceModel(null, null, false);
  });

  it('registers contributions from a source string', () => {
    const registry = createExtensionRegistry();
    const record = {
      id: 'local.audit',
      name: 'Audit',
      version: '0.1.0',
      enabled: true,
      source: `
        app.extension({ id: "local.audit", name: "Audit", version: "0.1.0" });
        app.commands.register("local.audit.count", { title: "Count", run() {} });
        app.toolbar.addButton({ id: "local.audit.button", label: "Count", command: "local.audit.count" });
        app.menus.addItem("extensions.menu", { id: "local.audit.menu", label: "Count", command: "local.audit.count" });
        app.panels.register("local.audit.panel", { title: "Audit", render(container) { container.textContent = "Audit"; } });
      `,
      createdAt: 1,
      updatedAt: 1,
    };

    expect(runExtensionRecord(record, registry)).toEqual({});
    expect(registry.getSnapshot().commands.map((command) => command.id)).toEqual([
      'local.audit.count',
    ]);
    expect(registry.getSnapshot().toolbarButtons.map((button) => button.id)).toEqual([
      'local.audit.button',
    ]);
    expect(registry.getSnapshot().menus['extensions.menu'].map((item) => item.id)).toEqual([
      'local.audit.menu',
    ]);
    expect(registry.getSnapshot().panels.map((panel) => panel.id)).toEqual([
      'local.audit.panel',
    ]);
  });

  it('records runtime errors without throwing to the app shell', () => {
    const registry = createExtensionRegistry();
    const record = {
      id: 'local.broken',
      name: 'Broken',
      version: '0.1.0',
      enabled: true,
      source: 'throw new Error("broken extension");',
      createdAt: 1,
      updatedAt: 1,
    };

    expect(runExtensionRecord(record, registry).error).toMatch(/broken extension/);
    expect(registry.getSnapshot().errors[0]).toMatchObject({
      extensionId: 'local.broken',
      message: 'Error: broken extension',
    });
  });

  it('stores extension-private values under the extension namespace', () => {
    const registry = createExtensionRegistry();
    const app = createAppApi('local.audit', registry);

    app.storage.set('threshold', 7);

    expect(app.storage.get('threshold')).toBe(7);
    expect(localStorage.getItem('archi-online.extension-storage.v1.local.audit')).toContain(
      '"threshold":7',
    );
  });

  it('exposes active views and current selection through app APIs', () => {
    replaceModel(createEmptyModel('API'), null);
    const registry = createExtensionRegistry();
    const viewId = addView('Main');
    const actorId = addElement('BusinessActor', 'Actor');
    const nodeId = addElementNodeToView(
      viewId,
      actorId,
      viewId,
      { x: 10, y: 20, width: 120, height: 55 },
      false,
    );
    openView(viewId);
    setSelection('view', [nodeId, actorId, 'missing-id']);

    const app = createAppApi('local.audit', registry);

    expect(app.views.active()?.id).toBe(viewId);
    expect(app.views.get(viewId)?.name).toBe('Main');
    expect(app.views.open(viewId)?.id).toBe(viewId);
    expect(app.views.get('missing-id')).toBeNull();
    expect(app.views.all().map((view) => view.id)).toEqual([viewId]);
    expect(app.selection.ids()).toEqual([nodeId, actorId, 'missing-id']);
    expect(app.selection.items().map((item) => `${item.kind}:${item.id}`)).toEqual([
      `visual:${nodeId}`,
      `element:${actorId}`,
    ]);
    expect(app.selection.visuals().map((visual) => visual.id)).toEqual([nodeId]);

    app.selection.clear();

    expect(useStore.getState().selection.ids).toEqual([]);
  });

  it('exposes package manifest and asset helpers to package-owned extensions', async () => {
    const registry = createExtensionRegistry();
    const pkg = makeInstalledPackage({
      manifest: {
        schemaVersion: 2,
        id: 'local.assets',
        name: 'Assets',
        version: '1.0.0',
        main: 'main.js',
      },
      files: {
        'manifest.json': {
          encoding: 'utf8',
          content: JSON.stringify({
            schemaVersion: 2,
            id: 'local.assets',
            name: 'Assets',
            version: '1.0.0',
            main: 'main.js',
          }),
        },
        'main.js': {
          encoding: 'utf8',
          content: `
            app.extension({ id: "local.assets", name: "Assets", version: "1.0.0" });
            app.commands.register("local.assets.read", {
              title: "Read",
              run() {
                app.storage.set("manifestName", app.manifest.get().name);
                app.storage.set("configEnabled", app.assets.json("data/config.json").enabled);
                app.storage.set("text", app.assets.text("README.md"));
                app.storage.set("packageId", app.extension.package().id);
                app.storage.set("assetUrl", app.assets.url("assets/icon.svg"));
              }
            });
          `,
        },
        'README.md': { encoding: 'utf8', content: 'Package readme' },
        'data/config.json': { encoding: 'utf8', content: '{"enabled":true}' },
        'assets/icon.svg': {
          encoding: 'base64',
          mediaType: 'image/svg+xml',
          content: 'PHN2Zy8+',
        },
      },
      now: 1,
    });

    expect(runInstalledPackage(pkg, registry)).toEqual({});

    await registry.runCommand('local.assets.read');

    const stored = JSON.parse(
      localStorage.getItem('archi-online.extension-storage.v1.local.assets') ?? '{}',
    );
    expect(stored).toMatchObject({
      manifestName: 'Assets',
      configEnabled: true,
      text: 'Package readme',
      packageId: 'local.assets',
    });
    expect(stored.assetUrl).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('lets a packaged command layout the active view', async () => {
    replaceModel(createEmptyModel('Package Layout'), null);
    const registry = createExtensionRegistry();
    const viewId = addView('Active');
    const actorId = addElement('BusinessActor', 'Actor');
    const nodeId = addElementNodeToView(
      viewId,
      actorId,
      viewId,
      { x: 10, y: 20, width: 120, height: 55 },
      false,
    );
    openView(viewId);
    const pkg = makeInstalledPackage({
      manifest: {
        schemaVersion: 2,
        id: 'local.layout',
        name: 'Layout',
        version: '1.0.0',
        main: 'main.js',
      },
      files: {
        'manifest.json': {
          encoding: 'utf8',
          content: JSON.stringify({
            schemaVersion: 2,
            id: 'local.layout',
            name: 'Layout',
            version: '1.0.0',
            main: 'main.js',
          }),
        },
        'main.js': {
          encoding: 'utf8',
          content: `
            app.extension({ id: "local.layout", name: "Layout", version: "1.0.0" });
            app.commands.register("local.layout.apply", {
              title: "Layout",
              run() {
                var view = app.views.active();
                var node = view.nodes()[0];
                view.layout({ nodes: { [node.id]: { x: 80, y: 90, width: 160, height: 70 } } });
                app.storage.set("bounds", node.absoluteBounds());
              }
            });
          `,
        },
      },
      now: 1,
    });

    expect(runInstalledPackage(pkg, registry)).toEqual({});

    await registry.runCommand('local.layout.apply');

    expect(useStore.getState().model!.nodes[nodeId].bounds).toEqual({
      x: 80,
      y: 90,
      width: 160,
      height: 70,
    });
    expect(
      JSON.parse(localStorage.getItem('archi-online.extension-storage.v1.local.layout') ?? '{}'),
    ).toMatchObject({
      bounds: { x: 80, y: 90, width: 160, height: 70 },
    });
  });
});

describe('extension events', () => {
  beforeEach(() => {
    extensionRegistry.clearAll();
    replaceModel(null, null, false);
  });

  it('emits selection.changed when the app selection changes', async () => {
    const registry = createExtensionRegistry();
    const payloads: unknown[] = [];
    registry.onEvent('local.audit', 'selection.changed', (payload) => payloads.push(payload));
    const stop = startExtensionEventBridge(registry);

    setSelection('tree', ['element-1']);

    stop();
    expect(payloads).toEqual([{ source: 'tree', ids: ['element-1'] }]);
  });

  it('debounces model.changed events', async () => {
    vi.useFakeTimers();
    const registry = createExtensionRegistry();
    let count = 0;
    registry.onEvent('local.audit', 'model.changed', () => {
      count += 1;
    });
    const stop = startExtensionEventBridge(registry, 10);

    replaceModel(createEmptyModel('One'), null, false);
    replaceModel(createEmptyModel('Two'), null, false);
    vi.advanceTimersByTime(10);
    await Promise.resolve();

    stop();
    expect(count).toBe(1);
    vi.useRealTimers();
    useStore.setState({ model: null });
  });
});
