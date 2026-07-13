import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewEditor } from '../src/canvas/ViewEditor';
import { StaticViewContent } from '../src/canvas/export/StaticViewSvg';
import {
  addLegendToView,
  addView,
  createElementOnView,
  createEmptyModel,
  setLegendOptions,
  setNodeStyle,
} from '../src/model/ops';
import {
  openView,
  replaceModel,
  setActiveTool,
  setSelection,
} from '../src/model/store';
import { DEFAULT_SETTINGS, useSettingsStore } from '../src/settings/app-settings';
import { OutlinePanel } from '../src/ui/OutlinePanel';
import { Palette } from '../src/ui/Palette';
import { PropertiesPanel } from '../src/ui/PropertiesPanel';
import { SettingsPanel } from '../src/ui/SettingsPanel';
import { useStore } from '../src/ui/store-hooks';

async function render(element: React.ReactElement): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(element));
  return { host, root };
}

async function click(element: Element): Promise<void> {
  await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

async function change(select: HTMLSelectElement | HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const prototype = select instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function fixture() {
  const viewId = addView('Legend View');
  const legendId = addLegendToView(
    viewId,
    viewId,
    { x: 20, y: 20, width: 210, height: 320 },
  )!;
  createElementOnView(
    'BusinessActor',
    viewId,
    viewId,
    { x: 300, y: 20, width: 120, height: 55 },
    'Customer',
  );
  return { viewId, legendId };
}

function pointer(x = 40, y = 40): PointerEvent {
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  }) as PointerEvent;
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

const originalGetBBox = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox');

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  replaceModel(createEmptyModel('Legend UI'), null);
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: () => ({ x: 0, y: 0, width: 700, height: 500 }),
  });
});

afterEach(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  if (originalGetBBox) Object.defineProperty(SVGElement.prototype, 'getBBox', originalGetBBox);
  else Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
});

describe('native legend palette and properties', () => {
  it('offers a distinct accessible sticky-capable Legend tool', async () => {
    const { host, root } = await render(createElement(Palette));
    const legend = host.querySelector<HTMLButtonElement>('button[title="Legend"]')!;
    const note = host.querySelector<HTMLButtonElement>('button[title="Note"]')!;
    expect(legend).not.toBeNull();
    expect(note).not.toBeNull();
    expect(legend).not.toBe(note);

    await act(async () => legend.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      shiftKey: true,
    })));
    expect(useStore.getState().activeTool).toEqual({ kind: 'create-legend', sticky: true });
    expect(legend.getAttribute('aria-pressed')).toBe('true');
    await act(async () => root.unmount());
  });

  it('authors a native legend at Desktop size/defaults and honors one-shot completion', async () => {
    const viewId = addView('View');
    const { host, root } = await render(createElement(ViewEditor, { viewId }));
    const svg = host.querySelector<SVGSVGElement>('svg.view-svg')!;
    Object.defineProperty(svg, 'setPointerCapture', { configurable: true, value: vi.fn() });
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => svg),
    });
    setActiveTool({ kind: 'create-legend' });

    await act(async () => svg.dispatchEvent(pointer(80, 90)));

    const legend = Object.values(useStore.getState().model!.nodes).find(
      (node) => node.nodeType === 'note' && node.legendOptions,
    );
    expect(legend).toMatchObject({
      nodeType: 'note',
      name: 'Legend',
      content: '',
      bounds: { width: 210, height: 320 },
      legendOptions: {
        rowsPerColumn: 15,
        colorScheme: 1,
        sortMethod: 1,
      },
    });
    expect(useStore.getState().activeTool).toEqual({ kind: 'select' });

    Reflect.deleteProperty(document, 'elementFromPoint');
    await act(async () => root.unmount());
  });

  it('does not expose the underlying Note text editor', async () => {
    const { viewId, legendId } = fixture();
    const { host, root } = await render(createElement(ViewEditor, { viewId }));
    const legend = host.querySelector(`[data-node-id="${legendId}"]`)!;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => legend),
    });

    await act(async () => legend.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));

    expect(host.querySelector('textarea.direct-edit')).toBeNull();
    Reflect.deleteProperty(document, 'elementFromPoint');
    await act(async () => root.unmount());
  });

  it('shows compact controls for every native option and optimal size', async () => {
    const { legendId } = fixture();
    setSelection('view', [legendId]);
    const { host, root } = await render(createElement(PropertiesPanel));
    expect(host.querySelector('.prop-type')?.textContent).toBe('Legend');
    const tab = Array.from(host.querySelectorAll('button')).find((item) => item.textContent === 'Legend')!;
    await click(tab);

    for (const label of [
      'Core elements',
      'Core relationships',
      'Specialized elements',
      'Specialized relationships',
    ]) {
      expect(host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)?.checked).toBe(true);
    }
    expect(host.querySelector<HTMLSelectElement>('[aria-label="Legend sort"]')?.value).toBe('1');
    expect(host.querySelector<HTMLSelectElement>('[aria-label="Legend colors"]')?.value).toBe('1');
    expect(host.querySelector<HTMLInputElement>('[aria-label="Legend rows per column"]')?.value).toBe('15');
    expect(host.querySelector<HTMLInputElement>('[aria-label="Legend width offset"]')?.value).toBe('0');
    expect(Array.from(host.querySelectorAll('button')).some((item) => item.textContent === 'Optimal size'))
      .toBe(true);

    const coreElements = host.querySelector<HTMLInputElement>('[aria-label="Core elements"]')!;
    await click(coreElements);
    await change(host.querySelector<HTMLSelectElement>('[aria-label="Legend sort"]')!, '0');
    await change(host.querySelector<HTMLSelectElement>('[aria-label="Legend colors"]')!, '2');
    await change(host.querySelector<HTMLInputElement>('[aria-label="Legend rows per column"]')!, '2');
    await change(host.querySelector<HTMLInputElement>('[aria-label="Legend width offset"]')!, '-16');

    expect(useStore.getState().model!.nodes[legendId]).toMatchObject({
      legendOptions: {
        displayElements: false,
        sortMethod: 0,
        colorScheme: 2,
        rowsPerColumn: 2,
        widthOffset: -16,
      },
    });
    await act(async () => root.unmount());
  });

  it('keeps legend controls visible but disabled in read-only mode', async () => {
    const { legendId } = fixture();
    setSelection('view', [legendId]);
    useStore.setState({ readOnly: true });
    const { host, root } = await render(createElement(PropertiesPanel));
    const tab = Array.from(host.querySelectorAll('button')).find((item) => item.textContent === 'Legend')!;
    await click(tab);
    expect(host.querySelectorAll('.legend-controls input:disabled, .legend-controls select:disabled'))
      .toHaveLength(8);
    expect(host.querySelector<HTMLButtonElement>('.legend-controls button')?.disabled).toBe(true);
    await act(async () => root.unmount());
  });

  it('edits and resets browser-local custom labels and element colors in Settings', async () => {
    const { host, root } = await render(createElement(SettingsPanel));
    const details = host.querySelector<HTMLDetailsElement>('.settings-legend-custom')!;
    expect(details).not.toBeNull();
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event('toggle', { bubbles: true }));
    });
    const label = host.querySelector<HTMLInputElement>(
      '[aria-label="Business Actor legend label"]',
    )!;
    const color = host.querySelector<HTMLInputElement>(
      '[aria-label="Business Actor legend user color"]',
    )!;
    expect(label).not.toBeNull();
    expect(color).not.toBeNull();

    await change(label, 'Person');
    await change(color, '#123456');
    expect(useSettingsStore.getState().settings.legendLabels).toEqual({ BusinessActor: 'Person' });
    expect(useSettingsStore.getState().settings.legendUserColors).toEqual({ BusinessActor: '#123456' });

    await click(host.querySelector('[aria-label="Reset Business Actor legend preferences"]')!);
    expect(useSettingsStore.getState().settings.legendLabels).toEqual({});
    expect(useSettingsStore.getState().settings.legendUserColors).toEqual({});
    expect(host.querySelector('[aria-label="Assignment relation legend user color"]')).toBeNull();
    await act(async () => root.unmount());
  });
});

describe('shared native legend projections', () => {
  it.each([
    ['editor', false],
    ['viewer', true],
  ] as const)('renders live entries in the %s projection', async (_name, readOnly) => {
    const { viewId } = fixture();
    const { host, root } = await render(createElement(ViewEditor, { viewId, readOnly }));
    expect(host.querySelector('[data-native-legend="true"]')).not.toBeNull();
    expect(host.querySelector('[data-legend-entry="BusinessActor"]')?.textContent)
      .toContain('Business Actor');
    await act(async () => root.unmount());
  });

  it('uses the same renderer for static image/SVG export', () => {
    const { viewId, legendId } = fixture();
    setNodeStyle([legendId], { fontAlpha: 128 });
    const markup = renderToStaticMarkup(createElement(
      'svg',
      null,
      createElement(StaticViewContent, { model: useStore.getState().model!, viewId }),
    ));
    expect(markup).toContain('data-native-legend="true"');
    expect(markup).toContain('data-legend-entry="BusinessActor"');
    expect(markup).toContain('opacity="0.5019607843137255"');
  });

  it('uses the same renderer in the outline', async () => {
    const { viewId } = fixture();
    openView(viewId);
    const { host, root } = await render(createElement(OutlinePanel));
    expect(host.querySelector('.outline-svg [data-native-legend="true"]')).not.toBeNull();
    expect(host.querySelector('.outline-svg [data-legend-entry="BusinessActor"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('updates rendered labels and user colors directly from local settings', async () => {
    const { viewId } = fixture();
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        legendLabels: { BusinessActor: 'Person' },
        legendUserColors: { BusinessActor: '#123456' },
      },
    });
    const legendId = Object.values(useStore.getState().model!.nodes).find(
      (node) => node.nodeType === 'note' && node.legendOptions,
    )!.id;
    await act(async () => setLegendOptions(legendId, { colorScheme: 2 }));
    const { host, root } = await render(createElement(ViewEditor, { viewId }));
    const entry = host.querySelector('[data-legend-entry="BusinessActor"]')!;
    expect(entry.textContent).toContain('Person');
    expect(entry.querySelector('[data-legend-color]')?.getAttribute('fill')).toBe('#123456');
    await act(async () => root.unmount());
  });
});
