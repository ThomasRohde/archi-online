import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wikiDir = path.join(root, 'docs', 'wiki');
const markdownLinkPattern = /\[[^\]\n]+\]\(([^)\s]+(?:\s+"[^"]*")?)\)/g;
const wikiLinkPattern = /\[\[([^\]\n]+)\]\]/g;

function stripAnchor(target) {
  return target.split('#')[0];
}

function stripTitle(target) {
  return target.replace(/\s+"[^"]*"$/, '');
}

function isExternal(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target);
}

function wikiTargetToFile(target) {
  const page = stripAnchor(target.includes('|') ? target.split('|').at(-1) : target).trim();
  if (!page) return null;
  const fileName = page.endsWith('.md') ? page : `${page}.md`;
  return path.join(wikiDir, fileName);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const entries = await fs.readdir(wikiDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(wikiDir, entry.name))
    .sort();
  const required = ['Home.md', '_Sidebar.md'];
  const errors = [];

  for (const fileName of required) {
    const filePath = path.join(wikiDir, fileName);
    if (!(await exists(filePath))) errors.push(`Missing required wiki file: ${fileName}`);
  }

  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8');
    const rel = path.relative(root, filePath);

    for (const match of content.matchAll(wikiLinkPattern)) {
      const targetFile = wikiTargetToFile(match[1]);
      if (!targetFile || !(await exists(targetFile))) {
        errors.push(`${rel}: unresolved wiki link [[${match[1]}]]`);
      }
    }

    for (const match of content.matchAll(markdownLinkPattern)) {
      const rawTarget = stripTitle(match[1]);
      if (!rawTarget || rawTarget.startsWith('#') || isExternal(rawTarget)) continue;
      const targetPath = stripAnchor(decodeURIComponent(rawTarget));
      const resolved = path.resolve(path.dirname(filePath), targetPath);
      if (!(await exists(resolved))) {
        errors.push(`${rel}: unresolved markdown link ${rawTarget}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
    return;
  }

  console.log(`Checked ${files.length} wiki pages: all links resolved.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

