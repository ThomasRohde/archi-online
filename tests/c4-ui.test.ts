import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  c4DefaultNodeSize,
  createC4ElementOnView,
  createC4TemplateView,
  createEmptyModel,
} from '../src/model/ops';
import { openView, replaceModel, setActiveTool, setSelection } from '../src/model/store';
import { useStore } from '../src/ui/store-hooks';
import { ViewEditor } from '../src/canvas/ViewEditor';
import { ConnectionView } from '../src/canvas/ConnectionView';
import { NodeFigure } from '../src/canvas/figures/NodeFigure';
import { Palette } from '../src/ui/Palette';
import { PropertiesPanel } from '../src/ui/PropertiesPanel';
import { ContextMenuHost } from '../src/ui/ContextMenu';
import { Toolbar } from '../src/ui/Toolbar';
import { DEFAULT_SETTINGS, useSettingsStore } from '../src/settings/app-settings';

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
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
});

afterEach(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  Reflect.deleteProperty(document, 'elementFromPoint');
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
      ['C4 Web Browser', 'browser'],
      ['C4 Folder', 'folder'],
      ['C4 Bucket', 'bucket'],
      ['C4 Terminal', 'terminal'],
    ] as const;
    for (const [title, icon] of expectedIcons) {
      const button = host.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
      expect(button, `Expected ${title} palette button`).not.toBeNull();
      expect(button?.querySelector(`[data-c4-palette-icon="${icon}"]`)).not.toBeNull();
    }
    expect(
      host.querySelector('[data-c4-palette-icon="folder"] path')?.getAttribute('d'),
    ).toBe('M2,15 V3 H8 L9.5,5 H16 V15 Z');

    const containerButton = host.querySelector<HTMLButtonElement>('button[title="C4 Container"]');
    expect(containerButton).not.toBeNull();

    await act(async () => {
      containerButton!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(useStore.getState().activeTool).toEqual({
      kind: 'create-c4-element',
      c4Kind: 'container',
    });

    for (const [title, tag] of [
      ['C4 Database', 'database'],
      ['C4 Web Browser', 'browser'],
      ['C4 Folder', 'folder'],
      ['C4 Bucket', 'bucket'],
      ['C4 Terminal', 'terminal'],
    ] as const) {
      const button = host.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
      await act(async () => {
        button!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });

      expect(useStore.getState().activeTool).toEqual({
        kind: 'create-c4-element',
        c4Kind: 'container',
        c4Properties: { [C4_PROPERTY_KEYS.tags]: tag },
      });
    }
    await act(async () => {
      root.unmount();
    });
  });

  it('shows Shape only for containers and disables it in read-only mode', async () => {
    const viewId = addView('Shapes');
    const container = createC4ElementOnView(
      'container', viewId, viewId, { x: 0, y: 0, width: 150, height: 72 },
    );
    const instance = createC4ElementOnView(
      'container-instance', viewId, viewId, { x: 180, y: 0, width: 150, height: 72 },
    );
    const person = createC4ElementOnView(
      'person', viewId, viewId, { x: 360, y: 0, width: 160, height: 150 },
    );
    setSelection('tree', [container.elementId]);
    const { host, root } = await render(createElement(PropertiesPanel));

    expect(propertyRow(host, 'Shape').querySelector('select')?.disabled).toBe(false);

    await act(async () => setSelection('tree', [instance.elementId]));
    expect(propertyRow(host, 'Shape').querySelector('select')).not.toBeNull();

    await act(async () => setSelection('tree', [person.elementId]));
    expect(Array.from(host.querySelectorAll('.prop-row label')).some(
      (label) => label.textContent === 'Shape',
    )).toBe(false);

    await act(async () => {
      setSelection('tree', [container.elementId]);
      useStore.setState({ readOnly: true });
    });
    expect(propertyRow(host, 'Shape').querySelector('select')?.disabled).toBe(true);

    await act(async () => root.unmount());
  });

  it('preserves external tags while selecting and clearing a container shape', async () => {
    const viewId = addView('Shapes');
    const { elementId } = createC4ElementOnView(
      'container',
      viewId,
      viewId,
      { x: 0, y: 0, width: 150, height: 72 },
      undefined,
      { [C4_PROPERTY_KEYS.tags]: 'external' },
    );
    setSelection('tree', [elementId]);
    const { host, root } = await render(createElement(PropertiesPanel));
    const shape = propertyRow(host, 'Shape').querySelector('select')!;

    await changeSelect(shape, 'bucket');
    expect(c4PropertyValue(model().elements[elementId].properties, C4_PROPERTY_KEYS.tags)).toBe(
      'external, bucket',
    );

    await changeSelect(shape, '');
    expect(c4PropertyValue(model().elements[elementId].properties, C4_PROPERTY_KEYS.tags)).toBe(
      'external',
    );

    await act(async () => root.unmount());
  });

  it('preserves custom tags through the container shape round trip', async () => {
    const viewId = addView('Shapes');
    const { elementId } = createC4ElementOnView(
      'container',
      viewId,
      viewId,
      { x: 0, y: 0, width: 150, height: 72 },
      undefined,
      { [C4_PROPERTY_KEYS.tags]: 'external, custom' },
    );
    setSelection('tree', [elementId]);
    const { host, root } = await render(createElement(PropertiesPanel));
    const shape = propertyRow(host, 'Shape').querySelector('select')!;

    await changeSelect(shape, 'folder');
    expect(c4PropertyValue(model().elements[elementId].properties, C4_PROPERTY_KEYS.tags)).toBe(
      'external, custom, folder',
    );

    await changeSelect(shape, '');
    expect(c4PropertyValue(model().elements[elementId].properties, C4_PROPERTY_KEYS.tags)).toBe(
      'external, custom',
    );

    await act(async () => root.unmount());
  });

  it('uses configured and C4 minimum sizes when centering palette-created people', async () => {
    const viewId = createC4TemplateView('system-context');
    openView(viewId);
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        elementWidth: 180,
        elementHeight: 100,
        snapToGrid: false,
      },
    });
    setActiveTool({ kind: 'create-c4-element', c4Kind: 'person' });
    const { host, root } = await render(createElement(ViewEditor, { viewId }));
    const svg = host.querySelector<SVGSVGElement>('svg.view-svg')!;
    Object.defineProperty(svg, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => svg),
    });
    const pointer = new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 300,
      clientY: 300,
    });
    Object.defineProperty(pointer, 'pointerId', { value: 1 });

    await act(async () => svg.dispatchEvent(pointer));

    const created = Object.values(model().elements).find((element) => element.name === 'Person')!;
    const node = Object.values(model().nodes).find(
      (candidate) => candidate.nodeType === 'element' && candidate.elementId === created.id,
    );
    expect(node?.bounds).toEqual({ x: 190, y: 205, width: 180, height: 150 });

    await act(async () => root.unmount());
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

  it('lets explicit line styles override the dashed C4 relationship default', async () => {
    createC4TemplateView('dynamic');
    const relationship = Object.values(model().relationships).find(
      (candidate) => c4PropertyValue(candidate.properties, C4_PROPERTY_KEYS.order) === '1',
    )!;
    const connection = Object.values(model().connections).find(
      (candidate) => candidate.relationshipId === relationship.id,
    )!;
    const styles = [
      { lineStyle: 0, dash: null },
      { lineStyle: 1, dash: '6 4' },
      { lineStyle: 2, dash: '2 3' },
    ] as const;
    const { host, root } = await render(createElement(
      'svg',
      null,
      ...styles.map(({ lineStyle }, index) => createElement(ConnectionView, {
        key: lineStyle,
        conn: { ...connection, id: `${connection.id}-${lineStyle}`, lineStyle },
        rel: relationship,
        c4ViewType: 'dynamic',
        points: [
          { x: 0, y: index * 20 },
          { x: 100, y: index * 20 },
        ],
        selected: false,
      })),
    ));

    for (const { lineStyle, dash } of styles) {
      const path = host.querySelector(
        `[data-conn-id="${connection.id}-${lineStyle}"] [data-c4-relationship="true"]`,
      );
      expect(path?.getAttribute('stroke-dasharray')).toBe(dash);
    }

    await act(async () => root.unmount());
  });

  it('keeps structured C4 labels readable across standard shapes and small boxes', async () => {
    const viewId = addView('Responsive labels');
    const { elementId, nodeId } = createC4ElementOnView(
      'container',
      viewId,
      viewId,
      { x: 0, y: 0, width: 190, height: 92 },
      'API Application',
      { [C4_PROPERTY_KEYS.technology]: 'Node.js, Express' },
    );
    const description = 'Handles customer journeys, order orchestration, and integrations.';
    const element = { ...model().elements[elementId], documentation: description };
    const node = model().nodes[nodeId];
    const standardShapes = ['browser', 'folder', 'bucket'] as const;
    const shapedElements = standardShapes.map((shape) => ({
      shape,
      element: {
        ...element,
        id: `${element.id}-${shape}`,
        properties: [
          ...element.properties,
          { key: C4_PROPERTY_KEYS.tags, value: shape },
        ],
      },
    }));
    const { elementId: personId, nodeId: personNodeId } = createC4ElementOnView(
      'person',
      viewId,
      viewId,
      { x: 0, y: 0, width: 160, height: 150 },
      'Customer',
    );
    const person = { ...model().elements[personId], documentation: description };
    const personNode = model().nodes[personNodeId];
    const { host, root } = await render(createElement(
      'svg',
      null,
      createElement(
        'g',
        { 'data-label-size': 'small' },
        createElement(NodeFigure, {
          node,
          element,
          width: 132,
          height: 84,
          c4ViewType: 'container',
        }),
      ),
      createElement(
        'g',
        { 'data-label-size': 'default' },
        createElement(NodeFigure, {
          node,
          element,
          width: 190,
          height: 92,
          c4ViewType: 'container',
        }),
      ),
      ...shapedElements.map(({ shape, element: shapedElement }) => createElement(
        'g',
        { key: shape, 'data-label-size': shape },
        createElement(NodeFigure, {
          node,
          element: shapedElement,
          width: 190,
          height: 92,
          c4ViewType: 'container',
        }),
      )),
      createElement(
        'g',
        { 'data-label-size': 'person' },
        createElement(NodeFigure, {
          node: personNode,
          element: person,
          width: 160,
          height: 150,
          c4ViewType: 'system-context',
        }),
      ),
    ));

    const smallLabel = host.querySelector('[data-label-size="small"]')!;
    expect(smallLabel.textContent).toContain('API Application');
    expect(smallLabel.textContent).toContain('[Container: Node.js, Express]');
    expect(smallLabel.textContent).not.toContain(description);
    for (const labelCase of ['default', 'person']) {
      expect(host.querySelector(`[data-label-size="${labelCase}"]`)?.textContent).toContain(
        description,
      );
    }
    for (const labelCase of standardShapes) {
      expect(host.querySelector(`[data-label-size="${labelCase}"]`)?.textContent).not.toContain(
        description,
      );
    }
    const mandatoryItems = Array.from(smallLabel.querySelectorAll<HTMLDivElement>('foreignObject div'))
      .filter((item) => [
        'API Application',
        '[Container: Node.js, Express]',
      ].includes(item.textContent ?? ''));
    expect(mandatoryItems).toHaveLength(2);
    expect(mandatoryItems.every((item) => item.style.flexShrink === '0')).toBe(true);
    const descriptionItem = Array.from(
      host.querySelectorAll<HTMLDivElement>('[data-label-size="default"] foreignObject div'),
    ).find((item) => item.textContent === description);
    expect(descriptionItem?.style.overflow).toBe('hidden');

    await act(async () => root.unmount());
  });

  it('keeps database and bucket labels below their caps and inside tapered walls', async () => {
    const viewId = addView('Shape label geometry');
    const figures = (['database', 'bucket'] as const).map((shape) => {
      const { elementId, nodeId } = createC4ElementOnView(
        'container',
        viewId,
        viewId,
        { x: 0, y: 0, width: 250, height: 100 },
        `${shape} service`,
        { [C4_PROPERTY_KEYS.tags]: shape },
      );
      return { shape, element: model().elements[elementId], node: model().nodes[nodeId] };
    });
    const { host, root } = await render(createElement(
      'svg',
      null,
      ...figures.map(({ shape, element, node }) => createElement(
        'g',
        { key: shape, 'data-label-geometry': shape },
        createElement(NodeFigure, {
          node,
          element,
          width: 250,
          height: 100,
          c4ViewType: 'container',
        }),
      )),
      createElement(
        'g',
        { 'data-label-geometry': 'bucket-default' },
        createElement(NodeFigure, {
          node: figures[1].node,
          element: figures[1].element,
          width: 150,
          height: 72,
          c4ViewType: 'container',
        }),
      ),
    ));

    const databaseLabel = host.querySelector('[data-label-geometry="database"] foreignObject');
    expect(databaseLabel?.getAttribute('y')).toBe('40');
    const bucketLabel = host.querySelector('[data-label-geometry="bucket"] foreignObject');
    expect(bucketLabel?.getAttribute('x')).toBe('27');
    expect(bucketLabel?.getAttribute('width')).toBe('196');
    const defaultBucketLabel = host.querySelector(
      '[data-label-geometry="bucket-default"] foreignObject',
    );
    expect(defaultBucketLabel?.getAttribute('x')).toBe('20.5');
    expect(defaultBucketLabel?.getAttribute('width')).toBe('109');
    expect(defaultBucketLabel?.getAttribute('height')).toBe('34.72');

    await act(async () => root.unmount());
  });

  it('clamps the person body geometry at extreme imported sizes', async () => {
    const viewId = addView('Extreme person');
    const { elementId, nodeId } = createC4ElementOnView(
      'person',
      viewId,
      viewId,
      { x: 0, y: 0, width: 40, height: 8 },
      'Tiny person',
    );
    const { host, root } = await render(createElement(
      'svg',
      null,
      createElement(NodeFigure, {
        node: model().nodes[nodeId],
        element: model().elements[elementId],
        width: 40,
        height: 8,
        c4ViewType: 'system-context',
      }),
    ));

    const body = host.querySelector('[data-c4-shape="person"]');
    expect(body?.getAttribute('height')).toBe('0');
    expect(body?.getAttribute('rx')).toBe('0');

    await act(async () => root.unmount());
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
    const browser = host.querySelector('[data-c4-shape="browser"]')!;
    expect(browser.tagName.toLowerCase()).toBe('rect');
    expect(browser.parentElement?.querySelectorAll('line')).toHaveLength(1);
    expect(browser.parentElement?.querySelectorAll('circle')).toHaveLength(3);
    const folder = host.querySelector('[data-c4-shape="folder"]')!;
    expect(folder.tagName.toLowerCase()).toBe('path');
    expect(folder.getAttribute('d')).toBeTruthy();
    const bucket = host.querySelector('[data-c4-shape="bucket"]')!;
    expect(bucket.tagName.toLowerCase()).toBe('path');
    expect(bucket.parentElement?.querySelectorAll('ellipse')).toHaveLength(1);
    const terminal = host.querySelector('[data-c4-shape="terminal"]')!;
    expect(terminal.tagName.toLowerCase()).toBe('rect');
    expect(terminal.parentElement?.querySelectorAll('path')).toHaveLength(1);
    const terminalPrompt = terminal.parentElement?.querySelector('[data-c4-shape-part="terminal-prompt"]');
    const terminalCursor = terminal.parentElement?.querySelector('[data-c4-shape-part="terminal-cursor"]');
    expect(terminalPrompt?.getAttribute('d')).toBe('M10,8 L19,14 L10,20');
    expect(terminalPrompt?.getAttribute('stroke-width')).toBe('2.5');
    expect(terminalCursor?.getAttribute('x2')).toBe('36');
    expect(terminalCursor?.getAttribute('stroke-width')).toBe('2.5');

    await act(async () => root.unmount());
  });

  it('renders C4 components with two left-side notation tabs', async () => {
    const viewId = addView('Components');
    const { elementId, nodeId } = createC4ElementOnView(
      'component',
      viewId,
      viewId,
      { x: 0, y: 0, width: 150, height: 72 },
      'Order Controller',
    );
    const { host, root } = await render(createElement(
      'svg',
      null,
      createElement(NodeFigure, {
        node: model().nodes[nodeId],
        element: model().elements[elementId],
        width: 150,
        height: 72,
        c4ViewType: 'component',
      }),
    ));

    const body = host.querySelector('[data-c4-shape="component"]');
    const tabs = host.querySelectorAll('[data-c4-shape-part="component-tab"]');
    expect(body?.tagName.toLowerCase()).toBe('rect');
    expect(Number(body?.getAttribute('x'))).toBeGreaterThan(0);
    expect(tabs).toHaveLength(2);
    expect(Array.from(tabs).every((tab) => tab.tagName.toLowerCase() === 'rect')).toBe(true);
    expect(host.textContent).toContain('Order Controller');
    expect(host.textContent).toContain('[Component]');

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
    const boundaryLabels = Array.from(host.querySelectorAll('text'));
    expect(boundaryLabels.map((text) => text.textContent)).toEqual([
      'Customer Portal',
      '[Software System]',
    ]);
    expect(boundaryLabels.map((text) => text.getAttribute('x'))).toEqual(['12', '12']);
    expect(boundaryLabels.map((text) => text.getAttribute('y'))).toEqual(['259', '273']);

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
      fontColor: C4_VISUAL_DEFAULTS.elementLine,
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

  it('uses shape-aware names for every palette-created C4 container shape', () => {
    const viewId = addView('Shapes');
    const expectedNames = {
      database: 'Database',
      browser: 'Web Browser',
      folder: 'Folder',
      bucket: 'Bucket',
      terminal: 'Terminal',
    } as const;

    for (const [tag, name] of Object.entries(expectedNames)) {
      const { elementId } = createC4ElementOnView(
        'container',
        viewId,
        viewId,
        { x: 0, y: 0, width: 150, height: 72 },
        undefined,
        { [C4_PROPERTY_KEYS.tags]: tag },
      );
      expect(model().elements[elementId].name).toBe(name);
    }
  });

  it('provides modern C4 default node sizes', () => {
    expect(c4DefaultNodeSize('person')).toEqual({ width: 160, height: 150 });
    expect(c4DefaultNodeSize('container')).toEqual({ width: 150, height: 72 });
  });
});
