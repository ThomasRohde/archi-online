export interface LocalExtensionRecord {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  source: string;
  createdAt: number;
  updatedAt: number;
  origin?: 'source' | 'override';
}

export interface ExtensionCommandContext {
  extensionId: string;
  activeViewId: string | null;
  selectionIds: string[];
  trigger?: unknown;
}

export interface ExtensionCommand {
  id: string;
  title: string;
  description?: string;
  run(context: ExtensionCommandContext, args?: unknown): unknown | Promise<unknown>;
}

export interface ExtensionToolbarButton {
  id: string;
  label: string;
  command: string;
}

export type ExtensionMenuLocation =
  | 'extensions.menu'
  | 'model-tree.context'
  | 'view.context'
  | 'selection.context';

export interface ExtensionMenuItem {
  id: string;
  label: string;
  command: string;
  danger?: boolean;
}

export interface ExtensionPanel {
  id: string;
  title: string;
  render(container: HTMLElement): void | (() => void);
}

export interface ExtensionRuntimeError {
  extensionId: string;
  message: string;
  time: number;
}

export type ExtensionEventName =
  | 'app.ready'
  | 'model.opened'
  | 'model.changed'
  | 'model.saved'
  | 'selection.changed'
  | 'view.opened'
  | 'view.activated'
  | 'view.contextMenu'
  | 'tree.contextMenu'
  | 'script.error';

export type ExtensionEventHandler = (payload: unknown) => unknown | Promise<unknown>;

export interface ExtensionRegistrySnapshot {
  commands: ExtensionCommand[];
  toolbarButtons: ExtensionToolbarButton[];
  menus: Record<ExtensionMenuLocation, ExtensionMenuItem[]>;
  panels: ExtensionPanel[];
  errors: ExtensionRuntimeError[];
}
