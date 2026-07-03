import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createArchiveBytesForPackage,
  createArchiveBytesForSourceRecord,
  readExtensionArchive,
} from '../src/extensions/package-archive';
import {
  EXTENSION_PACKAGES_STORAGE_KEY,
  loadInstalledPackages,
  persistInstalledPackages,
  useExtensionPackageStore,
} from '../src/extensions/package-store';
import {
  flattenInstalledPackage,
  makeInstalledPackage,
  normalizePackagePath,
  packageInfo,
  readPackageJsonFile,
  readPackageTextFile,
} from '../src/extensions/package-validation';
import { createExtensionRegistry } from '../src/extensions/registry';
import { reloadEnabledExtensions } from '../src/extensions/runtime';
import { createExtensionRecord, useExtensionStore } from '../src/extensions/extension-store';
import type { InstalledExtensionPackage } from '../src/extensions/package-types';
import {
  packageConversionWarning,
  packageImportWarning,
} from '../src/extensions/package-conversion';

function packageFixture(now = 100): InstalledExtensionPackage {
  return makeInstalledPackage({
    manifest: {
      schemaVersion: 2,
      id: 'local.audit-tools',
      name: 'Audit tools',
      version: '0.2.0',
      description: 'Audit commands.',
      main: 'main.js',
    },
    files: {
      'manifest.json': {
        encoding: 'utf8',
        content: JSON.stringify({
          schemaVersion: 2,
          id: 'local.audit-tools',
          name: 'Audit tools',
          version: '0.2.0',
          main: 'main.js',
        }),
      },
      'main.js': {
        encoding: 'utf8',
        content: `
          app.extension({ id: "local.audit-tools", name: "Audit tools", version: "0.2.0" });
          app.commands.register("local.audit-tools.count", { title: "Count", run() {} });
        `,
      },
      'data/config.json': { encoding: 'utf8', content: '{"threshold":7}' },
    },
    enabled: true,
    now,
  });
}

function storage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(EXTENSION_PACKAGES_STORAGE_KEY, initial);
  return {
    data,
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

function throwingStorage() {
  return {
    getItem() {
      return null;
    },
    setItem() {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    },
  };
}

function browserStorage() {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', browserStorage());
  localStorage.clear();
  useExtensionStore.getState().setExtensions([]);
  useExtensionPackageStore.getState().setPackages([]);
});

describe('extension package validation', () => {
  it('normalizes safe package paths and rejects unsafe paths', () => {
    expect(normalizePackagePath('scripts/audit.js')).toBe('scripts/audit.js');
    expect(normalizePackagePath('README.md')).toBe('README.md');

    expect(() => normalizePackagePath('../main.js')).toThrow(/Unsafe package path/);
    expect(() => normalizePackagePath('/main.js')).toThrow(/Unsafe package path/);
    expect(() => normalizePackagePath('scripts\\audit.js')).toThrow(/Unsafe package path/);
    expect(() => normalizePackagePath('scripts//audit.js')).toThrow(/Unsafe package path/);
  });

  it('creates an installed package from valid files and flattens it for runtime', () => {
    const pkg = packageFixture();

    expect(flattenInstalledPackage(pkg)).toMatchObject({
      id: 'local.audit-tools',
      name: 'Audit tools',
      version: '0.2.0',
      enabled: true,
      source: expect.stringContaining('local.audit-tools'),
      createdAt: 100,
      updatedAt: 100,
    });
    expect(readPackageTextFile(pkg, 'main.js')).toContain('app.extension');
    expect(readPackageJsonFile(pkg, 'data/config.json')).toEqual({ threshold: 7 });
  });

  it('exposes static contribution metadata in package info', () => {
    const pkg = makeInstalledPackage({
      manifest: {
        schemaVersion: 2,
        id: 'local.contributes',
        name: 'Contributes',
        version: '1.0.0',
        main: 'main.js',
        contributes: {
          commands: [{ id: 'local.contributes.run', title: 'Run' }],
          events: [{ name: 'selection.changed' }],
        },
      },
      files: {
        'manifest.json': {
          encoding: 'utf8',
          content: '{}',
        },
        'main.js': {
          encoding: 'utf8',
          content: 'app.extension({ id: "local.contributes", name: "Contributes", version: "1.0.0" });',
        },
      },
      now: 1,
    });

    expect(packageInfo(pkg).contributes).toEqual({
      commands: [{ id: 'local.contributes.run', title: 'Run' }],
      events: [{ name: 'selection.changed' }],
    });
  });

  it('rejects invalid manifests and missing main files', () => {
    expect(() =>
      makeInstalledPackage({
        manifest: {
          schemaVersion: 1,
          id: 'x',
          name: 'X',
          version: '1.0.0',
          main: 'main.js',
        } as never,
        files: {},
        enabled: true,
        now: 1,
      }),
    ).toThrow(/schemaVersion/);

    expect(() =>
      makeInstalledPackage({
        manifest: {
          schemaVersion: 2,
          id: 'local.missing',
          name: 'Missing',
          version: '1.0.0',
          main: 'main.js',
        },
        files: { 'manifest.json': { encoding: 'utf8', content: '{}' } },
        enabled: true,
        now: 1,
      }),
    ).toThrow(/main file/);
  });
});

describe('extension package store and runtime loading', () => {
  it('persists valid installed packages and falls back for invalid JSON', () => {
    const pkg = packageFixture();
    const s = storage();

    persistInstalledPackages([pkg], s);

    expect(loadInstalledPackages(s)).toEqual([pkg]);
    expect(loadInstalledPackages(storage('{broken'))).toEqual([]);
  });

  it('surfaces localStorage persistence failures', () => {
    const pkg = packageFixture();

    expect(() => persistInstalledPackages([pkg], throwingStorage())).toThrow(
      /Could not persist extension packages/,
    );
  });

  it('ignores unknown persisted fields and invalid package entries', () => {
    const pkg = packageFixture();
    const raw = JSON.stringify([
      { ...pkg, unknown: 'ignored' },
      { id: 'broken' },
    ]);

    expect(loadInstalledPackages(storage(raw))).toEqual([pkg]);
  });

  it('loads enabled packages through the existing extension runtime registry', () => {
    const registry = createExtensionRegistry();
    useExtensionPackageStore.getState().setPackages([packageFixture()]);

    reloadEnabledExtensions(registry);

    expect(registry.getSnapshot().commands.map((command) => command.id)).toEqual([
      'local.audit-tools.count',
    ]);
  });

  it('falls back to an enabled package when a same-id source override is disabled', () => {
    const registry = createExtensionRegistry();
    const pkg = packageFixture();
    useExtensionStore.getState().setExtensions([
      {
        id: pkg.id,
        name: 'Disabled override',
        version: '0.1.0',
        enabled: false,
        source: 'throw new Error("disabled source should not load");',
        createdAt: 1,
        updatedAt: 1,
        origin: 'override',
      },
    ]);
    useExtensionPackageStore.getState().setPackages([pkg]);

    reloadEnabledExtensions(registry);

    expect(registry.getSnapshot().commands.map((command) => command.id)).toEqual([
      'local.audit-tools.count',
    ]);
  });
});

describe('extension package archives', () => {
  it('rejects oversized compressed archives before decompression', async () => {
    await expect(readExtensionArchive(new Uint8Array(20_000_001))).rejects.toThrow(
      /Package archive is too large/,
    );
  });

  it('round trips installed package archives', async () => {
    const pkg = packageFixture();

    const bytes = createArchiveBytesForPackage(pkg);
    const imported = await readExtensionArchive(bytes, 200);

    expect(imported.manifest).toEqual(pkg.manifest);
    expect(readPackageTextFile(imported, 'main.js')).toContain('local.audit-tools.count');
    expect(readPackageJsonFile(imported, 'data/config.json')).toEqual({ threshold: 7 });
  });

  it('exports source records as valid V2 packages', async () => {
    const source = createExtensionRecord('local.source', 'Source extension', 1);

    const bytes = createArchiveBytesForSourceRecord(source);
    const imported = await readExtensionArchive(bytes, 2);

    expect(imported.id).toBe('local.source');
    expect(imported.manifest).toMatchObject({
      schemaVersion: 2,
      id: 'local.source',
      name: 'Source extension',
      version: '0.1.0',
      main: 'main.js',
    });
    expect(readPackageTextFile(imported, 'main.js')).toBe(source.source);
  });
});

describe('extension package conversion', () => {
  it('warns when converting a package would drop bundled assets', () => {
    expect(packageConversionWarning(packageFixture())).toContain('1 bundled file will be lost');
  });

  it('warns that imported packages run trusted code', () => {
    expect(packageImportWarning(packageFixture(), false)).toContain(
      'Extensions run with full access',
    );
    expect(packageImportWarning(packageFixture(), true)).toContain('Replace the existing');
  });
});
