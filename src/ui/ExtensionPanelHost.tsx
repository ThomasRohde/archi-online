import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { extensionRegistry } from '../extensions/registry';

function subscribe(listener: () => void) {
  return extensionRegistry.subscribe(listener);
}

function snapshot() {
  return extensionRegistry.getSnapshot();
}

export function ExtensionPanelHost(props: IDockviewPanelProps<{ panelId: string }>) {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const ref = useRef<HTMLDivElement>(null);
  const panel = extensionRegistry.getPanel(props.params.panelId);

  useEffect(() => {
    const container = ref.current;
    if (!container || !panel) return;
    container.replaceChildren();
    try {
      const cleanup = panel.render(container);
      if (cleanup instanceof Promise) {
        void cleanup.catch((error) => {
          const owner = extensionRegistry.getPanelOwner(props.params.panelId) ?? props.params.panelId;
          extensionRegistry.recordError(owner, error);
          container.textContent = error instanceof Error ? error.message : String(error);
        });
      }
      return () => {
        if (typeof cleanup === 'function') cleanup();
        container.replaceChildren();
      };
    } catch (error) {
      const owner = extensionRegistry.getPanelOwner(props.params.panelId) ?? props.params.panelId;
      extensionRegistry.recordError(owner, error);
      container.textContent = error instanceof Error ? error.message : String(error);
    }
  }, [panel, props.params.panelId]);

  if (!panel) return <div className="empty-hint">Extension panel is not registered.</div>;
  return <div className="extension-panel-host" ref={ref} />;
}
