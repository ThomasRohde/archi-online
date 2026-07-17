import { useEffect, useState } from 'react';
import { emitWorkspaceStartupEvents, startExtensionEventBridge } from './extensions/events';
import { hydrateExtensionStore } from './extensions/extension-store';
import { hydrateExtensionPackageStore } from './extensions/package-store';
import { extensionRegistry } from './extensions/registry';
import { reloadEnabledExtensions } from './extensions/runtime';
import { duplicateItems } from './model/ops';
import {
  createModelStore,
  openView,
  replaceModel,
  redo,
  setSelection,
  undo,
  type ModelStore,
} from './model/store';
import { ModelStoreProvider, useWorkspaceStore } from './ui/store-hooks';
import { getActiveModelSession, addModelSession, setWorkspaceBooted } from './model/workspace';
import { restoreWorkspace, startAutosave } from './persistence/autosave';
import { loadModelBytes, openModelFromHandle } from './persistence/files';
import { loadSharedModelFromLocation, parseShareFragment } from './persistence/share';
import { consumePwaAction } from './pwa/actions';
import { signalEditorRuntimeReady } from './pwa/boot-signal';
import { subscribeLaunchedFiles } from './pwa/launch-queue';
import { takeSharedFile } from './pwa/share-target-inbox';
import { shouldBlockUnload } from './pwa/unload-guard';
import { hydrateSettingsStore, useSettingsStore } from './settings/app-settings';
import { hydrateAnalysisPreferences } from './settings/analysis-preferences';
import { hydrateValidatorSettings } from './settings/validator-settings';
import { hydrateTemplateCatalog } from './persistence/template-store';
import { AppDialogHost, showAlertDialog, showConfirmDialog } from './ui/AppDialog';
import { AppShell } from './ui/AppShell';
import { createEditableModelCopySession } from './ui/model-session-actions';
import { blocksReadOnlyShortcut } from './ui/shortcut-policy';
import { matchesShortcut } from './ui/shortcuts';
import { applyThemeMode } from './ui/theme';
import { newModel, openModel, saveModel } from './ui/Toolbar';
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
  void import('./ui/store-hooks').then((hooks) => {
    (window as unknown as Record<string, unknown>).__archiStore = hooks.useStore;
  });
  void import('./scripting/runner').then(({ runScript }) => {
    (window as unknown as Record<string, unknown>).__archiRunScript = (code: string) => {
      const logs: string[] = [];
      const res = runScript(code, (e) => logs.push(`${e.level}: ${e.text}`));
      return { ...res, logs };
    };
  });
  void import('./dev/canvas-benchmark').then(({ createCanvasBenchmarkModel }) => {
    (window as unknown as Record<string, unknown>).__archiCreateCanvasBenchmark = () => {
      const { model, viewId } = createCanvasBenchmarkModel();
      addModelSession({
        model,
        fileName: 'canvas-benchmark.archimate',
        dirty: false,
        openViewIds: [viewId],
        activeViewId: viewId,
      });
      return { viewId, nodes: 400, connections: 200 };
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

async function bootEditorRuntime(shouldRestoreWorkspace: boolean): Promise<void> {
  if (editorBooted) {
    setWorkspaceBooted(true);
    return;
  }
  editorBooted = true;
  const [restoreResult] = await Promise.all([
    shouldRestoreWorkspace ? restoreWorkspace() : Promise.resolve({ restored: 0, failed: 0 }),
    hydrateSettingsStore(),
    hydrateAnalysisPreferences(),
    hydrateValidatorSettings(),
    hydrateTemplateCatalog(),
    hydrateExtensionStore(),
    hydrateExtensionPackageStore(),
  ]).finally(() => {
    startAutosave();
    setWorkspaceBooted(true);
    reloadEnabledExtensions();
    if (!extensionEventBridgeStarted) {
      extensionEventBridgeStarted = true;
      startExtensionEventBridge();
    }
    void (async () => {
      await extensionRegistry.emitEvent('app.ready');
      await emitWorkspaceStartupEvents();
      signalEditorRuntimeReady();
    })();
  });
  if (restoreResult.failed > 0) {
    void showAlertDialog({
      title: 'Workspace recovery',
      message: `${restoreResult.failed} model${restoreResult.failed === 1 ? '' : 's'} could not be restored.`,
      details: `${restoreResult.restored} model${restoreResult.restored === 1 ? '' : 's'} restored successfully.`,
      intent: 'error',
    });
  }
}

/** Handle `?action=` URLs from manifest shortcuts and the share-target redirect. */
async function handlePwaAction(): Promise<void> {
  const action = consumePwaAction();
  if (!action) return;
  if (action === 'new') {
    await newModel();
  } else if (action === 'open') {
    // showOpenFilePicker needs transient user activation; the confirm
    // button click supplies it.
    const proceed = await showConfirmDialog({
      title: 'Open model file',
      message: 'Choose an ArchiMate model file to open.',
      confirmLabel: 'Choose file…',
    });
    if (proceed) await openModel();
  } else if (action === 'share-received') {
    const shared = await takeSharedFile();
    if (!shared) {
      await showAlertDialog({
        title: 'Shared model',
        message: 'No shared file was received.',
      });
      return;
    }
    try {
      await loadModelBytes(shared.bytes, shared.name);
    } catch (error) {
      await showAlertDialog({
        title: 'Could not open shared model',
        message: error instanceof Error ? error.message : String(error),
        intent: 'error',
      });
    }
  }
}

async function openLaunchedFile(handle: FileSystemFileHandle): Promise<void> {
  try {
    await openModelFromHandle(handle);
  } catch (error) {
    await showAlertDialog({
      title: 'Could not open model',
      message: error instanceof Error ? error.message : String(error),
      intent: 'error',
    });
  }
}

async function bootViewerRuntime(
  routeKey: string,
  setMode: (mode: AppMode) => void,
  viewerStore: ModelStore,
): Promise<void> {
  try {
    if (!viewerSettingsHydrated) {
      viewerSettingsHydrated = true;
      await hydrateSettingsStore();
    }
    const loaded = await loadSharedModelFromLocation(window.location);
    if (routeKey !== viewerRouteKey(new URL(window.location.href))) return;
    replaceModel(loaded.model, loaded.fileName, false, { readOnly: true }, viewerStore);
    const firstView = loaded.initialViewId ?? Object.keys(loaded.model.views)[0];
    if (firstView) openView(firstView, viewerStore);
    viewerStore.setState({ booted: true });
    setMode({ kind: 'viewer-loaded', sourceLabel: loaded.sourceLabel });
  } catch (error) {
    if (routeKey !== viewerRouteKey(new URL(window.location.href))) return;
    viewerStore.setState({ booted: true });
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
  const themeMode = useSettingsStore((state) => state.settings.themeMode);
  const [viewerStore] = useState(() => createModelStore({ readOnly: true }));
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
    applyThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (mode.kind !== 'viewer-loading') return;
    void bootViewerRuntime(currentViewerRouteKey, setMode, viewerStore);
  }, [mode.kind, currentViewerRouteKey, viewerStore]);

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
    void bootEditorRuntime(editorBoot.restoreWorkspace).then(() => handlePwaAction());
    const onKey = (e: KeyboardEvent) => {
      const inText =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);
      const key = e.key.toLowerCase();
      const activeStore = getActiveModelSession()?.store;
      if (activeStore?.getState().readOnly && blocksReadOnlyShortcut(key)) return;
      if (matchesShortcut('new-model', e)) {
        e.preventDefault();
        void newModel();
      } else if (matchesShortcut('save', e)) {
        e.preventDefault();
        void saveModel(false);
      } else if (matchesShortcut('open', e)) {
        e.preventDefault();
        void openModel();
      } else if (!inText && matchesShortcut('duplicate', e)) {
        e.preventDefault();
        const sel = activeStore?.getState().selection;
        if (sel?.source === 'tree' && sel.ids.length > 0) {
          const newIds = duplicateItems(sel.ids, activeStore);
          if (newIds.length) setSelection('tree', newIds, activeStore);
        }
      } else if (!inText && matchesShortcut('undo', e)) {
        e.preventDefault();
        undo(activeStore);
      } else if (!inText && (
        matchesShortcut('redo', e) || matchesShortcut('redo-shift', e)
      )) {
        e.preventDefault();
        redo(activeStore);
      }
    };
    window.addEventListener('keydown', onKey);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const workspace = useWorkspaceStore.getState();
      const dirty = workspace.order.some((id) => workspace.sessions[id]?.store.getState().dirty);
      if (dirty && shouldBlockUnload()) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [mode.kind, editorBoot.restoreWorkspace]);

  useEffect(() => {
    return subscribeLaunchedFiles((handle) => {
      void (async () => {
        const inEditor = mode.kind === 'editor';
        if (!inEditor) {
          clearViewerUrl();
          setEditorBoot({ restoreWorkspace: true });
          setMode({ kind: 'editor' });
        }
        await bootEditorRuntime(inEditor ? editorBoot.restoreWorkspace : true);
        await openLaunchedFile(handle);
      })();
    });
  }, [mode.kind, editorBoot.restoreWorkspace]);

  const openEditorHome = () => {
    clearViewerUrl();
    setEditorBoot({ restoreWorkspace: true });
    setMode({ kind: 'editor' });
  };

  const openCopyInEditor = async () => {
    const { model, activeViewId } = viewerStore.getState();
    if (!model) return;
    clearViewerUrl();
    setEditorBoot({ restoreWorkspace: false });
    setMode({ kind: 'editor' });
    await bootEditorRuntime(false);
    createEditableModelCopySession(model, activeViewId);
  };

  if (mode.kind === 'viewer-loading') {
    return <ModelStoreProvider store={viewerStore}><ViewerShell status="loading" sourceLabel={mode.sourceLabel} onOpenEditor={openEditorHome} /></ModelStoreProvider>;
  }
  if (mode.kind === 'viewer-error') {
    return <ModelStoreProvider store={viewerStore}><ViewerShell status="error" message={mode.message} onOpenEditor={openEditorHome} /></ModelStoreProvider>;
  }
  if (mode.kind === 'viewer-loaded') {
    return <ModelStoreProvider store={viewerStore}><ViewerShell status="loaded" sourceLabel={mode.sourceLabel} onOpenCopy={() => void openCopyInEditor()} /></ModelStoreProvider>;
  }

  return (
    <>
      <AppShell />
      <AppDialogHost />
    </>
  );
}
