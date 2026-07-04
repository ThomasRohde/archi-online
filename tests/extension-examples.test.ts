import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { extensionStorageKey } from '../src/extensions/app-api';
import { readExtensionArchive } from '../src/extensions/package-archive';
import { createExtensionRegistry } from '../src/extensions/registry';
import { runInstalledPackage } from '../src/extensions/runtime';
import { memoryKeyValueStore, setDefaultKeyValueStoreForTests } from '../src/persistence/keyval';

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
      else files[archivePath] = readFileSync(path);
    }
  };
  visit(folder);
  return zipSync(files);
}

async function loadExample(folderName: string) {
  const bytes = archiveBytesFromFolder(join(examplesRoot, folderName));
  const pkg = await readExtensionArchive(bytes, 100);
  const registry = createExtensionRegistry();
  const result = runInstalledPackage(pkg, registry);
  expect(result).toEqual({});
  return { pkg, registry };
}

let persistenceStore = memoryKeyValueStore();

async function flushPanelRender() {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe('example extension packages', () => {
  beforeEach(() => {
    persistenceStore = memoryKeyValueStore();
    setDefaultKeyValueStoreForTests(persistenceStore);
  });

  it('defines the expected example package folders', () => {
    const folders = readdirSync(examplesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => name !== 'dist')
      .sort();

    expect(folders).toEqual([...exampleIds].sort());
  });

  it.each(exampleIds)('imports and registers runtime contributions for %s', async (folderName) => {
    const { pkg, registry } = await loadExample(folderName);

    expect(pkg.manifest.main).toBe('main.js');
    expect(pkg.files['manifest.json']).toBeDefined();
    expect(pkg.files[pkg.manifest.main]).toBeDefined();

    expect(registry.getSnapshot().commands.length).toBeGreaterThan(0);
  });

  it('renders stored ELK dropdown values after panel re-render', async () => {
    const { registry } = await loadExample('elk-layout');
    await persistenceStore.set(
      extensionStorageKey('examples.elk-layout'),
      {
        options: {
          scope: 'selection',
          direction: 'down',
          edgeRouting: 'splines',
          nodeSpacing: 40,
          layerSpacing: 80,
        },
      },
    );
    const panel = registry
      .getSnapshot()
      .panels.find((candidate) => candidate.id === 'examples.elk-layout.panel');
    const container = document.createElement('div');

    panel?.render(container);
    await flushPanelRender();

    expect([...container.querySelectorAll('select')].map((select) => select.value)).toEqual([
      'selection',
      'down',
      'splines',
    ]);
  });

  it('renders event log payloads as text instead of HTML', async () => {
    const { registry } = await loadExample('event-log-console');
    await registry.emitEvent('model.opened', {
      fileName: '<img src=x onerror="globalThis.__xss = true">',
    });
    const panel = registry
      .getSnapshot()
      .panels.find((candidate) => candidate.id === 'examples.event-log-console.panel');
    const container = document.createElement('div');

    panel?.render(container);
    await flushPanelRender();

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x');
  });

  it('renders selection history values as text instead of HTML', async () => {
    const { registry } = await loadExample('selection-workbench');
    await registry.emitEvent('selection.changed', {
      source: '<img src=x onerror="globalThis.__xss = true">',
      ids: ['<svg onload="globalThis.__xss = true">'],
    });
    const panel = registry
      .getSnapshot()
      .panels.find((candidate) => candidate.id === 'examples.selection-workbench.panel');
    const container = document.createElement('div');

    panel?.render(container);
    await flushPanelRender();

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toContain('<img src=x');
    expect(container.textContent).toContain('<svg onload=');
  });
});
