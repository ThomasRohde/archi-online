import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDialogHost } from '../src/ui/AppDialog';
import * as dialogs from '../src/ui/AppDialog';

type ShowNestingRelationshipDialog = (options: {
  parentLabel: string;
  rows: Array<{
    childId: string;
    childLabel: string;
    choices: Array<{ value: string; label: string }>;
  }>;
}) => Promise<Record<string, string | null> | null>;

const showNestingRelationshipDialog = (dialogs as typeof dialogs & {
  showNestingRelationshipDialog?: ShowNestingRelationshipDialog;
}).showNestingRelationshipDialog;

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
  host.remove();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

function requireDialog(): ShowNestingRelationshipDialog | null {
  expect(
    showNestingRelationshipDialog,
    'showNestingRelationshipDialog must use the shared accessible dialog host',
  ).toBeTypeOf('function');
  return showNestingRelationshipDialog ?? null;
}

describe('automatic relationship chooser', () => {
  it('defaults a single child to its first valid candidate and includes None', async () => {
    const show = requireDialog();
    if (!show) return;
    let result: Record<string, string | null> | null | undefined;
    await act(async () => {
      void show({
        parentLabel: 'Parent',
        rows: [
          {
            childId: 'child-a',
            childLabel: 'Child A',
            choices: [
              { value: 'composition', label: 'Composition — Parent to Child A' },
              { value: 'aggregation', label: 'Aggregation — Parent to Child A' },
            ],
          },
        ],
      }).then((value) => {
        result = value;
      });
    });

    const dialog = document.querySelector('[role="dialog"]');
    const select = dialog?.querySelector<HTMLSelectElement>(
      'select[aria-label="Relationship for Child A"]',
    );
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(select?.value).toBe('composition');
    expect([...select!.options].map((option) => option.textContent)).toContain('None');

    const apply = [...dialog!.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Apply',
    );
    await act(async () => apply!.click());
    expect(result).toEqual({ 'child-a': 'composition' });
  });

  it('renders one independently labelled choice for every child', async () => {
    const show = requireDialog();
    if (!show) return;
    let result: Record<string, string | null> | null | undefined;
    await act(async () => {
      void show({
        parentLabel: 'Parent',
        rows: [
          {
            childId: 'child-a',
            childLabel: 'Child A',
            choices: [{ value: 'composition-a', label: 'Composition' }],
          },
          {
            childId: 'child-b',
            childLabel: 'Child B',
            choices: [{ value: 'aggregation-b', label: 'Aggregation' }],
          },
        ],
      }).then((value) => {
        result = value;
      });
    });

    const first = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Relationship for Child A"]',
    );
    const second = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Relationship for Child B"]',
    );
    expect(first?.value).toBe('composition-a');
    expect(second?.value).toBe('aggregation-b');
    await act(async () => {
      second!.value = '';
      second!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const apply = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Apply',
    );
    await act(async () => apply!.click());

    expect(result).toEqual({ 'child-a': 'composition-a', 'child-b': null });
  });

  it('returns null on Cancel so callers can leave the model untouched', async () => {
    const show = requireDialog();
    if (!show) return;
    let result: Record<string, string | null> | null | undefined;
    await act(async () => {
      void show({
        parentLabel: 'Parent',
        rows: [
          {
            childId: 'child-a',
            childLabel: 'Child A',
            choices: [{ value: 'composition', label: 'Composition' }],
          },
        ],
      }).then((value) => {
        result = value;
      });
    });

    const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Cancel',
    );
    await act(async () => cancel!.click());
    expect(result).toBeNull();
  });
});
