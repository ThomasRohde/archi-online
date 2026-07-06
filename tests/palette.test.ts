import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { addView, createEmptyModel, setViewpoint } from '../src/model/ops';
import { openView, replaceModel } from '../src/model/store';
import { Palette } from '../src/ui/Palette';

async function render(element: React.ReactElement): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return { host, root };
}

beforeEach(() => {
  replaceModel(createEmptyModel('Palette Test'), null);
});

describe('Palette', () => {
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
});
