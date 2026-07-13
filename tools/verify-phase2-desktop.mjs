import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
import { readConfiguredArchiEditorVersion } from './archi-installation.mjs';
import { verifyFrozenDesktopSource } from './phase2-desktop-provenance.mjs';
import { assertPhase2Semantics, canonicalizePhase2Model } from './phase2-semantics.mjs';
import { settlePhase2Cleanup, throwPhase2Failures } from './phase2-resource-lifecycle.mjs';
import { verifyPhase2Parity } from './verify-phase2-parity.mjs';

const EXPECTED_ARCHI_VERSION = '5.9.0.202604140726';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureDir = join(root, 'tests', 'fixtures', 'phase2');
const archiHome = process.env.ARCHI_HOME ?? 'C:\\Program Files\\Archi';
const archiExe = join(archiHome, 'Archi.exe');
const tracked = ['online', 'desktop'].flatMap((origin) => [
  join(fixtureDir, `phase2-${origin}.archimate`),
  join(fixtureDir, `phase2-${origin}.semantics.json`),
]);
tracked.push(join(fixtureDir, 'source', 'phase2-desktop-authored.archimate'));

await verifyPhase2Parity();

const version = await readConfiguredArchiEditorVersion(archiHome);
if (version !== EXPECTED_ARCHI_VERSION) {
  throw new Error(`Expected Archi ${EXPECTED_ARCHI_VERSION}, found ${version}`);
}
console.log(`Archi ${version}`);

const before = await hashes(tracked);
const hadDOMParser = Object.hasOwn(globalThis, 'DOMParser');
const previousDOMParser = globalThis.DOMParser;
const failures = [];
let temporaryRoot = null;
let dom = null;
let server = null;
try {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'archi-online-phase2-'));
  dom = new JSDOM('');
  globalThis.DOMParser = dom.window.DOMParser;
  server = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const { parseArchimateDocument, serializeArchimateDocument } =
    await server.ssrLoadModule('/src/model/io/archimate-document.ts');
  const desktopExpected = JSON.parse(
    await readFile(join(fixtureDir, 'phase2-desktop.semantics.json'), 'utf8'),
  );
  await verifyFrozenDesktopSource({
    sourcePath: join(fixtureDir, 'source', 'phase2-desktop-authored.archimate'),
    goldenPath: join(fixtureDir, 'phase2-desktop.archimate'),
    candidatePath: join(temporaryRoot, 'desktop-authored-source-desktop-save.archimate'),
    saveWithDesktop,
    async verifySemantics(bytes, label) {
      const parsed = await parseArchimateDocument(bytes);
      assertPhase2Semantics(desktopExpected, canonicalizePhase2Model(parsed), label);
    },
  });
  console.log('Verified hand-authored Desktop source against the frozen Desktop golden.');
  for (const origin of ['online', 'desktop']) {
    const expected = JSON.parse(await readFile(join(fixtureDir, `phase2-${origin}.semantics.json`), 'utf8'));
    const source = await parseArchimateDocument(
      new Uint8Array(await readFile(join(fixtureDir, `phase2-${origin}.archimate`))),
    );
    const onlinePath = join(temporaryRoot, `${origin}-online-roundtrip.archimate`);
    const desktopPath = join(temporaryRoot, `${origin}-desktop-roundtrip.archimate`);
    await writeFile(onlinePath, await serializeArchimateDocument(source));
    saveWithDesktop(onlinePath, desktopPath);
    const desktopRoundTrip = await parseArchimateDocument(new Uint8Array(await readFile(desktopPath)));
    assertPhase2Semantics(
      expected,
      canonicalizePhase2Model(desktopRoundTrip),
      `${origin} Online and Desktop round-trip semantics`,
    );
    console.log(`Verified ${origin} through Online and Desktop in temporary paths.`);
  }
} catch (error) {
  failures.push(error);
} finally {
  failures.push(...await settlePhase2Cleanup([
    ...(server ? [() => server.close()] : []),
    ...(dom ? [() => dom.window.close()] : []),
    ...(temporaryRoot ? [() => rm(temporaryRoot, { recursive: true, force: true })] : []),
    () => {
      if (hadDOMParser) globalThis.DOMParser = previousDOMParser;
      else delete globalThis.DOMParser;
    },
  ]));
}

try {
  const after = await hashes(tracked);
  if (before.some((digest, index) => digest !== after[index])) {
    failures.push(new Error('Desktop verification modified a committed Phase 2 fixture'));
  }
} catch (error) {
  failures.push(error);
}
throwPhase2Failures(failures, 'Phase 2 Desktop verification and cleanup failed');
console.log(`Phase 2 Desktop verification passed; removed ${temporaryRoot}.`);

async function hashes(paths) {
  return Promise.all(paths.map(async (path) =>
    createHash('sha256').update(await readFile(path)).digest('hex')));
}

function saveWithDesktop(sourcePath, targetPath) {
  execFileSync(archiExe, [
    '-application', 'com.archimatetool.commandline.app',
    '-consoleLog',
    '-nosplash',
    '--loadModel', sourcePath,
    '--saveModel', targetPath,
  ], { stdio: 'inherit', timeout: 120_000 });
}
