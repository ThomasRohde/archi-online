import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StaticViewContent } from '../src/canvas/export/StaticViewSvg';
import { connectionEndpointModel } from './helpers/connection-endpoints';

describe('connection endpoint projections', () => {
  it('includes recursively routed connection endpoints in static SVG export', () => {
    const model = connectionEndpointModel();
    const markup = renderToStaticMarkup(
      createElement('svg', null, createElement(StaticViewContent, { model, viewId: 'view' })),
    );

    expect(markup).toContain('data-conn-id="base"');
    expect(markup).toContain('data-conn-id="dependent"');
    expect(markup).toContain('d="M150,20 L150,160"');
  });
});
