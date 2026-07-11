import { useRegisterSW } from 'virtual:pwa-register/react';
import { useStore, useWorkspaceStore } from './store-hooks';
import { flushAutosaveNow } from '../persistence/autosave';
import { bypassUnloadGuardOnce } from '../pwa/unload-guard';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Service worker registration + "update available" toast. Mounted in
 * main.tsx (not inside App) so it covers editor, viewer, and error states;
 * AppDialogHost only exists in editor mode.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) {
        setInterval(() => void registration.update(), UPDATE_CHECK_INTERVAL_MS);
      }
    },
  });

  if (!needRefresh) return null;

  const reload = async () => {
    const workspace = useWorkspaceStore.getState();
    const anyDirty = workspace.order.some((id) => workspace.sessions[id]?.store.getState().dirty);
    if (anyDirty || useStore.getState().dirty) await flushAutosaveNow();
    bypassUnloadGuardOnce();
    await updateServiceWorker(true);
  };

  return (
    <div className="update-toast" role="status">
      <span>A new version of Archi Online is available.</span>
      <button className="app-dialog-btn primary" onClick={() => void reload()}>
        Reload
      </button>
      <button className="app-dialog-btn" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  );
}
