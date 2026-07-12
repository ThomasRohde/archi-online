import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
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

export type MenuDismissReason = 'escape' | 'outside' | 'blur';

export const SEPARATOR: MenuItem = { label: '', separator: true };

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
  onDismiss?: (reason: MenuDismissReason) => void;
}

interface SubmenuState {
  index: number;
  x: number;
  y: number;
  items: MenuItem[];
  focusOnOpen: boolean;
}

let openMenuFn: ((state: MenuState) => void) | null = null;

/** Open the global context menu at screen coordinates. */
export function showContextMenu(
  x: number,
  y: number,
  items: MenuItem[],
  onDismiss?: (reason: MenuDismissReason) => void,
): void {
  openMenuFn?.({ x, y, items, onDismiss });
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

function firstEnabledItemIndex(items: MenuItem[]): number {
  return items.findIndex((item) => !item.separator && !item.disabled);
}

function nextEnabledItemIndex(items: MenuItem[], current: number, direction: 1 | -1): number {
  if (items.length === 0) return -1;
  let index = current;
  for (let visited = 0; visited < items.length; visited += 1) {
    index = (index + direction + items.length) % items.length;
    const item = items[index];
    if (item && !item.separator && !item.disabled) return index;
  }
  return -1;
}

type FocusableElement = Element & { focus: () => void };

function isFocusableElement(element: Element | null): element is FocusableElement {
  return !!element && 'focus' in element && typeof element.focus === 'function';
}

function MenuList({
  items,
  onDone,
  onDismiss,
  onClose,
  style,
  autoFocus = true,
}: {
  items: MenuItem[];
  onDone: () => void;
  onDismiss: (reason: MenuDismissReason) => void;
  onClose?: () => void;
  style?: CSSProperties;
  autoFocus?: boolean;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(() => firstEnabledItemIndex(items));
  const [openSub, setOpenSub] = useState<SubmenuState | null>(null);

  useEffect(() => {
    const firstIndex = firstEnabledItemIndex(items);
    setActiveIndex(firstIndex);
    setOpenSub(null);
    if (!autoFocus) return;
    if (firstIndex >= 0) itemRefs.current[firstIndex]?.focus();
    else menuRef.current?.focus();
  }, [autoFocus, items]);

  const focusItem = (index: number) => {
    if (index < 0) return;
    setOpenSub(null);
    setActiveIndex(index);
    itemRefs.current[index]?.focus();
  };

  const openSubmenu = (index: number, focusOnOpen: boolean) => {
    const item = items[index];
    const element = itemRefs.current[index];
    if (!item?.children || item.disabled || !element) return;
    const { x, y } = submenuPosition(element.getBoundingClientRect(), item.children.length);
    setActiveIndex(index);
    setOpenSub({ index, x, y, items: item.children, focusOnOpen });
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const item = items[activeIndex];
    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        focusItem(nextEnabledItemIndex(items, activeIndex, 1));
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        focusItem(nextEnabledItemIndex(items, activeIndex, -1));
        break;
      }
      case 'ArrowRight': {
        event.preventDefault();
        openSubmenu(activeIndex, true);
        break;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        if (onClose) onClose();
        else setOpenSub(null);
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (!item || item.disabled) break;
        if (item.children) {
          openSubmenu(activeIndex, true);
          break;
        }
        onDone();
        item.onClick?.();
        break;
      }
      case 'Escape': {
        event.preventDefault();
        onDismiss('escape');
        break;
      }
    }
  };

  return (
    <div
      ref={menuRef}
      className="ctx-menu"
      role="menu"
      aria-orientation="vertical"
      tabIndex={-1}
      style={style}
      onKeyDown={onKeyDown}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="ctx-sep" role="separator" />
        ) : (
          <div
            key={i}
            ref={(element) => {
              itemRefs.current[i] = element;
            }}
            className={
              'ctx-item' + (item.disabled ? ' disabled' : '') + (item.danger ? ' danger' : '')
            }
            role="menuitem"
            tabIndex={i === activeIndex && !item.disabled ? 0 : -1}
            aria-disabled={item.disabled || undefined}
            aria-haspopup={item.children ? 'menu' : undefined}
            aria-expanded={item.children ? openSub?.index === i : undefined}
            onFocus={() => setActiveIndex(i)}
            onMouseEnter={(e) => {
              if (!item.children) {
                setOpenSub(null);
                return;
              }
              const { x, y } = submenuPosition(e.currentTarget.getBoundingClientRect(), item.children.length);
              setOpenSub({ index: i, x, y, items: item.children, focusOnOpen: false });
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
                  key={openSub.index}
                  items={openSub.items}
                  onDone={onDone}
                  onDismiss={onDismiss}
                  onClose={() => {
                    setOpenSub(null);
                    setActiveIndex(i);
                    itemRefs.current[i]?.focus();
                  }}
                  autoFocus={openSub.focusOnOpen}
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
  const menuStateRef = useRef<MenuState | null>(null);
  const restoreFocusRef = useRef<FocusableElement | null>(null);

  const close = useCallback(() => {
    menuStateRef.current = null;
    setMenu(null);
    const restoreFocus = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (restoreFocus?.isConnected) restoreFocus.focus();
  }, []);

  const dismiss = useCallback((reason: MenuDismissReason) => {
    const onDismiss = menuStateRef.current?.onDismiss;
    close();
    onDismiss?.(reason);
  }, [close]);

  useEffect(() => {
    openMenuFn = (state) => {
      const activeElement = document.activeElement;
      restoreFocusRef.current = isFocusableElement(activeElement) ? activeElement : null;
      menuStateRef.current = state;
      setMenu(state);
    };
    return () => {
      openMenuFn = null;
    };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss('escape');
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    const onBlur = () => dismiss('blur');
    window.addEventListener('blur', onBlur);
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Element | null;
      if (target?.closest('.ctx-menu')) return;
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) dismiss('outside');
    }
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, [dismiss, menu]);

  if (!menu) return null;
  // clamp to viewport
  const x = clampMenuX(menu.x);
  const y = clampMenuY(menu.y, menu.items.length);
  return createPortal(
    <div ref={ref} className="ctx-root" style={{ left: x, top: Math.max(4, y) }}>
      <MenuList items={menu.items} onDone={close} onDismiss={dismiss} />
    </div>,
    document.body,
  );
}
