/**
 * Global Ctrl/Cmd shortcut keys that mutate the model and are therefore
 * suppressed while the active model is read-only (undo, redo, duplicate).
 * File-level shortcuts like Open and Save stay available and decide for
 * themselves how to behave.
 */
export function blocksReadOnlyShortcut(key: string): boolean {
  return ['z', 'y', 'd'].includes(key.toLowerCase());
}
