import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
import { assertPhase2Semantics, canonicalizePhase2Model } from './phase2-semantics.mjs';
import { settlePhase2Cleanup, throwPhase2Failures } from './phase2-resource-lifecycle.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureDir = join(root, 'tests', 'fixtures', 'phase2');
const validOrigins = ['online', 'desktop'];
const malformed = [
  ['phase2-malformed-missing-endpoint.archimate', /endpoint missing/i],
  ['phase2-malformed-endpoint-cycle.archimate', /endpoint cycle/i],
];

export async function verifyPhase2Parity() {
  const committedPaths = [
    ...validOrigins.flatMap((origin) => [
      join(fixtureDir, `phase2-${origin}.archimate`),
      join(fixtureDir, `phase2-${origin}.semantics.json`),
    ]),
    ...malformed.map(([name]) => join(fixtureDir, name)),
    join(fixtureDir, 'source', 'phase2-desktop-authored.archimate'),
  ];
  const before = await hashes(committedPaths);
  const hadDOMParser = Object.hasOwn(globalThis, 'DOMParser');
  const previousDOMParser = globalThis.DOMParser;
  const failures = [];
  let dom = null;
  let server = null;
  try {
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
    for (const origin of validOrigins) {
      const sourceBytes = new Uint8Array(await readFile(join(fixtureDir, `phase2-${origin}.archimate`)));
      const expected = JSON.parse(await readFile(join(fixtureDir, `phase2-${origin}.semantics.json`), 'utf8'));
      const source = await parseArchimateDocument(sourceBytes);
      assertPhase2Semantics(
        expected,
        canonicalizePhase2Model(source),
        `${origin} source semantics`,
      );
      const reparsed = await parseArchimateDocument(await serializeArchimateDocument(source));
      assertPhase2Semantics(
        expected,
        canonicalizePhase2Model(reparsed),
        `${origin} Online round-trip semantics`,
      );
      console.log(`Verified ${origin} source and Online round-trip semantics.`);
    }
    for (const [name, expected] of malformed) {
      try {
        await parseArchimateDocument(new Uint8Array(await readFile(join(fixtureDir, name))));
        throw new Error(`${name} was accepted`);
      } catch (error) {
        if (error instanceof Error && error.message === `${name} was accepted`) throw error;
        const message = error instanceof Error ? error.message : String(error);
        if (!expected.test(message)) {
          throw new Error(`${name} failed for an unexpected reason: ${message}`, { cause: error });
        }
      }
      console.log(`Verified rejection of ${name}.`);
    }
  } catch (error) {
    failures.push(error);
  } finally {
    failures.push(...await settlePhase2Cleanup([
      ...(server ? [() => server.close()] : []),
      ...(dom ? [() => dom.window.close()] : []),
      () => {
        if (hadDOMParser) globalThis.DOMParser = previousDOMParser;
        else delete globalThis.DOMParser;
      },
    ]));
  }
  try {
    const after = await hashes(committedPaths);
    if (before.some((digest, index) => digest !== after[index])) {
      failures.push(new Error('Phase 2 verification modified a committed fixture'));
    }
  } catch (error) {
    failures.push(error);
  }
  throwPhase2Failures(failures, 'Phase 2 verification and cleanup failed');
  console.log('Phase 2 cross-platform semantic verification passed without modifying fixtures.');
}

async function hashes(paths) {
  return Promise.all(paths.map(async (path) =>
    createHash('sha256').update(await readFile(path)).digest('hex')));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyPhase2Parity();
}
