import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ARM_RELATIONSHIP_BITS } from '../src/model/automatic-relationships';
import { DEFAULT_SETTINGS, useSettingsStore } from '../src/settings/app-settings';
import { SettingsPanel } from '../src/ui/SettingsPanel';

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(SettingsPanel)));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('automatic relationship settings UI', () => {
  it('shows compact relationship checklists with exact checked defaults and persists toggles', async () => {
    const normal = host.querySelector('[data-setting-mask="newRelationsTypes"]');
    const reverse = host.querySelector('[data-setting-mask="newReverseRelationsTypes"]');
    const hidden = host.querySelector('[data-setting-mask="hiddenRelationsTypes"]');

    expect(normal?.querySelectorAll('input[type="checkbox"]')).toHaveLength(11);
    expect(reverse?.querySelectorAll('input[type="checkbox"]')).toHaveLength(11);
    expect(hidden?.querySelectorAll('input[type="checkbox"]')).toHaveLength(11);
    expect(normal?.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(6);
    expect(reverse?.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(0);
    expect(hidden?.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(11);

    const access = reverse?.querySelector<HTMLInputElement>(
      'input[aria-label="Access reverse candidates"]',
    );
    expect(access).not.toBeNull();
    await act(async () => access!.click());
    expect(
      useSettingsStore.getState().settings.newReverseRelationsTypes &
        ARM_RELATIONSHIP_BITS.AccessRelationship,
    ).toBe(ARM_RELATIONSHIP_BITS.AccessRelationship);
  });

  it('keeps two-column masks inside the bounded settings control track', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    const rule = css.match(/\.settings-relationship-mask\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(rule).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(rule).toContain('min-width: 0;');
    expect(rule).toContain('width: 100%;');
  });
});
