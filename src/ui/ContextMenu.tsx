import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { extensionRegistry } from '../extensions/registry';
import type { ExtensionMenuLocation } from '../extensions/types';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
  children?: MenuItem[];
  separator?: boolean;
}

export const SEPARATOR: MenuItem = { label: '', separator: true };

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

let openMenuFn: ((state: MenuState) => void) | null = null;

/** Open the global context menu at screen coordinates. */
export function showContextMenu(x: number, y: number, items: MenuItem[]): void {
  openMenuFn?.({ x, y, items });
}

export function extensionMenuItems(location: ExtensionMenuLocation): MenuItem[] {
  return extensionRegistry.getSnapshot().menus[location].map((item) => ({
    label: item.label,
    danger: item.danger,
    onClick: () => void extensionRegistry.runCommand(item.command),
  }));
}

function MenuList({ items, onDone }: { items: MenuItem[]; onDone: () => void }) {
  const [openSub, setOpenSub] = useState<number | null>(null);
  return (
    <div className="ctx-menu">
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="ctx-sep" />
        ) : (
          <div
            key={i}
            className={
              'ctx-item' + (item.disabled ? ' disabled' : '') + (item.danger ? ' danger' : '')
            }
            onMouseEnter={() => setOpenSub(item.children ? i : null)}
            onClick={(e) => {
              e.stopPropagation();
              if (item.disabled || item.children) return;
              onDone();
              item.onClick?.();
            }}
          >
            {item.icon && <span className="ctx-icon">{item.icon}</span>}
            <span className="ctx-label">{item.label}</span>
            {item.children && <span className="ctx-arrow">▸</span>}
            {item.children && openSub === i && (
              <div className="ctx-submenu">
                <MenuList items={item.children} onDone={onDone} />
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
}

/** Mount once in the app shell. */
export function ContextMenuHost() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openMenuFn = setMenu;
    return () => {
      openMenuFn = null;
    };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) close();
    }
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  if (!menu) return null;
  // clamp to viewport
  const x = Math.min(menu.x, window.innerWidth - 220);
  const y = Math.min(menu.y, window.innerHeight - 40 * menu.items.length - 16);
  return createPortal(
    <div ref={ref} className="ctx-root" style={{ left: x, top: Math.max(4, y) }}>
      <MenuList items={menu.items} onDone={() => setMenu(null)} />
    </div>,
    document.body,
  );
}
