import { ContextMenuHost } from './ContextMenu';
import { DockLayout } from './DockLayout';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';
import { GenerateViewDialogHost } from './GenerateViewDialog';

export function AppShell() {
  const activeSessionId = useWorkspaceStore((state) => state.activeSessionId);
  const session = useWorkspaceStore((state) =>
    activeSessionId ? state.sessions[activeSessionId] : undefined,
  );
  const shell = (
    <div className="app-shell">
      <ContextMenuHost />
      <GenerateViewDialogHost />
      <Toolbar />
      <div className="app-main">
        <DockLayout />
      </div>
      <StatusBar />
    </div>
  );
  return session ? <ModelStoreProvider store={session.store}>{shell}</ModelStoreProvider> : shell;
}
import { ModelStoreProvider, useWorkspaceStore } from './store-hooks';
