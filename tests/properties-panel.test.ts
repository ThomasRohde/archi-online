import { act, createElement } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addElement,
  addElementNodeToView,
  addRelationship,
  addView,
  createEmptyModel,
} from '../src/model/ops';
import { replaceModel, setSelection } from '../src/model/store';
import { useStore } from '../src/ui/store-hooks';
import { PropertiesPanel } from '../src/ui/PropertiesPanel';

function model() {
  return useStore.getState().model!;
}

async function renderPropertiesPanel(): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(PropertiesPanel));
  });
  return { host, root };
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

async function changeInput(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function changeSelect(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function field(host: HTMLElement, label: string): HTMLElement {
  const fields = Array.from(host.querySelectorAll<HTMLElement>('.appearance-field'));
  const match = fields.find((candidate) => candidate.querySelector('label')?.textContent === label);
  expect(match, `Expected appearance field "${label}"`).toBeDefined();
  return match!;
}

function cssBlock(css: string, selector: string): string {
  const match = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 's')
    .exec(css);
  expect(match, `Expected CSS block for "${selector}"`).toBeTruthy();
  return match![1];
}

beforeEach(() => {
  replaceModel(createEmptyModel('Appearance Test'), null);
});

describe('properties Appearance tab', () => {
  it('renders the Analysis tab for concepts and navigates relation and view rows', async () => {
    const customerId = addElement('BusinessActor', 'Customer');
    const roleId = addElement('BusinessRole', 'Role');
    const relationshipId = addRelationship('AssignmentRelationship', customerId, roleId, 'Assigned')!;
    const viewId = addView('Customer view');
    const customerNodeId = addElementNodeToView(viewId, customerId, viewId, {
      x: 10,
      y: 10,
      width: 120,
      height: 55,
    });
    addElementNodeToView(viewId, roleId, viewId, { x: 220, y: 10, width: 120, height: 55 });
    setSelection('tree', [customerId]);
    const { host, root } = await renderPropertiesPanel();

    await click(Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Analysis')!);

    expect(host.textContent).toContain('Model Relations');
    expect(host.textContent).toContain('Used in Views');
    expect(host.textContent).toContain('Assignment');
    expect(host.textContent).toContain('Customer');
    expect(host.textContent).toContain('Role');
    expect(host.textContent).toContain('Customer view');

    await click(
      Array.from(host.querySelectorAll('button')).find(
        (button) => button.textContent?.includes('Customer view'),
      )!,
    );
    expect(useStore.getState().activeViewId).toBe(viewId);
    expect(useStore.getState().selection).toEqual({ source: 'view', ids: [customerNodeId] });

    setSelection('tree', [customerId]);
    await act(async () => {});
    await click(
      Array.from(host.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Assignment'),
      )!,
    );
    expect(useStore.getState().selection).toEqual({ source: 'tree', ids: [relationshipId] });

    await act(async () => {
      root.unmount();
    });
  });

  it('keeps the Properties view typography on the normal app scale', () => {
    const css = readFileSync('src/styles.css', 'utf8');

    expect(css).toMatch(/\.prop-type\s*\{[^}]*font-size:\s*13px;/s);
    expect(css).toMatch(/\.appearance-field > label\s*\{[^}]*font-size:\s*13px;/s);
  });

  it('keeps Appearance controls compact enough for the Properties font scale', () => {
    const css = readFileSync('src/styles.css', 'utf8');

    expect(cssBlock(css, '.appearance-control select')).toMatch(/height:\s*26px;/);
    expect(cssBlock(css, ".appearance-colour input[type='color']")).toMatch(/height:\s*26px;/);
    expect(cssBlock(css, '.appearance-reset')).toMatch(/width:\s*26px;[\s\S]*height:\s*26px;/);
    expect(cssBlock(css, '.appearance-number')).toMatch(/height:\s*26px;/);
    expect(cssBlock(css, '.appearance-segmented button')).toMatch(/width:\s*28px;[\s\S]*height:\s*28px;/);
    expect(cssBlock(css, '.appearance-align-icon,\n.appearance-position-icon')).toMatch(/width:\s*18px;[\s\S]*height:\s*18px;/);
    expect(cssBlock(css, '.appearance-line-preview')).toMatch(/width:\s*78px;[\s\S]*height:\s*28px;/);
  });

  it('renders Archi-style node appearance controls and applies node style edits', async () => {
    const actorId = addElement('BusinessActor', 'Actor');
    const viewId = addView('View');
    const nodeId = addElementNodeToView(viewId, actorId, viewId, {
      x: 10,
      y: 10,
      width: 120,
      height: 55,
    });
    setSelection('view', [nodeId]);
    const { host, root } = await renderPropertiesPanel();

    await click(Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Appearance')!);

    expect(host.querySelector('.prop-type')?.textContent).toBe('Actor (Business Actor)');
    for (const label of [
      'Fill Colour',
      'Fill Opacity',
      'Line Colour',
      'Line Opacity',
      'Text Alignment',
      'Font',
      'Gradient',
      'Line Width',
      'Line Style',
      'Text Position',
      'Font Colour',
      'Figure',
    ]) {
      expect(field(host, label)).toBeTruthy();
    }
    expect(field(host, 'Gradient').querySelector('select')?.disabled).toBe(true);
    expect(field(host, 'Line Style').querySelector('button')?.disabled).toBe(true);

    await changeInput(field(host, 'Fill Opacity').querySelector('input')!, '128');
    await changeInput(field(host, 'Line Opacity').querySelector('input')!, '64');
    await click(field(host, 'Text Alignment').querySelector('[aria-label="Align right"]')!);
    await click(field(host, 'Text Position').querySelector('[aria-label="Position top"]')!);
    await changeInput(field(host, 'Font Colour').querySelector('input[type="color"]')!, '#112233');
    await changeSelect(field(host, 'Figure').querySelector('select')!, '1');

    expect(model().nodes[nodeId]).toMatchObject({
      alpha: 128,
      lineAlpha: 64,
      textAlignment: 4,
      textPosition: 0,
      fontColor: '#112233',
      figureType: 1,
    });

    await act(async () => {
      root.unmount();
    });
  });

  it('renders Archi-style connection appearance controls and applies connection style edits', async () => {
    const actorId = addElement('BusinessActor', 'Actor');
    const roleId = addElement('BusinessRole', 'Role');
    const relationshipId = addRelationship('AssignmentRelationship', actorId, roleId, 'Assigned')!;
    const viewId = addView('View');
    addElementNodeToView(viewId, actorId, viewId, { x: 10, y: 10, width: 120, height: 55 });
    addElementNodeToView(viewId, roleId, viewId, { x: 220, y: 10, width: 120, height: 55 });
    const connectionId = Object.values(model().connections).find(
      (connection) => connection.relationshipId === relationshipId,
    )!.id;
    setSelection('view', [connectionId]);
    const { host, root } = await renderPropertiesPanel();

    await click(Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Appearance')!);
    await changeSelect(field(host, 'Line Width').querySelector('select')!, '3');
    await click(field(host, 'Text Position').querySelector('[aria-label="Position target"]')!);
    await changeInput(field(host, 'Font Colour').querySelector('input[type="color"]')!, '#445566');

    expect(model().connections[connectionId]).toMatchObject({
      lineWidth: 3,
      textPosition: 2,
      fontColor: '#445566',
    });

    await act(async () => {
      root.unmount();
    });
  });
});
