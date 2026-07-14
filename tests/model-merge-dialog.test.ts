import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { serializeArchimateDocument } from '../src/model/io/archimate-xml';
import { addElement, createEmptyModel } from '../src/model/ops';
import { createModelStore, replaceModel } from '../src/model/store';
import { ModelMergeDialog } from '../src/ui/ModelMergeDialog';
import { useStore } from '../src/ui/store-hooks';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 80; index++) {
    if (predicate()) return;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  }
  expect(predicate()).toBe(true);
}

describe('ModelMergeDialog', () => {
  it('parses a source without opening a session, previews it, and applies the plan', async () => {
    replaceModel(createEmptyModel('Target'), null);
    const sourceStore = createModelStore({ model: createEmptyModel('Source') });
    const actor = addElement('BusinessActor', 'Imported actor', undefined, sourceStore);
    const bytes = await serializeArchimateDocument(sourceStore.getState().model!);
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => { root.render(createElement(ModelMergeDialog, { onClose() {} })); });
    const dialog = document.body.querySelector<HTMLElement>('.model-merge-dialog')!;
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [{
        name: 'source.archimate',
        arrayBuffer: async () => bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      } as File],
    });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await waitFor(() => dialog.textContent?.includes('Preview is current.') ?? false);

    const apply = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent === 'Apply Import',
    )!;
    await act(async () => { apply.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(useStore.getState().model!.elements[actor]).toBeDefined();
    expect(dialog.textContent).toContain('Import applied as one undoable change.');
    await act(async () => { root.unmount(); });
  });
});
