import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { NodeFigure } from '../src/canvas/figures/NodeFigure';
import type { ArchimateElement, ElementNode } from '../src/model/types';

async function render(element: React.ReactElement): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return { host, root };
}

describe('NodeFigure', () => {
  it('renders the alternate Application Component body as a closed rectangle behind its tabs', async () => {
    const element: ArchimateElement = {
      id: 'app',
      kind: 'element',
      type: 'ApplicationComponent',
      name: 'Application Component',
      documentation: '',
      properties: [],
      folderId: 'app-folder',
    };
    const node: ElementNode = {
      id: 'node',
      viewId: 'view',
      parentId: 'view',
      bounds: { x: 0, y: 0, width: 120, height: 70 },
      childIds: [],
      sourceConnectionIds: [],
      targetConnectionIds: [],
      nodeType: 'element',
      elementId: 'app',
      figureType: 1,
    };

    const { host, root } = await render(
      createElement(
        'svg',
        null,
        createElement(NodeFigure, {
          node,
          element,
          width: 120,
          height: 70,
        }),
      ),
    );

    const body = host.querySelector('[data-figure-part="component-body"]');
    expect(body?.tagName.toLowerCase()).toBe('rect');
    expect(body?.getAttribute('x')).toBe('12');
    expect(body?.getAttribute('y')).toBe('0');
    expect(body?.getAttribute('width')).toBe('108');
    expect(body?.getAttribute('height')).toBe('70');

    await act(async () => {
      root.unmount();
    });
  });
});
