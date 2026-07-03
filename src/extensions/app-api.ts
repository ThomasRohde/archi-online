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
      addItem(
        location: ExtensionMenuLocation,
        options: Omit<ExtensionMenuItem, 'id'> & { id?: string },
      ) {
        registry.addMenuItem(
          extensionId,
          location,
          withId(extensionId, `menu.${options.command}`, options),
        );
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
