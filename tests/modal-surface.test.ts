import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalSurface } from '../src/ui/ModalSurface';

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.replaceChildren();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('ModalSurface', () => {
  it('traps focus, closes on Escape, and restores the trigger', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onClose = vi.fn();

    await act(async () => root.render(createElement(
      ModalSurface,
      { title: 'Keyboard shortcuts', onClose },
      createElement('button', null, 'First'),
      createElement('button', null, 'Last'),
    )));

    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')];
    expect(document.activeElement).toBe(buttons[0]);
    buttons[1].focus();
    await act(async () => buttons[1].dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab', bubbles: true, cancelable: true,
    })));
    expect(document.activeElement).toBe(buttons[0]);

    await act(async () => buttons[0].dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true,
    })));
    expect(onClose).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    expect(document.activeElement).toBe(trigger);
  });
});
