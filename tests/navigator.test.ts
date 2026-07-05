import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addConnectionToView,
  addElement,
  addElementNodeToView,
  addRelationship,
  addView,
  createEmptyModel,
} from '../src/model/ops';
import { incomingRelationships, outgoingRelationships } from '../src/model/analysis';
import { replaceModel, setSelection, useStore } from '../src/model/store';
import { NavigatorPanel } from '../src/ui/NavigatorPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function model() {
  return useStore.getState().model!;
}

async function renderNavigator(): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(NavigatorPanel));
  });
  return { host, root };
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

async function doubleClick(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  });
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const match = Array.from(host.querySelectorAll('button')).find(
    (candidate) => candidate.textContent === label || candidate.getAttribute('title') === label,
  );
  expect(match, `Expected button "${label}"`).toBeDefined();
  return match as HTMLButtonElement;
}

function row(host: HTMLElement, text: string): HTMLElement {
  const match = Array.from(host.querySelectorAll<HTMLElement>('.navigator-row')).find(
    (candidate) => candidate.textContent?.includes(text),
  );
  expect(match, `Expected navigator row containing "${text}"`).toBeDefined();
  return match!;
}

async function expandRow(host: HTMLElement, text: string): Promise<void> {
  const toggle = row(host, text).querySelector('button');
  expect(toggle, `Expected expandable navigator row containing "${text}"`).toBeDefined();
  await click(toggle!);
}

beforeEach(() => {
  replaceModel(createEmptyModel('Navigator Test'), null);
});

describe('navigator relationship queries', () => {
  it('returns outgoing and incoming relationships sorted by name and id', () => {
    const actor = addElement('BusinessActor', 'Actor');
    const role = addElement('BusinessRole', 'Role');
    const backupRole = addElement('BusinessRole', 'Backup Role');
    const vipActor = addElement('BusinessActor', 'VIP Actor');
    const zOutgoing = addRelationship('AssignmentRelationship', actor, role, 'Z assigned')!;
    const aOutgoing = addRelationship('AssignmentRelationship', actor, backupRole, 'A assigned')!;
    const incoming = addRelationship('SpecializationRelationship', vipActor, actor, 'B specializes')!;

    expect(outgoingRelationships(model(), actor).map((rel) => rel.id)).toEqual([aOutgoing, zOutgoing]);
    expect(incomingRelationships(model(), actor).map((rel) => rel.id)).toEqual([incoming]);
  });
});

describe('NavigatorPanel', () => {
  it('renders the selected concept as root and toggles between downstream and upstream traversal', async () => {
    const actor = addElement('BusinessActor', 'Actor');
    const role = addElement('BusinessRole', 'Role');
    const vipActor = addElement('BusinessActor', 'VIP Actor');
    addRelationship('AssignmentRelationship', actor, role, 'assigned to')!;
    addRelationship('SpecializationRelationship', vipActor, actor, 'specializes')!;
    setSelection('tree', [actor]);

    const { host, root } = await renderNavigator();

    expect(host.textContent).toContain('Actor');
    expect(host.textContent).toContain('Assignment: assigned to');
    expect(host.textContent).not.toContain('Specialization: specializes');

    await click(button(host, 'Show source relations'));

    expect(host.textContent).toContain('Specialization: specializes');
    expect(host.textContent).not.toContain('Assignment: assigned to');

    await act(async () => {
      root.unmount();
    });
  });

  it('pins the root against external selection changes and home re-roots to current selection', async () => {
    const actor = addElement('BusinessActor', 'Actor');
    const role = addElement('BusinessRole', 'Role');
    addRelationship('AssignmentRelationship', actor, role, 'assigned to')!;
    setSelection('tree', [actor]);
    const { host, root } = await renderNavigator();

    await click(button(host, 'Pin to selection'));
    await act(async () => {
      setSelection('tree', [role]);
    });
    await expandRow(host, 'Assignment: assigned to');

    expect(row(host, 'Actor').getAttribute('aria-level')).toBe('1');
    expect(row(host, 'Role').getAttribute('aria-level')).toBe('3');

    await click(button(host, 'Home'));

    expect(row(host, 'Role').getAttribute('aria-level')).toBe('1');

    await act(async () => {
      root.unmount();
    });
  });

  it('selects rows in the model tree without re-rooting the navigator', async () => {
    const actor = addElement('BusinessActor', 'Actor');
    const role = addElement('BusinessRole', 'Role');
    addRelationship('AssignmentRelationship', actor, role, 'assigned to')!;
    setSelection('tree', [actor]);
    const { host, root } = await renderNavigator();
    await expandRow(host, 'Assignment: assigned to');

    await click(row(host, 'Role'));

    expect(useStore.getState().selection).toEqual({ source: 'tree', ids: [role] });
    expect(row(host, 'Actor').getAttribute('aria-level')).toBe('1');

    await act(async () => {
      root.unmount();
    });
  });

  it('re-roots from selected view objects and double-clicked element rows', async () => {
    const actor = addElement('BusinessActor', 'Actor');
    const role = addElement('BusinessRole', 'Role');
    const relationship = addRelationship('AssignmentRelationship', actor, role, 'assigned to')!;
    const view = addView('View');
    const actorNode = addElementNodeToView(view, actor, view, { x: 10, y: 10, width: 120, height: 55 }, false);
    const roleNode = addElementNodeToView(view, role, view, { x: 200, y: 10, width: 120, height: 55 }, false);
    const connection = addConnectionToView(view, relationship, actorNode, roleNode);
    setSelection('view', [actorNode]);
    const { host, root } = await renderNavigator();

    expect(row(host, 'Actor').getAttribute('aria-level')).toBe('1');

    await act(async () => {
      setSelection('view', [connection]);
    });

    expect(row(host, 'Assignment: assigned to').getAttribute('aria-level')).toBe('1');

    await doubleClick(row(host, 'Role'));

    expect(row(host, 'Role').getAttribute('aria-level')).toBe('1');

    await act(async () => {
      root.unmount();
    });
  });
});
