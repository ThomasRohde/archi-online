import { runBatch, useStore } from '../model/store';
import { getActiveModelSession } from '../model/workspace';
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
  private snapshot: ExtensionRegistrySnapshot;

  constructor() {
    for (const location of MENU_LOCATIONS) this.menuItems.set(location, new Map());
    this.snapshot = this.createSnapshot();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): ExtensionRegistrySnapshot {
    return this.snapshot;
  }

  private createSnapshot(): ExtensionRegistrySnapshot {
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
    for (const [id, owned] of this.commands) {
      if (owned.extensionId === extensionId) this.commands.delete(id);
    }
    for (const [id, owned] of this.toolbarButtons) {
      if (owned.extensionId === extensionId) this.toolbarButtons.delete(id);
    }
    for (const map of this.menuItems.values()) {
      for (const [id, owned] of map) {
        if (owned.extensionId === extensionId) map.delete(id);
      }
    }
    for (const [id, owned] of this.panels) {
      if (owned.extensionId === extensionId) this.panels.delete(id);
    }
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

  getPanelOwner(id: string): string | null {
    return this.panels.get(id)?.extensionId ?? null;
  }

  onEvent(extensionId: string, name: ExtensionEventName, handler: ExtensionEventHandler): void {
    const handlers = this.eventHandlers.get(name) ?? [];
    this.eventHandlers.set(name, [...handlers, { extensionId, value: handler }]);
  }

  offEvent(extensionId: string, name: ExtensionEventName, handler: ExtensionEventHandler): void {
    const handlers = this.eventHandlers.get(name) ?? [];
    this.eventHandlers.set(
      name,
      handlers.filter((owned) => owned.extensionId !== extensionId || owned.value !== handler),
    );
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
      const session = getActiveModelSession();
      return await runBatch(
        `Extension: ${owned.value.title}`,
        () => owned.value.run(this.createContext(owned.extensionId, trigger), args),
        session?.store,
      );
    } catch (error) {
      this.recordError(owned.extensionId, error);
      return undefined;
    }
  }

  recordError(extensionId: string, error: unknown): void {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    this.errors = [...this.errors, { extensionId, message, time: Date.now() }].slice(-100);
    this.notify();
  }

  private createContext(extensionId: string, trigger?: unknown): ExtensionCommandContext {
    const session = getActiveModelSession();
    const state = session?.store.getState() ?? useStore.getState();
    return {
      extensionId,
      modelSessionId: session?.id ?? null,
      modelId: state.model?.info.id ?? null,
      activeViewId: state.activeViewId,
      selectionIds: state.selection.ids,
      trigger,
    };
  }

  private assertAvailable<T>(map: Map<string, T>, id: string, kind: string): void {
    if (map.has(id)) throw new Error(`Duplicate ${kind} id: ${id}`);
  }

  private notify(): void {
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) listener();
  }
}

export function createExtensionRegistry(): ExtensionRegistry {
  return new ExtensionRegistry();
}

export const extensionRegistry = createExtensionRegistry();
