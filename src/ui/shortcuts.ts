export type ShortcutScope = 'application' | 'canvas' | 'model-tree' | 'presentation' | 'scripting';

interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

interface ShortcutMatch {
  key: string;
  primary?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export interface ShortcutDefinition {
  id: string;
  keys: string;
  description: string;
  scope: ShortcutScope;
  match?: ShortcutMatch;
}

export const SHORTCUTS = [
  { id: 'new-model', keys: 'Ctrl+Alt+N', description: 'Create a new model', scope: 'application', match: { key: 'n', primary: true, alt: true } },
  { id: 'save', keys: 'Ctrl+S', description: 'Save model', scope: 'application', match: { key: 's', primary: true } },
  { id: 'open', keys: 'Ctrl+O', description: 'Open model', scope: 'application', match: { key: 'o', primary: true } },
  { id: 'undo', keys: 'Ctrl+Z', description: 'Undo', scope: 'application', match: { key: 'z', primary: true } },
  { id: 'redo', keys: 'Ctrl+Y', description: 'Redo', scope: 'application', match: { key: 'y', primary: true } },
  { id: 'redo-shift', keys: 'Ctrl+Shift+Z', description: 'Redo', scope: 'application', match: { key: 'z', primary: true, shift: true } },
  { id: 'copy', keys: 'Ctrl+C', description: 'Copy diagram objects or tree items', scope: 'canvas', match: { key: 'c', primary: true } },
  { id: 'cut', keys: 'Ctrl+X', description: 'Cut diagram objects', scope: 'canvas', match: { key: 'x', primary: true } },
  { id: 'paste', keys: 'Ctrl+V', description: 'Paste diagram objects or tree items', scope: 'canvas', match: { key: 'v', primary: true } },
  { id: 'duplicate', keys: 'Ctrl+D', description: 'Duplicate the tree or view selection', scope: 'canvas', match: { key: 'd', primary: true } },
  { id: 'select-all', keys: 'Ctrl+A', description: 'Select all objects on the view', scope: 'canvas', match: { key: 'a', primary: true } },
  { id: 'delete', keys: 'Delete', description: 'Delete the current selection', scope: 'canvas', match: { key: 'delete' } },
  { id: 'rename', keys: 'F2', description: 'Rename the selected item', scope: 'model-tree', match: { key: 'f2' } },
  { id: 'fit-view', keys: 'Home', description: 'Fit the diagram to the window', scope: 'canvas', match: { key: 'home' } },
  { id: 'zoom-reset', keys: 'Ctrl+0', description: 'Reset canvas zoom to 100%', scope: 'canvas', match: { key: '0', primary: true } },
  { id: 'zoom-in', keys: 'Ctrl+=', description: 'Zoom canvas in', scope: 'canvas', match: { key: '=', primary: true } },
  { id: 'zoom-out', keys: 'Ctrl+-', description: 'Zoom canvas out', scope: 'canvas', match: { key: '-', primary: true } },
  { id: 'tree-filter', keys: 'Ctrl+F', description: 'Filter the model tree', scope: 'model-tree', match: { key: 'f', primary: true } },
  { id: 'run-script', keys: 'Ctrl+Enter', description: 'Run the current script', scope: 'scripting', match: { key: 'enter', primary: true } },
  { id: 'nudge', keys: 'Arrows (+Shift)', description: 'Nudge the selection by 1 px or one grid step', scope: 'canvas' },
  { id: 'pan', keys: 'Middle-drag or Space+drag', description: 'Pan the canvas', scope: 'canvas' },
  { id: 'wheel', keys: 'Wheel / Shift+wheel', description: 'Scroll the canvas', scope: 'canvas' },
  { id: 'disable-snap', keys: 'Alt while dragging', description: 'Disable grid snapping', scope: 'canvas' },
  { id: 'cancel', keys: 'Escape', description: 'Cancel the tool or clear selection', scope: 'canvas', match: { key: 'escape' } },
  { id: 'remove-bendpoint', keys: 'Double-click bendpoint', description: 'Remove a bendpoint', scope: 'canvas' },
  { id: 'present-next', keys: '←/→, PgUp/PgDn', description: 'Show the previous or next presentation view', scope: 'presentation' },
] as const satisfies readonly ShortcutDefinition[];

export type ShortcutId = (typeof SHORTCUTS)[number]['id'];

export function matchesShortcut(id: ShortcutId, event: ShortcutEvent): boolean {
  const definition = SHORTCUTS.find((candidate) => candidate.id === id);
  const match: ShortcutMatch | undefined = definition && 'match' in definition
    ? definition.match
    : undefined;
  if (!match) return false;
  const primary = event.ctrlKey || event.metaKey;
  return event.key.toLowerCase() === match.key &&
    primary === Boolean(match.primary) &&
    event.altKey === Boolean(match.alt) &&
    event.shiftKey === Boolean(match.shift);
}
