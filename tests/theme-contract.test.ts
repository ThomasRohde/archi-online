import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyThemeMode } from '../src/ui/theme';

describe('application theme contract', () => {
  it('applies explicit themes and leaves system preference to CSS', () => {
    applyThemeMode('dark', document.documentElement);
    expect(document.documentElement.dataset.theme).toBe('dark');
    applyThemeMode('light', document.documentElement);
    expect(document.documentElement.dataset.theme).toBe('light');
    applyThemeMode('system', document.documentElement);
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('defines dark chrome, strong focus, readable muted text, and a white canvas', () => {
    const css = readFileSync(resolve('src/styles.css'), 'utf8');
    expect(css).toContain('--text-dim: #5f6874');
    expect(css).toContain(":root[data-theme='dark']");
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toMatch(/html :focus-visible\s*\{[^}]*outline: 2px solid var\(--accent\)/s);
    expect(css).not.toMatch(/html :focus-visible\s*\{[^}]*!important/s);
    expect(css).toMatch(/\.view-svg\s*\{[^}]*background:\s*#fff/s);
  });

  it('routes secondary chrome surfaces through light and dark theme tokens', () => {
    const css = readFileSync(resolve('src/styles.css'), 'utf8');
    const darkTheme = css.match(/:root\[data-theme='dark'\]\s*\{(?<rules>[^}]*)\}/)?.groups?.rules ?? '';

    for (const token of [
      '--input-bg',
      '--surface-code',
      '--surface-notice',
      '--notice-text',
      '--surface-subtle',
      '--accent-soft-strong',
    ]) {
      expect(css).toContain(`${token}:`);
      expect(darkTheme).toContain(`${token}:`);
    }

    expect(css).toMatch(/\.script-console\s*\{[^}]*background:\s*var\(--surface-code\)/s);
    expect(css).toMatch(/\.extension-source-note\s*\{[^}]*background:\s*var\(--surface-notice\)[^}]*color:\s*var\(--notice-text\)/s);
    expect(css).toMatch(/\.extension-errors\s*\{[^}]*background:\s*var\(--surface-code\)/s);
    expect(css).toMatch(/\.tree-label\.dim\s*\{[^}]*color:\s*var\(--text-dim\)/s);
    expect(css).toMatch(/\.tree-filter-btn\s*\{[^}]*color:\s*var\(--text-dim\)/s);
    expect(css).toMatch(/\.visualiser-panel\s*\{[^}]*background:\s*var\(--surface-subtle\)/s);
    expect(css).toMatch(/\.visualiser-controls\s*\{[^}]*background:\s*var\(--panel-bg\)/s);
    expect(css).toMatch(/\.visualiser-controls select\s*\{[^}]*background:\s*var\(--input-bg\)[^}]*color:\s*var\(--text\)/s);
    expect(css).toMatch(/\.appearance-field > label\s*\{[^}]*color:\s*var\(--text\)/s);
    expect(css).toMatch(/\.appearance-control select\s*\{[^}]*background:\s*var\(--input-bg\)[^}]*color:\s*var\(--text\)/s);
    expect(css).toMatch(/\.appearance-segmented button\.active\s*\{[^}]*background:\s*var\(--accent-soft-strong\)/s);
  });

  it('sizes virtualized model trees from their dock panel instead of the browser viewport', () => {
    const css = readFileSync(resolve('src/styles.css'), 'utf8');
    expect(css).not.toContain('calc(100vh - 150px)');
    expect(css).toMatch(/\.model-tree\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.model-tree-session\s*\{[^}]*flex:\s*1 1 0[^}]*min-height:\s*0[^}]*overflow:\s*auto/s);
  });
});
