import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  C4_PROPERTY_KEYS,
  C4_VISUAL_DEFAULTS,
  c4ElementLabelParts,
  c4KindForConcept,
  c4PropertyValue,
} from '../src/model/c4';
import {
  addElementNodeToView,
  addView,
  createC4ElementOnView,
  createC4TemplateView,
  createEmptyModel,
} from '../src/model/ops';
import { openView, replaceModel, setSelection } from '../src/model/store';
import { useStore } from '../src/ui/store-hooks';
import { ConnectionView } from '../src/canvas/ConnectionView';
import { NodeFigure } from '../src/canvas/figures/NodeFigure';
import { Palette } from '../src/ui/Palette';
import { PropertiesPanel } from '../src/ui/PropertiesPanel';
import { ContextMenuHost } from '../src/ui/ContextMenu';
import { Toolbar } from '../src/ui/Toolbar';

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
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  replaceModel(createEmptyModel('C4 UI Test'), null);
});

afterEach(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  document.body.innerHTML = '';
});

describe('C4 UI affordances', () => {
  it('does not consume a phantom C4 view ID from a disabled read-only menu', async () => {
    const viewId = addView('Existing View');
    openView(viewId);
    setSelection('tree', [viewId]);
    useStore.setState({ readOnly: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(
      Fragment,
      null,
      createElement(ContextMenuHost),
      createElement(Toolbar),
    )));
    const c4Button = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Create and validate C4 views"]',
    )!;

    await act(async () => c4Button.click());
    const parent = Array.from(document.querySelectorAll<HTMLElement>('.ctx-item')).find(
      (item) => item.querySelector(':scope > .ctx-label')?.textContent === 'New C4 View',
    )!;
    await act(async () => parent.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    const child = Array.from(document.querySelectorAll<HTMLElement>('.ctx-item')).find(
      (item) => item.querySelector(':scope > .ctx-label')?.textContent === 'System Landscape',
    );
    if (child) await act(async () => child.click());
    const state = useStore.getState();
    const viewIds = Object.keys(model().views);

    await act(async () => root.unmount());
    host.remove();

    expect(viewIds).toEqual([viewId]);
    expect(state.activeViewId).toBe(viewId);
    expect(state.openViewIds).toEqual([viewId]);
    expect(state.selection).toEqual({ source: 'tree', ids: [viewId] });
    expect(child).toBeUndefined();
  });

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
    expect(host.querySelector('[data-c4-shape="box"]')?.getAttribute('stroke-width')).toBe('2');
    expect(host.querySelector('g[color]')).toBeNull();
    const relationshipPath = host.querySelector('[data-c4-relationship="true"]');
    expect(relationshipPath?.getAttribute('stroke')).toBe(C4_VISUAL_DEFAULTS.relationshipLine);
    expect(relationshipPath?.getAttribute('stroke-dasharray')).toBe('6 4');
    expect(Array.from(host.querySelectorAll('tspan')).map((tspan) => tspan.textContent)).toEqual([
      '1. Submits order',
      '[HTTPS]',
    ]);

    await act(async () => {
      root.unmount();
    });
  });

  it('renders internal and external people as outlined person figures', async () => {
    const viewId = addView('People');
    const { elementId, nodeId } = createC4ElementOnView(
      'person',
      viewId,
      viewId,
      { x: 0, y: 0, width: 160, height: 150 },
      'Customer',
    );
    const person = model().elements[elementId];
    const node = model().nodes[nodeId];
    const externalPerson = {
      ...person,
      id: 'external-person',
      name: 'External Customer',
      properties: [
        ...person.properties,
        { key: C4_PROPERTY_KEYS.external, value: 'true' },
      ],
    };
    const externalNode = {
      ...node,
      id: 'external-person-node',
      elementId: externalPerson.id,
      fillColor: undefined,
      lineColor: undefined,
      fontColor: undefined,
    };
    const { host, root } = await render(
      createElement(
        'svg',
        null,
        createElement(NodeFigure, {
          node,
          element: person,
          width: 160,
          height: 150,
          c4ViewType: 'system-context',
        }),
        createElement(NodeFigure, {
          node: externalNode,
          element: externalPerson,
          width: 160,
          height: 150,
          c4ViewType: 'system-context',
        }),
      ),
    );

    const bodies = host.querySelectorAll('[data-c4-shape="person"]');
    expect(bodies).toHaveLength(2);
    expect(bodies[0].tagName.toLowerCase()).toBe('rect');
    expect(bodies[0].getAttribute('fill')).toBe(C4_VISUAL_DEFAULTS.personFill);
    expect(bodies[0].getAttribute('stroke')).toBe(C4_VISUAL_DEFAULTS.personLine);
    expect(bodies[1].getAttribute('stroke')).toBe(C4_VISUAL_DEFAULTS.externalLine);
    expect(host.querySelectorAll('[data-c4-shape-part="head"]')).toHaveLength(2);

    await act(async () => root.unmount());
  });

  it('renders each C4 container variant with a shape hook and structured label', async () => {
    const viewId = addView('Shapes');
    const shapes = ['browser', 'folder', 'bucket', 'terminal', 'database'] as const;
    const figures = shapes.map((shape) => {
      const { elementId, nodeId } = createC4ElementOnView(
        'container',
        viewId,
        viewId,
        { x: 0, y: 0, width: 190, height: 92 },
        `${shape} service`,
        { [C4_PROPERTY_KEYS.tags]: shape },
      );
      return { shape, element: model().elements[elementId], node: model().nodes[nodeId] };
    });
    const { host, root } = await render(
      createElement(
        'svg',
        null,
        ...figures.map(({ shape, element, node }) => createElement(
          'g',
          { key: shape },
          createElement(NodeFigure, {
            node,
            element,
            width: 190,
            height: 92,
            c4ViewType: 'container',
          }),
        )),
      ),
    );

    for (const shape of shapes) {
      expect(host.querySelector(`[data-c4-shape="${shape}"]`), shape).not.toBeNull();
      expect(host.textContent).toContain(`${shape} service`);
    }
    expect(host.textContent).toContain('[Container]');
    expect(host.textContent).toContain('[Database]');

    await act(async () => root.unmount());
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
    const boundary = host.querySelector('[data-c4-shape="boundary"]');
    expect(boundary?.getAttribute('stroke-dasharray')).toBeNull();
    expect(boundary?.getAttribute('rx')).toBe('8');
    expect(Array.from(host.querySelectorAll('text')).map((text) => text.textContent)).toEqual([
      'Customer Portal',
      '[Software System]',
    ]);

    await act(async () => {
      root.unmount();
    });
  });

  it('keeps explicit C4 appearance overrides authoritative', async () => {
    const viewId = addView('Overrides');
    const { elementId, nodeId } = createC4ElementOnView(
      'container',
      viewId,
      viewId,
      { x: 0, y: 0, width: 190, height: 92 },
    );
    const node = {
      ...model().nodes[nodeId],
      fillColor: '#fff4d6',
      lineColor: '#c0121c',
      fontColor: '#ec870c',
      derivedLineColor: false,
      lineWidth: 3 as const,
      lineStyle: 2 as const,
    };
    const { host, root } = await render(createElement(
      'svg',
      null,
      createElement(NodeFigure, {
        node,
        element: model().elements[elementId],
        width: 190,
        height: 92,
        c4ViewType: 'container',
      }),
    ));

    const body = host.querySelector('[data-c4-shape="box"]');
    expect(body?.getAttribute('fill')).toBe('#fff4d6');
    expect(body?.getAttribute('stroke')).toBe('#c0121c');
    expect(body?.getAttribute('stroke-width')).toBe('3');
    expect(body?.getAttribute('stroke-dasharray')).toBe('2 3');
    expect(host.querySelector('foreignObject div')?.getAttribute('style')).toContain(
      'color: rgb(236, 135, 12)',
    );

    await act(async () => root.unmount());
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
      fontColor: C4_VISUAL_DEFAULTS.elementText,
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
