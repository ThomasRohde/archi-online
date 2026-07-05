import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { extensionRegistry } from '../extensions/registry';
import type { ExtensionRegistry } from '../extensions/registry';
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

interface SubmenuState {
  index: number;
  x: number;
  y: number;
  items: MenuItem[];
}

let openMenuFn: ((state: MenuState) => void) | null = null;

/** Open the global context menu at screen coordinates. */
export function showContextMenu(x: number, y: number, items: MenuItem[]): void {
  openMenuFn?.({ x, y, items });
}

export function extensionMenuItems(
  location: ExtensionMenuLocation,
  trigger?: unknown,
  registry: ExtensionRegistry = extensionRegistry,
): MenuItem[] {
  return registry.getSnapshot().menus[location].map((item) => ({
    label: item.label,
    danger: item.danger,
    onClick: () => void registry.runCommand(item.command, undefined, trigger),
  }));
}

function clampMenuX(x: number, width = 220): number {
  return Math.max(4, Math.min(x, window.innerWidth - width - 8));
}

function clampMenuY(y: number, itemCount: number): number {
  return Math.max(4, Math.min(y, window.innerHeight - 40 * itemCount - 16));
}

function submenuPosition(rect: DOMRect, itemCount: number): { x: number; y: number } {
  const estimatedWidth = 220;
  const openRight = rect.right + estimatedWidth <= window.innerWidth - 8;
  return {
    x: openRight ? rect.right - 1 : rect.left - estimatedWidth + 1,
    y: clampMenuY(rect.top - 4, itemCount),
  };
}

function MenuList({
  items,
  onDone,
  style,
}: {
  items: MenuItem[];
  onDone: () => void;
  style?: CSSProperties;
}) {
  const [openSub, setOpenSub] = useState<SubmenuState | null>(null);
  return (
    <div className="ctx-menu" style={style}>
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="ctx-sep" />
        ) : (
          <div
            key={i}
            className={
              'ctx-item' + (item.disabled ? ' disabled' : '') + (item.danger ? ' danger' : '')
            }
            onMouseEnter={(e) => {
              if (!item.children) {
                setOpenSub(null);
                return;
              }
              const { x, y } = submenuPosition(e.currentTarget.getBoundingClientRect(), item.children.length);
              setOpenSub({ index: i, x, y, items: item.children });
            }}
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
            {item.children &&
              openSub?.index === i &&
              createPortal(
                <MenuList
                  items={openSub.items}
                  onDone={onDone}
                  style={{ position: 'fixed', left: openSub.x, top: openSub.y }}
                />,
                document.body,
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
      const target = e.target as Element | null;
      if (target?.closest('.ctx-menu')) return;
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
  const x = clampMenuX(menu.x);
  const y = clampMenuY(menu.y, menu.items.length);
  return createPortal(
    <div ref={ref} className="ctx-root" style={{ left: x, top: Math.max(4, y) }}>
      <MenuList items={menu.items} onDone={() => setMenu(null)} />
    </div>,
    document.body,
  );
}
