import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  memoryKeyValueStore,
  setDefaultKeyValueStoreForTests,
} from '../src/persistence/keyval';
import { ScriptPanel } from '../src/ui/ScriptPanel';

vi.mock('../src/ui/MonacoEditor', () => ({
  default: () => createElement('div', { 'data-testid': 'monaco-editor' }),
}));

let root: Root | undefined;
let restoreStore: (() => void) | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  restoreStore?.();
  root = undefined;
  restoreStore = undefined;
});

describe('Script panel', () => {
  it('migrates the architecture example to a human-readable dropdown name', async () => {
    const store = memoryKeyValueStore([
      [
        'archi-online.scripts',
        [{ id: 'architecture', name: 'archi_online_architecture', code: '// fixture' }],
      ],
    ]);
    restoreStore = setDefaultKeyValueStoreForTests(store);
    const host = document.createElement('div');
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(ScriptPanel));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      host.querySelector<HTMLOptionElement>('option[value="architecture"]')?.textContent,
    ).toBe('Archi Online architecture');
    expect(
      (store.data.get('archi-online.scripts') as { id: string; name: string; code: string }[])[0]
        .name,
    ).toBe('Archi Online architecture');
  });
});
