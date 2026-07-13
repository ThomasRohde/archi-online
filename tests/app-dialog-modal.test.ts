import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppDialogHost,
  showAlertDialog,
  showConfirmDialog,
  showPromptDialog,
} from '../src/ui/AppDialog';

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(AppDialogHost)));
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

function pressKey(
  key: string,
  options: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    ...options,
  });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}

function button(label: string): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (candidate) => candidate.textContent === label,
  )!;
}

describe('shared application dialog modal behavior', () => {
  it('suppresses global shortcuts from the capture phase', async () => {
    const globalShortcut = vi.fn();
    window.addEventListener('keydown', globalShortcut);
    await act(async () => {
      void showConfirmDialog({ title: 'Delete object?', confirmLabel: 'Delete' });
    });

    let shortcutEvent!: KeyboardEvent;
    await act(async () => {
      shortcutEvent = pressKey('d', { ctrlKey: true });
    });

    expect(globalShortcut).not.toHaveBeenCalled();
    expect(shortcutEvent.defaultPrevented).toBe(true);

    await act(async () => button('Cancel').click());
    window.removeEventListener('keydown', globalShortcut);
  });

  it('wraps Tab and Shift+Tab within the dialog', async () => {
    await act(async () => {
      void showConfirmDialog({
        title: 'Apply changes?',
        confirmLabel: 'Apply',
        cancelLabel: 'Keep editing',
      });
    });
    const first = button('Keep editing');
    const last = button('Apply');

    expect(document.activeElement).toBe(last);
    await act(async () => pressKey('Tab'));
    expect(document.activeElement).toBe(first);
    await act(async () => pressKey('Tab', { shiftKey: true }));
    expect(document.activeElement).toBe(last);

    await act(async () => first.click());
  });

  it('focuses queued dialogs without restoring focus until the queue drains', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open dialog';
    document.body.append(trigger);
    trigger.focus();
    const restored = vi.fn();
    trigger.addEventListener('focus', restored);
    const firstResult = vi.fn();
    const secondResult = vi.fn();
    const thirdResult = vi.fn();

    await act(async () => {
      void showAlertDialog({ title: 'First notice', confirmLabel: 'Continue' }).then(firstResult);
      void showPromptDialog({ title: 'Second prompt', defaultValue: 'value' }).then(secondResult);
      void showAlertDialog({ title: 'Third notice', confirmLabel: 'Finish' }).then(thirdResult);
    });

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('First notice');
    expect(document.activeElement).toBe(button('Continue'));
    await act(async () => pressKey('Escape'));
    expect(firstResult).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Second prompt');
    expect(document.activeElement).toBe(document.querySelector('.app-dialog-input'));
    expect(restored).not.toHaveBeenCalled();

    await act(async () => {
      pressKey('Escape');
      pressKey('Escape');
    });
    expect(secondResult).toHaveBeenCalledOnce();
    expect(thirdResult).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Third notice');
    expect(document.activeElement).toBe(button('Finish'));
    expect(restored).not.toHaveBeenCalled();

    await act(async () => pressKey('Escape'));
    expect(thirdResult).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(restored).toHaveBeenCalledOnce();
  });

  it('cancels the active and queued requests on teardown without remounting ghosts', async () => {
    const confirmResult = vi.fn();
    const promptResult = vi.fn();
    const alertResult = vi.fn();

    await act(async () => {
      void showConfirmDialog({ title: 'Active confirmation' }).then(confirmResult);
      void showPromptDialog({ title: 'Queued prompt' }).then(promptResult);
      void showAlertDialog({ title: 'Queued alert' }).then(alertResult);
    });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Active confirmation');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });

    expect(confirmResult).toHaveBeenCalledOnce();
    expect(confirmResult).toHaveBeenCalledWith(false);
    expect(promptResult).toHaveBeenCalledOnce();
    expect(promptResult).toHaveBeenCalledWith(null);
    expect(alertResult).toHaveBeenCalledOnce();
    expect(alertResult).toHaveBeenCalledWith(undefined);

    root = createRoot(host);
    await act(async () => root.render(createElement(AppDialogHost)));
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    const freshResult = vi.fn();
    await act(async () => {
      void showAlertDialog({ title: 'Fresh alert' }).then(freshResult);
    });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Fresh alert');
    await act(async () => button('OK').click());
    expect(freshResult).toHaveBeenCalledOnce();
  });

  it('does not render a settled prequeued request after StrictMode replays effects', async () => {
    await act(async () => root.unmount());
    const result = vi.fn();
    void showConfirmDialog({ title: 'Prequeued confirmation' }).then(result);

    root = createRoot(host);
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(AppDialogHost)));
      await Promise.resolve();
    });

    expect(result).toHaveBeenCalledOnce();
    expect(result).toHaveBeenCalledWith(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
