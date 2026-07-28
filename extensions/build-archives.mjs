import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(root, '..');
const officialDownloads = [
  {
    folder: 'capability-map',
    id: 'archi-online.capability-map',
    fileName: 'capability-map.archi-ext',
  },
  {
    folder: 'elk-layout',
    id: 'archi-online.elk-layout',
    fileName: 'elk-layout.archi-ext',
  },
];

function optionValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a directory path`);
  }
  return resolve(process.cwd(), value);
}

const outputDir = optionValue('--output') ?? join(root, 'dist');
const docsOutputDir = optionValue('--docs-output');
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
    const entries = readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
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
const builtPackages = new Map();

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

  const bytes = zipSync(collectFiles(dir), {
    level: 6,
    mtime: new Date('1980-01-01T00:00:00.000Z'),
  });
  const fileName = `${manifest.id.replace(/[^a-zA-Z0-9_.-]+/g, '-')}-${manifest.version}.archi-ext`;
  writeFileSync(join(outputDir, fileName), bytes);
  builtPackages.set(name, { bytes, fileName, manifest });
  console.log(`${basename(dir)} -> ${relative(repositoryRoot, join(outputDir, fileName))}`);
}

if (docsOutputDir) {
  mkdirSync(docsOutputDir, { recursive: true });
  const catalog = [];
  const checksums = [];

  for (const official of officialDownloads) {
    const built = builtPackages.get(official.folder);
    if (!built) throw new Error(`Official extension folder is missing: ${official.folder}`);
    if (built.manifest.id !== official.id) {
      throw new Error(
        `${official.folder} must use official extension id ${official.id}, found ${built.manifest.id}`,
      );
    }

    const sha256 = createHash('sha256').update(built.bytes).digest('hex');
    writeFileSync(join(docsOutputDir, official.fileName), built.bytes);
    checksums.push(`${sha256}  ${official.fileName}`);
    catalog.push({
      id: built.manifest.id,
      name: built.manifest.name,
      version: built.manifest.version,
      description: built.manifest.description ?? '',
      download: official.fileName,
      sha256,
    });
    console.log(
      `${official.folder} -> ${relative(repositoryRoot, join(docsOutputDir, official.fileName))}`,
    );
  }

  writeFileSync(
    join(docsOutputDir, 'catalog.json'),
    `${JSON.stringify({ schemaVersion: 1, extensions: catalog }, null, 2)}\n`,
  );
  writeFileSync(join(docsOutputDir, 'checksums.txt'), `${checksums.join('\n')}\n`);
}
