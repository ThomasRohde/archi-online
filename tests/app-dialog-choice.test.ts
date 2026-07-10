import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDialogHost, showChoiceDialog } from '../src/ui/AppDialog';

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.replaceChildren();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('choice dialog', () => {
  it('resolves the selected secondary action', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(AppDialogHost)));

    let result: string | null | undefined;
    await act(async () => {
      void showChoiceDialog({
        title: 'Save changes?',
        choices: [
          { label: 'Save', value: 'save', primary: true },
          { label: "Don't Save", value: 'discard', danger: true },
        ],
        cancelLabel: 'Cancel',
      }).then((value) => {
        result = value;
      });
    });

    const discard = [...document.querySelectorAll<HTMLButtonElement>('.app-dialog-btn')].find(
      (button) => button.textContent === "Don't Save",
    );
    expect(discard).toBeDefined();
    await act(async () => discard!.click());

    expect(result).toBe('discard');
    await act(async () => root.unmount());
  });
});
