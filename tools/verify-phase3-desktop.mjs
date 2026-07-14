import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { readConfiguredArchiEditorVersion } from './archi-installation.mjs';
import { verifyPhase3Parity } from './verify-phase3-parity.mjs';

const EXPECTED_ARCHI_VERSION = '5.9.0.202604140726';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixture = join(root, 'tests', 'fixtures', 'phase3', 'phase3-online.architemplate');
const archiHome = process.env.ARCHI_HOME ?? 'C:\\Program Files\\Archi';
const archiExe = join(archiHome, 'Archi.exe');

await verifyPhase3Parity();
const version = await readConfiguredArchiEditorVersion(archiHome);
if (version !== EXPECTED_ARCHI_VERSION) {
  throw new Error(`Expected Archi ${EXPECTED_ARCHI_VERSION}, found ${version}`);
}
console.log(`Archi ${version}`);

const temporaryRoot = await mkdtemp(join(tmpdir(), 'archi-online-phase3-'));
const dom = new JSDOM('');
const previousDOMParser = globalThis.DOMParser;
const hadDOMParser = Object.hasOwn(globalThis, 'DOMParser');
globalThis.DOMParser = dom.window.DOMParser;
const server = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const templateBytes = new Uint8Array(await readFile(fixture));
  const entries = unzipSync(templateBytes);
  assert.deepEqual(Object.keys(entries).sort(), [
    'Thumbnails/1.png', 'archi-online.json', 'manifest.xml', 'model.archimate',
  ]);
  assert.match(strFromU8(entries['manifest.xml']), /<key-thumbnail>Thumbnails\/1\.png<\/key-thumbnail>/);
  const sourcePath = join(temporaryRoot, 'template-inner.archimate');
  const desktopPath = join(temporaryRoot, 'template-inner-desktop-save.archimate');
  await writeFile(sourcePath, entries['model.archimate']);
  execFileSync(archiExe, [
    '-application', 'com.archimatetool.commandline.app',
    '-consoleLog',
    '-nosplash',
    '--loadModel', sourcePath,
    '--saveModel', desktopPath,
  ], { stdio: 'inherit', timeout: 120_000 });
  const { parseArchimateDocument } =
    await server.ssrLoadModule('/src/model/io/archimate-document.ts');
  const { parseArchiTemplate } = await server.ssrLoadModule('/src/model/io/architemplate.ts');
  const template = await parseArchiTemplate(templateBytes);
  assert.deepEqual(Object.keys(template.thumbnails), ['Thumbnails/1.png']);
  const before = template.model;
  const after = await parseArchimateDocument(new Uint8Array(await readFile(desktopPath)));
  assert.deepEqual(summary(after), summary(before), 'Desktop changed Phase 3 template model semantics');
  console.log('Phase 3 Desktop 5.9 verified the full template archive and round-tripped model.archimate.');
} finally {
  await server.close();
  dom.window.close();
  if (hadDOMParser) globalThis.DOMParser = previousDOMParser;
  else delete globalThis.DOMParser;
  await rm(temporaryRoot, { recursive: true, force: true });
}

function summary(model) {
  return {
    name: model.info.name,
    profiles: Object.keys(model.profiles).length,
    elements: Object.values(model.elements).map((item) => [item.type, item.name]).sort(),
    relationships: Object.values(model.relationships).map((item) => [
      item.type, item.name,
      model.elements[item.sourceId]?.name ?? model.relationships[item.sourceId]?.name,
      model.elements[item.targetId]?.name ?? model.relationships[item.targetId]?.name,
    ]).sort(),
    views: Object.values(model.views).map((item) => item.name).sort(),
    nodes: Object.keys(model.nodes).length,
    connections: Object.keys(model.connections).length,
  };
}
