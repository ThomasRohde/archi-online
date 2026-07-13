import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewEditor } from '../src/canvas/ViewEditor';
import { StaticViewContent } from '../src/canvas/export/StaticViewSvg';
import { LegendFigure } from '../src/canvas/figures/LegendFigure';
import { LegendElementGlyph } from '../src/canvas/figures/LegendGlyph';
import { isLegendNote, type LegendPreferences } from '../src/model/legend';
import { ELEMENT_TYPES, type ElementType } from '../src/model/metamodel';
import {
  addLegendToView,
  addView,
  createElementOnView,
  createEmptyModel,
  createRelationshipOnView,
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

async function typeCharacters(input: HTMLInputElement, value: string): Promise<void> {
  for (const character of value) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        input.value + character,
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
}

function fixture() {
  const viewId = addView('Legend View');
  const legendId = addLegendToView(
    viewId,
    viewId,
    { x: 20, y: 20, width: 210, height: 320 },
  )!;
  const actor = createElementOnView(
    'BusinessActor',
    viewId,
    viewId,
    { x: 300, y: 20, width: 120, height: 55 },
    'Customer',
  );
  return { viewId, legendId, actor };
}

function glyphFixture() {
  const { viewId, legendId, actor } = fixture();
  const role = createElementOnView(
    'BusinessRole', viewId, viewId, { x: 450, y: 20, width: 120, height: 55 }, 'Role',
  );
  const process = createElementOnView(
    'BusinessProcess', viewId, viewId, { x: 300, y: 120, width: 120, height: 55 }, 'Process',
  );
  const object = createElementOnView(
    'BusinessObject', viewId, viewId, { x: 450, y: 120, width: 120, height: 55 }, 'Object',
  );
  createRelationshipOnView('AssignmentRelationship', viewId, actor.nodeId, role.nodeId);
  createRelationshipOnView('AssociationRelationship', viewId, actor.nodeId, role.nodeId);
  createRelationshipOnView('AccessRelationship', viewId, process.nodeId, object.nodeId);
  return { viewId, legendId };
}

function staticLegendDocument(viewId: string): Document {
  const markup = renderToStaticMarkup(createElement(
    'svg',
    null,
    createElement(StaticViewContent, { model: useStore.getState().model!, viewId }),
  ));
  return new DOMParser().parseFromString(markup, 'image/svg+xml');
}

function legendFigureDocument(legendId: string, preferences: LegendPreferences): Document {
  const current = useStore.getState().model!;
  const node = current.nodes[legendId];
  if (!isLegendNote(node)) throw new Error('Expected native legend');
  const markup = renderToStaticMarkup(createElement(
    'svg',
    null,
    createElement(LegendFigure, {
      model: current,
      node,
      preferences,
      font: { family: 'Segoe UI', sizePx: 12, bold: false, italic: false },
      color: '#000000',
    }),
  ));
  return new DOMParser().parseFromString(markup, 'image/svg+xml');
}

function elementGlyphDocument(type: ElementType): Document {
  const markup = renderToStaticMarkup(createElement(
    'svg',
    null,
    createElement(LegendElementGlyph, { type, backgroundColor: '#123456' }),
  ));
  return new DOMParser().parseFromString(markup, 'image/svg+xml');
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
    await act(async () => label.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    await change(color, '#123456');
    expect(useSettingsStore.getState().settings.legendLabels).toEqual({ BusinessActor: 'Person' });
    expect(useSettingsStore.getState().settings.legendUserColors).toEqual({ BusinessActor: '#123456' });

    await click(host.querySelector('[aria-label="Reset Business Actor legend preferences"]')!);
    expect(useSettingsStore.getState().settings.legendLabels).toEqual({});
    expect(useSettingsStore.getState().settings.legendUserColors).toEqual({});
    expect(host.querySelector('[aria-label="Assignment relation legend user color"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('keeps spaces while typing a custom label and persists only on blur', async () => {
    const { host, root } = await render(createElement(SettingsPanel));
    const details = host.querySelector<HTMLDetailsElement>('.settings-legend-custom')!;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event('toggle', { bubbles: true }));
    });
    const label = host.querySelector<HTMLInputElement>(
      '[aria-label="Business Actor legend label"]',
    )!;

    await typeCharacters(label, 'External Party');

    expect(label.value).toBe('External Party');
    expect(useSettingsStore.getState().settings.legendLabels).toEqual({});

    await act(async () => label.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(useSettingsStore.getState().settings.legendLabels).toEqual({
      BusinessActor: 'External Party',
    });
    await act(async () => root.unmount());
  });

  it('canonicalizes a whitespace-only label draft immediately after commit', async () => {
    const { host, root } = await render(createElement(SettingsPanel));
    const details = host.querySelector<HTMLDetailsElement>('.settings-legend-custom')!;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event('toggle', { bubbles: true }));
    });
    const label = host.querySelector<HTMLInputElement>(
      '[aria-label="Business Actor legend label"]',
    )!;
    const reset = host.querySelector<HTMLButtonElement>(
      '[aria-label="Reset Business Actor legend preferences"]',
    )!;

    await change(label, '   ');
    await act(async () => label.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));

    expect(label.value).toBe('');
    expect(reset.disabled).toBe(true);
    expect(useSettingsStore.getState().settings.legendLabels).toEqual({});
    await act(async () => root.unmount());
  });

  it('commits custom labels with Enter and restores drafts with Escape or Reset', async () => {
    const { host, root } = await render(createElement(SettingsPanel));
    const details = host.querySelector<HTMLDetailsElement>('.settings-legend-custom')!;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event('toggle', { bubbles: true }));
    });
    const label = host.querySelector<HTMLInputElement>(
      '[aria-label="Business Actor legend label"]',
    )!;
    const reset = host.querySelector<HTMLButtonElement>(
      '[aria-label="Reset Business Actor legend preferences"]',
    )!;

    await typeCharacters(label, 'External Party');
    await act(async () => label.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
    })));
    expect(useSettingsStore.getState().settings.legendLabels).toEqual({
      BusinessActor: 'External Party',
    });

    await change(label, 'Discard me');
    await act(async () => label.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    })));
    expect(label.value).toBe('External Party');
    expect(useSettingsStore.getState().settings.legendLabels).toEqual({
      BusinessActor: 'External Party',
    });

    await click(reset);
    await typeCharacters(label, 'Uncommitted draft');
    expect(reset.disabled).toBe(false);
    await click(reset);
    expect(label.value).toBe('');
    expect(useSettingsStore.getState().settings.legendLabels).toEqual({});
    await act(async () => root.unmount());
  });

  it('hides ignored text alignment and position controls for native legends', async () => {
    const { legendId } = fixture();
    setSelection('view', [legendId]);
    const { host, root } = await render(createElement(PropertiesPanel));
    await click(Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Appearance',
    )!);
    const labels = Array.from(host.querySelectorAll('.appearance-field > label'))
      .map((label) => label.textContent);

    expect(labels).not.toContain('Text Alignment');
    expect(labels).not.toContain('Text Position');
    expect(labels).toContain('Font');
    expect(labels).toContain('Fill Colour');
    await act(async () => root.unmount());
  });
});

describe('shared native legend projections', () => {
  it('declares an audited background-fill strategy for every element glyph', () => {
    const strategies = ELEMENT_TYPES.map(({ type }) => {
      const glyph = elementGlyphDocument(type).querySelector('[data-legend-element-glyph]')!;
      return [type, glyph.getAttribute('data-legend-fill-strategy')] as const;
    });

    expect(strategies.filter(([, strategy]) => strategy === null)).toEqual([]);
    expect(strategies.filter(([, strategy]) => strategy === 'custom').length).toBeGreaterThan(10);
    expect(strategies.filter(([, strategy]) => strategy === 'none').map(([type]) => type))
      .toEqual(['Path', 'WorkPackage', 'Plateau']);

    for (const [type, strategy] of strategies) {
      if (strategy === 'none' || strategy === 'foreground') continue;
      expect(
        elementGlyphDocument(type).querySelector('[data-legend-background-shape="true"]'),
        `${type} should include its audited background artwork`,
      ).not.toBeNull();
    }
  });

  it('fills Desktop composite Event, Interaction, and Role regions explicitly', () => {
    const event = elementGlyphDocument('BusinessEvent');
    const interaction = elementGlyphDocument('BusinessInteraction');
    const role = elementGlyphDocument('BusinessRole');
    const stakeholder = elementGlyphDocument('Stakeholder');

    expect(event.querySelector('[data-legend-background-part="event-body"]')).not.toBeNull();
    expect(event.querySelectorAll('[data-legend-background-part="event-body"] > *'))
      .toHaveLength(3);
    expect(event.querySelectorAll('[data-legend-background-part="event-body"] > path')[0]
      ?.getAttribute('d')).toBe('M12 9 A4 4.5 0 0 0 12 0');
    expect(interaction.querySelectorAll('[data-legend-background-part^="interaction-"]'))
      .toHaveLength(2);
    expect(role.querySelector('[data-legend-background-part="role-body"]')).not.toBeNull();
    expect(role.querySelector('[data-legend-background-part="role-end"]')).not.toBeNull();
    expect(stakeholder.querySelector('[data-legend-background-part="stakeholder-arc"]')
      ?.getAttribute('d')).toBe('M4 0 A4 3.5 0 0 0 4 7');
    expect(stakeholder.querySelector('[data-legend-background-part="stakeholder-body"]')
      ?.tagName).toBe('rect');
    expect(stakeholder.querySelector('[data-legend-background-part="stakeholder-end"]'))
      .not.toBeNull();
  });

  it('fills both faces of the Desktop Node glyph', () => {
    const node = elementGlyphDocument('Node');

    expect(node.querySelector('[data-legend-element-glyph]')
      ?.getAttribute('data-legend-fill-strategy')).toBe('custom');
    expect(node.querySelector('[data-legend-background-part="node-front"]')).not.toBeNull();
    expect(node.querySelector('[data-legend-background-part="node-depth"]')
      ?.getAttribute('d')).toBe('M-0.2 0 L3.2 -3 L14 -3 L14 8 L11 11.2 Z');
  });

  it('draws and colours the complete Desktop Junction glyph', () => {
    const junction = elementGlyphDocument('Junction');
    const artwork = junction.querySelector('[data-legend-junction-desktop="true"]')!;

    expect(junction.querySelector('[data-legend-element-glyph]')
      ?.getAttribute('data-legend-fill-strategy')).toBe('foreground');
    expect(artwork.querySelectorAll('rect')).toHaveLength(3);
    expect(artwork.querySelectorAll('line')).toHaveLength(3);
    expect(artwork.querySelector('circle')?.getAttribute('fill')).toBe('#123456');
    expect(artwork.querySelector('circle')?.getAttribute('r')).toBe('3');
  });

  it('draws Desktop-style element fill inside the type glyph without a generic swatch', () => {
    const { viewId } = glyphFixture();
    const document = staticLegendDocument(viewId);
    const actor = document.querySelector('[data-legend-entry="BusinessActor"]')!;
    const glyph = actor.querySelector('[data-legend-element-glyph="BusinessActor"]')!;

    expect(glyph).not.toBeNull();
    expect(glyph.getAttribute('data-legend-background')).toBe('#ffffb5');
    expect(glyph.querySelector('[data-legend-background-shape="true"]')?.getAttribute('fill'))
      .toBe('#ffffb5');
    expect(actor.querySelector('rect[data-legend-color]')).toBeNull();
  });

  it('uses exact diagonal Desktop relationship glyph families', () => {
    const { viewId } = glyphFixture();
    const document = staticLegendDocument(viewId);
    const assignment = document.querySelector(
      '[data-legend-relationship-glyph="AssignmentRelationship"]',
    )!;
    const access = document.querySelector(
      '[data-legend-relationship-glyph="AccessRelationship"]',
    )!;
    const association = document.querySelector(
      '[data-legend-relationship-glyph="AssociationRelationship"]',
    )!;

    expect(assignment).not.toBeNull();
    expect(access).not.toBeNull();
    expect(association).not.toBeNull();
    expect(assignment.querySelector('[data-legend-relationship-line]')?.getAttribute('d'))
      .toBe('M0 13 L13 0');
    expect(assignment.querySelector('circle')).not.toBeNull();
    expect(access.querySelector('[data-legend-relationship-line]')?.getAttribute('stroke-dasharray'))
      .toBe('1.5 1.5');
    expect(association.querySelector('[data-legend-relationship-line]')?.getAttribute('d'))
      .toBe('M0 13 L13 0');
    expect(document.querySelector('[data-legend-relationship-glyph] line[y1="9"][y2="9"]'))
      .toBeNull();
  });

  it('applies Core, User, and None schemes to the element glyph itself', () => {
    const { legendId } = glyphFixture();
    let document = legendFigureDocument(legendId, { labels: {}, userColors: {} });
    expect(document.querySelector(
      '[data-legend-element-glyph="BusinessActor"] [data-legend-background-shape="true"]',
    )?.getAttribute('fill')).toBe('#ffffb5');

    setLegendOptions(legendId, { colorScheme: 2 });
    expect(useStore.getState().model!.nodes[legendId]).toMatchObject({
      legendOptions: { colorScheme: 2 },
    });
    document = legendFigureDocument(legendId, {
      labels: {},
      userColors: { BusinessActor: '#123456' },
    });
    expect(document.querySelector(
      '[data-legend-element-glyph="BusinessActor"] [data-legend-background-shape="true"]',
    )?.getAttribute('fill')).toBe('#123456');

    setLegendOptions(legendId, { colorScheme: 0 });
    document = legendFigureDocument(legendId, { labels: {}, userColors: {} });
    expect(document.querySelector(
      '[data-legend-element-glyph="BusinessActor"] [data-legend-background-shape="true"]',
    )).toBeNull();
    expect(document.querySelector('[data-legend-element-glyph="BusinessActor"]'))
      .not.toBeNull();
  });

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
    expect(entry.querySelector('[data-legend-background-shape]')?.getAttribute('fill'))
      .toBe('#123456');
    await act(async () => root.unmount());
  });
});
