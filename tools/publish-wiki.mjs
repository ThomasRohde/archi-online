import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'docs', 'wiki');
const defaultWikiDir = path.join(root, '.wiki-publish');

function help() {
  console.log(`Publish docs/wiki to a GitHub Wiki checkout.

Usage:
  node tools/publish-wiki.mjs [--wiki-dir PATH] [--remote URL] [--dry-run]

Options:
  --wiki-dir PATH  Existing or clone target wiki checkout. Defaults to .wiki-publish.
  --remote URL     GitHub wiki remote. Defaults to origin converted to .wiki.git.
  --dry-run        Print planned actions and changed files without committing or pushing.
  --help           Show this help.
`);
}

function parseArgs(argv) {
  const args = { dryRun: false, help: false, wikiDir: undefined, remote: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--wiki-dir') args.wikiDir = argv[++i];
    else if (arg === '--remote') args.remote = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function deriveWikiRemote(remote) {
  const trimmed = remote.trim();
  const https = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (https) return `https://github.com/${https[1]}/${https[2]}.wiki.git`;
  const ssh = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (ssh) return `git@github.com:${ssh[1]}/${ssh[2]}.wiki.git`;
  throw new Error(`Cannot derive GitHub wiki remote from origin: ${trimmed}`);
}

function originWikiRemote() {
  const origin = git(['remote', 'get-url', 'origin']);
  return deriveWikiRemote(origin);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function markdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();
}

async function ensureWikiCheckout(wikiDir, remote, dryRun) {
  const exists = await pathExists(wikiDir);
  if (exists) {
    const gitDir = path.join(wikiDir, '.git');
    if (!(await pathExists(gitDir))) {
      throw new Error(`Wiki directory is not a git checkout: ${wikiDir}`);
    }
    if (dryRun) {
      console.log(`Would pull existing wiki checkout: ${wikiDir}`);
    } else {
      git(['pull', '--ff-only'], { cwd: wikiDir, stdio: 'inherit' });
    }
    return;
  }

  if (dryRun) {
    if (!remote) {
      console.log(`Would use wiki checkout at ${wikiDir}`);
      console.log('A real publish requires this directory to exist or --remote to be provided.');
      return;
    }
    console.log(`Would clone ${remote} into ${wikiDir}`);
    return;
  }
  if (!remote) throw new Error('No wiki remote available. Pass --remote or --wiki-dir.');
  git(['clone', remote, wikiDir], { stdio: 'inherit' });
}

async function syncWikiFiles(wikiDir, dryRun) {
  const sourceFiles = await markdownFiles(sourceDir);
  const existingFiles = (await pathExists(wikiDir)) ? await markdownFiles(wikiDir) : [];
  const sourceSet = new Set(sourceFiles);

  for (const fileName of existingFiles) {
    if (!sourceSet.has(fileName)) {
      const target = path.join(wikiDir, fileName);
      if (dryRun) console.log(`Would remove stale wiki page: ${fileName}`);
      else await fs.rm(target);
    }
  }

  for (const fileName of sourceFiles) {
    const source = path.join(sourceDir, fileName);
    const target = path.join(wikiDir, fileName);
    if (dryRun) console.log(`Would copy ${path.relative(root, source)} -> ${target}`);
    else await fs.copyFile(source, target);
  }
}

function status(wikiDir) {
  return git(['status', '--short'], { cwd: wikiDir });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    help();
    return;
  }

  const wikiDir = path.resolve(root, args.wikiDir ?? defaultWikiDir);
  let remote = args.remote;
  if (!remote && !args.wikiDir) {
    try {
      remote = originWikiRemote();
    } catch (error) {
      if (!args.dryRun) throw error;
      console.log('No GitHub origin remote found yet; dry run will use the default wiki checkout path.');
    }
  }

  await ensureWikiCheckout(wikiDir, remote, args.dryRun);
  await syncWikiFiles(wikiDir, args.dryRun);

  if (args.dryRun) {
    console.log('Dry run complete. No files were changed.');
    return;
  }

  const changed = status(wikiDir);
  if (!changed) {
    console.log('Wiki already up to date.');
    return;
  }

  console.log(changed);
  git(['add', '--all'], { cwd: wikiDir, stdio: 'inherit' });
  git(['commit', '-m', 'Update Archi Online wiki'], { cwd: wikiDir, stdio: 'inherit' });
  git(['push'], { cwd: wikiDir, stdio: 'inherit' });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
