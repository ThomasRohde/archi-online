import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConnectionView } from '../src/canvas/ConnectionView';
import { NodeFigure } from '../src/canvas/figures/NodeFigure';
import type { DiagramNode } from '../src/model/types';

const node: DiagramNode = {
  id: 'node', nodeType: 'element', elementId: 'element', viewId: 'view', parentId: 'view',
  bounds: { x: 0, y: 0, width: 120, height: 55 }, childIds: [], sourceConnectionIds: [], targetConnectionIds: [],
  fillColor: '#336699', gradient: 1, lineStyle: 2, lineWidth: 3, iconVisible: 2,
  fontStyle: { family: 'Aptos', sizePt: 12, bold: true, italic: true }, fontAlpha: 128,
};

describe('VIEW-08 rendering', () => {
  it('renders gradient, outline, typed font, and expression label', () => {
    const html = renderToStaticMarkup(createElement(NodeFigure, {
      node,
      element: { id: 'element', kind: 'element', type: 'BusinessActor', name: 'Default', documentation: '', properties: [], profileIds: [], folderId: 'folder' },
      width: 120,
      height: 55,
      displayLabel: 'Expression Label',
    }));
    expect(html).toContain('<linearGradient');
    expect(html).toContain('stroke-dasharray="2 3"');
    expect(html).toContain('stroke-width="3"');
    expect(html).toContain('font-family:Aptos');
    expect(html).toContain('font-weight:700');
    expect(html).toContain('opacity:0.5019607843137255');
    expect(html).toContain('Expression Label');
    expect(html).not.toContain('Default</div>');
  });

  it('lets expression labels and line style override relationship defaults', () => {
    const html = renderToStaticMarkup(createElement(ConnectionView, {
      conn: { id: 'conn', viewId: 'view', connType: 'plain', name: '', documentation: '', properties: [], sourceConnectionIds: [], targetConnectionIds: [], sourceId: 'one', targetId: 'two', bendpoints: [], lineStyle: 1, lineWidth: 2 },
      rel: undefined,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      selected: false,
      displayLabel: 'Connection Label',
    }));
    expect(html).toContain('stroke-dasharray="6 4"');
    expect(html).toContain('stroke-width="2"');
    expect(html).toContain('Connection Label');
  });
});
