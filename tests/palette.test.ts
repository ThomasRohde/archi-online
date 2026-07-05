import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyModel } from '../src/model/ops';
import { replaceModel } from '../src/model/store';
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
});
