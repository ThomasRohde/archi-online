import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function readRequired(relativePath) {
  try {
    return readFileSync(resolve(root, relativePath), 'utf8');
  } catch (error) {
    throw new Error(`Missing required license distribution file: ${relativePath}`, {
      cause: error,
    });
  }
}

function requireText(content, expected, relativePath) {
  if (!content.includes(expected)) {
    throw new Error(`${relativePath} is missing required text: ${expected}`);
  }
}

const publicLicense = readRequired('public/licenses/EPL-1.0.txt');
const publicNotice = readRequired('public/licenses/Eclipse-Draw2D-NOTICE.txt');
const publicMitLicense = readRequired('public/licenses/MIT.txt');
const publicRouterSource = readRequired('public/licenses/source/manhattan-router.ts.txt');
const distLicense = readRequired('dist/licenses/EPL-1.0.txt');
const distNotice = readRequired('dist/licenses/Eclipse-Draw2D-NOTICE.txt');
const distMitLicense = readRequired('dist/licenses/MIT.txt');
const distRouterSource = readRequired('dist/licenses/source/manhattan-router.ts.txt');
const repositoryNotice = readRequired('THIRD_PARTY_NOTICES.md');
const routerSource = readRequired('src/canvas/manhattan-router.ts');
const projectLicense = readRequired('LICENSE');
const packageJson = JSON.parse(readRequired('package.json'));

if (distLicense !== publicLicense) {
  throw new Error('dist/licenses/EPL-1.0.txt differs from its canonical public source');
}
if (distNotice !== publicNotice) {
  throw new Error('dist/licenses/Eclipse-Draw2D-NOTICE.txt differs from its public source');
}
if (distMitLicense !== publicMitLicense) {
  throw new Error('dist/licenses/MIT.txt differs from its public source');
}
if (publicMitLicense.replace(/\r\n/g, '\n') !== projectLicense.replace(/\r\n/g, '\n')) {
  throw new Error('public/licenses/MIT.txt differs from the project LICENSE');
}
if (publicRouterSource !== routerSource || distRouterSource !== routerSource) {
  throw new Error('public/dist corresponding Manhattan router source differs from src');
}
if (publicLicense.length < 11_000) {
  throw new Error('public/licenses/EPL-1.0.txt is not the complete EPL-1.0 text');
}
const normalizedLicense = publicLicense
  .replace(/\r\n/g, '\n')
  .split('\n')
  .map((line) => line.trimEnd())
  .join('\n')
  .trimEnd() + '\n';
const licenseHash = createHash('sha256').update(normalizedLicense).digest('hex');
if (licenseHash !== '2a3309551210de4a1ef5db287b4f0e38d43b57e973b7c821d726c36f47fa2aec') {
  throw new Error(`public/licenses/EPL-1.0.txt is not the canonical EPL-1.0 text: ${licenseHash}`);
}

const normalizedNotice = publicNotice.replace(/\s+/g, ' ');
for (const marker of [
  'Eclipse Public License - v 1.0',
  '1. DEFINITIONS',
  '2. GRANT OF RIGHTS',
  '3. REQUIREMENTS',
  '4. COMMERCIAL DISTRIBUTION',
  '5. NO WARRANTY',
  '6. DISCLAIMER OF LIABILITY',
  '7. GENERAL',
  'This Agreement is governed by the laws of the State of New York',
]) {
  requireText(publicLicense, marker, 'public/licenses/EPL-1.0.txt');
}

for (const marker of [
  'Copyright (c) 2000, 2010 IBM Corporation and others.',
  'Eclipse Public License 1.0',
  'ManhattanConnectionRouter.java',
  'release_5.9.0',
  'e0ba88c6b3391e0d3c5839917474d1b6085adbe4',
  'src/canvas/manhattan-router.ts',
  'git clone https://github.com/ThomasRohde/archi-online.git',
  'offered by the Archi Online contributors alone',
  'ALL EPL CONTRIBUTORS DISCLAIM ALL WARRANTIES AND CONDITIONS',
  'NO EPL CONTRIBUTOR SHALL BE LIABLE',
  '/licenses/source/manhattan-router.ts.txt',
  'No external tag lookup is required',
]) {
  requireText(normalizedNotice, marker, 'public/licenses/Eclipse-Draw2D-NOTICE.txt');
}
if (/<[^>]+>/.test(publicNotice)) {
  throw new Error('Eclipse-Draw2D-NOTICE.txt contains an unresolved placeholder');
}

requireText(repositoryNotice, 'public/licenses/EPL-1.0.txt', 'THIRD_PARTY_NOTICES.md');
requireText(
  repositoryNotice,
  'public/licenses/Eclipse-Draw2D-NOTICE.txt',
  'THIRD_PARTY_NOTICES.md',
);
requireText(repositoryNotice, 'public/licenses/MIT.txt', 'THIRD_PARTY_NOTICES.md');
requireText(
  repositoryNotice,
  'public/licenses/source/manhattan-router.ts.txt',
  'THIRD_PARTY_NOTICES.md',
);
requireText(routerSource, 'Licensed under the Eclipse Public License 1.0', 'src/canvas/manhattan-router.ts');
requireText(routerSource, 'Copyright (c) 2000, 2010 IBM Corporation and others.', 'src/canvas/manhattan-router.ts');
requireText(
  routerSource,
  'Modifications copyright (c) 2026 Archi Online contributors.',
  'src/canvas/manhattan-router.ts',
);
requireText(projectLicense, 'MIT License', 'LICENSE');
if (packageJson.license !== 'MIT') {
  throw new Error(`package.json must continue to identify the project license as MIT, got ${packageJson.license}`);
}

console.log('Verified complete EPL-1.0 and Draw2D source notices in dist/licenses.');
