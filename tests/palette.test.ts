import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addView, createEmptyModel, setViewpoint } from '../src/model/ops';
import {
  createModelStore,
  getActiveModelStore,
  openView,
  replaceModel,
  setActiveTool,
  setActiveModelStore,
  type ModelStore,
  type Tool,
} from '../src/model/store';
import * as modelStore from '../src/model/store';
import { Palette } from '../src/ui/Palette';
import { ModelStoreProvider, useStore } from '../src/ui/store-hooks';

type FinishPaletteToolUse = (tool: Tool, store?: ModelStore) => void;
const finishPaletteToolUse = (modelStore as typeof modelStore & {
  finishPaletteToolUse?: FinishPaletteToolUse;
}).finishPaletteToolUse;

async function render(element: React.ReactElement): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return { host, root };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  replaceModel(createEmptyModel('Palette Test'), null);
  openView(addView('Palette View'));
});

afterEach(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('Palette', () => {
  it('disables every tool until an editable view is active', async () => {
    useStore.setState({ activeViewId: null, openViewIds: [] });
    const { host, root } = await render(createElement(Palette));
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')];

    expect(buttons.length).toBeGreaterThan(10);
    expect(buttons.every((button) => button.disabled)).toBe(true);
    expect(buttons[0].title).toBe('Open an editable view to use the palette');
    await act(async () => root.unmount());
  });

  it('offers Format Painter with one-shot and sticky activation', async () => {
    const { host, root } = await render(createElement(Palette));
    const button = host.querySelector<HTMLButtonElement>('button[data-tool-kind="format-painter"]');

    expect(button).not.toBeNull();
    await act(async () => button!.click());
    expect(useStore.getState().activeTool).toEqual({ kind: 'format-painter' });

    await act(async () => button!.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true,
      detail: 2,
    })));
    expect(useStore.getState().activeTool).toEqual({
      kind: 'format-painter',
      sticky: true,
    });
    await act(async () => root.unmount());
  });

  it('disables Format Painter in a read-only model session', async () => {
    const store = createModelStore({ model: createEmptyModel('Read-only palette') });
    openView(addView('Read-only View', undefined, store), store);
    store.setState({ readOnly: true });
    const { host, root } = await render(createElement(
      ModelStoreProvider,
      { store, children: createElement(Palette) },
    ));
    const button = host.querySelector<HTMLButtonElement>('button[data-tool-kind="format-painter"]');

    expect(button?.disabled).toBe(true);
    await act(async () => button?.click());
    expect(store.getState().activeTool).toEqual({ kind: 'select' });
    await act(async () => root.unmount());
  });

  it('renders the Junction element as a dot instead of a filled square swatch', async () => {
    const { host, root } = await render(createElement(Palette));
    const button = host.querySelector<HTMLButtonElement>('button[title="Junction (Other)"]');

    expect(button).not.toBeNull();
    const glyph = button!.querySelector<HTMLElement>('[data-palette-element="Junction"]');
    expect(glyph).not.toBeNull();
    expect(glyph?.classList.contains('pal-junction-el')).toBe(true);
    expect(glyph?.querySelector('[data-junction-icon="dot"]')).not.toBeNull();
    expect(glyph?.querySelector('rect')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('greys out element entries disallowed by the active view viewpoint', async () => {
    const viewId = addView('Restricted');
    setViewpoint(viewId, 'application_structure');
    openView(viewId);

    const { host, root } = await render(createElement(Palette));
    const btnFor = (type: string) =>
      host.querySelector<HTMLElement>(`[data-palette-element="${type}"]`)?.closest('button');

    // application_structure allows Application concepts, not Business ones.
    expect(btnFor('BusinessActor')?.classList.contains('palette-item-disabled')).toBe(true);
    expect(btnFor('ApplicationComponent')?.classList.contains('palette-item-disabled')).toBe(false);
    // Junction is always allowed (Archi defaultList).
    expect(btnFor('Junction')?.classList.contains('palette-item-disabled')).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });

  it.each([
    ['Magic connector', 'Magic connector — pick a valid relationship after drawing'],
    ['relationship', 'Assignment'],
    ['note', 'Note'],
    ['group', 'Group'],
    ['element', 'Business Actor (Business)'],
  ])('Shift-click keeps the %s creation tool sticky', async (_kind, title) => {
    const { host, root } = await render(createElement(Palette));
    const button = host.querySelector<HTMLButtonElement>(`button[title="${title}"]`)!;

    await act(async () => button.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      detail: 1,
      shiftKey: true,
    })));

    expect(useStore.getState().activeTool).toMatchObject({ sticky: true });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    await act(async () => root.unmount());
  });

  it('double-click keeps a palette creation tool sticky', async () => {
    const { host, root } = await render(createElement(Palette));
    const button = host.querySelector<HTMLButtonElement>('button[title="Note"]')!;

    await act(async () => button.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true,
      detail: 2,
    })));

    expect(useStore.getState().activeTool).toEqual({ kind: 'create-note', sticky: true });
    await act(async () => root.unmount());
  });

  it('a single click clears sticky mode while keeping the selected tool one-shot', async () => {
    setActiveTool({ kind: 'create-note', sticky: true } as Tool);
    const { host, root } = await render(createElement(Palette));
    const button = host.querySelector<HTMLButtonElement>('button[title="Note"]')!;

    await act(async () => button.click());

    expect(useStore.getState().activeTool).toEqual({ kind: 'create-note' });
    await act(async () => root.unmount());
  });

  it('finishes an ordinary palette creation as one-shot', () => {
    expect(finishPaletteToolUse, 'finishPaletteToolUse must be exported').toBeTypeOf('function');
    if (!finishPaletteToolUse) return;
    const tool: Tool = { kind: 'create-note' };
    setActiveTool(tool);

    finishPaletteToolUse(tool);

    expect(useStore.getState().activeTool).toEqual({ kind: 'select' });
  });

  it('keeps a sticky palette creation tool selected after use', () => {
    expect(finishPaletteToolUse, 'finishPaletteToolUse must be exported').toBeTypeOf('function');
    if (!finishPaletteToolUse) return;
    const tool: Tool = { kind: 'create-note', sticky: true };
    setActiveTool(tool);

    finishPaletteToolUse(tool);

    expect(useStore.getState().activeTool).toEqual(tool);
  });

  it('does not reset a newer tool when an earlier creation finishes asynchronously', () => {
    expect(finishPaletteToolUse, 'finishPaletteToolUse must be exported').toBeTypeOf('function');
    if (!finishPaletteToolUse) return;
    const usedTool: Tool = { kind: 'create-note' };
    const newerTool: Tool = { kind: 'create-group' };
    setActiveTool(usedTool);
    setActiveTool(newerTool);

    finishPaletteToolUse(usedTool);

    expect(useStore.getState().activeTool).toEqual(newerTool);
  });

  it('Escape from the palette returns a sticky tool to Select', async () => {
    const { host, root } = await render(createElement(Palette));
    const button = host.querySelector<HTMLButtonElement>('button[title="Note"]')!;
    await act(async () => button.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      shiftKey: true,
    })));

    await act(async () => button.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'Escape',
    })));

    expect(useStore.getState().activeTool).toEqual({ kind: 'select' });
    await act(async () => root.unmount());
  });

  it('updates the provider store without mutating a different global active store', async () => {
    const previous = getActiveModelStore();
    const providerStore = createModelStore({ model: createEmptyModel('Provider') });
    const globalStore = createModelStore({ model: createEmptyModel('Global') });
    setActiveModelStore(globalStore);
    openView(addView('Provider View', undefined, providerStore), providerStore);
    let root: Root | undefined;
    try {
      const rendered = await render(createElement(
        ModelStoreProvider,
        {
          store: providerStore,
          children: createElement(Palette),
        },
      ));
      root = rendered.root;
      const button = rendered.host.querySelector<HTMLButtonElement>('button[title="Note"]')!;

      await act(async () => button.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        shiftKey: true,
      })));

      expect(providerStore.getState().activeTool).toEqual({ kind: 'create-note', sticky: true });
      expect(globalStore.getState().activeTool).toEqual({ kind: 'select' });
    } finally {
      if (root) await act(async () => root?.unmount());
      setActiveModelStore(previous);
    }
  });
});
