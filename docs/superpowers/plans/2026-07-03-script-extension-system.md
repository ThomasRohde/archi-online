# Script Extension System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build trusted browser-profile-local script extensions that can register commands, toolbar/menu items, dock panels, app events, and private storage without becoming model data.

**Architecture:** Add a framework-neutral extension runtime under `src/extensions/` with a persisted local record store, a live contribution registry, and an `app` API injected beside existing jArchi globals. React UI surfaces subscribe to the registry and use the existing Dockview layout bus, toolbar menu, context menu, Monaco editor, and app dialog host.

**Tech Stack:** Vite, React, TypeScript, Zustand, Vitest, Dockview, Monaco, browser `localStorage`.

---

## File Structure

- Create `src/extensions/types.ts` for extension records, contribution contracts, event names, contexts, and runtime status types.
- Create `src/extensions/extension-store.ts` for persisted browser-local records, validation, template creation, and a separate Zustand store.
- Create `src/extensions/registry.ts` for live commands, toolbar items, menu items, panels, event handlers, errors, subscriptions, clearing, and command execution.
- Create `src/extensions/app-api.ts` for the trusted script-facing `app` object and extension-local storage.
- Create `src/extensions/runtime.ts` for running enabled extension records with `$`, `model`, `console`, `app`, `window`, and `exit`.
- Create `src/extensions/events.ts` for app/model/view event bridge helpers and debounced `model.changed`.
- Create `src/ui/ExtensionsPanel.tsx` for local extension management.
- Create `src/ui/ExtensionPanelHost.tsx` for docked DOM-rendered extension panels.
- Modify `src/ui/dock/layout-config.tsx` to add the Extensions tool panel and dynamic extension panel host.
- Modify `src/ui/layout-bus.ts` and `src/ui/DockLayout.tsx` to focus/open extension panels by registry panel id.
- Modify `src/ui/Toolbar.tsx` to show extension toolbar buttons and an Extensions menu.
- Modify `src/ui/ContextMenu.tsx`, `src/ui/ModelTree.tsx`, and `src/canvas/view-editor/contextMenu.ts` to append extension context menu contributions.
- Modify `src/App.tsx` and `src/persistence/files.ts` to start the extension runtime after boot and emit app/model/save lifecycle events.
- Modify `src/scripting/jarchi-dts.ts` to document the `app` global in Monaco.
- Add `tests/extensions.test.ts` for store, registry, runtime, API, and event behavior.

### Task 1: Baseline And First Extension Store Tests

**Files:**
- Create: `tests/extensions.test.ts`
- Create: `src/extensions/types.ts`
- Create: `src/extensions/extension-store.ts`

- [ ] **Step 1: Run baseline tests on the feature branch**

Run: `npm test`

Expected: all existing tests pass before feature work starts.

- [ ] **Step 2: Write failing persisted-record tests**

Add this initial test block to `tests/extensions.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_EXTENSION_TEMPLATE,
  EXTENSIONS_STORAGE_KEY,
  createExtensionRecord,
  loadExtensionRecords,
  normalizeExtensionRecords,
  persistExtensionRecords,
} from '../src/extensions/extension-store';

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

describe('extension records', () => {
  beforeEach(() => {
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
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npm test -- tests/extensions.test.ts`

Expected: fail with module-not-found for `src/extensions/extension-store`.

- [ ] **Step 4: Implement minimal extension record types and store helpers**

Create `src/extensions/types.ts` with:

```ts
export interface LocalExtensionRecord {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  source: string;
  createdAt: number;
  updatedAt: number;
}
```

Create `src/extensions/extension-store.ts` with:

```ts
import { create } from 'zustand';
import type { LocalExtensionRecord } from './types';

export const EXTENSIONS_STORAGE_KEY = 'archi-online.extensions.v1';

export const DEFAULT_EXTENSION_TEMPLATE = `app.extension({
  id: "local.my-extension",
  name: "My extension",
  version: "0.1.0"
});

app.commands.register("local.my-extension.hello", {
  title: "Hello",
  run() {
    app.dialogs.info("Hello", "Extension is working.");
  }
});

app.toolbar.addButton({
  id: "local.my-extension.helloButton",
  label: "Hello",
  command: "local.my-extension.hello"
});
`;

type ExtensionStorage = Pick<Storage, 'getItem' | 'setItem'>;

function storageOrNull(): ExtensionStorage | null {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return null;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRecord(value: unknown): LocalExtensionRecord | null {
  if (!isRecord(value)) return null;
  const { id, name, version, enabled, source, createdAt, updatedAt } = value;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof version !== 'string' ||
    typeof enabled !== 'boolean' ||
    typeof source !== 'string' ||
    typeof createdAt !== 'number' ||
    typeof updatedAt !== 'number' ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(updatedAt)
  ) {
    return null;
  }
  return { id, name, version, enabled, source, createdAt, updatedAt };
}

export function normalizeExtensionRecords(value: unknown): LocalExtensionRecord[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const records: LocalExtensionRecord[] = [];
  for (const item of value) {
    const record = normalizeRecord(item);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    records.push(record);
  }
  return records;
}

export function loadExtensionRecords(
  storage: ExtensionStorage | null = storageOrNull(),
): LocalExtensionRecord[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(EXTENSIONS_STORAGE_KEY);
    if (!raw) return [];
    return normalizeExtensionRecords(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function persistExtensionRecords(
  records: LocalExtensionRecord[],
  storage: ExtensionStorage | null = storageOrNull(),
): void {
  if (!storage) return;
  try {
    storage.setItem(EXTENSIONS_STORAGE_KEY, JSON.stringify(normalizeExtensionRecords(records)));
  } catch {
    /* localStorage failures should not block editing */
  }
}

export function createExtensionRecord(
  id: string,
  name: string,
  now = Date.now(),
): LocalExtensionRecord {
  return {
    id,
    name,
    version: '0.1.0',
    enabled: true,
    source: DEFAULT_EXTENSION_TEMPLATE,
    createdAt: now,
    updatedAt: now,
  };
}

interface ExtensionStoreState {
  extensions: LocalExtensionRecord[];
  setExtensions(records: LocalExtensionRecord[]): void;
  upsert(record: LocalExtensionRecord): void;
  remove(id: string): void;
  setEnabled(id: string, enabled: boolean): void;
}

function commit(records: LocalExtensionRecord[]): LocalExtensionRecord[] {
  const normalized = normalizeExtensionRecords(records);
  persistExtensionRecords(normalized);
  return normalized;
}

export const useExtensionStore = create<ExtensionStoreState>((set) => ({
  extensions: loadExtensionRecords(),
  setExtensions: (records) => set({ extensions: commit(records) }),
  upsert: (record) =>
    set((state) => ({
      extensions: commit([
        ...state.extensions.filter((existing) => existing.id !== record.id),
        { ...record, updatedAt: Date.now() },
      ]),
    })),
  remove: (id) =>
    set((state) => ({ extensions: commit(state.extensions.filter((record) => record.id !== id)) })),
  setEnabled: (id, enabled) =>
    set((state) => ({
      extensions: commit(
        state.extensions.map((record) =>
          record.id === id ? { ...record, enabled, updatedAt: Date.now() } : record,
        ),
      ),
    })),
}));
```

- [ ] **Step 5: Run focused test and verify GREEN**

Run: `npm test -- tests/extensions.test.ts`

Expected: `tests/extensions.test.ts` passes.

### Task 2: Live Registry And Command Execution

**Files:**
- Modify: `src/extensions/types.ts`
- Create: `src/extensions/registry.ts`
- Modify: `tests/extensions.test.ts`

- [ ] **Step 1: Add failing registry tests**

Append this block to `tests/extensions.test.ts`:

```ts
import {
  createExtensionRegistry,
  extensionRegistry,
} from '../src/extensions/registry';

describe('extension registry', () => {
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

  it('exposes a singleton registry for UI surfaces', () => {
    expect(extensionRegistry.getSnapshot().commands).toEqual([]);
  });
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm test -- tests/extensions.test.ts`

Expected: fail with module-not-found for `src/extensions/registry`.

- [ ] **Step 3: Add contribution types**

Extend `src/extensions/types.ts` with command, toolbar, menu, panel, event, status, and snapshot interfaces:

```ts
export interface ExtensionCommandContext {
  extensionId: string;
  activeViewId: string | null;
  selectionIds: string[];
  trigger?: unknown;
}

export interface ExtensionCommand {
  id: string;
  title: string;
  description?: string;
  run(context: ExtensionCommandContext, args?: unknown): unknown | Promise<unknown>;
}

export interface ExtensionToolbarButton {
  id: string;
  label: string;
  command: string;
}

export type ExtensionMenuLocation =
  | 'extensions.menu'
  | 'model-tree.context'
  | 'view.context'
  | 'selection.context';

export interface ExtensionMenuItem {
  id: string;
  label: string;
  command: string;
  danger?: boolean;
}

export interface ExtensionPanel {
  id: string;
  title: string;
  render(container: HTMLElement): void | (() => void);
}

export interface ExtensionRuntimeError {
  extensionId: string;
  message: string;
  time: number;
}

export type ExtensionEventName =
  | 'app.ready'
  | 'model.opened'
  | 'model.changed'
  | 'model.saved'
  | 'selection.changed'
  | 'view.opened'
  | 'view.activated'
  | 'view.contextMenu'
  | 'tree.contextMenu'
  | 'script.error';

export type ExtensionEventHandler = (payload: unknown) => unknown | Promise<unknown>;

export interface ExtensionRegistrySnapshot {
  commands: ExtensionCommand[];
  toolbarButtons: ExtensionToolbarButton[];
  menus: Record<ExtensionMenuLocation, ExtensionMenuItem[]>;
  panels: ExtensionPanel[];
  errors: ExtensionRuntimeError[];
}
```

- [ ] **Step 4: Implement the registry**

Create `src/extensions/registry.ts` with:

```ts
import { runBatch, useStore } from '../model/store';
import type {
  ExtensionCommand,
  ExtensionCommandContext,
  ExtensionEventHandler,
  ExtensionEventName,
  ExtensionMenuItem,
  ExtensionMenuLocation,
  ExtensionPanel,
  ExtensionRegistrySnapshot,
  ExtensionRuntimeError,
  ExtensionToolbarButton,
} from './types';

const MENU_LOCATIONS: ExtensionMenuLocation[] = [
  'extensions.menu',
  'model-tree.context',
  'view.context',
  'selection.context',
];

interface Owned<T> {
  extensionId: string;
  value: T;
}

type Listener = () => void;

export class ExtensionRegistry {
  private commands = new Map<string, Owned<ExtensionCommand>>();
  private toolbarButtons = new Map<string, Owned<ExtensionToolbarButton>>();
  private menuItems = new Map<ExtensionMenuLocation, Map<string, Owned<ExtensionMenuItem>>>();
  private panels = new Map<string, Owned<ExtensionPanel>>();
  private eventHandlers = new Map<ExtensionEventName, Owned<ExtensionEventHandler>[]>();
  private errors: ExtensionRuntimeError[] = [];
  private listeners = new Set<Listener>();

  constructor() {
    for (const location of MENU_LOCATIONS) this.menuItems.set(location, new Map());
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): ExtensionRegistrySnapshot {
    return {
      commands: [...this.commands.values()].map((owned) => owned.value),
      toolbarButtons: [...this.toolbarButtons.values()].map((owned) => owned.value),
      menus: Object.fromEntries(
        MENU_LOCATIONS.map((location) => [
          location,
          [...(this.menuItems.get(location)?.values() ?? [])].map((owned) => owned.value),
        ]),
      ) as ExtensionRegistrySnapshot['menus'],
      panels: [...this.panels.values()].map((owned) => owned.value),
      errors: [...this.errors],
    };
  }

  clearAll(): void {
    this.commands.clear();
    this.toolbarButtons.clear();
    for (const map of this.menuItems.values()) map.clear();
    this.panels.clear();
    this.eventHandlers.clear();
    this.errors = [];
    this.notify();
  }

  clearExtension(extensionId: string): void {
    for (const [id, owned] of this.commands) if (owned.extensionId === extensionId) this.commands.delete(id);
    for (const [id, owned] of this.toolbarButtons) if (owned.extensionId === extensionId) this.toolbarButtons.delete(id);
    for (const map of this.menuItems.values()) {
      for (const [id, owned] of map) if (owned.extensionId === extensionId) map.delete(id);
    }
    for (const [id, owned] of this.panels) if (owned.extensionId === extensionId) this.panels.delete(id);
    for (const [name, handlers] of this.eventHandlers) {
      this.eventHandlers.set(name, handlers.filter((owned) => owned.extensionId !== extensionId));
    }
    this.errors = this.errors.filter((error) => error.extensionId !== extensionId);
    this.notify();
  }

  registerCommand(extensionId: string, command: ExtensionCommand): void {
    this.assertAvailable(this.commands, command.id, 'command');
    this.commands.set(command.id, { extensionId, value: command });
    this.notify();
  }

  addToolbarButton(extensionId: string, button: ExtensionToolbarButton): void {
    this.assertAvailable(this.toolbarButtons, button.id, 'toolbar button');
    this.toolbarButtons.set(button.id, { extensionId, value: button });
    this.notify();
  }

  addMenuItem(extensionId: string, location: ExtensionMenuLocation, item: ExtensionMenuItem): void {
    const map = this.menuItems.get(location);
    if (!map) throw new Error(`Unknown menu location: ${location}`);
    this.assertAvailable(map, item.id, 'menu item');
    map.set(item.id, { extensionId, value: item });
    this.notify();
  }

  registerPanel(extensionId: string, panel: ExtensionPanel): void {
    this.assertAvailable(this.panels, panel.id, 'panel');
    this.panels.set(panel.id, { extensionId, value: panel });
    this.notify();
  }

  getPanel(id: string): ExtensionPanel | null {
    return this.panels.get(id)?.value ?? null;
  }

  onEvent(extensionId: string, name: ExtensionEventName, handler: ExtensionEventHandler): void {
    const handlers = this.eventHandlers.get(name) ?? [];
    this.eventHandlers.set(name, [...handlers, { extensionId, value: handler }]);
  }

  async emitEvent(name: ExtensionEventName, payload?: unknown): Promise<void> {
    const handlers = this.eventHandlers.get(name) ?? [];
    for (const handler of handlers) {
      try {
        await handler.value(payload);
      } catch (error) {
        this.recordError(handler.extensionId, error);
      }
    }
  }

  async runCommand(id: string, args?: unknown, trigger?: unknown): Promise<unknown> {
    const owned = this.commands.get(id);
    if (!owned) throw new Error(`Unknown extension command: ${id}`);
    try {
      return runBatch(`Extension: ${owned.value.title}`, () =>
        owned.value.run(this.createContext(owned.extensionId, trigger), args),
      );
    } catch (error) {
      this.recordError(owned.extensionId, error);
      throw error;
    }
  }

  recordError(extensionId: string, error: unknown): void {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    this.errors = [...this.errors, { extensionId, message, time: Date.now() }].slice(-100);
    this.notify();
  }

  private createContext(extensionId: string, trigger?: unknown): ExtensionCommandContext {
    const state = useStore.getState();
    return {
      extensionId,
      activeViewId: state.activeViewId,
      selectionIds: state.selection.ids,
      trigger,
    };
  }

  private assertAvailable<T>(map: Map<string, T>, id: string, kind: string): void {
    if (map.has(id)) throw new Error(`Duplicate ${kind} id: ${id}`);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export function createExtensionRegistry(): ExtensionRegistry {
  return new ExtensionRegistry();
}

export const extensionRegistry = createExtensionRegistry();
```

- [ ] **Step 5: Run focused test and verify GREEN**

Run: `npm test -- tests/extensions.test.ts`

Expected: all extension tests pass.

### Task 3: App API And Runtime Loader

**Files:**
- Create: `src/extensions/app-api.ts`
- Create: `src/extensions/runtime.ts`
- Modify: `tests/extensions.test.ts`

- [ ] **Step 1: Add failing runtime/API tests**

Append this block to `tests/extensions.test.ts`:

```ts
import { createAppApi } from '../src/extensions/app-api';
import { runExtensionRecord } from '../src/extensions/runtime';

describe('extension app API and runtime', () => {
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
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm test -- tests/extensions.test.ts`

Expected: fail with module-not-found for `src/extensions/app-api`.

- [ ] **Step 3: Implement the trusted app API**

Create `src/extensions/app-api.ts` with:

```ts
import { useStore } from '../model/store';
import { showAlertDialog, showConfirmDialog } from '../ui/AppDialog';
import { layoutBus } from '../ui/layout-bus';
import { extensionRegistry, type ExtensionRegistry } from './registry';
import type {
  ExtensionCommand,
  ExtensionEventHandler,
  ExtensionEventName,
  ExtensionMenuItem,
  ExtensionMenuLocation,
  ExtensionPanel,
  ExtensionToolbarButton,
} from './types';

const STORAGE_PREFIX = 'archi-online.extension-storage.v1.';

function readStorage(extensionId: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + extensionId);
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(extensionId: string, value: Record<string, unknown>): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + extensionId, JSON.stringify(value));
  } catch {
    /* private extension storage failures should not block editing */
  }
}

function withId<T extends { id?: string }>(
  extensionId: string,
  fallbackSuffix: string,
  value: T,
): T & { id: string } {
  return { ...value, id: value.id ?? `${extensionId}.${fallbackSuffix}` };
}

export function createAppApi(
  extensionId: string,
  registry: ExtensionRegistry = extensionRegistry,
) {
  return {
    extension(meta: { id: string; name: string; version: string }) {
      if (meta.id !== extensionId) throw new Error(`Extension id mismatch: ${meta.id}`);
    },
    commands: {
      register(id: string, options: Omit<ExtensionCommand, 'id'>) {
        registry.registerCommand(extensionId, { ...options, id });
      },
      run(id: string, args?: unknown) {
        return registry.runCommand(id, args);
      },
    },
    toolbar: {
      addButton(options: ExtensionToolbarButton) {
        registry.addToolbarButton(extensionId, options);
      },
    },
    menus: {
      addItem(location: ExtensionMenuLocation, options: Omit<ExtensionMenuItem, 'id'> & { id?: string }) {
        registry.addMenuItem(extensionId, location, withId(extensionId, `menu.${options.command}`, options));
      },
    },
    panels: {
      register(id: string, options: Omit<ExtensionPanel, 'id'>) {
        registry.registerPanel(extensionId, { ...options, id });
      },
      show(id: string) {
        layoutBus()?.showExtensionPanel(id);
      },
    },
    events: {
      on(name: ExtensionEventName, handler: ExtensionEventHandler) {
        registry.onEvent(extensionId, name, handler);
      },
    },
    storage: {
      get(key: string) {
        return readStorage(extensionId)[key];
      },
      set(key: string, value: unknown) {
        const current = readStorage(extensionId);
        current[key] = value;
        writeStorage(extensionId, current);
      },
    },
    dialogs: {
      info(title: string, message?: string) {
        return showAlertDialog({ title, message });
      },
      confirm(title: string, message?: string) {
        return showConfirmDialog({ title, message });
      },
    },
    model: {
      current() {
        return useStore.getState().model;
      },
    },
  };
}
```

- [ ] **Step 4: Implement the runtime loader**

Create `src/extensions/runtime.ts` with:

```ts
import { createJArchiGlobals, JCollection } from '../scripting/jarchi';
import type { ConsoleEntry } from '../scripting/runner';
import { createAppApi } from './app-api';
import { useExtensionStore } from './extension-store';
import { extensionRegistry, type ExtensionRegistry } from './registry';
import type { LocalExtensionRecord } from './types';

class ExtensionExitSignal extends Error {}

function fmt(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  if (arg instanceof JCollection) return `[${arg.toArray().map((o) => String(o)).join(', ')}]`;
  if (arg instanceof Error) return arg.message;
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg, null, 1);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

function extensionConsole(
  extensionId: string,
  registry: ExtensionRegistry,
  onConsole?: (entry: ConsoleEntry) => void,
) {
  const emit = (level: ConsoleEntry['level'], args: unknown[]) => {
    const entry = { level, text: args.map(fmt).join(' '), time: Date.now() };
    onConsole?.(entry);
    if (level === 'error') registry.recordError(extensionId, entry.text);
  };
  return {
    log: (...args: unknown[]) => emit('log', args),
    error: (...args: unknown[]) => emit('error', args),
    warn: (...args: unknown[]) => emit('warn', args),
    info: (...args: unknown[]) => emit('info', args),
    show: () => {},
    clear: () => onConsole?.({ level: 'info', text: '\u0000clear', time: Date.now() }),
  };
}

export function runExtensionRecord(
  record: LocalExtensionRecord,
  registry: ExtensionRegistry = extensionRegistry,
  onConsole?: (entry: ConsoleEntry) => void,
): { error?: string } {
  registry.clearExtension(record.id);
  const { $, model } = createJArchiGlobals();
  const app = createAppApi(record.id, registry);
  const exit = () => {
    throw new ExtensionExitSignal('exit');
  };
  try {
    const fn = new Function(
      '$',
      'model',
      'app',
      'console',
      'window',
      'exit',
      `"use strict";\n${record.source}`,
    );
    fn($, model, app, extensionConsole(record.id, registry, onConsole), {}, exit);
    return {};
  } catch (error) {
    if (error instanceof ExtensionExitSignal) return {};
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    registry.recordError(record.id, error);
    return { error: message };
  }
}

export function reloadEnabledExtensions(registry: ExtensionRegistry = extensionRegistry): void {
  registry.clearAll();
  for (const record of useExtensionStore.getState().extensions) {
    if (record.enabled) runExtensionRecord(record, registry);
  }
}
```

- [ ] **Step 5: Run focused test and verify GREEN**

Run: `npm test -- tests/extensions.test.ts`

Expected: all extension tests pass.

### Task 4: Event Bridge And App Boot Integration

**Files:**
- Create: `src/extensions/events.ts`
- Modify: `src/App.tsx`
- Modify: `src/persistence/files.ts`
- Modify: `tests/extensions.test.ts`

- [ ] **Step 1: Add failing event bridge test**

Append this block to `tests/extensions.test.ts`:

```ts
import { startExtensionEventBridge } from '../src/extensions/events';
import { createEmptyModel } from '../src/model/ops';
import { replaceModel, setSelection, useStore } from '../src/model/store';

describe('extension events', () => {
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
    const registry = createExtensionRegistry();
    let count = 0;
    registry.onEvent('local.audit', 'model.changed', () => {
      count += 1;
    });
    const stop = startExtensionEventBridge(registry, 1);

    replaceModel(createEmptyModel('One'), null, false);
    replaceModel(createEmptyModel('Two'), null, false);
    await new Promise((resolve) => window.setTimeout(resolve, 5));

    stop();
    expect(count).toBe(1);
    useStore.setState({ model: null });
  });
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm test -- tests/extensions.test.ts`

Expected: fail with module-not-found for `src/extensions/events`.

- [ ] **Step 3: Implement event bridge**

Create `src/extensions/events.ts` with:

```ts
import { useStore } from '../model/store';
import { extensionRegistry, type ExtensionRegistry } from './registry';

export function startExtensionEventBridge(
  registry: ExtensionRegistry = extensionRegistry,
  modelChangedDelay = 150,
): () => void {
  let modelTimer: number | undefined;
  let previousSelection = useStore.getState().selection;
  let previousActiveViewId = useStore.getState().activeViewId;
  let previousOpenViewIds = useStore.getState().openViewIds;
  let previousModelEpoch = useStore.getState().modelEpoch;

  const unsubscribe = useStore.subscribe((state) => {
    if (state.selection !== previousSelection) {
      previousSelection = state.selection;
      void registry.emitEvent('selection.changed', state.selection);
    }
    if (state.activeViewId !== previousActiveViewId) {
      previousActiveViewId = state.activeViewId;
      void registry.emitEvent('view.activated', { viewId: state.activeViewId });
    }
    if (state.openViewIds !== previousOpenViewIds) {
      const opened = state.openViewIds.filter((id) => !previousOpenViewIds.includes(id));
      previousOpenViewIds = state.openViewIds;
      for (const viewId of opened) void registry.emitEvent('view.opened', { viewId });
    }
    if (state.modelEpoch !== previousModelEpoch) {
      previousModelEpoch = state.modelEpoch;
      void registry.emitEvent('model.opened', { fileName: state.fileName });
    }
    if (modelTimer) clearTimeout(modelTimer);
    modelTimer = window.setTimeout(() => {
      void registry.emitEvent('model.changed', { dirty: useStore.getState().dirty });
    }, modelChangedDelay);
  });

  return () => {
    unsubscribe();
    if (modelTimer) clearTimeout(modelTimer);
  };
}

export function emitModelSaved(): void {
  void extensionRegistry.emitEvent('model.saved', { fileName: useStore.getState().fileName });
}
```

- [ ] **Step 4: Start extensions after autosave restore**

Modify `src/App.tsx` inside the `restoreAutosave().finally` callback:

```ts
void import('./extensions/runtime').then(({ reloadEnabledExtensions }) => {
  reloadEnabledExtensions();
  void import('./extensions/events').then(({ startExtensionEventBridge }) => {
    startExtensionEventBridge();
    void import('./extensions/registry').then(({ extensionRegistry }) =>
      extensionRegistry.emitEvent('app.ready'),
    );
  });
});
```

- [ ] **Step 5: Emit save events**

Modify `src/persistence/files.ts` after successful save/download state updates:

```ts
import { emitModelSaved } from '../extensions/events';
```

Call `emitModelSaved();` after `useStore.setState({ dirty: false, fileName: handle.name });` and after `useStore.setState({ dirty: false, fileName });`.

- [ ] **Step 6: Run focused test and verify GREEN**

Run: `npm test -- tests/extensions.test.ts`

Expected: all extension tests pass.

### Task 5: Management Panel And Dynamic Dock Panels

**Files:**
- Create: `src/ui/ExtensionsPanel.tsx`
- Create: `src/ui/ExtensionPanelHost.tsx`
- Modify: `src/ui/layout-bus.ts`
- Modify: `src/ui/DockLayout.tsx`
- Modify: `src/ui/dock/layout-config.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add `showExtensionPanel` to the layout bus**

Modify `src/ui/layout-bus.ts` so `LayoutBus` includes:

```ts
/** Open or focus a runtime-registered extension panel. */
showExtensionPanel(panelId: string): void;
```

- [ ] **Step 2: Host dynamic DOM-rendered extension panels**

Create `src/ui/ExtensionPanelHost.tsx` with:

```tsx
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { extensionRegistry } from '../extensions/registry';

export function ExtensionPanelHost(props: IDockviewPanelProps<{ panelId: string }>) {
  useSyncExternalStore(extensionRegistry.subscribe.bind(extensionRegistry), () =>
    extensionRegistry.getSnapshot(),
  );
  const ref = useRef<HTMLDivElement>(null);
  const panel = extensionRegistry.getPanel(props.params.panelId);

  useEffect(() => {
    const container = ref.current;
    if (!container || !panel) return;
    container.replaceChildren();
    try {
      const cleanup = panel.render(container);
      return () => {
        if (typeof cleanup === 'function') cleanup();
        container.replaceChildren();
      };
    } catch (error) {
      extensionRegistry.recordError(props.params.panelId, error);
      container.textContent = error instanceof Error ? error.message : String(error);
    }
  }, [panel, props.params.panelId]);

  if (!panel) return <div className="empty-hint">Extension panel is not registered.</div>;
  return <div className="extension-panel-host" ref={ref} />;
}
```

- [ ] **Step 3: Add Extensions tool panel and component mapping**

Modify `src/ui/dock/layout-config.tsx`:

```tsx
import { ExtensionPanelHost } from '../ExtensionPanelHost';
import { ExtensionsPanel } from '../ExtensionsPanel';
```

Add a `TOOL_PANELS` entry:

```ts
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
```

Add it to `buildDefaultLayout` within the right-side group:

```ts
api.addPanel({
  id: 'extensions',
  component: 'extensions',
  title: 'Extensions',
  position: { referencePanel: 'settings', direction: 'within' },
});
```

Add component mappings:

```tsx
extensions: () => (
  <div className="dock-panel">
    <ExtensionsPanel />
  </div>
),
'extension-panel': ExtensionPanelHost as React.FunctionComponent<IDockviewPanelProps>,
```

- [ ] **Step 4: Open extension panels from DockLayout**

Modify the layout bus registration in `src/ui/DockLayout.tsx`:

```ts
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
```

Import `extensionRegistry` from `../extensions/registry`.

- [ ] **Step 5: Implement ExtensionsPanel**

Create `src/ui/ExtensionsPanel.tsx` with list, enable, edit, reload, create, and delete actions using `useExtensionStore`, `runExtensionRecord`, `reloadEnabledExtensions`, `showConfirmDialog`, `showPromptDialog`, lazy `MonacoEditor`, and the registry snapshot. Use `DEFAULT_EXTENSION_TEMPLATE` for new source, and update records through `upsert` without touching the model store.

- [ ] **Step 6: Add CSS**

Add styles for:

```css
.extensions-panel
.extensions-head
.extensions-list
.extension-row
.extension-row.active
.extension-editor
.extension-actions
.extension-errors
.extension-panel-host
```

- [ ] **Step 7: Run build-time verification**

Run: `npm run typecheck`

Expected: no TypeScript errors.

### Task 6: Toolbar, Extensions Menu, And Context Menus

**Files:**
- Modify: `src/ui/Toolbar.tsx`
- Modify: `src/ui/ContextMenu.tsx`
- Modify: `src/ui/ModelTree.tsx`
- Modify: `src/canvas/view-editor/contextMenu.ts`

- [ ] **Step 1: Subscribe toolbar to registry**

Modify `src/ui/Toolbar.tsx` to import `useSyncExternalStore`, `extensionRegistry`, and map contributions:

```tsx
const extensionSnapshot = useSyncExternalStore(
  extensionRegistry.subscribe.bind(extensionRegistry),
  () => extensionRegistry.getSnapshot(),
);
```

Render text buttons for `extensionSnapshot.toolbarButtons` before the Views button:

```tsx
{extensionSnapshot.toolbarButtons.map((button) => (
  <button
    key={button.id}
    className="tb-btn"
    title={button.label}
    onClick={() => void extensionRegistry.runCommand(button.command)}
  >
    {button.label}
  </button>
))}
```

- [ ] **Step 2: Add toolbar Extensions menu**

Add an `Extensions ▾` button before `Views ▾` that shows explicit `extensions.menu` items and unlisted commands:

```ts
const menuItems = extensionSnapshot.menus['extensions.menu'].map((item) => ({
  label: item.label,
  danger: item.danger,
  onClick: () => void extensionRegistry.runCommand(item.command),
}));
const explicitCommands = new Set(extensionSnapshot.menus['extensions.menu'].map((item) => item.command));
for (const command of extensionSnapshot.commands) {
  if (!explicitCommands.has(command.id)) {
    menuItems.push({
      label: command.title,
      onClick: () => void extensionRegistry.runCommand(command.id),
    });
  }
}
```

Disable the button when `menuItems.length === 0`.

- [ ] **Step 3: Add helper for extension menu items**

Create a named helper in `src/ui/ContextMenu.tsx`:

```ts
import { extensionRegistry } from '../extensions/registry';
import type { ExtensionMenuLocation } from '../extensions/types';

export function extensionMenuItems(location: ExtensionMenuLocation): MenuItem[] {
  return extensionRegistry.getSnapshot().menus[location].map((item) => ({
    label: item.label,
    danger: item.danger,
    onClick: () => void extensionRegistry.runCommand(item.command),
  }));
}
```

- [ ] **Step 4: Append tree context menu contributions**

In `src/ui/ModelTree.tsx`, when passing items to `showContextMenu`, append:

```ts
const extensions = extensionMenuItems('model-tree.context');
showContextMenu(x, y, extensions.length > 0 ? [...items, SEPARATOR, ...extensions] : items);
void extensionRegistry.emitEvent('tree.contextMenu', { x, y, targetId });
```

Import `extensionRegistry` and `extensionMenuItems`.

- [ ] **Step 5: Append view context menu contributions**

In `src/canvas/view-editor/contextMenu.ts`, append `view.context` for empty canvas menus and `selection.context` for object menus. Emit `view.contextMenu` with `{ x, y, viewId, targetId }` or `{ x, y, viewId }`.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`

Expected: no TypeScript errors.

### Task 7: Monaco Declarations And Browser Smoke

**Files:**
- Modify: `src/scripting/jarchi-dts.ts`

- [ ] **Step 1: Add `app` declarations**

Extend `src/scripting/jarchi-dts.ts` with `declare const app` including:

```ts
declare const app: {
  extension(meta: { id: string; name: string; version: string }): void;
  commands: {
    register(id: string, options: { title: string; description?: string; run(context: unknown, args?: unknown): unknown }): void;
    run(id: string, args?: unknown): Promise<unknown>;
  };
  toolbar: {
    addButton(options: { id: string; label: string; command: string }): void;
  };
  menus: {
    addItem(location: 'extensions.menu' | 'model-tree.context' | 'view.context' | 'selection.context', options: { id?: string; label: string; command: string; danger?: boolean }): void;
  };
  panels: {
    register(id: string, options: { title: string; render(container: HTMLElement): void | (() => void) }): void;
    show(id: string): void;
  };
  events: {
    on(name: 'app.ready' | 'model.opened' | 'model.changed' | 'model.saved' | 'selection.changed' | 'view.opened' | 'view.activated' | 'view.contextMenu' | 'tree.contextMenu' | 'script.error', handler: (payload: unknown) => unknown): void;
  };
  storage: {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
  };
  dialogs: {
    info(title: string, message?: string): Promise<void>;
    confirm(title: string, message?: string): Promise<boolean>;
  };
  model: {
    current(): unknown;
  };
};
```

- [ ] **Step 2: Run full automated verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all commands pass.

- [ ] **Step 3: Browser smoke test**

Run: `npm run dev -- --host 127.0.0.1`

In the browser, create an extension from the default template, confirm the Hello toolbar button appears, click it, confirm the custom app dialog appears, register a panel, call `app.panels.show(...)`, and confirm a Dockview panel opens without native browser dialogs.

Expected: no console crash, no model dirty flag from extension preference edits, and no extension data in saved `.archimate` XML.

### Task 8: Commit And Publish

**Files:**
- All implementation files from Tasks 1-7.

- [ ] **Step 1: Review diff**

Run:

```bash
git status --short
git diff -- src tests docs
```

Expected: only extension-system implementation, tests, styles, and plan files changed.

- [ ] **Step 2: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-07-03-script-extension-system.md src tests
git commit -m "Add script extension system"
```

Expected: commit succeeds on `codex/script-extension-runtime`.

- [ ] **Step 3: Republish when committing**

Run:

```bash
npm run build
bash -lc "cd /mnt/c/Users/thoma/Projects/archi-online && /mnt/c/Users/thoma/.agents/skills/here-now/scripts/publish.sh dist --slug bitter-mill-c9qn --client codex --spa"
```

Expected: here.now updates the existing `https://bitter-mill-c9qn.here.now/` site.

- [ ] **Step 4: Verify live publish**

Run:

```bash
curl.exe -I https://bitter-mill-c9qn.here.now/
```

Expected: HTTP status is `200`.

## Self-Review

- Spec coverage: Runtime core is Tasks 1-4; UI contributions are Tasks 5-6; events are Task 4 plus Task 6 context-menu emission; management UI is Task 5; Option 3 compatibility is covered by manifest-shaped `LocalExtensionRecord` and registry-only UI surfaces.
- Placeholder scan: Task 5 Step 5 intentionally names UI behavior but must be implemented fully before completion; it is not a deferred feature, and typecheck/build gates must pass before commit.
- Type consistency: Record, contribution, event, and registry names match across the store, API, runtime, UI, tests, and Monaco declaration tasks.
