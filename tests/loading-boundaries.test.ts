import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isMonacoRuntimeAsset } from '../src/pwa/monaco-cache';

describe('initial loading boundaries', () => {
  it('keeps Exchange parsing and image-js behind dynamic imports', () => {
    const files = readFileSync(resolve('src/persistence/files.ts'), 'utf8');
    const assets = readFileSync(resolve('src/model/assets.ts'), 'utf8');
    const dialog = readFileSync(resolve('src/ui/ExportExchangeDialog.tsx'), 'utf8');

    expect(files).not.toMatch(/import \{[^}]*parseExchange[^}]*\} from/);
    expect(files).toContain("await import('../model/io/exchange-xml')");
    expect(assets).not.toMatch(/from 'image-js'/);
    expect(assets).toContain("await import('image-js')");
    expect(dialog).toContain("await import('../model/io/exchange-xml')");
  });

  it('recognizes only same-origin Monaco editor and worker assets', () => {
    expect(isMonacoRuntimeAsset(new URL('https://example.test/assets/MonacoEditor-abc.js'), 'https://example.test')).toBe(true);
    expect(isMonacoRuntimeAsset(new URL('https://example.test/assets/ts.worker-abc.js'), 'https://example.test')).toBe(true);
    expect(isMonacoRuntimeAsset(new URL('https://example.test/assets/index-abc.js'), 'https://example.test')).toBe(false);
    expect(isMonacoRuntimeAsset(new URL('https://cdn.test/assets/ts.worker-abc.js'), 'https://example.test')).toBe(false);
  });

  it('precache-excludes Monaco workers without excluding the autosave worker', () => {
    const config = readFileSync(resolve('vite.config.ts'), 'utf8');
    expect(config).toContain("'**/{css,editor,html,json,ts}.worker-*.js'");
    expect(config).not.toContain("'**/*.worker-*.js'");
  });
});
