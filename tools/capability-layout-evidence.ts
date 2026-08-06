import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  evaluatePackedTreeLayout,
  layoutPackedTree,
  measurePackedLabel,
  wrapPackedText,
  type PackedLayoutMetrics,
  type PackedTreeLayout,
  type PackedTreeNode,
  type PackedTreeOptions,
} from '../src/model/layout/packed-tree';
import type { Bounds } from '../src/model/types';
import {
  CAPABILITY_LAYOUT_FRAMES,
  capabilityLayoutFixtures,
  type CapabilityLayoutFixture,
  type CapabilityLayoutFrame,
} from './capability-layout-fixtures';

type EvidenceRole = 'baseline' | 'improved';
type EvidenceVariant = 'balanced-rows' | 'frontier-repack' | 'frontier-preserve';

interface EvidenceCase {
  id: string;
  fixtureId: string;
  fixtureTitle: string;
  frame: CapabilityLayoutFrame;
  role: EvidenceRole;
  variant: EvidenceVariant;
  layoutHash: string;
  size: { width: number; height: number };
  hardViolations: string[];
  metrics: PackedLayoutMetrics;
  cumulativeDrift: number;
  medianMs: number;
  diagnostics: PackedTreeLayout['diagnostics'];
  /** Generated-only raw geometry permits both roles to use one metric revision. */
  layoutNodes: Record<string, Bounds>;
  previousBounds?: Readonly<Record<string, Bounds>>;
  initialBounds?: Readonly<Record<string, Bounds>>;
  svgPath?: string;
  pngPath?: string;
}

interface EvidenceManifest {
  schemaVersion: 2;
  role: EvidenceRole;
  generatedAt: string;
  metricEvaluator: string;
  environment: {
    node: string;
    platform: string;
    cpu: string;
    note: string;
  };
  frames: readonly CapabilityLayoutFrame[];
  cases: EvidenceCase[];
}

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDirectory = join(rootDirectory, '.capability-layout-evidence');
const roleArgument = process.argv.findIndex((value) => value === '--role');
const role = (roleArgument >= 0 ? process.argv[roleArgument + 1] : 'improved') as EvidenceRole;
if (role !== 'baseline' && role !== 'improved') {
  throw new Error('layout:evidence --role must be baseline or improved');
}

const roleDirectory = join(evidenceDirectory, role);
mkdirSync(roleDirectory, { recursive: true });
const fixtureArgument = process.argv.findIndex((value) => value === '--fixture');
const fixtureFilter = fixtureArgument >= 0 ? process.argv[fixtureArgument + 1] : undefined;

const frontierOptions = (frame: CapabilityLayoutFrame): PackedTreeOptions => ({
  mode: 'grid',
  gridAlgorithm: 'frontier',
  leafSizing: 'text-aware',
  sort: 'none',
  targetAspect: frame.width / frame.height,
  frontier: { maxCandidatesPerNode: 16, beamWidth: 20 },
  stability: { targetExtent: { width: frame.width, height: frame.height } },
});

const balancedOptions = (frame: CapabilityLayoutFrame): PackedTreeOptions => ({
  mode: 'grid',
  sort: 'none',
  targetAspect: frame.width / frame.height,
});

function nodeCount(nodes: readonly PackedTreeNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + nodeCount(node.children ?? []), 0);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function benchmark(
  roots: readonly PackedTreeNode[],
  options: PackedTreeOptions,
  previousBounds?: Readonly<Record<string, Bounds>>,
): { layout: PackedTreeLayout; medianMs: number } {
  layoutPackedTree(roots, options, previousBounds ? { previousBounds } : {});
  const timings: number[] = [];
  let layout: PackedTreeLayout | undefined;
  for (let repeat = 0; repeat < 5; repeat++) {
    const start = performance.now();
    layout = layoutPackedTree(roots, options, previousBounds ? { previousBounds } : {});
    timings.push(performance.now() - start);
  }
  return { layout: layout!, medianMs: median(timings) };
}

function preorder(roots: readonly PackedTreeNode[]): string[] {
  const ids: string[] = [];
  const visit = (node: PackedTreeNode) => {
    ids.push(node.id);
    for (const child of node.children ?? []) visit(child);
  };
  roots.forEach(visit);
  return ids;
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width &&
    a.y < b.y + b.height && b.y < a.y + a.height;
}

function validateLayout(
  roots: readonly PackedTreeNode[],
  layout: PackedTreeLayout,
  options: PackedTreeOptions,
): string[] {
  const errors: string[] = [];
  const ids = preorder(roots);
  const actual = Object.keys(layout.nodes);
  if (new Set(ids).size !== ids.length) errors.push('duplicate-input-id');
  if (actual.length !== ids.length || ids.some((id) => !layout.nodes[id])) {
    errors.push('missing-or-extra-node');
  }
  for (const id of actual) {
    const bounds = layout.nodes[id];
    if (!Object.values(bounds).every(Number.isFinite)) errors.push(`non-finite:${id}`);
    if (bounds.x < 0 || bounds.y < 0) errors.push(`negative-coordinate:${id}`);
    if (!(bounds.width > 0) || !(bounds.height > 0)) errors.push(`non-positive:${id}`);
  }
  const padding = options.padding ?? 12;
  const visit = (node: PackedTreeNode) => {
    const bounds = layout.nodes[node.id];
    const children = node.children ?? [];
    const childBounds = children.map((child) => layout.nodes[child.id]);
    for (let index = 0; index < children.length; index++) {
      const child = childBounds[index];
      if (child.x < padding || child.y < 0 ||
        child.x + child.width > bounds.width - padding ||
        child.y + child.height > bounds.height - padding) {
        errors.push(`containment:${node.id}:${children[index].id}`);
      }
    }
    for (let left = 0; left < children.length; left++) {
      for (let right = left + 1; right < children.length; right++) {
        if (overlaps(childBounds[left], childBounds[right])) {
          errors.push(`sibling-overlap:${children[left].id}:${children[right].id}`);
        }
      }
    }
    if (node.label && options.gridAlgorithm === 'frontier') {
      const titleHeight = children.length > 0
        ? Math.min(...childBounds.map((child) => child.y))
        : bounds.height;
      if (!measurePackedLabel(node.label, bounds.width, titleHeight).fits) {
        errors.push(`text-fit:${node.id}`);
      }
    }
    children.forEach(visit);
  };
  roots.forEach(visit);
  const rootBounds = roots.map((root) => layout.nodes[root.id]);
  for (let left = 0; left < roots.length; left++) {
    for (let right = left + 1; right < roots.length; right++) {
      if (overlaps(rootBounds[left], rootBounds[right])) {
        errors.push(`root-overlap:${roots[left].id}:${roots[right].id}`);
      }
    }
  }
  if (layout.semanticOrder && layout.semanticOrder.join('\u0000') !== ids.join('\u0000')) {
    errors.push('semantic-order');
  }
  const maximum = options.frontier?.maxCandidatesPerNode ?? 16;
  if ((layout.diagnostics?.maximumFrontierSize ?? 0) > maximum) {
    errors.push('frontier-bound');
  }
  return [...new Set(errors)].sort();
}

function layoutHash(layout: PackedTreeLayout): string {
  return createHash('sha256').update(JSON.stringify({
    nodes: layout.nodes,
    size: layout.size,
    semanticOrder: layout.semanticOrder,
    diagnostics: layout.diagnostics,
  })).digest('hex');
}

function cumulativeDrift(
  initial: Readonly<Record<string, Bounds>> | undefined,
  current: Readonly<Record<string, Bounds>>,
): number {
  if (!initial) return 0;
  let sum = 0;
  let count = 0;
  for (const [id, before] of Object.entries(initial)) {
    const after = current[id];
    if (!after) continue;
    const scale = Math.max(1, Math.hypot(before.width, before.height));
    sum += Math.hypot(
      after.x + after.width / 2 - before.x - before.width / 2,
      after.y + after.height / 2 - before.y - before.height / 2,
    ) / scale;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface AbsoluteNode {
  node: PackedTreeNode;
  bounds: Bounds;
  depth: number;
}

function absoluteNodes(
  roots: readonly PackedTreeNode[],
  layout: PackedTreeLayout,
): AbsoluteNode[] {
  const result: AbsoluteNode[] = [];
  const visit = (node: PackedTreeNode, parentX: number, parentY: number, depth: number) => {
    const relativeBounds = layout.nodes[node.id];
    const bounds = {
      x: parentX + relativeBounds.x,
      y: parentY + relativeBounds.y,
      width: relativeBounds.width,
      height: relativeBounds.height,
    };
    result.push({ node, bounds, depth });
    for (const child of node.children ?? []) visit(child, bounds.x, bounds.y, depth + 1);
  };
  roots.forEach((root) => visit(root, 0, 0, 0));
  return result;
}

function renderSvg(
  fixture: CapabilityLayoutFixture,
  frame: CapabilityLayoutFrame,
  layout: PackedTreeLayout,
): string {
  const canvasWidth = 1280;
  const canvasHeight = 820;
  const margin = 38;
  const header = 72;
  // Every algorithm for a frame uses the same scale. This keeps compactness,
  // overflow and frame fit visually comparable instead of normalising each
  // candidate to fill its panel independently.
  const scale = Math.min(
    (canvasWidth - 2 * margin) / frame.width,
    (canvasHeight - header - margin) / frame.height,
  );
  const xOffset = margin;
  const yOffset = header;
  const colors = ['#e1c46d', '#efd995', '#f5e8bd', '#fbf4df', '#fffaf0'];
  const nodes = absoluteNodes(fixture.roots, layout).map(({ node, bounds, depth }, index) => {
    const parent = Boolean(node.children?.length);
    const fontSize = parent ? Math.max(10, 15 - depth) : 12;
    const lineCount = parent ? 2 : Math.max(1, Math.floor((bounds.height - 10) / (fontSize * 1.2)));
    const lines = wrapPackedText(node.name ?? '', Math.max(fontSize, bounds.width - 14), fontSize)
      .slice(0, lineCount);
    const startY = parent
      ? bounds.y + fontSize + 5
      : bounds.y + bounds.height / 2 - (lines.length - 1) * fontSize * 0.6 + fontSize * 0.35;
    const text = lines.map((line, lineIndex) =>
      `<tspan x="${bounds.x + bounds.width / 2}" y="${startY + lineIndex * fontSize * 1.2}">${escapeXml(line)}</tspan>`).join('');
    return `<g><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" rx="3" fill="${colors[Math.min(depth, colors.length - 1)]}" stroke="#66552c" stroke-width="1.2"/><clipPath id="clip-${index}"><rect x="${bounds.x + 3}" y="${bounds.y + 3}" width="${Math.max(0, bounds.width - 6)}" height="${Math.max(0, bounds.height - 6)}"/></clipPath><text clip-path="url(#clip-${index})" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="${fontSize}" font-weight="${parent ? 650 : 400}" fill="#282313">${text}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}"><rect width="${canvasWidth}" height="${canvasHeight}" fill="#f2efe8"/><text x="38" y="34" font-family="Segoe UI, sans-serif" font-size="24" font-weight="700" fill="#29261f">${escapeXml(fixture.title)}</text><text x="38" y="57" font-family="Segoe UI, sans-serif" font-size="13" fill="#6d675d">${escapeXml(frame.id)} · ${nodeCount(fixture.roots)} capabilities · ${layout.size.width} × ${layout.size.height}</text><rect x="${xOffset}" y="${yOffset}" width="${frame.width * scale}" height="${frame.height * scale}" fill="#fffdf8" stroke="#9d8c68" stroke-dasharray="7 5"/><g transform="translate(${xOffset} ${yOffset}) scale(${scale})">${nodes}</g></svg>`;
}

function filePath(value: string): string {
  return value.replace(/\\/g, '/');
}

async function writeRender(
  fixture: CapabilityLayoutFixture,
  frame: CapabilityLayoutFrame,
  variant: EvidenceVariant,
  layout: PackedTreeLayout,
): Promise<{ svgPath: string; pngPath: string }> {
  const directory = join(roleDirectory, fixture.id, frame.id);
  mkdirSync(directory, { recursive: true });
  const svgPath = join(directory, `${variant}.svg`);
  const pngPath = join(directory, `${variant}.png`);
  const svg = renderSvg(fixture, frame, layout);
  writeFileSync(svgPath, svg, 'utf8');
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
  return {
    svgPath: filePath(relative(evidenceDirectory, svgPath)),
    pngPath: filePath(relative(evidenceDirectory, pngPath)),
  };
}

function metricsFor(
  roots: readonly PackedTreeNode[],
  layout: PackedTreeLayout,
  frame: CapabilityLayoutFrame,
  previousBounds?: Readonly<Record<string, Bounds>>,
): PackedLayoutMetrics {
  return evaluatePackedTreeLayout({
    roots,
    nodes: layout.nodes,
    size: layout.size,
    targetAspect: frame.width / frame.height,
    previousBounds,
  });
}

function caseId(fixtureId: string, frameId: string, variant: EvidenceVariant): string {
  return `${fixtureId}__${frameId}__${variant}`;
}

async function recordCase(input: {
  fixture: CapabilityLayoutFixture;
  frame: CapabilityLayoutFrame;
  variant: EvidenceVariant;
  options: PackedTreeOptions;
  previousBounds?: Readonly<Record<string, Bounds>>;
  initialBounds?: Readonly<Record<string, Bounds>>;
}): Promise<{ evidence: EvidenceCase; layout: PackedTreeLayout }> {
  const measured = benchmark(input.fixture.roots, input.options, input.previousBounds);
  const paths = input.fixture.render
    ? await writeRender(input.fixture, input.frame, input.variant, measured.layout)
    : {};
  return {
    layout: measured.layout,
    evidence: {
      id: caseId(input.fixture.id, input.frame.id, input.variant),
      fixtureId: input.fixture.id,
      fixtureTitle: input.fixture.title,
      frame: input.frame,
      role,
      variant: input.variant,
      layoutHash: layoutHash(measured.layout),
      size: measured.layout.size,
      hardViolations: validateLayout(input.fixture.roots, measured.layout, input.options),
      metrics: metricsFor(
        input.fixture.roots,
        measured.layout,
        input.frame,
        input.previousBounds,
      ),
      cumulativeDrift: cumulativeDrift(input.initialBounds, measured.layout.nodes),
      medianMs: measured.medianMs,
      diagnostics: measured.layout.diagnostics,
      layoutNodes: measured.layout.nodes,
      ...(input.previousBounds ? { previousBounds: input.previousBounds } : {}),
      ...(input.initialBounds ? { initialBounds: input.initialBounds } : {}),
      ...paths,
    },
  };
}

function readManifest(path: string): EvidenceManifest | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as EvidenceManifest;
  } catch {
    return undefined;
  }
}

function refreshManifestMetrics(
  manifest: EvidenceManifest,
  fixtures: readonly CapabilityLayoutFixture[],
): EvidenceManifest {
  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  for (const item of manifest.cases) {
    const fixture = byId.get(item.fixtureId);
    if (!fixture || !item.layoutNodes) continue;
    item.metrics = evaluatePackedTreeLayout({
      roots: fixture.roots,
      nodes: item.layoutNodes,
      size: item.size,
      targetAspect: item.frame.width / item.frame.height,
      previousBounds: item.previousBounds,
    });
    item.cumulativeDrift = cumulativeDrift(item.initialBounds, item.layoutNodes);
  }
  manifest.metricEvaluator = 'current-production-packed-metrics';
  return manifest;
}

function htmlEscape(value: string): string {
  return escapeXml(value).replace(/'/g, '&#39;');
}

function metricSummary(item: EvidenceCase): string {
  const metrics = item.metrics as PackedLayoutMetrics & Record<string, number>;
  const fields = [
    'aspectDeviation', 'raggedness', 'orphanPenalty', 'bandConsistency', 'whitespace',
    'alignmentComplexity', 'movement', 'neighborhoodChange', 'bandChange', 'regionChange',
  ];
  return fields.filter((field) => typeof metrics[field] === 'number').map((field) =>
    `<span><b>${htmlEscape(field)}</b> ${metrics[field].toFixed(4)}</span>`).join('');
}

async function writeBlindCard(
  before: EvidenceCase,
  after: EvidenceCase,
  panels: readonly EvidenceCase[],
  scenario: string,
): Promise<void> {
  const directory = join(evidenceDirectory, 'review-blind-cards');
  mkdirSync(directory, { recursive: true });
  const images = await Promise.all(panels.map((item) => sharp(
    join(evidenceDirectory, item.pngPath!),
  ).resize(620, 397, { fit: 'contain', background: '#f2efe8' }).png().toBuffer()));
  const heading = escapeXml(`${after.fixtureTitle} · ${after.frame.id} · ${scenario}`);
  const labels = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="470"><style>text{font-family:Segoe UI,sans-serif;fill:#29261f}.title{font-size:19px;font-weight:700}.option{font-size:16px;font-weight:700}</style><text class="title" x="20" y="28">${heading}</text><text class="option" x="20" y="58">Option A</text><text class="option" x="660" y="58">Option B</text></svg>`);
  await sharp({
    create: { width: 1280, height: 470, channels: 4, background: '#fffdf8' },
  }).composite([
    { input: images[0], left: 20, top: 68 },
    { input: images[1], left: 660, top: 68 },
    { input: labels, left: 0, top: 0 },
  ]).png().toFile(join(directory, `${after.id}.png`));
  void before;
}

async function writeReviewPages(
  baseline: EvidenceManifest,
  improved: EvidenceManifest,
): Promise<void> {
  const baselineById = new Map(baseline.cases.map((item) => [item.id, item]));
  const reviewCases = improved.cases.filter((item) =>
    (item.variant === 'frontier-repack' || item.variant === 'frontier-preserve') && item.pngPath);
  const scenario = (item: EvidenceCase) => item.variant === 'frontier-preserve'
    ? 'preserve update'
    : 'fresh composition';
  const blindCards: string[] = [];
  for (const after of reviewCases) {
    const before = baselineById.get(after.id);
    if (!before?.pngPath) continue;
    const baselineFirst = Number.parseInt(createHash('sha256').update(after.id).digest('hex').slice(0, 2), 16) % 2 === 0;
    const panels = baselineFirst ? [before, after] : [after, before];
    await writeBlindCard(before, after, panels, scenario(after));
    blindCards.push(`<section><h2>${htmlEscape(after.fixtureTitle)} · ${htmlEscape(after.frame.id)} · ${scenario(after)}</h2><div class="pair">${panels.map((item, index) => `<figure><figcaption>Option ${index === 0 ? 'A' : 'B'}</figcaption><img src="./${htmlEscape(item.pngPath!)}" alt="Concealed capability layout option ${index === 0 ? 'A' : 'B'}"></figure>`).join('')}</div><p class="tags">Judge: label legibility · hierarchy · row rhythm · orphan rows · alignment · whitespace · silhouette/frame fit · stability · visual calm · uncontrolled shape variation</p></section>`);
  }
  const blind = `<!doctype html><html><head><meta charset="utf-8"><title>Capability layout blind review</title><style>${reviewCss()}</style></head><body><header><p class="eyebrow">Concealed comparison</p><h1>Capability layout visual review</h1><p>Algorithm identities and scores are intentionally hidden. Choose A or B before opening the revealed comparison.</p></header>${blindCards.join('')}</body></html>`;
  writeFileSync(join(evidenceDirectory, 'review-blind.html'), blind, 'utf8');

  const revealedCards = reviewCases.flatMap((after) => {
    const before = baselineById.get(after.id);
    const comparison = improved.cases.find((item) => item.fixtureId === after.fixtureId &&
      item.frame.id === after.frame.id && item.variant === (after.variant === 'frontier-preserve'
        ? 'frontier-repack'
        : 'balanced-rows'));
    if (!before?.pngPath || !comparison?.pngPath) return [];
    const panels = after.variant === 'frontier-preserve'
      ? [
        { title: 'Starting frontier · preserve', item: before },
        { title: 'Improved frontier · preserve', item: after },
        { title: 'Improved frontier · fresh repack', item: comparison },
      ]
      : [
        { title: 'Starting frontier', item: before },
        { title: 'Improved frontier', item: after },
        { title: 'Balanced rows', item: comparison },
      ];
    return [`<section><h2>${htmlEscape(after.fixtureTitle)} · ${htmlEscape(after.frame.id)} · ${scenario(after)}</h2><div class="trio">${panels.map(({ title, item }) => `<figure><figcaption>${title}</figcaption><img src="./${htmlEscape(item.pngPath!)}" alt="${title}"><div class="metrics">${metricSummary(item)}<span><b>frontier max</b> ${item.diagnostics?.maximumFrontierSize ?? 1}</span><span><b>compositions</b> ${item.diagnostics?.candidateCompositionCount ?? 0}</span><span><b>median ms</b> ${item.medianMs.toFixed(2)}</span></div></figure>`).join('')}</div></section>`];
  }).join('');
  const revealed = `<!doctype html><html><head><meta charset="utf-8"><title>Capability layout comparison</title><style>${reviewCss()}</style></head><body><header><p class="eyebrow">Revealed evidence</p><h1>Capability layout before / after / baseline</h1><p>Open <a href="./review-blind.html">the concealed review</a> first.</p></header>${revealedCards}</body></html>`;
  writeFileSync(join(evidenceDirectory, 'comparison.html'), revealed, 'utf8');
}

function reviewCss(): string {
  return `:root{font-family:Inter,Segoe UI,sans-serif;color:#242019;background:#eeeae1}body{margin:0 auto;max-width:1800px;padding:42px}header,section{background:#fffdf8;border:1px solid #d8d0c2;border-radius:18px;padding:28px;margin-bottom:28px;box-shadow:0 12px 32px #66552c14}.eyebrow{text-transform:uppercase;letter-spacing:.16em;color:#7a6430;font-weight:700;font-size:12px}h1,h2{margin:.2em 0 .6em}.pair,.trio{display:grid;gap:20px}.pair{grid-template-columns:repeat(2,minmax(0,1fr))}.trio{grid-template-columns:repeat(3,minmax(0,1fr))}figure{margin:0}figcaption{font-weight:750;margin:0 0 10px}img{display:block;width:100%;border:1px solid #ddd3c1;border-radius:12px;background:#f4f0e8}.tags{color:#6d6558}.metrics{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.metrics span{font-size:11px;background:#f1ebde;padding:5px 8px;border-radius:999px}@media(max-width:1000px){.pair,.trio{grid-template-columns:1fr}body{padding:18px}}`;
}

const fixtures = capabilityLayoutFixtures().filter((fixture) =>
  !fixtureFilter || fixture.id === fixtureFilter);
if (fixtures.length === 0) throw new Error(`Unknown layout evidence fixture: ${fixtureFilter}`);
const cases: EvidenceCase[] = [];
const evolutionState = new Map<string, {
  previous: Readonly<Record<string, Bounds>>;
  initial: Readonly<Record<string, Bounds>>;
}>();

for (const fixture of fixtures) {
  const frames = fixture.render ? CAPABILITY_LAYOUT_FRAMES : [CAPABILITY_LAYOUT_FRAMES[0]];
  for (const frame of frames) {
    const balanced = await recordCase({
      fixture,
      frame,
      variant: 'balanced-rows',
      options: balancedOptions(frame),
    });
    cases.push(balanced.evidence);

    const repack = await recordCase({
      fixture,
      frame,
      variant: 'frontier-repack',
      options: { ...frontierOptions(frame), rootPlacement: 'repack' },
    });
    cases.push(repack.evidence);

    if (fixture.previousRoots) {
      const stateKey = frame.id;
      let previous: Readonly<Record<string, Bounds>>;
      let initial: Readonly<Record<string, Bounds>>;
      if (fixture.id.startsWith('evolution-') && evolutionState.has(stateKey)) {
        ({ previous, initial } = evolutionState.get(stateKey)!);
      } else {
        const previousLayout = layoutPackedTree(
          fixture.previousRoots,
          { ...frontierOptions(frame), rootPlacement: 'repack' },
        );
        previous = previousLayout.nodes;
        initial = previousLayout.nodes;
      }
      const preserve = await recordCase({
        fixture,
        frame,
        variant: 'frontier-preserve',
        options: { ...frontierOptions(frame), rootPlacement: 'preserve' },
        previousBounds: previous,
        initialBounds: initial,
      });
      cases.push(preserve.evidence);
      if (fixture.id.startsWith('evolution-')) {
        evolutionState.set(stateKey, { previous: preserve.layout.nodes, initial });
      }
    }
  }
}

const manifest: EvidenceManifest = {
  schemaVersion: 2,
  role,
  generatedAt: new Date().toISOString(),
  metricEvaluator: 'current-production-packed-metrics',
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cpu: cpus()[0]?.model ?? 'unknown',
    note: 'Timings are observational medians of five measured runs after one warm-up.',
  },
  frames: CAPABILITY_LAYOUT_FRAMES,
  cases,
};

const manifestPath = join(roleDirectory, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
const benchmarkPath = join(roleDirectory, 'benchmark.json');
writeFileSync(benchmarkPath, `${JSON.stringify({
  role,
  generatedAt: manifest.generatedAt,
  environment: manifest.environment,
  cases: cases.map((item) => ({
    id: item.id,
    fixtureId: item.fixtureId,
    frame: item.frame.id,
    variant: item.variant,
    totalNodes: nodeCount(fixtures.find((fixture) => fixture.id === item.fixtureId)!.roots),
    medianMs: item.medianMs,
    maximumFrontierSize: item.diagnostics?.maximumFrontierSize ?? 1,
    candidateCompositionCount: item.diagnostics?.candidateCompositionCount ?? 0,
  })),
}, null, 2)}\n`, 'utf8');

const baselinePath = join(evidenceDirectory, 'baseline', 'manifest.json');
const baseline = readManifest(baselinePath);
if (role === 'improved' && baseline) {
  refreshManifestMetrics(baseline, capabilityLayoutFixtures());
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  await writeReviewPages(baseline, manifest);
}

const violations = cases.flatMap((item) => item.hardViolations.map((violation) =>
  `${item.id}: ${violation}`));
console.log(JSON.stringify({
  role,
  manifestPath,
  benchmarkPath,
  caseCount: cases.length,
  renderCount: cases.filter((item) => item.pngPath).length,
  violationCount: violations.length,
  violations: violations.slice(0, 50),
}, null, 2));
if (violations.length > 0) process.exitCode = 1;
