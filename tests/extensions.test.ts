import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_EXTENSION_TEMPLATE,
  EXTENSIONS_STORAGE_KEY,
  createExtensionRecord,
  loadExtensionRecords,
  normalizeExtensionRecords,
  persistExtensionRecords,
  useExtensionStore,
} from '../src/extensions/extension-store';
import { clearExtensionStorage, createAppApi, extensionStorageKey } from '../src/extensions/app-api';
import { startExtensionEventBridge } from '../src/extensions/events';
import { makeInstalledPackage } from '../src/extensions/package-validation';
import {
  createExtensionRegistry,
  extensionRegistry,
} from '../src/extensions/registry';
import {
  reloadEnabledExtensions,
  runExtensionRecord,
  runInstalledPackage,
} from '../src/extensions/runtime';
import { runScript } from '../src/scripting/runner';
import {
  addElement,
  addElementNodeToView,
  addView,
  createEmptyModel,
} from '../src/model/ops';
import { openView, replaceModel, setSelection } from '../src/model/store';
import { useStore } from '../src/ui/store-hooks';
import { memoryKeyValueStore, setDefaultKeyValueStoreForTests } from '../src/persistence/keyval';

function storage(initial?: unknown) {
  return memoryKeyValueStore(initial === undefined ? undefined : [[EXTENSIONS_STORAGE_KEY, initial]]);
}

let persistenceStore = memoryKeyValueStore();

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  persistenceStore = memoryKeyValueStore();
  setDefaultKeyValueStoreForTests(persistenceStore);
});

describe('extension records', () => {
  it('loads no extensions when storage is empty', async () => {
    await expect(loadExtensionRecords(storage())).resolves.toEqual([]);
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

  it('falls back to no extensions for unreadable records', async () => {
    await expect(loadExtensionRecords(storage('{broken'))).resolves.toEqual([]);
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

  it('persists normalized records', async () => {
    const s = storage();
    const record = createExtensionRecord('local.saved', 'Saved', 100);

    await persistExtensionRecords([record], s);

    expect(s.data.get(EXTENSIONS_STORAGE_KEY)).toEqual([record]);
  });

  it('preserves unreadable persisted source records across unrelated writes', async () => {
    const record = createExtensionRecord('local.saved', 'Saved', 100);
    const futureRecord = {
      id: 'local.future-source',
      schemaVersion: 99,
      name: 'Future source',
      version: '9.0.0',
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    };
    const s = storage([futureRecord, record]);

    await expect(loadExtensionRecords(s)).resolves.toEqual([record]);
    await persistExtensionRecords([{ ...record, enabled: false, updatedAt: 101 }], s);

    const written = s.data.get(EXTENSIONS_STORAGE_KEY) as unknown[];
    expect(written).toHaveLength(2);
    expect(written[0]).toEqual(futureRecord);
    expect(written[1]).toMatchObject({ id: record.id, enabled: false });
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

  it('stores extension-private values under the extension namespace', async () => {
    const registry = createExtensionRegistry();
    const app = createAppApi('local.audit', registry);

    await app.storage.set('threshold', 7);

    await expect(app.storage.get('threshold')).resolves.toBe(7);
    expect(persistenceStore.data.get(extensionStorageKey('local.audit'))).toMatchObject({
      threshold: 7,
    });

    await clearExtensionStorage('local.audit');

    expect(persistenceStore.data.get(extensionStorageKey('local.audit'))).toBeUndefined();
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
              async run() {
                await app.storage.set("manifestName", app.manifest.get().name);
                await app.storage.set("configEnabled", app.assets.json("data/config.json").enabled);
                await app.storage.set("text", app.assets.text("README.md"));
                await app.storage.set("packageId", app.extension.package().id);
                await app.storage.set("assetUrl", app.assets.url("assets/icon.svg"));
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

    const stored = persistenceStore.data.get(extensionStorageKey('local.assets')) as Record<
      string,
      unknown
    >;
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
              async run() {
                var view = app.views.active();
                var node = view.nodes()[0];
                view.layout({ nodes: { [node.id]: { x: 80, y: 90, width: 160, height: 70 } } });
                await app.storage.set("bounds", node.absoluteBounds());
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
    expect(persistenceStore.data.get(extensionStorageKey('local.layout'))).toMatchObject({
      bounds: { x: 80, y: 90, width: 160, height: 70 },
    });
  });

  it('clears partial registrations when a source extension fails to load', () => {
    const registry = createExtensionRegistry();
    const record = {
      id: 'local.partial',
      name: 'Partial',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.partial.before-error", { title: "Before", run() {} });
        throw new Error("load failed");
      `,
      createdAt: 1,
      updatedAt: 1,
    };

    expect(runExtensionRecord(record, registry).error).toMatch(/load failed/);

    expect(registry.getSnapshot().commands).toEqual([]);
  });

  it('forwards extension console output to the browser console with an extension prefix', () => {
    const registry = createExtensionRegistry();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const record = {
      id: 'local.logs',
      name: 'Logs',
      version: '0.1.0',
      enabled: true,
      source: 'console.log("ready", 7);',
      createdAt: 1,
      updatedAt: 1,
    };

    expect(runExtensionRecord(record, registry)).toEqual({});

    expect(spy).toHaveBeenCalledWith('[ext:local.logs]', 'ready 7');
    spy.mockRestore();
  });

  it('provides dialog window shims to extension source code', () => {
    const registry = createExtensionRegistry();
    const spy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const record = {
      id: 'local.window-shim',
      name: 'Window Shim',
      version: '0.1.0',
      enabled: true,
      source: 'window.alert("hello");',
      createdAt: 1,
      updatedAt: 1,
    };

    expect(runExtensionRecord(record, registry)).toEqual({});

    expect(spy).toHaveBeenCalledWith('hello');
    spy.mockRestore();
  });

  it('batches top-level extension load model mutations into one undo step', () => {
    replaceModel(createEmptyModel('Load Batch'), null);
    const registry = createExtensionRegistry();
    const record = {
      id: 'local.load-batch',
      name: 'Load Batch',
      version: '0.1.0',
      enabled: true,
      source: `
        model.createElement("BusinessActor", "Actor");
        model.createElement("BusinessRole", "Role");
      `,
      createdAt: 1,
      updatedAt: 1,
    };

    expect(runExtensionRecord(record, registry)).toEqual({});

    expect(useStore.getState().undoStack.map((tx) => tx.label)).toEqual([
      'Extension load: Load Batch',
    ]);
  });

  it('rejects a successful extension load immediately while its model store is busy', async () => {
    replaceModel(createEmptyModel('Busy load'), null);
    const registry = createExtensionRegistry();
    const gate = deferred();
    expect(runExtensionRecord({
      id: 'local.load-blocker',
      name: 'Load blocker',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.load-blocker.wait", {
          title: "Wait",
          async run(_context, args) { await args.gate; }
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});
    const blocker = registry.runCommand('local.load-blocker.wait', { gate: gate.promise });

    const result = runExtensionRecord({
      id: 'local.busy-success',
      name: 'Busy success',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.busy-success.command", {
          title: "Should not register",
          run() {}
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry);
    const registeredImmediately = registry.getSnapshot().commands
      .some((command) => command.id === 'local.busy-success.command');
    gate.resolve();
    await blocker;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.error).toMatch(/busy/i);
    expect(registeredImmediately).toBe(false);
    expect(registry.getSnapshot().commands.map((command) => command.id))
      .not.toContain('local.busy-success.command');
    expect(registry.getSnapshot().errors.at(-1)).toMatchObject({
      extensionId: 'local.busy-success',
      message: expect.stringMatching(/busy/i),
    });
  });

  it('preserves existing contributions when the same extension reload is busy', async () => {
    replaceModel(createEmptyModel('Busy reload'), null);
    const registry = createExtensionRegistry();
    const gate = deferred();
    expect(runExtensionRecord({
      id: 'local.busy-reload',
      name: 'Busy reload',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.busy-reload.wait", {
          title: "Wait",
          async run(_context, args) { await args.gate; }
        });
        app.commands.register("local.busy-reload.stable", {
          title: "Stable",
          run() { return "old contribution"; }
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});
    const blocker = registry.runCommand('local.busy-reload.wait', { gate: gate.promise });

    const result = runExtensionRecord({
      id: 'local.busy-reload',
      name: 'Busy reload',
      version: '0.2.0',
      enabled: true,
      source: `
        app.commands.register("local.busy-reload.replacement", {
          title: "Replacement",
          run() { return "new contribution"; }
        });
      `,
      createdAt: 1,
      updatedAt: 2,
    }, registry);
    const commandIdsWhileBusy = registry.getSnapshot().commands
      .map((command) => command.id);
    gate.resolve();
    await blocker;

    expect(result.error).toMatch(/busy/i);
    expect(commandIdsWhileBusy).toEqual([
      'local.busy-reload.wait',
      'local.busy-reload.stable',
    ]);
    await expect(registry.runCommand('local.busy-reload.stable'))
      .resolves.toBe('old contribution');
    expect(registry.getSnapshot().commands.map((command) => command.id))
      .not.toContain('local.busy-reload.replacement');
  });

  it('preserves every existing contribution when reload all is busy', async () => {
    replaceModel(createEmptyModel('Busy reload all'), null);
    const registry = createExtensionRegistry();
    const gate = deferred();
    const record = {
      id: 'local.busy-reload-all',
      name: 'Busy reload all',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.busy-reload-all.wait", {
          title: "Wait",
          async run(_context, args) { await args.gate; }
        });
        app.commands.register("local.busy-reload-all.stable", {
          title: "Stable",
          run() { return "old contribution"; }
        });
        app.toolbar.addButton({
          id: "local.busy-reload-all.button",
          label: "Stable",
          command: "local.busy-reload-all.stable"
        });
        app.menus.addItem("extensions.menu", {
          id: "local.busy-reload-all.menu",
          label: "Stable",
          command: "local.busy-reload-all.stable"
        });
        app.panels.register("local.busy-reload-all.panel", {
          title: "Stable",
          render() {}
        });
        app.events.on("app.ready", function(payload) { payload.handled(); });
      `,
      createdAt: 1,
      updatedAt: 1,
    };
    useExtensionStore.setState({ extensions: [record] });
    expect(runExtensionRecord(record, registry)).toEqual({});
    const blocker = registry.runCommand('local.busy-reload-all.wait', { gate: gate.promise });

    reloadEnabledExtensions(registry);
    const snapshotWhileBusy = registry.getSnapshot();
    gate.resolve();
    await blocker;

    try {
      expect(snapshotWhileBusy.commands.map((command) => command.id)).toEqual([
        'local.busy-reload-all.wait',
        'local.busy-reload-all.stable',
      ]);
      expect(snapshotWhileBusy.toolbarButtons.map((button) => button.id)).toEqual([
        'local.busy-reload-all.button',
      ]);
      expect(snapshotWhileBusy.menus['extensions.menu'].map((item) => item.id)).toEqual([
        'local.busy-reload-all.menu',
      ]);
      expect(snapshotWhileBusy.panels.map((panel) => panel.id)).toEqual([
        'local.busy-reload-all.panel',
      ]);
      let handled = false;
      await registry.emitEvent('app.ready', { handled() { handled = true; } });
      expect(handled).toBe(true);
      await expect(registry.runCommand('local.busy-reload-all.stable'))
        .resolves.toBe('old contribution');
      expect(registry.getSnapshot().errors.at(-1)).toMatchObject({
        extensionId: 'extensions.reload',
        message: expect.stringMatching(/busy/i),
      });
    } finally {
      useExtensionStore.setState({ extensions: [] });
    }
  });

  it('rejects a failing extension load before partial registration while busy', async () => {
    replaceModel(createEmptyModel('Busy failing load'), null);
    const registry = createExtensionRegistry();
    const gate = deferred();
    expect(runExtensionRecord({
      id: 'local.error-load-blocker',
      name: 'Error load blocker',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.error-load-blocker.wait", {
          title: "Wait",
          async run(_context, args) { await args.gate; }
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});
    const blocker = registry.runCommand('local.error-load-blocker.wait', { gate: gate.promise });

    const result = runExtensionRecord({
      id: 'local.busy-error',
      name: 'Busy error',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.busy-error.partial", {
          title: "Partial",
          run() {}
        });
        throw new Error("late load failure");
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry);
    if (result.error) {
      gate.resolve();
      await blocker;
    }

    expect(result.error).toMatch(/busy/i);
    expect(registry.getSnapshot().commands.map((command) => command.id))
      .not.toContain('local.busy-error.partial');
    expect(registry.getSnapshot().errors.at(-1)).toMatchObject({
      extensionId: 'local.busy-error',
      message: expect.stringMatching(/busy/i),
    });
  });

  it('records command errors without rejecting callers', async () => {
    const registry = createExtensionRegistry();
    registry.registerCommand('local.broken-command', {
      id: 'local.broken-command.fail',
      title: 'Fail',
      run: () => {
        throw new Error('command failed');
      },
    });

    await expect(registry.runCommand('local.broken-command.fail')).resolves.toBeUndefined();

    expect(registry.getSnapshot().errors[0]).toMatchObject({
      extensionId: 'local.broken-command',
      message: 'Error: command failed',
    });
  });

  it('records rejected runtime command and event callbacks after await', async () => {
    const registry = createExtensionRegistry();
    expect(runExtensionRecord({
      id: 'local.async-errors',
      name: 'Async errors',
      version: '0.1.0',
      enabled: true,
      source: `
        app.commands.register("local.async-errors.fail", {
          title: "Fail later",
          async run() {
            await Promise.resolve();
            throw new Error("async command failed");
          }
        });
        app.events.on("app.ready", async function() {
          await Promise.resolve();
          throw new Error("async event failed");
        });
      `,
      createdAt: 1,
      updatedAt: 1,
    }, registry)).toEqual({});

    await expect(registry.runCommand('local.async-errors.fail')).resolves.toBeUndefined();
    await expect(registry.emitEvent('app.ready')).resolves.toBeUndefined();

    expect(registry.getSnapshot().errors.map((error) => error.message)).toEqual([
      'Error: async command failed',
      'Error: async event failed',
    ]);
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

  it('lets extensions unregister event handlers', async () => {
    const registry = createExtensionRegistry();
    let count = 0;
    const handler = () => {
      count += 1;
    };
    registry.onEvent('local.audit', 'app.ready', handler);
    registry.offEvent('local.audit', 'app.ready', handler);

    await registry.emitEvent('app.ready');

    expect(count).toBe(0);
  });

  it('emits script.error when a user script fails', () => {
    replaceModel(createEmptyModel('Script Error'), null);
    const payloads: unknown[] = [];
    extensionRegistry.onEvent('local.audit', 'script.error', (payload) => payloads.push(payload));

    const result = runScript('throw new Error("script exploded");', () => undefined);

    expect(result.error).toBe('Error: script exploded');
    expect(payloads).toEqual([
      {
        message: 'Error: script exploded',
      },
    ]);
  });
});
