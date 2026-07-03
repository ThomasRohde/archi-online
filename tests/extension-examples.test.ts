import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { readExtensionArchive } from '../src/extensions/package-archive';
import { createExtensionRegistry } from '../src/extensions/registry';
import { runInstalledPackage } from '../src/extensions/runtime';

const examplesRoot = join(process.cwd(), 'extensions');
const exampleIds = [
  'elk-layout',
  'model-audit-dashboard',
  'selection-workbench',
  'package-showcase',
  'event-log-console',
];

function archiveBytesFromFolder(folder: string): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const visit = (dir: string, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'dist') continue;
      const path = join(dir, entry.name);
      const archivePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(path, archivePath);
      else files[archivePath] = strToU8(readFileSync(path, 'utf8'));
    }
  };
  visit(folder);
  return zipSync(files);
}

describe('example extension packages', () => {
  it('defines the expected example package folders', () => {
    const folders = readdirSync(examplesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => name !== 'dist')
      .sort();

    expect(folders).toEqual([...exampleIds].sort());
  });

  it.each(exampleIds)('imports and registers runtime contributions for %s', async (folderName) => {
    const bytes = archiveBytesFromFolder(join(examplesRoot, folderName));
    const pkg = await readExtensionArchive(bytes, 100);
    const registry = createExtensionRegistry();

    expect(pkg.manifest.main).toBe('main.js');
    expect(pkg.files['manifest.json']).toBeDefined();
    expect(pkg.files[pkg.manifest.main]).toBeDefined();

    const result = runInstalledPackage(pkg, registry);

    expect(result).toEqual({});
    expect(registry.getSnapshot().commands.length).toBeGreaterThan(0);
  });
});
