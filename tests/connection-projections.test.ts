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

  it('exports the same view-wide Manhattan route while preserving stored bendpoints', () => {
    const model = connectionEndpointModel();
    model.views.view.connectionRouterType = 2;
    model.connections.dependent.bendpoints = [
      { startX: 200, startY: 200, endX: 200, endY: 200 },
    ];
    const before = structuredClone(model.connections.dependent.bendpoints);
    const markup = renderToStaticMarkup(
      createElement('svg', null, createElement(StaticViewContent, { model, viewId: 'view' })),
    );

    expect(markup).toContain('d="M150,20 L150,90 L150,90 L150,160"');
    expect(model.connections.dependent.bendpoints).toEqual(before);
  });
});
