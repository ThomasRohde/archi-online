import { useEffect, useState } from 'react';
import { startExtensionEventBridge } from './extensions/events';
import { hydrateExtensionStore } from './extensions/extension-store';
import { hydrateExtensionPackageStore } from './extensions/package-store';
import { extensionRegistry } from './extensions/registry';
import { reloadEnabledExtensions } from './extensions/runtime';
import { cloneModelForEditing, openView, replaceModel, redo, undo, useStore } from './model/store';
import { restoreAutosave, startAutosave } from './persistence/autosave';
import { loadSharedModelFromLocation, parseShareFragment } from './persistence/share';
import { hydrateSettingsStore } from './settings/app-settings';
import { AppDialogHost } from './ui/AppDialog';
import { AppShell } from './ui/AppShell';
import { openModel, saveModel } from './ui/Toolbar';
import { ViewerShell } from './ui/ViewerShell';

let editorBooted = false;
let viewerSettingsHydrated = false;
let extensionEventBridgeStarted = false;

type AppMode =
  | { kind: 'editor' }
  | { kind: 'viewer-loading'; sourceLabel: string }
  | { kind: 'viewer-loaded'; sourceLabel: string }
  | { kind: 'viewer-error'; message: string };

if (import.meta.env.DEV) {
  // dev/testing hook: load a model from XML text in the browser console
  void import('./model/io/archimate-xml').then(({ parseArchimate }) => {
    (window as unknown as Record<string, unknown>).__archiLoadXml = (xml: string) => {
      import('./model/store').then(({ replaceModel }) =>
        replaceModel(parseArchimate(xml), 'dev.archimate', false),
      );
    };
  });
  void import('./model/store').then((store) => {
    (window as unknown as Record<string, unknown>).__archiStore = store.useStore;
  });
  void import('./scripting/runner').then(({ runScript }) => {
    (window as unknown as Record<string, unknown>).__archiRunScript = (code: string) => {
      const logs: string[] = [];
      const res = runScript(code, (e) => logs.push(`${e.level}: ${e.text}`));
      return { ...res, logs };
    };
  });
}

export function isViewerLocation(url: URL): boolean {
  if (url.searchParams.get('mode') === 'viewer') return true;
  return parseShareFragment(url.hash).kind !== 'none';
}

export function viewerRouteKey(url: URL): string {
  return `${url.search}${url.hash}`;
}

async function bootEditorRuntime(restoreWorkspace: boolean): Promise<void> {
  if (editorBooted) {
    useStore.setState({ booted: true });
    return;
  }
  editorBooted = true;
  await Promise.all([
    restoreWorkspace ? restoreAutosave() : Promise.resolve(false),
    hydrateSettingsStore(),
    hydrateExtensionStore(),
    hydrateExtensionPackageStore(),
  ]).finally(() => {
    startAutosave();
    useStore.setState({ booted: true });
    reloadEnabledExtensions();
    if (!extensionEventBridgeStarted) {
      extensionEventBridgeStarted = true;
      startExtensionEventBridge();
    }
    void extensionRegistry.emitEvent('app.ready');
  });
}

async function bootViewerRuntime(
  routeKey: string,
  setMode: (mode: AppMode) => void,
): Promise<void> {
  try {
    if (!viewerSettingsHydrated) {
      viewerSettingsHydrated = true;
      await hydrateSettingsStore();
    }
    const loaded = await loadSharedModelFromLocation(window.location);
    if (routeKey !== viewerRouteKey(new URL(window.location.href))) return;
    replaceModel(loaded.model, loaded.fileName, false, { readOnly: true });
    const firstView = Object.keys(loaded.model.views)[0];
    if (firstView) openView(firstView);
    useStore.setState({ booted: true });
    setMode({ kind: 'viewer-loaded', sourceLabel: loaded.sourceLabel });
  } catch (error) {
    if (routeKey !== viewerRouteKey(new URL(window.location.href))) return;
    useStore.setState({ booted: true });
    setMode({
      kind: 'viewer-error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function clearViewerUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('mode');
  url.hash = '';
  history.replaceState(null, '', url);
}

export function App() {
  const [mode, setMode] = useState<AppMode>(() =>
    isViewerLocation(new URL(window.location.href))
      ? { kind: 'viewer-loading', sourceLabel: 'shared model' }
      : { kind: 'editor' },
  );
  const [currentViewerRouteKey, setCurrentViewerRouteKey] = useState(() =>
    viewerRouteKey(new URL(window.location.href)),
  );
  const [editorBoot, setEditorBoot] = useState({ restoreWorkspace: true });

  useEffect(() => {
    if (mode.kind !== 'viewer-loading') return;
    void bootViewerRuntime(currentViewerRouteKey, setMode);
  }, [mode.kind, currentViewerRouteKey]);

  useEffect(() => {
    const onLocationChange = () => {
      const url = new URL(window.location.href);
      if (!isViewerLocation(url)) return;
      setCurrentViewerRouteKey(viewerRouteKey(url));
      setMode({ kind: 'viewer-loading', sourceLabel: 'shared model' });
    };
    window.addEventListener('hashchange', onLocationChange);
    window.addEventListener('popstate', onLocationChange);
    return () => {
      window.removeEventListener('hashchange', onLocationChange);
      window.removeEventListener('popstate', onLocationChange);
    };
  }, []);

  useEffect(() => {
    if (mode.kind !== 'editor') return;
    void bootEditorRuntime(editorBoot.restoreWorkspace);
    const onKey = (e: KeyboardEvent) => {
      const inText =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);
      if (!e.ctrlKey && !e.metaKey) return;
      const key = e.key.toLowerCase();
      if (useStore.getState().readOnly && ['s', 'o', 'z', 'y'].includes(key)) return;
      if (key === 's') {
        e.preventDefault();
        void saveModel(false);
      } else if (key === 'o') {
        e.preventDefault();
        void openModel();
      } else if (!inText && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (!inText && key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useStore.getState().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [mode.kind, editorBoot.restoreWorkspace]);

  const openEditorHome = () => {
    clearViewerUrl();
    replaceModel(null, null, false, { readOnly: false });
    setEditorBoot({ restoreWorkspace: true });
    setMode({ kind: 'editor' });
  };

  const openCopyInEditor = () => {
    const model = useStore.getState().model;
    if (!model) return;
    clearViewerUrl();
    replaceModel(cloneModelForEditing(model), null, true, { readOnly: false });
    setEditorBoot({ restoreWorkspace: false });
    setMode({ kind: 'editor' });
  };

  if (mode.kind === 'viewer-loading') {
    return <ViewerShell status="loading" sourceLabel={mode.sourceLabel} onOpenEditor={openEditorHome} />;
  }
  if (mode.kind === 'viewer-error') {
    return <ViewerShell status="error" message={mode.message} onOpenEditor={openEditorHome} />;
  }
  if (mode.kind === 'viewer-loaded') {
    return <ViewerShell status="loaded" sourceLabel={mode.sourceLabel} onOpenCopy={openCopyInEditor} />;
  }

  return (
    <>
      <AppShell />
      <AppDialogHost />
    </>
  );
}
