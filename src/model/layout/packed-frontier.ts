import type { Bounds } from '../types';
import { compareStableText } from '../stable-order';
import {
  measurePackedMetrics,
  scorePackedMetrics,
  type PackedLayoutMetrics,
  type ResolvedPackedAestheticWeights,
} from './packed-metrics';
import {
  createPackedLeafShapes,
  measurePackedLabel,
  minimumPackedLabelWidth,
  type PackedLabelSpec,
} from './packed-text';
import type {
  PackedAestheticWeights,
  PackedTreeLayout,
  PackedTreeNode,
  PackedTreeOptions,
} from './packed-tree';

export type PackedGridAlgorithm = 'balanced-rows' | 'frontier';
export type PackedLeafSizing = 'fixed' | 'text-aware';
export type PackedRootPlacement = 'preserve' | 'repack';

export interface PackedFrontierOptions {
  maxCandidatesPerNode?: number;
  beamWidth?: number;
  epsilon?: number;
  aspectBuckets?: readonly number[];
  largeSiblingThreshold?: number;
}

export interface PackedStabilityOptions {
  /** Required aesthetic improvement before switching away from a low-movement form. */
  switchThreshold?: number;
  /** Optional extent used by the overflow quality term. */
  targetExtent?: { width: number; height: number };
}

export interface PackedLayoutContext {
  /** Parent-relative bounds of surviving nodes. */
  previousBounds?: Readonly<Record<string, Bounds>>;
}

export interface PackedFrontierDiagnostics {
  engine: 'GCHRP-2';
  frontierNodeCount: number;
  totalFrontierCandidates: number;
  averageFrontierSize: number;
  maximumFrontierSize: number;
  candidateCompositionCount: number;
  reducedGrammarNodeCount: number;
  selectedMetrics: PackedLayoutMetrics;
  selectedScore: number;
  selectedGrammar: string;
  selectedGrammarCounts: Readonly<Record<string, number>>;
  selectedNodeGrammars: Readonly<Record<string, string>>;
  grammarCandidateCounts: Readonly<Record<string, number>>;
}

interface ResolvedFrontierOptions {
  leafWidth: number;
  leafHeight: number;
  padding: number;
  gutter: number;
  titleBandHeight: number;
  targetAspect: number;
  sort: 'name' | 'weight' | 'none';
  leafSizing: PackedLeafSizing;
  rootPlacement: PackedRootPlacement;
  weights: ResolvedPackedAestheticWeights;
  maxCandidates: number;
  beamWidth: number;
  epsilon: number;
  aspectBuckets: readonly number[];
  largeSiblingThreshold: number;
  switchThreshold: number;
  targetExtent?: { width: number; height: number };
}

interface FrontierNode {
  input: PackedTreeNode;
  children: FrontierNode[];
  candidates: ShapeCandidate[];
}

interface CandidatePlacement {
  child: FrontierNode;
  candidate: ShapeCandidate;
  bounds: Bounds;
}

interface ShapeCandidate {
  width: number;
  height: number;
  placements: readonly CandidatePlacement[];
  metrics: PackedLayoutMetrics;
  score: number;
  signature: string;
  grammar: string;
}

interface BlockPlacement {
  child: FrontierNode;
  candidate: ShapeCandidate;
  bounds: Bounds;
}

interface BlockCandidate {
  width: number;
  height: number;
  placements: readonly BlockPlacement[];
  raggedness: number;
  orphanPenalty: number;
  grammar: string;
  signature: string;
}

interface SearchStats {
  frontierNodeCount: number;
  totalFrontierCandidates: number;
  maximumFrontierSize: number;
  candidateCompositionCount: number;
  reducedGrammarNodeCount: number;
  grammarCandidateCounts: Record<string, number>;
}

function finite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, finite(value, fallback)));
}

function resolveWeights(weights: PackedAestheticWeights | undefined): ResolvedPackedAestheticWeights {
  return {
    aspect: clamp(weights?.aspect, 1, 0, 100),
    raggedness: clamp(weights?.raggedness, 0.8, 0, 100),
    whitespace: clamp(weights?.whitespace, 0.2, 0, 100),
    orphan: clamp(weights?.orphan, 1.2, 0, 100),
    alignment: clamp(weights?.alignment, 0.6, 0, 100),
    movement: clamp(weights?.movement, 1.5, 0, 100),
    neighborhood: clamp(weights?.neighborhood, 0.8, 0, 100),
    overflow: clamp(weights?.overflow, 0.4, 0, 100),
  };
}

function resolveOptions(options: PackedTreeOptions): ResolvedFrontierOptions {
  const buckets = options.frontier?.aspectBuckets?.filter((value) =>
    Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  return {
    leafWidth: clamp(options.leafWidth, 120, 10, 2000),
    leafHeight: clamp(options.leafHeight, 55, 10, 2000),
    padding: clamp(options.padding, 12, 0, 200),
    gutter: clamp(options.gutter, 12, 0, 200),
    titleBandHeight: clamp(options.titleBandHeight, 30, 0, 200),
    targetAspect: clamp(options.targetAspect, 1.6, 0.2, 8),
    sort: options.sort === 'weight' || options.sort === 'none' ? options.sort : 'name',
    leafSizing: options.leafSizing === 'text-aware' ? 'text-aware' : 'fixed',
    rootPlacement: options.rootPlacement === 'preserve' ? 'preserve' : 'repack',
    weights: resolveWeights(options.aesthetics),
    maxCandidates: Math.floor(clamp(options.frontier?.maxCandidatesPerNode, 16, 4, 64)),
    beamWidth: Math.floor(clamp(options.frontier?.beamWidth, 20, 4, 64)),
    epsilon: clamp(options.frontier?.epsilon, 0.02, 0, 0.25),
    aspectBuckets: buckets?.length ? buckets : [0.65, 1, 1.6, 2.5],
    largeSiblingThreshold: Math.floor(clamp(
      options.frontier?.largeSiblingThreshold,
      14,
      8,
      200,
    )),
    switchThreshold: clamp(options.stability?.switchThreshold, 0.07, 0, 0.5),
    targetExtent: options.stability?.targetExtent,
  };
}

function hashSignature(parts: readonly string[]): string {
  let hash = 2166136261;
  for (const part of parts) {
    for (let index = 0; index < part.length; index++) {
      hash ^= part.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(36);
}

function sortNodes(nodes: FrontierNode[], opts: ResolvedFrontierOptions): FrontierNode[] {
  if (opts.sort === 'none') return nodes;
  return [...nodes].sort((a, b) => {
    if (opts.sort === 'weight') {
      const weightA = finite(a.input.weight, 1);
      const weightB = finite(b.input.weight, 1);
      if (weightA !== weightB) return weightB - weightA;
    }
    return compareStableText(a.input.name ?? '', b.input.name ?? '') ||
      compareStableText(a.input.id, b.input.id);
  });
}

function defaultLabel(node: PackedTreeNode, isParent: boolean): PackedLabelSpec {
  return node.label ?? {
    text: node.name ?? '',
    fontSizePx: 12,
    lineHeightPx: 15,
    maxLines: isParent ? 2 : 3,
    horizontalPadding: 8,
    verticalPadding: 6,
  };
}

function candidateMetricValues(metrics: PackedLayoutMetrics): number[] {
  return [
    metrics.area,
    metrics.aspectDeviation,
    metrics.raggedness,
    metrics.whitespace,
    metrics.orphanPenalty,
    metrics.alignmentComplexity,
    metrics.movement,
    metrics.neighborhoodChange,
    metrics.viewportOverflow,
  ];
}

function dominates(a: ShapeCandidate, b: ShapeCandidate, epsilon: number): boolean {
  const left = candidateMetricValues(a.metrics);
  const right = candidateMetricValues(b.metrics);
  let strictlyBetter = false;
  for (let index = 0; index < left.length; index++) {
    const tolerance = Math.max(epsilon, Math.abs(right[index]) * epsilon);
    if (left[index] > right[index] + tolerance) return false;
    if (left[index] < right[index] - tolerance) strictlyBetter = true;
  }
  return strictlyBetter;
}

function candidateCompare(a: ShapeCandidate, b: ShapeCandidate): number {
  return a.score - b.score ||
    a.metrics.area - b.metrics.area ||
    compareStableText(a.signature, b.signature);
}

function bucketIndex(aspect: number, buckets: readonly number[]): number {
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < buckets.length; index++) {
    const next = Math.abs(Math.log(aspect / buckets[index]));
    if (next < distance) {
      distance = next;
      best = index;
    }
  }
  return best;
}

function pruneCandidates(
  candidates: readonly ShapeCandidate[],
  opts: ResolvedFrontierOptions,
): ShapeCandidate[] {
  const bySignature = new Map<string, ShapeCandidate>();
  for (const candidate of candidates) {
    const current = bySignature.get(candidate.signature);
    if (!current || candidateCompare(candidate, current) < 0) {
      bySignature.set(candidate.signature, candidate);
    }
  }
  const unique = [...bySignature.values()];
  const pareto = unique.filter((candidate, index) =>
    !unique.some((other, otherIndex) =>
      index !== otherIndex && dominates(other, candidate, opts.epsilon)));
  const retained = new Map<string, ShapeCandidate>();
  const retain = (candidate: ShapeCandidate | undefined) => {
    if (candidate) retained.set(candidate.signature, candidate);
  };
  for (let index = 0; index < opts.aspectBuckets.length; index++) {
    retain(pareto.filter((candidate) =>
      bucketIndex(candidate.width / candidate.height, opts.aspectBuckets) === index)
      .sort(candidateCompare)[0]);
  }
  retain([...pareto].sort((a, b) => a.metrics.area - b.metrics.area || candidateCompare(a, b))[0]);
  retain([...pareto].sort((a, b) =>
    a.metrics.raggedness - b.metrics.raggedness || candidateCompare(a, b))[0]);
  retain([...pareto].sort((a, b) =>
    a.metrics.movement - b.metrics.movement || candidateCompare(a, b))[0]);
  for (const candidate of [...pareto].sort(candidateCompare)) retain(candidate);
  return [...retained.values()].sort(candidateCompare).slice(0, opts.maxCandidates);
}

function choiceSets(children: readonly FrontierNode[], opts: ResolvedFrontierOptions): ShapeCandidate[][] {
  const preferences = [...opts.aspectBuckets, opts.targetAspect];
  const sets: ShapeCandidate[][] = [];
  for (const preference of preferences) {
    sets.push(children.map((child) => [...child.candidates].sort((a, b) =>
      Math.abs(Math.log((a.width / a.height) / preference)) -
        Math.abs(Math.log((b.width / b.height) / preference)) || candidateCompare(a, b))[0]));
  }
  sets.push(children.map((child) => [...child.candidates].sort((a, b) =>
    a.metrics.area - b.metrics.area || candidateCompare(a, b))[0]));
  sets.push(children.map((child) => [...child.candidates].sort((a, b) =>
    a.metrics.movement - b.metrics.movement || candidateCompare(a, b))[0]));
  const seen = new Set<string>();
  return sets.filter((set) => {
    const key = set.map((candidate) => candidate.signature).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sampleCounts(total: number, large: boolean): number[] {
  if (!large && total <= 20) return Array.from({ length: total }, (_, index) => index + 1);
  const center = Math.max(1, Math.round(Math.sqrt(total)));
  const values = new Set<number>([1, 2, 3, center - 2, center - 1, center, center + 1,
    center + 2, Math.round(total / 3), Math.round(total / 2), total]);
  return [...values].filter((value) => value >= 1 && value <= total).sort((a, b) => a - b);
}

function balancedRanges(total: number, preferredCount: number): Array<[number, number]> {
  const bandCount = Math.ceil(total / preferredCount);
  const small = Math.floor(total / bandCount);
  const largeBands = total % bandCount;
  const ranges: Array<[number, number]> = [];
  let start = 0;
  for (let band = 0; band < bandCount; band++) {
    const count = small + (band < largeBands ? 1 : 0);
    ranges.push([start, start + count]);
    start += count;
  }
  return ranges;
}

function shelfBlock(
  children: readonly FrontierNode[],
  choices: readonly ShapeCandidate[],
  preferredCount: number,
  gutter: number,
  vertical: boolean,
): BlockCandidate {
  const ranges = balancedRanges(children.length, preferredCount);
  const placements: BlockPlacement[] = [];
  let major = 0;
  let outerMinor = 0;
  const bandEnds: number[] = [];
  for (const [start, end] of ranges) {
    let minor = 0;
    let bandMajor = 0;
    for (let index = start; index < end; index++) {
      const candidate = choices[index];
      const bounds = vertical
        ? { x: major, y: minor, width: candidate.width, height: candidate.height }
        : { x: minor, y: major, width: candidate.width, height: candidate.height };
      placements.push({ child: children[index], candidate, bounds });
      minor += (vertical ? candidate.height : candidate.width) + gutter;
      bandMajor = Math.max(bandMajor, vertical ? candidate.width : candidate.height);
    }
    minor = Math.max(0, minor - gutter);
    bandEnds.push(minor);
    outerMinor = Math.max(outerMinor, minor);
    major += bandMajor + gutter;
  }
  major = Math.max(0, major - gutter);
  // Deterministic polish: balance residual band space across both outer
  // margins without stretching children or changing semantic order.
  ranges.forEach(([start, end], bandIndex) => {
    const offset = Math.floor((outerMinor - bandEnds[bandIndex]) / 2);
    for (let index = start; index < end; index++) {
      const placement = placements[index];
      placement.bounds = vertical
        ? { ...placement.bounds, y: placement.bounds.y + offset }
        : { ...placement.bounds, x: placement.bounds.x + offset };
    }
  });
  const width = vertical ? major : outerMinor;
  const height = vertical ? outerMinor : major;
  const raggedness = bandEnds.reduce((sum, end) =>
    sum + ((outerMinor - end) / Math.max(1, outerMinor)) ** 2, 0) / ranges.length;
  const orphanPenalty = ranges.length > 1 && ranges.at(-1)![1] - ranges.at(-1)![0] === 1
    ? 1
    : 0;
  const grammar = vertical ? 'ordered-columns' : 'ordered-shelves';
  return {
    width,
    height,
    placements,
    raggedness,
    orphanPenalty,
    grammar,
    signature: hashSignature([
      grammar,
      String(preferredCount),
      ...choices.map((candidate) => candidate.signature),
    ]),
  };
}

function blockCompare(a: BlockCandidate, b: BlockCandidate, targetAspect: number): number {
  const score = (block: BlockCandidate) =>
    Math.abs(Math.log((block.width / Math.max(1, block.height)) / targetAspect)) +
    block.raggedness + block.orphanPenalty + block.width * block.height * 1e-9;
  return score(a) - score(b) || compareStableText(a.signature, b.signature);
}

function pruneBlocks(
  blocks: readonly BlockCandidate[],
  beamWidth: number,
  targetAspect: number,
  buckets: readonly number[],
): BlockCandidate[] {
  const bySignature = new Map(blocks.map((block) => [block.signature, block]));
  const unique = [...bySignature.values()];
  const retained = new Map<string, BlockCandidate>();
  for (let index = 0; index < buckets.length; index++) {
    const bucket = unique.filter((block) =>
      bucketIndex(block.width / Math.max(1, block.height), buckets) === index)
      .sort((a, b) => blockCompare(a, b, targetAspect))[0];
    if (bucket) retained.set(bucket.signature, bucket);
  }
  for (const block of [...unique].sort((a, b) => blockCompare(a, b, targetAspect))) {
    retained.set(block.signature, block);
  }
  return [...retained.values()].sort((a, b) => blockCompare(a, b, targetAspect))
    .slice(0, beamWidth);
}

function combineBlocks(
  left: BlockCandidate,
  right: BlockCandidate,
  gutter: number,
  horizontal: boolean,
): BlockCandidate {
  const dx = horizontal ? left.width + gutter : 0;
  const dy = horizontal ? 0 : left.height + gutter;
  const placements = [
    ...left.placements,
    ...right.placements.map((placement) => ({
      ...placement,
      bounds: { ...placement.bounds, x: placement.bounds.x + dx, y: placement.bounds.y + dy },
    })),
  ];
  const width = horizontal ? left.width + gutter + right.width : Math.max(left.width, right.width);
  const height = horizontal ? Math.max(left.height, right.height) : left.height + gutter + right.height;
  const grammar = horizontal ? 'ordered-guillotine-horizontal' : 'ordered-guillotine-vertical';
  return {
    width,
    height,
    placements,
    raggedness: (left.raggedness + right.raggedness) / 2 +
      (horizontal
        ? Math.abs(left.height - right.height) / Math.max(1, height)
        : Math.abs(left.width - right.width) / Math.max(1, width)) * 0.25,
    orphanPenalty: (left.orphanPenalty + right.orphanPenalty) / 2,
    grammar,
    signature: hashSignature([grammar, left.signature, right.signature]),
  };
}

function guillotineBlocks(
  children: readonly FrontierNode[],
  opts: ResolvedFrontierOptions,
): BlockCandidate[] {
  const count = children.length;
  if (count < 2 || count > Math.min(12, opts.largeSiblingThreshold)) return [];
  const memo = new Map<string, BlockCandidate[]>();
  const interval = (start: number, end: number): BlockCandidate[] => {
    const key = `${start}:${end}`;
    const cached = memo.get(key);
    if (cached) return cached;
    if (end - start === 1) {
      const child = children[start];
      const blocks = child.candidates.slice(0, Math.min(4, opts.beamWidth)).map((candidate) => ({
        width: candidate.width,
        height: candidate.height,
        placements: [{ child, candidate, bounds: {
          x: 0, y: 0, width: candidate.width, height: candidate.height,
        } }],
        raggedness: 0,
        orphanPenalty: 0,
        grammar: 'item',
        signature: hashSignature(['item', child.input.id, candidate.signature]),
      }));
      memo.set(key, blocks);
      return blocks;
    }
    const blocks: BlockCandidate[] = [];
    for (let split = start + 1; split < end; split++) {
      const left = interval(start, split);
      const right = interval(split, end);
      for (const a of left.slice(0, Math.min(8, opts.beamWidth))) {
        for (const b of right.slice(0, Math.min(8, opts.beamWidth))) {
          blocks.push(combineBlocks(a, b, opts.gutter, true));
          blocks.push(combineBlocks(a, b, opts.gutter, false));
        }
      }
    }
    const pruned = pruneBlocks(blocks, Math.min(opts.beamWidth, 12), opts.targetAspect,
      opts.aspectBuckets);
    memo.set(key, pruned);
    return pruned;
  };
  return interval(0, count);
}

function dominantBlocks(
  children: readonly FrontierNode[],
  choices: readonly ShapeCandidate[],
  opts: ResolvedFrontierOptions,
): BlockCandidate[] {
  if (children.length < 3) return [];
  const areas = choices.map((candidate) => candidate.width * candidate.height);
  const average = areas.reduce((sum, area) => sum + area, 0) / areas.length;
  const dominantIndex = areas.findIndex((area) => area >= average * 1.8);
  if (dominantIndex !== 0 && dominantIndex !== children.length - 1) return [];
  const stripStart = dominantIndex === 0 ? 1 : 0;
  const stripEnd = dominantIndex === 0 ? children.length : children.length - 1;
  const stripChildren = children.slice(stripStart, stripEnd);
  const stripChoices = choices.slice(stripStart, stripEnd);
  const dominant = choices[dominantIndex];
  const stripCandidates = [
    shelfBlock(stripChildren, stripChoices, stripChildren.length, opts.gutter, false),
    shelfBlock(stripChildren, stripChoices, stripChildren.length, opts.gutter, true),
  ];
  return stripCandidates.flatMap((strip) => {
    const dominantBlock: BlockCandidate = {
      width: dominant.width,
      height: dominant.height,
      placements: [{ child: children[dominantIndex], candidate: dominant, bounds: {
        x: 0, y: 0, width: dominant.width, height: dominant.height,
      } }],
      raggedness: 0,
      orphanPenalty: 0,
      grammar: 'dominant',
      signature: dominant.signature,
    };
    const first = dominantIndex === 0 ? dominantBlock : strip;
    const second = dominantIndex === 0 ? strip : dominantBlock;
    return [true, false].map((horizontal) => ({
      ...combineBlocks(first, second, opts.gutter, horizontal),
      grammar: horizontal ? 'dominant-block-horizontal-strip' : 'dominant-block-vertical-strip',
    }));
  });
}

function titleGeometry(
  node: PackedTreeNode,
  baseWidth: number,
  opts: ResolvedFrontierOptions,
): { width: number; height: number } {
  const label = defaultLabel(node, true);
  const width = Math.max(baseWidth, minimumPackedLabelWidth(label, label.maxLines ?? 2));
  const measured = measurePackedLabel(label, width, Number.MAX_SAFE_INTEGER);
  return { width: Math.ceil(width), height: Math.max(opts.titleBandHeight, measured.requiredHeight) };
}

function shapeFromBlock(
  node: PackedTreeNode,
  block: BlockCandidate,
  opts: ResolvedFrontierOptions,
  virtual: boolean,
): ShapeCandidate {
  const baseWidth = virtual ? block.width : block.width + 2 * opts.padding;
  const title = virtual
    ? { width: baseWidth, height: 0 }
    : titleGeometry(node, baseWidth, opts);
  const width = Math.ceil(Math.max(baseWidth, title.width));
  const height = Math.ceil(block.height + title.height + (virtual ? 0 : opts.padding));
  const xOffset = Math.floor((width - block.width) / 2);
  const yOffset = title.height;
  const placements = block.placements.map((placement) => ({
    ...placement,
    bounds: {
      x: placement.bounds.x + xOffset,
      y: placement.bounds.y + yOffset,
      width: placement.bounds.width,
      height: placement.bounds.height,
    },
  }));
  const ownMetrics = measurePackedMetrics({
    width,
    height,
    targetAspect: opts.targetAspect,
    placements: placements.map((placement) => ({
      id: placement.child.input.id,
      bounds: placement.bounds,
    })),
    contentArea: placements.reduce((sum, placement) =>
      sum + placement.bounds.width * placement.bounds.height, 0),
    raggedness: block.raggedness,
    orphanPenalty: block.orphanPenalty,
    previousBounds: undefined,
    targetExtent: virtual ? opts.targetExtent : undefined,
  });
  const metrics = aggregateChildMetrics(ownMetrics, placements);
  return {
    width,
    height,
    placements,
    metrics,
    score: scorePackedMetrics(metrics, opts.weights),
    signature: hashSignature([node.id, block.grammar, String(width), String(height), block.signature]),
    grammar: block.grammar,
  };
}

function aggregateChildMetrics(
  own: PackedLayoutMetrics,
  placements: readonly CandidatePlacement[],
): PackedLayoutMetrics {
  if (placements.length === 0) return own;
  const average = (key: Exclude<keyof PackedLayoutMetrics, 'area'>) =>
    placements.reduce((sum, placement) => sum + placement.candidate.metrics[key], 0) /
    placements.length;
  return {
    ...own,
    aspectDeviation: own.aspectDeviation * 0.75 + average('aspectDeviation') * 0.25,
    raggedness: (own.raggedness + average('raggedness')) / 2,
    whitespace: (own.whitespace + average('whitespace')) / 2,
    orphanPenalty: (own.orphanPenalty + average('orphanPenalty')) / 2,
    alignmentComplexity: (own.alignmentComplexity + average('alignmentComplexity')) / 2,
    movement: (own.movement + average('movement')) / 2,
    neighborhoodChange: (own.neighborhoodChange + average('neighborhoodChange')) / 2,
    viewportOverflow: (own.viewportOverflow + average('viewportOverflow')) / 2,
  };
}

function withStabilityMetrics(
  candidate: ShapeCandidate,
  context: PackedLayoutContext,
  opts: ResolvedFrontierOptions,
): ShapeCandidate {
  if (!context.previousBounds || candidate.placements.length === 0) return candidate;
  const ownMetrics = measurePackedMetrics({
    width: candidate.width,
    height: candidate.height,
    targetAspect: opts.targetAspect,
    placements: candidate.placements.map((placement) => ({
      id: placement.child.input.id,
      bounds: placement.bounds,
    })),
    contentArea: candidate.placements.reduce((sum, placement) =>
      sum + placement.bounds.width * placement.bounds.height, 0),
    raggedness: candidate.metrics.raggedness,
    orphanPenalty: candidate.metrics.orphanPenalty,
    previousBounds: context.previousBounds,
    targetExtent: opts.targetExtent,
  });
  const metrics = aggregateChildMetrics(ownMetrics, candidate.placements);
  return { ...candidate, metrics, score: scorePackedMetrics(metrics, opts.weights) };
}

function composeNode(
  node: PackedTreeNode,
  children: readonly FrontierNode[],
  opts: ResolvedFrontierOptions,
  context: PackedLayoutContext,
  stats: SearchStats,
  virtual = false,
): ShapeCandidate[] {
  const blocks: BlockCandidate[] = [];
  const large = children.length > opts.largeSiblingThreshold;
  if (large) stats.reducedGrammarNodeCount++;
  const allChoices = choiceSets(children, opts);
  const boundedChoices = large
    ? [...allChoices.slice(0, 4), allChoices.at(-1)!].filter((choices, index, values) =>
      values.findIndex((other) => other.map((candidate) => candidate.signature).join('|') ===
        choices.map((candidate) => candidate.signature).join('|')) === index)
    : allChoices;
  for (const choices of boundedChoices) {
    for (const count of sampleCounts(children.length, large)) {
      blocks.push(shelfBlock(children, choices, count, opts.gutter, false));
      blocks.push(shelfBlock(children, choices, count, opts.gutter, true));
    }
    blocks.push(...dominantBlocks(children, choices, opts));
  }
  if (!large) blocks.push(...guillotineBlocks(children, opts));
  stats.candidateCompositionCount += blocks.length;
  const candidates = blocks.map((block) => {
    stats.grammarCandidateCounts[block.grammar] =
      (stats.grammarCandidateCounts[block.grammar] ?? 0) + 1;
    return withStabilityMetrics(shapeFromBlock(node, block, opts, virtual), context, opts);
  });
  return pruneCandidates(candidates, opts);
}

function buildFrontier(
  input: PackedTreeNode,
  opts: ResolvedFrontierOptions,
  context: PackedLayoutContext,
  stats: SearchStats,
): FrontierNode {
  const rawChildren = (input.children ?? []).map((child) =>
    buildFrontier(child, opts, context, stats));
  const children = sortNodes(rawChildren, opts);
  let candidates: ShapeCandidate[];
  if (children.length === 0) {
    const shapes = opts.leafSizing === 'text-aware'
      ? createPackedLeafShapes(defaultLabel(input, false), opts.leafWidth, opts.leafHeight)
      : [{
        width: opts.leafWidth,
        height: opts.leafHeight,
        kind: 'fixed' as const,
        text: measurePackedLabel(defaultLabel(input, false), opts.leafWidth, opts.leafHeight),
      }];
    candidates = shapes.map((shape) => {
      const metrics = measurePackedMetrics({
        width: shape.width,
        height: shape.height,
        targetAspect: opts.targetAspect,
        placements: [],
        contentArea: shape.width * shape.height,
      });
      return {
        width: shape.width,
        height: shape.height,
        placements: [],
        metrics,
        score: scorePackedMetrics(metrics, opts.weights),
        signature: hashSignature(['leaf', input.id, shape.kind, String(shape.width), String(shape.height)]),
        grammar: `leaf-${shape.kind}`,
      };
    });
  } else {
    candidates = composeNode(input, children, opts, context, stats);
  }
  stats.frontierNodeCount++;
  stats.totalFrontierCandidates += candidates.length;
  stats.maximumFrontierSize = Math.max(stats.maximumFrontierSize, candidates.length);
  return { input, children, candidates };
}

function aestheticScore(metrics: PackedLayoutMetrics, opts: ResolvedFrontierOptions): number {
  return scorePackedMetrics(metrics, { ...opts.weights, movement: 0, neighborhood: 0 });
}

function selectCandidate(
  candidates: readonly ShapeCandidate[],
  opts: ResolvedFrontierOptions,
  previousSelf?: Bounds,
): ShapeCandidate {
  const rootMovement = (candidate: ShapeCandidate) => previousSelf
    ? (Math.abs(candidate.width - previousSelf.width) +
      Math.abs(candidate.height - previousSelf.height)) /
      Math.max(1, previousSelf.width + previousSelf.height)
    : 0;
  const scored = [...candidates].sort((a, b) =>
    a.score + opts.weights.movement * rootMovement(a) -
      (b.score + opts.weights.movement * rootMovement(b)) || candidateCompare(a, b));
  const best = scored[0];
  if (!previousSelf) return best;
  const stable = [...candidates].sort((a, b) =>
    a.metrics.movement + a.metrics.neighborhoodChange + rootMovement(a) -
      (b.metrics.movement + b.metrics.neighborhoodChange + rootMovement(b)) ||
      candidateCompare(a, b))[0];
  if (stable === best) return best;
  const stableAesthetic = aestheticScore(stable.metrics, opts);
  const bestAesthetic = aestheticScore(best.metrics, opts);
  const improvement = (stableAesthetic - bestAesthetic) / Math.max(0.0001, stableAesthetic);
  return improvement >= opts.switchThreshold ? best : stable;
}

function flattenCandidate(
  candidate: ShapeCandidate,
  out: Record<string, Bounds>,
  semanticOrder: string[],
  selectedGrammars: Record<string, number>,
  selectedNodeGrammars: Record<string, string>,
): void {
  selectedGrammars[candidate.grammar] = (selectedGrammars[candidate.grammar] ?? 0) + 1;
  for (const placement of candidate.placements) {
    out[placement.child.input.id] = { ...placement.bounds };
    selectedNodeGrammars[placement.child.input.id] = placement.candidate.grammar;
    semanticOrder.push(placement.child.input.id);
    flattenCandidate(
      placement.candidate,
      out,
      semanticOrder,
      selectedGrammars,
      selectedNodeGrammars,
    );
  }
}

function overlaps(a: Bounds, b: Bounds, gutter: number): boolean {
  return a.x < b.x + b.width + gutter && b.x < a.x + a.width + gutter &&
    a.y < b.y + b.height + gutter && b.y < a.y + a.height + gutter;
}

function repairRootOverlap(bounds: Bounds, placed: readonly Bounds[], gutter: number): Bounds {
  let current = { ...bounds, x: Math.max(0, bounds.x), y: Math.max(0, bounds.y) };
  for (let iteration = 0; iteration <= placed.length * 2; iteration++) {
    const conflicts = placed.filter((other) => overlaps(current, other, gutter));
    if (conflicts.length === 0) return current;
    const right = Math.max(...conflicts.map((other) => other.x + other.width + gutter));
    const below = Math.max(...conflicts.map((other) => other.y + other.height + gutter));
    const dx = right - current.x;
    const dy = below - current.y;
    current = dx <= dy ? { ...current, x: right } : { ...current, y: below };
  }
  return current;
}

function preservedLayout(
  roots: readonly FrontierNode[],
  opts: ResolvedFrontierOptions,
  context: PackedLayoutContext,
  selectedGrammars: Record<string, number>,
  selectedNodeGrammars: Record<string, string>,
): { nodes: Record<string, Bounds>; order: string[]; selected: ShapeCandidate } {
  const nodes: Record<string, Bounds> = {};
  const order: string[] = [];
  const placed: Bounds[] = [];
  let appendX = 0;
  let selected: ShapeCandidate | undefined;
  for (const root of roots) {
    const previous = context.previousBounds?.[root.input.id];
    const candidate = selectCandidate(root.candidates, opts, previous);
    selected ??= candidate;
    const proposed: Bounds = previous
      ? { x: previous.x, y: previous.y, width: candidate.width, height: candidate.height }
      : { x: appendX, y: 0, width: candidate.width, height: candidate.height };
    const bounds = repairRootOverlap(proposed, placed, opts.gutter);
    nodes[root.input.id] = bounds;
    selectedNodeGrammars[root.input.id] = candidate.grammar;
    order.push(root.input.id);
    flattenCandidate(candidate, nodes, order, selectedGrammars, selectedNodeGrammars);
    placed.push(bounds);
    appendX = Math.max(appendX, bounds.x + bounds.width + opts.gutter);
  }
  return { nodes, order, selected: selected! };
}

export function layoutPackedFrontier(
  roots: readonly PackedTreeNode[],
  options: PackedTreeOptions,
  context: PackedLayoutContext = {},
): PackedTreeLayout {
  const opts = resolveOptions(options);
  const stats: SearchStats = {
    frontierNodeCount: 0,
    totalFrontierCandidates: 0,
    maximumFrontierSize: 0,
    candidateCompositionCount: 0,
    reducedGrammarNodeCount: 0,
    grammarCandidateCounts: {},
  };
  const frontierRoots = sortNodes(
    roots.map((root) => buildFrontier(root, opts, context, stats)),
    opts,
  );
  let nodes: Record<string, Bounds>;
  let semanticOrder: string[];
  let selected: ShapeCandidate;
  const selectedGrammars: Record<string, number> = {};
  const selectedNodeGrammars: Record<string, string> = {};
  if (opts.rootPlacement === 'preserve' && context.previousBounds) {
    ({ nodes, order: semanticOrder, selected } = preservedLayout(
      frontierRoots,
      opts,
      context,
      selectedGrammars,
      selectedNodeGrammars,
    ));
  } else {
    const virtual = composeNode(
      { id: '__gchrp2_virtual_root__', name: '' },
      frontierRoots,
      opts,
      context,
      stats,
      true,
    );
    selected = selectCandidate(virtual, opts);
    nodes = {};
    semanticOrder = [];
    flattenCandidate(
      selected,
      nodes,
      semanticOrder,
      selectedGrammars,
      selectedNodeGrammars,
    );
  }
  const bounds = Object.values(nodes);
  const width = bounds.length ? Math.max(...bounds.map((item) => item.x + item.width)) : 0;
  const height = bounds.length ? Math.max(...bounds.map((item) => item.y + item.height)) : 0;
  const diagnostics: PackedFrontierDiagnostics = {
    engine: 'GCHRP-2',
    frontierNodeCount: stats.frontierNodeCount,
    totalFrontierCandidates: stats.totalFrontierCandidates,
    averageFrontierSize: stats.frontierNodeCount > 0
      ? stats.totalFrontierCandidates / stats.frontierNodeCount
      : 0,
    maximumFrontierSize: stats.maximumFrontierSize,
    candidateCompositionCount: stats.candidateCompositionCount,
    reducedGrammarNodeCount: stats.reducedGrammarNodeCount,
    selectedMetrics: selected.metrics,
    selectedScore: selected.score,
    selectedGrammar: selected.grammar,
    selectedGrammarCounts: selectedGrammars,
    selectedNodeGrammars,
    grammarCandidateCounts: stats.grammarCandidateCounts,
  };
  return { nodes, size: { width, height }, semanticOrder, diagnostics };
}
