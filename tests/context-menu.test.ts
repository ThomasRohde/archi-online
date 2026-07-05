import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ContextMenuHost, showContextMenu } from '../src/ui/ContextMenu';

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
});
