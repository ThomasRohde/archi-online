// Small registry so the Toolbar can drive the dock layout without importing
// DockLayout (which would create an import cycle via WelcomePanel -> Toolbar).

export interface DockPanelInfo {
  id: string;
  title: string;
  open: boolean;
}

export interface LayoutBus {
  /** Tool panels (models, palette, properties, scripts, welcome) with open state. */
  getPanels(): DockPanelInfo[];
  /** Reopen a closed tool panel, or focus it when already open. */
  showPanel(id: string): void;
  /** Restore the default arrangement. */
  reset(): void;
}

let bus: LayoutBus | null = null;

export function registerLayoutBus(b: LayoutBus | null): void {
  bus = b;
}

export function layoutBus(): LayoutBus | null {
  return bus;
}
