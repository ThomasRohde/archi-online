import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewEditor } from '../src/canvas/ViewEditor';
import {
  addNoteToView,
  addView,
  createElementOnView,
  createEmptyModel,
  createPlainConnectionOnView,
  setPlainConnectionAttributes,
} from '../src/model/ops';
import { PLAIN_CONNECTION_TYPE } from '../src/model/types';
import { openView, replaceModel, setActiveTool, setSelection } from '../src/model/store';
import { Palette } from '../src/ui/Palette';
import { PropertiesPanel } from '../src/ui/PropertiesPanel';
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

async function changeSelect(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function fixture() {
  const viewId = addView('View');
  const noteId = addNoteToView(viewId, viewId, { x: 10, y: 10, width: 180, height: 80 }, 'Note');
  const actor = createElementOnView(
    'BusinessActor',
    viewId,
    viewId,
    { x: 260, y: 10, width: 120, height: 55 },
    'Actor',
  );
  const connectionId = createPlainConnectionOnView(viewId, noteId, actor.nodeId)!;
  return { connectionId, viewId, noteId, actorNodeId: actor.nodeId };
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

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  replaceModel(createEmptyModel('Plain UI'), null);
});

describe('VIEW-05 plain connection UI', () => {
  it('offers an accessible sticky-capable palette tool', async () => {
    openView(addView('View'));
    const { host, root } = await render(createElement(Palette));
    const button = host.querySelector<HTMLButtonElement>('button[title="Plain connection"]')!;
    expect(button).not.toBeNull();

    await act(async () => button.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      shiftKey: true,
    })));

    expect(useStore.getState().activeTool).toEqual({
      kind: 'create-plain-connection',
      sticky: true,
    });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    await act(async () => root.unmount());
  });

  it('shows metadata, label visibility, native arrows, and appearance controls', async () => {
    const { connectionId } = fixture();
    setSelection('view', [connectionId]);
    const { host, root } = await render(createElement(PropertiesPanel));

    expect(host.querySelector('.prop-type')?.textContent).toBe('Plain Connection');
    expect(host.querySelector<HTMLInputElement>('.prop-row input')?.disabled).toBe(false);
    const showLabel = host.querySelector<HTMLInputElement>('[aria-label="Show connection label"]')!;
    expect(showLabel.checked).toBe(true);
    await click(showLabel);
    expect(useStore.getState().model!.connections[connectionId].nameVisible).toBe(false);

    await click(Array.from(host.querySelectorAll('button')).find((item) => item.textContent === 'Properties')!);
    expect(host.textContent).toContain('+ Add property');

    await click(Array.from(host.querySelectorAll('button')).find((item) => item.textContent === 'Appearance')!);
    const line = host.querySelector<HTMLSelectElement>('[aria-label="Plain line style"]')!;
    const source = host.querySelector<HTMLSelectElement>('[aria-label="Plain source arrow"]')!;
    const target = host.querySelector<HTMLSelectElement>('[aria-label="Plain target arrow"]')!;
    expect(line).not.toBeNull();
    expect(source).not.toBeNull();
    expect(target).not.toBeNull();

    await changeSelect(line, String(PLAIN_CONNECTION_TYPE.DOTTED));
    await changeSelect(source, String(PLAIN_CONNECTION_TYPE.SOURCE_OPEN));
    await changeSelect(target, String(PLAIN_CONNECTION_TYPE.TARGET_HOLLOW));

    expect(useStore.getState().model!.connections[connectionId].connectionType).toBe(
      PLAIN_CONNECTION_TYPE.DOTTED |
      PLAIN_CONNECTION_TYPE.SOURCE_OPEN |
      PLAIN_CONNECTION_TYPE.TARGET_HOLLOW,
    );
    for (const label of ['Line Colour', 'Line Width', 'Line Style', 'Font', 'Font Colour', 'Text Position']) {
      expect(Array.from(host.querySelectorAll('.appearance-field > label')).some(
        (item) => item.textContent === label,
      )).toBe(true);
    }

    await act(async () => root.unmount());
  });

  it('shows renderer-precedence values for conflicting imported native bits', async () => {
    const { connectionId } = fixture();
    setPlainConnectionAttributes(connectionId, { connectionType: 0xff });
    setSelection('view', [connectionId]);
    const { host, root } = await render(createElement(PropertiesPanel));

    await click(Array.from(host.querySelectorAll('button')).find((item) => item.textContent === 'Appearance')!);

    expect(host.querySelector<HTMLSelectElement>('[aria-label="Plain line style"]')?.value)
      .toBe(String(PLAIN_CONNECTION_TYPE.DASHED));
    expect(host.querySelector<HTMLSelectElement>('[aria-label="Plain source arrow"]')?.value)
      .toBe(String(PLAIN_CONNECTION_TYPE.SOURCE_FILLED));
    expect(host.querySelector<HTMLSelectElement>('[aria-label="Plain target arrow"]')?.value)
      .toBe(String(PLAIN_CONNECTION_TYPE.TARGET_FILLED));

    await act(async () => root.unmount());
  });

  it('authors every Note topology by pointer and honors sticky and one-shot completion', async () => {
    const { connectionId: baseId, viewId, noteId, actorNodeId } = fixture();
    const { host, root } = await render(createElement(ViewEditor, { viewId }));
    const svg = host.querySelector<SVGSVGElement>('svg.view-svg')!;
    Object.defineProperty(svg, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    let hit: Element;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => hit),
    });
    const author = async (sourceSelector: string, targetSelector: string) => {
      hit = host.querySelector(sourceSelector)!;
      await act(async () => svg.dispatchEvent(pointer()));
      hit = host.querySelector(targetSelector)!;
      await act(async () => svg.dispatchEvent(pointer()));
    };

    setActiveTool({ kind: 'create-plain-connection', sticky: true });
    await author(`[data-node-id="${noteId}"]`, `[data-node-id="${actorNodeId}"]`);
    await author(`[data-node-id="${noteId}"]`, `[data-conn-id="${baseId}"]`);
    await author(`[data-conn-id="${baseId}"]`, `[data-node-id="${noteId}"]`);
    await author(`[data-node-id="${noteId}"]`, `[data-node-id="${noteId}"]`);

    const authored = Object.values(useStore.getState().model!.connections).filter(
      (connection) => connection.id !== baseId,
    );
    expect(authored).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: noteId, targetId: actorNodeId }),
      expect.objectContaining({ sourceId: noteId, targetId: baseId }),
      expect.objectContaining({ sourceId: baseId, targetId: noteId }),
      expect.objectContaining({ sourceId: noteId, targetId: noteId }),
    ]));
    expect(useStore.getState().activeTool).toEqual({
      kind: 'create-plain-connection',
      sticky: true,
    });

    setActiveTool({ kind: 'create-plain-connection' });
    await author(`[data-node-id="${noteId}"]`, `[data-node-id="${actorNodeId}"]`);
    expect(useStore.getState().activeTool).toEqual({ kind: 'select' });

    Reflect.deleteProperty(document, 'elementFromPoint');
    await act(async () => root.unmount());
  });

  it.each([
    ['editor', false],
    ['viewer', true],
  ] as const)('renders the authored line in the %s projection', async (_projection, readOnly) => {
    const { connectionId, viewId } = fixture();
    setPlainConnectionAttributes(connectionId, {
      connectionType: PLAIN_CONNECTION_TYPE.SOURCE_HOLLOW | PLAIN_CONNECTION_TYPE.TARGET_OPEN,
    });
    const { host, root } = await render(createElement(ViewEditor, { viewId, readOnly }));

    expect(host.querySelector('[data-plain-arrow="source-hollow"]')).not.toBeNull();
    expect(host.querySelector('[data-plain-arrow="target-open"]')).not.toBeNull();

    await act(async () => root.unmount());
  });
});
