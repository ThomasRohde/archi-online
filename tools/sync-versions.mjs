import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionsDir = path.join(root, 'extensions');

const checkOnly = process.argv.includes('--check');

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function extensionDirs() {
  const entries = await fs.readdir(extensionsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== 'dist')
    .map((entry) => entry.name)
    .sort();
}

const versionLinePattern = /(version:\s*['"])([^'"]*)(['"])/;

async function main() {
  const { version } = await readJson(path.join(root, 'package.json'));
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('Root package.json is missing a version');
  }

  const changed = [];
  const drifted = [];

  for (const name of await extensionDirs()) {
    const dir = path.join(extensionsDir, name);

    // manifest.json — the authoritative version (names the built archive).
    const manifestPath = path.join(dir, 'manifest.json');
    const manifest = await readJson(manifestPath);
    if (manifest.version !== version) {
      drifted.push(`extensions/${name}/manifest.json (${manifest.version})`);
      if (!checkOnly) {
        manifest.version = version;
        await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        changed.push(`extensions/${name}/manifest.json`);
      }
    }

    // main.js — cosmetic app.extension({ version }) field, kept in sync.
    const mainPath = path.join(dir, manifest.main ?? 'main.js');
    const source = await fs.readFile(mainPath, 'utf8');
    const match = source.match(versionLinePattern);
    if (match && match[2] !== version) {
      drifted.push(`extensions/${name}/${path.basename(mainPath)} (${match[2]})`);
      if (!checkOnly) {
        await fs.writeFile(mainPath, source.replace(versionLinePattern, `$1${version}$3`));
        changed.push(`extensions/${name}/${path.basename(mainPath)}`);
      }
    }
  }

  if (checkOnly) {
    if (drifted.length > 0) {
      console.error(`Extension versions out of sync with package.json (${version}):`);
      for (const entry of drifted) console.error(`  - ${entry}`);
      console.error('Run `npm run sync-versions` to fix.');
      process.exit(1);
    }
    console.log(`All extension versions match ${version}.`);
    return;
  }

  if (changed.length === 0) {
    console.log(`Extension versions already at ${version}.`);
    return;
  }
  console.log(`Synced ${changed.length} file(s) to ${version}:`);
  for (const entry of changed) console.log(`  - ${entry}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
