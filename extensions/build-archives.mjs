import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, basename, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = dirname(fileURLToPath(import.meta.url));
const outputDir = join(root, 'dist');
const packages = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'dist')
  .map((entry) => entry.name)
  .sort();

function archivePath(path) {
  return path.split(sep).join('/');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function collectFiles(dir) {
  const files = {};
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else {
        const rel = archivePath(relative(dir, path));
        if (rel.startsWith('.') || rel.includes('..')) {
          throw new Error(`Unsafe archive path: ${rel}`);
        }
        files[rel] = readFileSync(path);
      }
    }
  };
  visit(dir);
  return files;
}

mkdirSync(outputDir, { recursive: true });

for (const name of packages) {
  const dir = join(root, name);
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
    throw new Error(`${name} is missing manifest.json`);
  }
  const manifest = readJson(manifestPath);
  if (manifest.schemaVersion !== 2) throw new Error(`${name} must use schemaVersion 2`);
  if (!manifest.id || !manifest.name || !manifest.version || !manifest.main) {
    throw new Error(`${name} manifest is missing required fields`);
  }
  const mainPath = join(dir, manifest.main);
  if (!existsSync(mainPath) || !statSync(mainPath).isFile()) {
    throw new Error(`${name} is missing ${manifest.main}`);
  }

  const bytes = zipSync(collectFiles(dir), { level: 6 });
  const fileName = `${manifest.id.replace(/[^a-zA-Z0-9_.-]+/g, '-')}-${manifest.version}.archi-ext`;
  writeFileSync(join(outputDir, fileName), bytes);
  console.log(`${basename(dir)} -> extensions/dist/${fileName}`);
}
