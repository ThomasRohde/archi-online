import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextMenuHost, showContextMenu } from '../src/ui/ContextMenu';

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

async function render(element: React.ReactElement): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return { host, root };
}

function menuItem(label: string): HTMLElement {
  const item = Array.from(document.querySelectorAll<HTMLElement>('.ctx-item')).find(
    (candidate) => candidate.textContent?.includes(label),
  );
  expect(item, `Expected menu item "${label}"`).toBeDefined();
  return item!;
}

async function pressKey(key: string): Promise<void> {
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  });
}

function focusedMenuItem(label: string): HTMLElement {
  const focused = document.activeElement as HTMLElement | null;
  expect(focused?.getAttribute('role')).toBe('menuitem');
  expect(focused?.textContent).toContain(label);
  return focused!;
}

describe('ContextMenuHost', () => {
  it('renders nested menus outside the parent menu so toolbar submenus stay selectable', async () => {
    const onContainer = vi.fn();
    const { host, root } = await render(createElement(ContextMenuHost));

    await act(async () => {
      showContextMenu(20, 20, [
        {
          label: 'New C4 View',
          children: [
            { label: 'System Landscape', onClick: vi.fn() },
            { label: 'Container', onClick: onContainer },
          ],
        },
        { label: 'Validate Active C4 View', onClick: vi.fn() },
      ]);
    });

    const parentItem = menuItem('New C4 View');
    await act(async () => {
      parentItem.dispatchEvent(
        new MouseEvent('mouseover', {
          bubbles: true,
          relatedTarget: document.body,
        }),
      );
    });

    const menus = Array.from(document.querySelectorAll<HTMLElement>('.ctx-menu'));
    const submenu = menus.find(
      (menu) =>
        menu.textContent?.includes('System Landscape') &&
        menu.textContent.includes('Container') &&
        !menu.textContent.includes('Validate Active C4 View'),
    );
    expect(submenu).toBeDefined();
    expect(submenu?.style.position).toBe('fixed');
    expect(parentItem.contains(submenu!)).toBe(false);

    await act(async () => {
      menuItem('Container').click();
    });

    expect(onContainer).toHaveBeenCalledOnce();

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('uses roving menu focus and skips disabled items and separators', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open menu';
    document.body.append(trigger);
    trigger.focus();
    const { host, root } = await render(createElement(ContextMenuHost));

    await act(async () => {
      showContextMenu(20, 20, [
        { label: 'First', onClick: vi.fn() },
        { label: '', separator: true },
        { label: 'Unavailable', disabled: true, onClick: vi.fn() },
        { label: 'Last', onClick: vi.fn() },
      ]);
    });

    const menu = document.querySelector<HTMLElement>('.ctx-menu');
    expect(menu?.getAttribute('role')).toBe('menu');
    expect(menuItem('First').getAttribute('role')).toBe('menuitem');
    expect(menuItem('Unavailable').getAttribute('aria-disabled')).toBe('true');
    focusedMenuItem('First');

    await pressKey('ArrowDown');
    focusedMenuItem('Last');
    await pressKey('ArrowDown');
    focusedMenuItem('First');
    await pressKey('ArrowUp');
    focusedMenuItem('Last');

    await act(async () => {
      root.unmount();
    });
    host.remove();
    trigger.remove();
  });

  it('operates a three-level Magic Connector menu entirely from the keyboard', async () => {
    const onReuse = vi.fn();
    const trigger = document.createElement('button');
    trigger.textContent = 'Magic Connector';
    document.body.append(trigger);
    trigger.focus();
    const { host, root } = await render(createElement(ContextMenuHost));

    await act(async () => {
      showContextMenu(20, 20, [
        {
          label: 'Forward',
          children: [
            {
              label: 'Assignment',
              children: [
                { label: 'Reuse Existing Assignment', onClick: onReuse },
                { label: 'New Assignment', onClick: vi.fn() },
              ],
            },
            { label: 'Serving', children: [{ label: 'New Serving', onClick: vi.fn() }] },
          ],
        },
        { label: 'Reverse', children: [{ label: 'Flow', onClick: vi.fn() }] },
      ]);
    });

    const forward = focusedMenuItem('Forward');
    expect(forward.getAttribute('aria-haspopup')).toBe('menu');
    expect(forward.getAttribute('aria-expanded')).toBe('false');

    await pressKey('ArrowRight');
    expect(forward.getAttribute('aria-expanded')).toBe('true');
    const assignment = focusedMenuItem('Assignment');
    expect(assignment.getAttribute('aria-haspopup')).toBe('menu');

    await pressKey('ArrowRight');
    expect(assignment.getAttribute('aria-expanded')).toBe('true');
    focusedMenuItem('Reuse Existing Assignment');

    await pressKey('ArrowLeft');
    expect(assignment.getAttribute('aria-expanded')).toBe('false');
    focusedMenuItem('Assignment');

    await pressKey('ArrowRight');
    await pressKey('Enter');
    expect(onReuse).toHaveBeenCalledOnce();
    expect(document.querySelector('.ctx-menu')).toBeNull();

    await act(async () => {
      root.unmount();
    });
    host.remove();
    trigger.remove();
  });

  it('activates a focused leaf with Space', async () => {
    const onSelect = vi.fn();
    const { host, root } = await render(createElement(ContextMenuHost));

    await act(async () => {
      showContextMenu(20, 20, [{ label: 'Select relationship', onClick: onSelect }]);
    });

    focusedMenuItem('Select relationship');
    await pressKey(' ');
    expect(onSelect).toHaveBeenCalledOnce();
    expect(document.querySelector('.ctx-menu')).toBeNull();

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('closes nested menus with ArrowLeft and restores pre-open focus on Escape', async () => {
    const onDismiss = vi.fn();
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.append(trigger);
    trigger.focus();
    const { host, root } = await render(createElement(ContextMenuHost));

    await act(async () => {
      showContextMenu(20, 20, [
        {
          label: 'Forward',
          children: [
            {
              label: 'Assignment',
              children: [{ label: 'New Assignment', onClick: vi.fn() }],
            },
          ],
        },
      ], onDismiss);
    });

    const forward = focusedMenuItem('Forward');
    await pressKey('ArrowRight');
    const assignment = focusedMenuItem('Assignment');
    await pressKey('ArrowRight');
    focusedMenuItem('New Assignment');
    await pressKey('ArrowLeft');
    expect(assignment.getAttribute('aria-expanded')).toBe('false');
    focusedMenuItem('Assignment');
    await pressKey('ArrowLeft');
    expect(forward.getAttribute('aria-expanded')).toBe('false');
    focusedMenuItem('Forward');

    await pressKey('Escape');
    expect(document.querySelector('.ctx-menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(onDismiss).toHaveBeenCalledWith('escape');

    await act(async () => {
      root.unmount();
    });
    host.remove();
    trigger.remove();
  });

  it('reports outside dismissal without reporting successful item activation', async () => {
    const onDismiss = vi.fn();
    const onSelect = vi.fn();
    const outside = document.createElement('button');
    outside.textContent = 'Outside';
    document.body.append(outside);
    const { host, root } = await render(createElement(ContextMenuHost));

    await act(async () => {
      showContextMenu(20, 20, [{ label: 'Select', onClick: onSelect }], onDismiss);
    });
    await act(async () => {
      outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });

    expect(document.querySelector('.ctx-menu')).toBeNull();
    expect(onDismiss).toHaveBeenCalledWith('outside');
    expect(onSelect).not.toHaveBeenCalled();

    await act(async () => {
      showContextMenu(20, 20, [{ label: 'Select', onClick: onSelect }], onDismiss);
    });
    await act(async () => menuItem('Select').click());

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();

    await act(async () => {
      root.unmount();
    });
    host.remove();
    outside.remove();
  });
});
