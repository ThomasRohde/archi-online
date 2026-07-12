import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const archiHome = process.env.ARCHI_HOME ?? 'C:\\Program Files\\Archi';
const archiExe = join(archiHome, 'Archi.exe');
const fixtureDir = join(root, 'tests', 'fixtures', 'phase1');
const onlinePath = join(fixtureDir, 'phase1-online.archimate');
const desktopPath = join(fixtureDir, 'phase1-desktop.archimate');
const skipDesktop = process.argv.includes('--skip-desktop');
const dom = new JSDOM('');
globalThis.DOMParser = dom.window.DOMParser;

const editorFeature = (await readdir(join(archiHome, 'features'))).find((name) => name.startsWith('com.archimatetool.editor.feature_'));
const version = editorFeature?.slice('com.archimatetool.editor.feature_'.length) ?? '';
if (version !== '5.9.0.202604140726') throw new Error(`Expected Archi 5.9.0.202604140726, found ${version || 'unknown'}`);
console.log(`Archi ${version}`);

if (!skipDesktop) {
  execFileSync(archiExe, [
    '-application', 'com.archimatetool.commandline.app', '-consoleLog', '-nosplash',
    '--loadModel', onlinePath, '--saveModel', desktopPath,
  ], { stdio: 'inherit', timeout: 120_000 });
}

const server = await createServer({ root, configFile: false, appType: 'custom', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { parseArchimateDocument } = await server.ssrLoadModule('/src/model/io/archimate-document.ts');
  const online = await parseArchimateDocument(new Uint8Array(await readFile(onlinePath)));
  const desktop = await parseArchimateDocument(new Uint8Array(await readFile(desktopPath)));
  const expected = semanticSummary(online);
  const actual = semanticSummary(desktop);
  await writeFile(join(fixtureDir, 'phase1-desktop.semantics.json'), JSON.stringify(actual, null, 2) + '\n');
  const differences = compare(expected, actual);
  if (differences.length > 0) throw new Error(`Desktop semantic comparison failed:\n${differences.slice(0, 40).join('\n')}`);
  console.log(`Phase 1 semantic parity verified (${expected.assets.length} archive asset, ${expected.nodes.length} nodes).`);
} finally {
  await server.close();
}

function semanticSummary(model) {
  const sort = (record, map) => Object.values(record).map(map).sort((left, right) => left.id.localeCompare(right.id));
  const compact = (value) => JSON.parse(JSON.stringify(value));
  return compact({
    info: { id: model.info.id, name: model.info.name, language: model.info.language, metadata: model.info.metadata },
    profiles: sort(model.profiles, (profile) => ({ ...profile })),
    elements: sort(model.elements, (element) => ({ ...element })),
    relationships: sort(model.relationships, (relationship) => ({ ...relationship })),
    views: sort(model.views, (view) => ({ id: view.id, name: view.name, viewpoint: view.viewpoint, childIds: view.childIds })),
    nodes: sort(model.nodes, (node) => ({
      ...node,
      lineWidth: node.lineWidth ?? 1,
      imagePosition: node.imagePosition ?? (node.nodeType === 'image' ? 9 : 2),
    })),
    connections: sort(model.connections, (connection) => ({ ...connection })),
    assets: sort(model.assets, (asset) => ({ id: asset.path, mediaType: asset.mediaType, sha256: asset.sha256, byteLength: asset.bytes.length })),
  });
}

function compare(expected, actual, path = '$') {
  if (Object.is(expected, actual)) return [];
  if (typeof expected !== typeof actual || expected === null || actual === null) return [`${path}: ${JSON.stringify(expected)} != ${JSON.stringify(actual)}`];
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${path}: expected array`];
    return [...(expected.length === actual.length ? [] : [`${path}.length: ${expected.length} != ${actual.length}`]), ...expected.flatMap((value, index) => compare(value, actual[index], `${path}[${index}]`))];
  }
  if (typeof expected === 'object') {
    return [...new Set([...Object.keys(expected), ...Object.keys(actual)])].flatMap((key) => compare(expected[key], actual[key], `${path}.${key}`));
  }
  return [`${path}: ${JSON.stringify(expected)} != ${JSON.stringify(actual)}`];
}
