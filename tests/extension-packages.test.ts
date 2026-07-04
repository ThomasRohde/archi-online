import { beforeEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
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
import { memoryKeyValueStore, setDefaultKeyValueStoreForTests } from '../src/persistence/keyval';

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

function storage(initial?: unknown) {
  return memoryKeyValueStore(
    initial === undefined ? undefined : [[EXTENSION_PACKAGES_STORAGE_KEY, initial]],
  );
}

function throwingStorage() {
  return {
    async get<T>() {
      return undefined as T | undefined;
    },
    async set() {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    },
    async del() {},
  };
}

beforeEach(async () => {
  setDefaultKeyValueStoreForTests(memoryKeyValueStore());
  await useExtensionStore.getState().setExtensions([]);
  await useExtensionPackageStore.getState().setPackages([]);
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
  it('persists valid installed packages and falls back for unreadable records', async () => {
    const pkg = packageFixture();
    const s = storage();

    await persistInstalledPackages([pkg], s);

    await expect(loadInstalledPackages(s)).resolves.toEqual([pkg]);
    await expect(loadInstalledPackages(storage('{broken'))).resolves.toEqual([]);
  });

  it('surfaces IndexedDB persistence failures', async () => {
    const pkg = packageFixture();

    await expect(persistInstalledPackages([pkg], throwingStorage())).rejects.toThrow(
      /Could not persist extension packages/,
    );
  });

  it('ignores unknown persisted fields and invalid package entries', async () => {
    const pkg = packageFixture();
    const raw = [
      { ...pkg, unknown: 'ignored' },
      { id: 'broken' },
    ];

    await expect(loadInstalledPackages(storage(raw))).resolves.toEqual([pkg]);
  });

  it('preserves unreadable persisted package records across unrelated writes', async () => {
    const pkg = packageFixture();
    const futurePackage = {
      id: 'local.future-package',
      schemaVersion: 99,
      enabled: true,
      installedAt: 1,
      updatedAt: 1,
      files: { 'main.js': { encoding: 'utf8', content: '' } },
    };
    const s = storage([futurePackage, pkg]);

    await expect(loadInstalledPackages(s)).resolves.toEqual([pkg]);
    await persistInstalledPackages([{ ...pkg, enabled: false, updatedAt: 101 }], s);

    const written = s.data.get(EXTENSION_PACKAGES_STORAGE_KEY) as unknown[];
    expect(written).toHaveLength(2);
    expect(written[0]).toEqual(futurePackage);
    expect(written[1]).toMatchObject({ id: pkg.id, enabled: false });
  });

  it('loads enabled packages through the existing extension runtime registry', async () => {
    const registry = createExtensionRegistry();
    await useExtensionPackageStore.getState().setPackages([packageFixture()]);

    reloadEnabledExtensions(registry);

    expect(registry.getSnapshot().commands.map((command) => command.id)).toEqual([
      'local.audit-tools.count',
    ]);
  });

  it('falls back to an enabled package when a same-id source override is disabled', async () => {
    const registry = createExtensionRegistry();
    const pkg = packageFixture();
    await useExtensionStore.getState().setExtensions([
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
    await useExtensionPackageStore.getState().setPackages([pkg]);

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

  it('rejects oversized uncompressed archive contents before package validation', async () => {
    const manifest = {
      schemaVersion: 2,
      id: 'local.big-package',
      name: 'Big package',
      version: '1.0.0',
      main: 'main.js',
    };
    const bytes = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'main.js': strToU8('app.extension({ id: "local.big-package", name: "Big package", version: "1.0.0" });'),
      'assets/large.bin': new Uint8Array(5_000_001),
    });

    await expect(readExtensionArchive(bytes)).rejects.toThrow(/uncompressed package content/i);
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
