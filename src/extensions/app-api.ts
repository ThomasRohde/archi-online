import { openView, setSelection, useStore } from '../model/store';
import { defaultKeyValueStore } from '../persistence/keyval';
import { JView, JVisual, wrap } from '../scripting/jarchi';
import { showAlertDialog, showConfirmDialog } from '../ui/AppDialog';
import { layoutBus } from '../ui/layout-bus';
import { runElkLayout, type ElkLayoutOptions } from './layout/elk';
import type { ExtensionManifestV2, InstalledExtensionPackage } from './package-types';
import {
  cloneManifest,
  normalizePackagePath,
  packageInfo,
  readPackageJsonFile,
  readPackageTextFile,
} from './package-validation';
import { extensionRegistry, type ExtensionRegistry } from './registry';
import type {
  ExtensionCommand,
  ExtensionEventHandler,
  ExtensionEventName,
  ExtensionMenuItem,
  ExtensionMenuLocation,
  ExtensionPanel,
  ExtensionToolbarButton,
  LocalExtensionRecord,
} from './types';

export const EXTENSION_STORAGE_PREFIX = 'archi-online.extension-storage.v1.';

export function extensionStorageKey(extensionId: string): string {
  return EXTENSION_STORAGE_PREFIX + extensionId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function clearExtensionStorage(extensionId: string): Promise<void> {
  try {
    await defaultKeyValueStore().del(extensionStorageKey(extensionId));
  } catch {
    /* private extension storage cleanup is best-effort */
  }
}

async function readStorage(extensionId: string): Promise<Record<string, unknown>> {
  try {
    const parsed = await defaultKeyValueStore().get<unknown>(extensionStorageKey(extensionId));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStorage(extensionId: string, value: Record<string, unknown>): Promise<void> {
  try {
    await defaultKeyValueStore().set(extensionStorageKey(extensionId), value);
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

interface AppApiRuntimeContext {
  sourceRecord?: LocalExtensionRecord;
  packageRecord?: InstalledExtensionPackage;
}

type AppExtensionFunction = ((meta: { id: string; name: string; version: string }) => void) & {
  package(): ReturnType<typeof packageInfo> | null;
};

function sourceManifest(extensionId: string, record?: LocalExtensionRecord): ExtensionManifestV2 {
  return {
    schemaVersion: 2,
    id: extensionId,
    name: record?.name ?? extensionId,
    version: record?.version ?? '0.0.0',
    main: 'main.js',
  };
}

function freezeClone<T>(value: T): T {
  return Object.freeze(JSON.parse(JSON.stringify(value))) as T;
}

function packageFileUrl(pkg: InstalledExtensionPackage, path: string): string {
  const normalized = normalizePackagePath(path);
  const file = pkg.files[normalized];
  if (!file) throw new Error(`Package file not found: ${normalized}`);
  const mediaType = file.mediaType ?? (file.encoding === 'utf8' ? 'text/plain' : 'application/octet-stream');
  if (file.encoding === 'base64') return `data:${mediaType};base64,${file.content}`;
  return `data:${mediaType};charset=utf-8,${encodeURIComponent(file.content)}`;
}

function requirePackage(context: AppApiRuntimeContext | undefined): InstalledExtensionPackage {
  if (!context?.packageRecord) throw new Error('This extension is not package-owned');
  return context.packageRecord;
}

function activeView(): JView | null {
  const appState = useStore.getState();
  const viewId = appState.activeViewId;
  return viewId && appState.model?.views[viewId] ? new JView(viewId) : null;
}

function selectedVisuals(): JVisual[] {
  if (!useStore.getState().model) return [];
  return useStore.getState().selection.ids
    .map((id) => wrap(id))
    .filter((item): item is JVisual => item instanceof JVisual);
}

type AppElkLayoutOptions = ElkLayoutOptions & {
  view?: JView;
};

export function createAppApi(
  extensionId: string,
  registry: ExtensionRegistry = extensionRegistry,
  context?: AppApiRuntimeContext,
) {
  const extension = ((meta: { id: string; name: string; version: string }) => {
    if (meta.id !== extensionId) throw new Error(`Extension id mismatch: ${meta.id}`);
  }) as AppExtensionFunction;
  extension.package = () =>
    context?.packageRecord ? freezeClone(packageInfo(context.packageRecord)) : null;

  return {
    extension,
    manifest: {
      get() {
        return freezeClone(
          context?.packageRecord
            ? cloneManifest(context.packageRecord.manifest)
            : sourceManifest(extensionId, context?.sourceRecord),
        );
      },
    },
    views: {
      active() {
        return activeView();
      },
      open(id: string) {
        const model = useStore.getState().model;
        if (!model?.views[id]) return null;
        openView(id);
        return new JView(id);
      },
      get(id: string) {
        return useStore.getState().model?.views[id] ? new JView(id) : null;
      },
      all() {
        const model = useStore.getState().model;
        return model ? Object.values(model.views).map((view) => new JView(view.id)) : [];
      },
    },
    selection: {
      ids() {
        return [...useStore.getState().selection.ids];
      },
      items() {
        if (!useStore.getState().model) return [];
        return useStore.getState().selection.ids
          .map((id) => wrap(id))
          .filter((item) => item !== undefined);
      },
      visuals() {
        return selectedVisuals();
      },
      clear() {
        setSelection(useStore.getState().selection.source, []);
      },
    },
    layout: {
      elk(options: AppElkLayoutOptions = {}) {
        const view = options.view ?? activeView();
        if (!view) throw new Error('No active view');
        return runElkLayout({
          ...options,
          view,
          selectedVisuals: selectedVisuals(),
        });
      },
    },
    assets: {
      text(path: string) {
        return readPackageTextFile(requirePackage(context), path);
      },
      json(path: string) {
        return readPackageJsonFile(requirePackage(context), path);
      },
      url(path: string) {
        return packageFileUrl(requirePackage(context), path);
      },
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
      off(name: ExtensionEventName, handler: ExtensionEventHandler) {
        registry.offEvent(extensionId, name, handler);
      },
    },
    storage: {
      async get(key: string) {
        return (await readStorage(extensionId))[key];
      },
      async set(key: string, value: unknown) {
        const current = await readStorage(extensionId);
        current[key] = value;
        await writeStorage(extensionId, current);
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
