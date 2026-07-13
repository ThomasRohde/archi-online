import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Toolbar } from '../src/ui/Toolbar';

const BUILT_IN_ACTIONS = [
  'New model (Ctrl+Alt+N)',
  'Open .archimate file (Ctrl+O)',
  'Save model (Ctrl+S)',
  'Save model as…',
  'Share model',
  'Undo (Ctrl+Z)',
  'Redo (Ctrl+Y)',
  'Import or export images, Open Exchange, and CSV',
  'Presentation mode — full-screen view walkthrough',
  'Create and validate C4 views',
  'Manage specializations',
  'Import or place model images',
  'Find and replace',
  'Run extension commands',
  'Show or reopen panels',
  'Documentation',
  'Keyboard shortcuts',
] as const;

describe('toolbar built-in icons', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders every built-in action with one accessible Lucide icon', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(Toolbar)));

    for (const label of BUILT_IN_ACTIONS) {
      const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      expect(button, label).not.toBeNull();
      expect(button!.querySelectorAll('svg.lucide'), label).toHaveLength(1);
      expect(button!.querySelector('svg')?.getAttribute('aria-hidden'), label).toBe('true');
    }

    for (const label of ['Manage specializations', 'Import or place model images']) {
      const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
      expect(button.textContent).toBe('');
      expect(button.classList.contains('tb-icon-text')).toBe(false);
    }

    await act(async () => root.unmount());
  });
});
