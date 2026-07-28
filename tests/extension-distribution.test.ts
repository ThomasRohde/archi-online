import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readExtensionArchive } from '../src/extensions/package-archive';

interface CatalogEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  download: string;
  sha256: string;
}

interface ExtensionCatalog {
  schemaVersion: number;
  extensions: CatalogEntry[];
}

const projectRoot = process.cwd();
const projectVersion = (
  JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { version: string }
).version;
const temporaryRoot = mkdtempSync(join(tmpdir(), 'archi-online-extension-downloads-'));
const archiveOutput = join(temporaryRoot, 'archives');
const docsOutput = join(temporaryRoot, 'docs');

function buildDownloads() {
  const result = spawnSync(
    process.execPath,
    [
      'extensions/build-archives.mjs',
      '--output',
      archiveOutput,
      '--docs-output',
      docsOutput,
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Extension archive build failed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('extension distribution', () => {
  beforeAll(() => {
    buildDownloads();
  });

  afterAll(() => {
    rmSync(temporaryRoot, { recursive: true, force: true });
  });

  it('builds official versioned archives without the examples prefix', () => {
    const names = readdirSync(archiveOutput).sort();
    expect(names).toContain(`archi-online.capability-map-${projectVersion}.archi-ext`);
    expect(names).toContain(`archi-online.elk-layout-${projectVersion}.archi-ext`);
    expect(names.some((name) => name.startsWith('examples.capability-map-'))).toBe(false);
    expect(names.some((name) => name.startsWith('examples.elk-layout-'))).toBe(false);
  });

  it('stages importable official packages at stable documentation URLs', async () => {
    const downloads = [
      ['capability-map.archi-ext', 'archi-online.capability-map'],
      ['elk-layout.archi-ext', 'archi-online.elk-layout'],
    ] as const;

    for (const [fileName, id] of downloads) {
      const bytes = Uint8Array.from(readFileSync(join(docsOutput, fileName)));
      const pkg = await readExtensionArchive(bytes, 100);
      expect(pkg.manifest.id).toBe(id);
      expect(pkg.manifest.version).toBe(projectVersion);
    }
  });

  it('publishes a catalog and checksums for corporate verification', () => {
    const catalog = JSON.parse(
      readFileSync(join(docsOutput, 'catalog.json'), 'utf8'),
    ) as ExtensionCatalog;
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.extensions.map((entry) => entry.id)).toEqual([
      'archi-online.capability-map',
      'archi-online.elk-layout',
    ]);

    const expectedChecksums = catalog.extensions.map((entry) => {
      const bytes = readFileSync(join(docsOutput, entry.download));
      expect(entry.sha256).toBe(sha256(bytes));
      expect(entry.description.length).toBeGreaterThan(0);
      return `${entry.sha256}  ${entry.download}`;
    });
    expect(readFileSync(join(docsOutput, 'checksums.txt'), 'utf8'))
      .toBe(`${expectedChecksums.join('\n')}\n`);
  });

  it('rebuilds deterministic documentation archives', () => {
    const before = [
      readFileSync(join(docsOutput, 'capability-map.archi-ext')),
      readFileSync(join(docsOutput, 'elk-layout.archi-ext')),
    ];
    buildDownloads();
    expect(readFileSync(join(docsOutput, 'capability-map.archi-ext'))).toEqual(before[0]);
    expect(readFileSync(join(docsOutput, 'elk-layout.archi-ext'))).toEqual(before[1]);
  });
});
