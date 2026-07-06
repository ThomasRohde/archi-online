import { ContextMenuHost } from './ContextMenu';
import { DockLayout } from './DockLayout';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';

export function AppShell() {
  return (
    <div className="app-shell">
      <ContextMenuHost />
      <Toolbar />
      <div className="app-main">
        <DockLayout />
      </div>
      <StatusBar />
    </div>
  );
}
