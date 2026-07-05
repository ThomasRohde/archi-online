import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  C4_PROPERTY_KEYS,
  C4_VISUAL_DEFAULTS,
  c4ElementLabelParts,
  c4KindForConcept,
  c4PropertyValue,
} from '../src/model/c4';
import { addElementNodeToView, addView, createC4ElementOnView, createC4TemplateView, createEmptyModel } from '../src/model/ops';
import { openView, replaceModel, setSelection, useStore } from '../src/model/store';
import { ConnectionView } from '../src/canvas/ConnectionView';
import { NodeFigure } from '../src/canvas/figures/NodeFigure';
import { Palette } from '../src/ui/Palette';
import { PropertiesPanel } from '../src/ui/PropertiesPanel';

function model() {
  return useStore.getState().model!;
}

async function render(element: React.ReactElement): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return { host, root };
}

async function changeSelect(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function propertyRow(host: HTMLElement, label: string): HTMLElement {
  const rows = Array.from(host.querySelectorAll<HTMLElement>('.prop-row'));
  const row = rows.find((candidate) => candidate.querySelector('label')?.textContent === label);
  expect(row, `Expected property row "${label}"`).toBeDefined();
  return row!;
}

beforeEach(() => {
  replaceModel(createEmptyModel('C4 UI Test'), null);
});

describe('C4 UI affordances', () => {
  it('renders and edits C4 metadata in the properties panel', async () => {
    createC4TemplateView('container');
    const web = Object.values(model().elements).find((element) => element.name === 'Web Application')!;
    setSelection('tree', [web.id]);
    const { host, root } = await render(createElement(PropertiesPanel));

    expect(host.textContent).toContain('C4 Profile');
    expect(propertyRow(host, 'Technology').querySelector('input')?.value).toBe(
      'React, TypeScript',
    );

    await changeSelect(propertyRow(host, 'C4 type').querySelector('select')!, 'software-system');

    expect(c4KindForConcept(model().elements[web.id])).toBe('software-system');

    await act(async () => {
      root.unmount();
    });
  });

  it('shows C4 palette shortcuts when the active view is a C4 view', async () => {
    const viewId = createC4TemplateView('container');
    openView(viewId);
    const { host, root } = await render(createElement(Palette));

    const expectedIcons = [
      ['C4 Person', 'person'],
      ['C4 Software System', 'software-system'],
      ['C4 Container', 'container'],
      ['C4 Component', 'component'],
      ['C4 Deployment Node', 'deployment-node'],
      ['C4 Infrastructure Node', 'infrastructure-node'],
      ['C4 Database', 'database'],
    ] as const;
    for (const [title, icon] of expectedIcons) {
      const button = host.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
      expect(button, `Expected ${title} palette button`).not.toBeNull();
      expect(button?.querySelector(`[data-c4-palette-icon="${icon}"]`)).not.toBeNull();
    }

    const containerButton = host.querySelector<HTMLButtonElement>('button[title="C4 Container"]');
    expect(containerButton).not.toBeNull();

    await act(async () => {
      containerButton!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(useStore.getState().activeTool).toEqual({
      kind: 'create-c4-element',
      c4Kind: 'container',
    });

    const databaseButton = host.querySelector<HTMLButtonElement>('button[title="C4 Database"]');
    await act(async () => {
      databaseButton!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(useStore.getState().activeTool).toEqual({
      kind: 'create-c4-element',
      c4Kind: 'container',
      c4Properties: { [C4_PROPERTY_KEYS.tags]: 'database' },
    });

    await act(async () => {
      root.unmount();
    });
  });

  it('renders C4 node and relationship labels on the canvas', async () => {
    createC4TemplateView('dynamic');
    const element = Object.values(model().elements).find((candidate) => candidate.name === 'Web Application')!;
    const node = Object.values(model().nodes).find(
      (candidate) => candidate.nodeType === 'element' && candidate.elementId === element.id,
    )!;
    const relationship = Object.values(model().relationships).find(
      (candidate) => c4PropertyValue(candidate.properties, C4_PROPERTY_KEYS.order) === '1',
    )!;
    const connection = Object.values(model().connections).find(
      (candidate) => candidate.relationshipId === relationship.id,
    )!;
    const { host, root } = await render(
      createElement(
        'svg',
        null,
        createElement(NodeFigure, {
          node,
          element,
          width: 190,
          height: 92,
          c4ViewType: 'dynamic',
        }),
        createElement(ConnectionView, {
          conn: connection,
          rel: relationship,
          c4ViewType: 'dynamic',
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
          selected: false,
        }),
      ),
    );

    expect(host.textContent).toContain('Web Application');
    expect(host.textContent).toContain('[Container: React, TypeScript]');
    expect(host.querySelector('[data-c4-shape="box"]')?.getAttribute('fill')).toBe(
      C4_VISUAL_DEFAULTS.elementFill,
    );
    expect(host.querySelector('[data-c4-shape="box"]')?.getAttribute('stroke')).toBe(
      C4_VISUAL_DEFAULTS.elementLine,
    );
    expect(host.querySelector('g[color]')).toBeNull();
    expect(host.querySelector('[data-c4-relationship="true"]')?.getAttribute('stroke')).toBe(
      C4_VISUAL_DEFAULTS.relationshipLine,
    );
    expect(Array.from(host.querySelectorAll('tspan')).map((tspan) => tspan.textContent)).toEqual([
      '1. Submits order',
      '[HTTPS]',
    ]);

    await act(async () => {
      root.unmount();
    });
  });

  it('renders database containers and parent nodes with dedicated C4 shapes in C4 views', async () => {
    createC4TemplateView('container');
    const database = Object.values(model().elements).find((candidate) => candidate.name === 'Customer Database')!;
    const databaseNode = Object.values(model().nodes).find(
      (candidate) => candidate.nodeType === 'element' && candidate.elementId === database.id,
    )!;
    const system = Object.values(model().elements).find((candidate) => candidate.name === 'Customer Portal')!;
    const systemNode = Object.values(model().nodes).find(
      (candidate) => candidate.nodeType === 'element' && candidate.elementId === system.id,
    )!;

    const { host, root } = await render(
      createElement(
        'svg',
        null,
        createElement(NodeFigure, {
          node: databaseNode,
          element: database,
          width: 190,
          height: 92,
          c4ViewType: 'container',
        }),
        createElement(NodeFigure, {
          node: systemNode,
          element: system,
          width: 640,
          height: 285,
          c4ViewType: 'container',
        }),
      ),
    );

    expect(host.querySelector('[data-c4-shape="database"]')).not.toBeNull();
    expect(host.querySelector('[data-c4-shape="boundary"]')?.getAttribute('stroke-dasharray')).toBe('8 5');
    expect(host.textContent).toContain('Software System: Customer Portal');

    await act(async () => {
      root.unmount();
    });
  });

  it('keeps C4-tagged elements in non-C4 views on normal ArchiMate rendering', async () => {
    createC4TemplateView('container');
    const element = Object.values(model().elements).find((candidate) => candidate.name === 'Web Application')!;
    const viewId = addView('Mixed ArchiMate View');
    const nodeId = addElementNodeToView(viewId, element.id, viewId, {
      x: 0,
      y: 0,
      width: 190,
      height: 92,
    });
    const node = model().nodes[nodeId];
    const { host, root } = await render(
      createElement(
        'svg',
        null,
        createElement(NodeFigure, {
          node,
          element,
          width: 190,
          height: 92,
        }),
      ),
    );

    expect(host.querySelector('[data-c4-shape]')).toBeNull();
    expect(host.textContent).toBe('Web Application');

    await act(async () => {
      root.unmount();
    });
  });

  it('persists default C4 style on palette-created C4 elements', () => {
    const viewId = createC4TemplateView('container');
    const { nodeId, elementId } = createC4ElementOnView('container', viewId, viewId, {
      x: 10,
      y: 10,
      width: 180,
      height: 90,
    });

    expect(c4KindForConcept(model().elements[elementId])).toBe('container');
    expect(model().nodes[nodeId]).toMatchObject({
      fillColor: C4_VISUAL_DEFAULTS.elementFill,
      lineColor: C4_VISUAL_DEFAULTS.elementLine,
      fontColor: C4_VISUAL_DEFAULTS.textOnDark,
    });
  });

  it('uses database-facing defaults for palette-created C4 database elements', () => {
    const viewId = createC4TemplateView('container');
    const { elementId } = createC4ElementOnView(
      'container',
      viewId,
      viewId,
      {
        x: 10,
        y: 10,
        width: 180,
        height: 90,
      },
      undefined,
      { [C4_PROPERTY_KEYS.tags]: 'database' },
    );
    const element = model().elements[elementId];

    expect(c4KindForConcept(element)).toBe('container');
    expect(c4PropertyValue(element.properties, C4_PROPERTY_KEYS.tags)).toBe('database');
    expect(element.name).toBe('Database');
    expect(c4ElementLabelParts(element)?.kindLabel).toBe('Database');
  });
});
