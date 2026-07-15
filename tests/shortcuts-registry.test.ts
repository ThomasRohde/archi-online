import { describe, expect, it } from 'vitest';
import { SHORTCUTS, matchesShortcut } from '../src/ui/shortcuts';

function key(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, ...options });
}

describe('shortcut registry', () => {
  it('contains the previously omitted new, cut, and alternate redo shortcuts', () => {
    expect(SHORTCUTS.map((shortcut) => shortcut.id)).toEqual(expect.arrayContaining([
      'new-model',
      'cut',
      'redo-shift',
    ]));
    expect(SHORTCUTS.find(({ id }) => id === 'new-model')?.keys).toBe('Ctrl+Alt+N');
    expect(SHORTCUTS.find(({ id }) => id === 'cut')?.keys).toBe('Ctrl+X');
    expect(SHORTCUTS.find(({ id }) => id === 'redo-shift')?.keys).toBe('Ctrl+Shift+Z');
  });

  it('matches platform control modifiers and exact additional modifiers', () => {
    expect(matchesShortcut('new-model', key('n', { ctrlKey: true, altKey: true }))).toBe(true);
    expect(matchesShortcut('new-model', key('n', { ctrlKey: true }))).toBe(false);
    expect(matchesShortcut('redo-shift', key('Z', { metaKey: true, shiftKey: true }))).toBe(true);
    expect(matchesShortcut('undo', key('z', { ctrlKey: true, shiftKey: true }))).toBe(false);
  });
});
