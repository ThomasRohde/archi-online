import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addElement,
  addElementNodeToView,
  addView,
  createEmptyModel,
  importModelAsset,
} from '../src/model/ops';
import { activateModelSession, addModelSession, getModelSession, resetWorkspaceForTests } from '../src/model/workspace';
import { replaceModel, setSelection } from '../src/model/store';
import { ImageGallery } from '../src/ui/ImageGallery';
import { PropertiesPanel } from '../src/ui/PropertiesPanel';
import { ModelStoreProvider, useStore } from '../src/ui/store-hooks';

async function render(element: React.ReactElement): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  return { host, root };
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

async function change(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  resetWorkspaceForTests();
  replaceModel(createEmptyModel('Images UI'), null);
});

describe('image UI', () => {
  it('chooses, previews, positions, and removes a custom node image', async () => {
    const path = await importModelAsset(new Uint8Array([1, 2, 3]), 'logo.png', 'image/png');
    const view = addView('View');
    const element = addElement('BusinessActor', 'Actor');
    const node = addElementNodeToView(view, element, view, { x: 0, y: 0, width: 120, height: 55 });
    setSelection('view', [node]);
    const { host, root } = await render(createElement(PropertiesPanel));

    await click(Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Image')!);
    await click(host.querySelector(`[data-image-path="${path}"]`)!);
    expect(useStore.getState().model!.nodes[node]).toMatchObject({
      imagePath: path,
      imageSource: 1,
    });
    expect(host.querySelector<HTMLImageElement>('.image-preview img')?.src).toMatch(/^data:image\/png;base64,/);

    await change(host.querySelector<HTMLSelectElement>('select[aria-label="Image position"]')!, '9');
    expect(useStore.getState().model!.nodes[node].imagePosition).toBe(9);

    await click(Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Remove image')!);
    expect(useStore.getState().model!.nodes[node].imagePath).toBeUndefined();
    expect(useStore.getState().model!.assets[path]).toBeUndefined();
    await act(async () => root.unmount());
  });

  it('copies and deduplicates gallery images from another open model', async () => {
    const sourceId = addModelSession({ model: createEmptyModel('Source'), fileName: null });
    const source = getModelSession(sourceId)!;
    const path = await importModelAsset(
      new Uint8Array([4, 5, 6]),
      'shared.png',
      'image/png',
      source.store,
    );
    const targetId = addModelSession({ model: createEmptyModel('Target'), fileName: null });
    const target = getModelSession(targetId)!;
    activateModelSession(targetId);
    const onSelect = vi.fn();
    const { host, root } = await render(
      createElement(
        ModelStoreProvider,
        {
          store: target.store,
          children: createElement(ImageGallery, { selectedPath: undefined, onSelect }),
        },
      ),
    );

    await click(host.querySelector(`[data-image-session-id="${sourceId}"][data-image-path="${path}"]`)!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    const copiedPath = onSelect.mock.calls[0][0];
    expect(Array.from(target.store.getState().model!.assets[copiedPath].bytes)).toEqual([4, 5, 6]);

    await click(host.querySelector(`[data-image-session-id="${sourceId}"][data-image-path="${path}"]`)!);
    expect(Object.keys(target.store.getState().model!.assets)).toHaveLength(1);
    await act(async () => root.unmount());
  });
});
