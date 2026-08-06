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
  /** Required visual improvement before switching away from a low-movement form. */
  switchThreshold?: number;
  /** Optional extent used only by the forest/frame quality tier. */
  targetExtent?: { width: number; height: number };
}

export interface PackedLayoutContext {
  /** Parent-relative bounds of surviving nodes. */
  previousBounds?: Readonly<Record<string, Bounds>>;
}

export interface PackedFrontierDiagnostics {
  engine: 'GCHRP-2';
  revision: 'shape-function-3';
  searchStrategy: 'bounded-mixed-form';
  qualityModel: 'tiered-significance-weighted';
  frontierNodeCount: number;
  totalFrontierCandidates: number;
  averageFrontierSize: number;
  maximumFrontierSize: number;
  candidateCompositionCount: number;
  mixedFormCompositionCount: number;
  intervalStateCount: number;
  maximumIntervalFrontier: number;
  intervalBaseAspectRegionCount: number;
  geometryCandidatesBeforePruning: number;
  geometryCandidatesAfterPruning: number;
  qualityVariantsBeforePruning: number;
  qualityVariantsAfterPruning: number;
  largeNodeFallbackCount: number;
  /** Backward-compatible name for the large-node fallback count. */
  reducedGrammarNodeCount: number;
  rootRepairStatesExplored: number;
  maximumRootRepairBeam: number;
  aspectRegionCounts: Readonly<Record<string, number>>;
  selectedQualityTiers: Readonly<Record<string, number>>;
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
  previousBounds?: Readonly<Record<string, Bounds>>;
}

interface FrontierNode {
  input: PackedTreeNode;
  children: FrontierNode[];
  candidates: ShapeCandidate[];
  representatives?: ShapeCandidate[];
}

interface CandidatePlacement {
  child: FrontierNode;
  candidate: ShapeCandidate;
  bounds: Bounds;
}

interface CandidateGeometry {
  area: number;
  aspect: number;
  aspectRegion: number;
  cell: string;
}

interface CandidateQuality {
  legibility: number;
  frameDefect: number;
  stability: number;
  rhythm: number;
  frame: number;
  compactness: number;
  key: readonly number[];
}

interface ShapeCandidate {
  width: number;
  height: number;
  placements: readonly CandidatePlacement[];
  localMetrics: PackedLayoutMetrics;
  metrics: PackedLayoutMetrics;
  geometry: CandidateGeometry;
  quality: CandidateQuality;
  labelPenalty: number;
  subtreeNodeCount: number;
  subtreeLeafCount: number;
  visibleArea: number;
  /** Forest-only broad guard against a row of presentation-hostile towers. */
  frameShapeDefect: number;
  score: number;
  signature: string;
  grammar: string;
  frameAware: boolean;
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
  bandConsistency: number;
  orphanPenalty: number;
  grammar: string;
  signature: string;
}

interface SearchStats {
  frontierNodeCount: number;
  totalFrontierCandidates: number;
  maximumFrontierSize: number;
  candidateCompositionCount: number;
  mixedFormCompositionCount: number;
  intervalStateCount: number;
  maximumIntervalFrontier: number;
  intervalBaseAspectRegionCount: number;
  geometryCandidatesBeforePruning: number;
  geometryCandidatesAfterPruning: number;
  qualityVariantsBeforePruning: number;
  qualityVariantsAfterPruning: number;
  largeNodeFallbackCount: number;
  rootRepairStatesExplored: number;
  maximumRootRepairBeam: number;
  aspectRegionCounts: Record<string, number>;
  grammarCandidateCounts: Record<string, number>;
}

// Tier bands gate microscopic differences while preserving the strict tier
// order. Values are normalised penalties; useful ranges are 0..1, with larger
// values still handled deterministically rather than clamped.
// Legal shapes can carry at most 0.08 of conservative comfort slack. Keep all
// fitting labels in the same hard tier; an actual fit failure remains infinite
// and cannot be traded for geometry, while comfort is a late deterministic tie.
const LEGIBILITY_TIER_QUANTUM = 0.1;
const STABILITY_TIER_QUANTUM = 0.05;
// A 0.20 rhythm band treats small guide-count/raggedness fluctuations as a
// tie so the explicit forest frame can decide; visibly different rhythm still
// remains a higher tier than frame fit.
const RHYTHM_TIER_QUANTUM = 0.2;
const FRAME_TIER_QUANTUM = 0.05;
const COMPACTNESS_TIER_QUANTUM = 0.05;
// At the explicit forest frame, leaving the requested presentation band is a
// feasibility defect rather than a small aesthetic preference. A 0.15
// log-aspect band is roughly ±16%; within it rhythm still decides before frame.
const FRAME_DEFECT_THRESHOLD = 0.15;
const FRAME_DEFECT_TIER_QUANTUM = 0.05;
// Top-level forms outside this symmetric portrait/landscape range are still
// searchable, but a forest made from them pays an explicit feasibility defect.
const FRAME_CHILD_EXTREME_ASPECT = 2;
const LABEL_COMFORT_RATIO = 0.92;
const LOCAL_EXTREME_ASPECT = 8;
const QUALITY_VARIANTS_PER_CELL = 3;
// Five geometry regions plus one explicitly stable representative. This is a
// fixed bound; it prevents preserve-mode candidates from being crowded out by
// the geometry vocabulary before their parent can evaluate them.
const CHILD_REPRESENTATIVE_LIMIT = 6;
const INTERVAL_FRONTIER_LIMIT = 8;
const INTERVAL_SIBLING_LIMIT = 8;
const ROOT_REPAIR_BEAM = 24;
const ROOT_POSITION_LIMIT = 64;

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

function resolveOptions(
  options: PackedTreeOptions,
  context: PackedLayoutContext,
): ResolvedFrontierOptions {
  const maxCandidates = Math.floor(clamp(options.frontier?.maxCandidatesPerNode, 16, 4, 64));
  const requestedBuckets = options.frontier?.aspectBuckets?.filter((value) =>
    Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const distinctBuckets = [...new Set(requestedBuckets?.length
    ? requestedBuckets
    : [0.5, 0.75, 1, 1.5, 2.25])].slice(0, maxCandidates);
  const targetExtent = options.stability?.targetExtent;
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
    maxCandidates,
    beamWidth: Math.floor(clamp(options.frontier?.beamWidth, 20, 4, 64)),
    epsilon: clamp(options.frontier?.epsilon, 0.02, 0, 0.25),
    aspectBuckets: distinctBuckets,
    largeSiblingThreshold: Math.floor(clamp(
      options.frontier?.largeSiblingThreshold,
      14,
      8,
      200,
    )),
    switchThreshold: clamp(options.stability?.switchThreshold, 0.07, 0, 0.5),
    targetExtent: targetExtent && Number.isFinite(targetExtent.width) && targetExtent.width > 0 &&
      Number.isFinite(targetExtent.height) && targetExtent.height > 0
      ? { width: targetExtent.width, height: targetExtent.height }
      : undefined,
    previousBounds: context.previousBounds,
  };
}

/** Two independent 32-bit hashes make deterministic tie signatures compact. */
function hashSignature(parts: readonly string[]): string {
  let fnv = 2166136261;
  let djb = 5381;
  for (const part of parts) {
    for (let index = 0; index < part.length; index++) {
      const code = part.charCodeAt(index);
      fnv ^= code;
      fnv = Math.imul(fnv, 16777619);
      djb = Math.imul(djb, 33) ^ code;
    }
  }
  return `${(fnv >>> 0).toString(36)}-${(djb >>> 0).toString(36)}`;
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

function bucketIndex(aspect: number, buckets: readonly number[]): number {
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < buckets.length; index++) {
    const next = Math.abs(Math.log(Math.max(0.0001, aspect) / buckets[index]));
    if (next < distance) {
      distance = next;
      best = index;
    }
  }
  return best;
}

function geometryFor(
  width: number,
  height: number,
  opts: ResolvedFrontierOptions,
): CandidateGeometry {
  const aspect = width / Math.max(1, height);
  const region = bucketIndex(aspect, opts.aspectBuckets);
  const cellWidth = Math.round(Math.log(Math.max(1, width)) / 0.08);
  const cellHeight = Math.round(Math.log(Math.max(1, height)) / 0.08);
  return {
    area: width * height,
    aspect,
    aspectRegion: region,
    cell: `${region}:${cellWidth}:${cellHeight}`,
  };
}

function tier(value: number, quantum: number): number {
  return Math.floor(Math.max(0, value) / quantum + 1e-9);
}

function qualityFor(
  metrics: PackedLayoutMetrics,
  labelPenalty: number,
  opts: ResolvedFrontierOptions,
  frameAware: boolean,
  frameShapeDefect: number,
): CandidateQuality {
  const stability = opts.rootPlacement === 'preserve'
    ? opts.weights.movement * (metrics.movement + metrics.bandChange + metrics.regionChange) +
      opts.weights.neighborhood * metrics.neighborhoodChange
    : 0;
  const rhythm = opts.weights.raggedness * (metrics.raggedness + metrics.bandConsistency) +
    opts.weights.orphan * metrics.orphanPenalty +
    opts.weights.alignment * metrics.alignmentComplexity;
  const frame = frameAware
    ? opts.weights.aspect * metrics.aspectDeviation + opts.weights.overflow * metrics.viewportOverflow
    : 0;
  const frameDefect = frameAware
    ? Math.max(0, metrics.aspectDeviation - FRAME_DEFECT_THRESHOLD) + metrics.viewportOverflow +
      frameShapeDefect
    : 0;
  const compactness = opts.weights.whitespace * metrics.whitespace +
    Math.log(Math.max(1, metrics.area)) / 50;
  return {
    legibility: labelPenalty,
    frameDefect,
    stability,
    rhythm,
    frame,
    compactness,
    key: [
      tier(labelPenalty, LEGIBILITY_TIER_QUANTUM),
      tier(frameDefect, FRAME_DEFECT_TIER_QUANTUM),
      tier(stability, STABILITY_TIER_QUANTUM),
      tier(rhythm, RHYTHM_TIER_QUANTUM),
      tier(frame, FRAME_TIER_QUANTUM),
      tier(compactness, COMPACTNESS_TIER_QUANTUM),
      labelPenalty,
      stability,
      rhythm,
      frame,
      compactness,
    ],
  };
}

function compareNumbers(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function candidateCompare(a: ShapeCandidate, b: ShapeCandidate): number {
  return compareNumbers(a.quality.key, b.quality.key) ||
    a.geometry.area - b.geometry.area ||
    a.width - b.width ||
    a.height - b.height ||
    compareStableText(a.signature, b.signature);
}

function stableCandidateCompare(
  a: ShapeCandidate,
  b: ShapeCandidate,
  opts: ResolvedFrontierOptions,
): number {
  if (opts.rootPlacement !== 'preserve') {
    return a.quality.legibility - b.quality.legibility || candidateCompare(a, b);
  }
  return tier(a.quality.legibility, LEGIBILITY_TIER_QUANTUM) -
      tier(b.quality.legibility, LEGIBILITY_TIER_QUANTUM) ||
    a.quality.stability - b.quality.stability || candidateCompare(a, b);
}

function visualCandidateCompare(a: ShapeCandidate, b: ShapeCandidate): number {
  return a.quality.legibility - b.quality.legibility ||
    a.quality.rhythm - b.quality.rhythm ||
    a.quality.frame - b.quality.frame ||
    a.quality.compactness - b.quality.compactness ||
    compareStableText(a.signature, b.signature);
}

function geometryDominates(
  a: ShapeCandidate,
  b: ShapeCandidate,
  epsilon: number,
): boolean {
  if (a.geometry.aspectRegion !== b.geometry.aspectRegion) return false;
  const tolerance = 1 + epsilon;
  const noWorse = a.width <= b.width * tolerance && a.height <= b.height * tolerance &&
    a.geometry.area <= b.geometry.area * tolerance;
  const strictlyBetter = a.width < b.width / tolerance || a.height < b.height / tolerance ||
    a.geometry.area < b.geometry.area / tolerance;
  return noWorse && strictlyBetter;
}

function candidateIdentity(candidate: ShapeCandidate): string {
  return `${candidate.signature}:${candidate.grammar}:${candidate.width}:${candidate.height}:${
    candidate.placements.map((placement) =>
      `${placement.child.input.id}@${placement.candidate.signature}@${placement.bounds.x},${placement.bounds.y}`)
      .join(';')}`;
}

function pruneCandidates(
  candidates: readonly ShapeCandidate[],
  opts: ResolvedFrontierOptions,
  stats: SearchStats,
): ShapeCandidate[] {
  const byIdentity = new Map<string, ShapeCandidate>();
  for (const candidate of candidates) {
    const identity = candidateIdentity(candidate);
    const current = byIdentity.get(identity);
    if (!current || candidateCompare(candidate, current) < 0) byIdentity.set(identity, candidate);
  }
  const unique = [...byIdentity.values()];
  stats.geometryCandidatesBeforePruning += unique.length;
  const locallyLegal = unique.filter((candidate) => candidate.frameAware ||
    Math.abs(Math.log(Math.max(0.0001, candidate.geometry.aspect))) <=
      Math.log(LOCAL_EXTREME_ASPECT));
  const legal = locallyLegal.length > 0 ? locallyLegal : unique;
  const geometryRetained = new Map<string, ShapeCandidate>();
  for (let region = 0; region < opts.aspectBuckets.length; region++) {
    const regional = legal.filter((candidate) => candidate.geometry.aspectRegion === region);
    if (regional.length === 0) continue;
    const skyline = regional.filter((candidate, index) => !regional.some((other, otherIndex) =>
      index !== otherIndex && geometryDominates(other, candidate, opts.epsilon)));
    const retain = (candidate: ShapeCandidate | undefined) => {
      if (candidate) geometryRetained.set(candidateIdentity(candidate), candidate);
    };
    skyline.forEach(retain);
    retain([...regional].sort((a, b) => a.geometry.area - b.geometry.area || candidateCompare(a, b))[0]);
    retain([...regional].sort((a, b) => a.width - b.width || candidateCompare(a, b))[0]);
    retain([...regional].sort((a, b) => a.height - b.height || candidateCompare(a, b))[0]);
    retain([...regional].sort((a, b) =>
      Math.abs(Math.log(a.geometry.aspect / opts.aspectBuckets[region])) -
      Math.abs(Math.log(b.geometry.aspect / opts.aspectBuckets[region])) || candidateCompare(a, b))[0]);
    if (opts.rootPlacement === 'preserve') {
      retain([...regional].sort((a, b) => stableCandidateCompare(a, b, opts))[0]);
    }
  }
  const stageA = [...geometryRetained.values()];
  stats.geometryCandidatesAfterPruning += stageA.length;
  stats.qualityVariantsBeforePruning += stageA.length;

  const byCell = new Map<string, ShapeCandidate[]>();
  for (const candidate of stageA) {
    const cell = byCell.get(candidate.geometry.cell) ?? [];
    cell.push(candidate);
    byCell.set(candidate.geometry.cell, cell);
  }
  const qualityRetained = new Map<string, ShapeCandidate>();
  const retainQuality = (candidate: ShapeCandidate | undefined) => {
    if (candidate) qualityRetained.set(candidateIdentity(candidate), candidate);
  };
  for (const cell of byCell.values()) {
    retainQuality([...cell].sort(candidateCompare)[0]);
    retainQuality([...cell].sort((a, b) => stableCandidateCompare(a, b, opts))[0]);
    retainQuality([...cell].sort(visualCandidateCompare)[0]);
    for (const candidate of [...cell].sort(candidateCompare).slice(0, QUALITY_VARIANTS_PER_CELL)) {
      retainQuality(candidate);
    }
  }
  const stageB = [...qualityRetained.values()];
  stats.qualityVariantsAfterPruning += stageB.length;

  const mandatory = new Map<string, ShapeCandidate>();
  const keepMandatory = (candidate: ShapeCandidate | undefined) => {
    if (candidate) mandatory.set(candidateIdentity(candidate), candidate);
  };
  for (let region = 0; region < opts.aspectBuckets.length; region++) {
    keepMandatory(stageB.filter((candidate) => candidate.geometry.aspectRegion === region)
      .sort(candidateCompare)[0]);
  }
  keepMandatory([...stageB].sort((a, b) =>
    a.geometry.area - b.geometry.area || candidateCompare(a, b))[0]);
  keepMandatory([...stageB].sort((a, b) => stableCandidateCompare(a, b, opts))[0]);
  keepMandatory([...stageB].sort(visualCandidateCompare)[0]);
  const result = [...mandatory.values()];
  const retainedIds = new Set(result.map(candidateIdentity));
  for (const candidate of [...stageB].sort(candidateCompare)) {
    if (result.length >= opts.maxCandidates) break;
    const identity = candidateIdentity(candidate);
    if (!retainedIds.has(identity)) {
      result.push(candidate);
      retainedIds.add(identity);
    }
  }
  return result.slice(0, opts.maxCandidates).sort(candidateCompare);
}

function representativeCandidates(
  child: FrontierNode,
  opts: ResolvedFrontierOptions,
): ShapeCandidate[] {
  if (child.representatives) return child.representatives;
  const retained = new Map<string, ShapeCandidate>();
  const retain = (candidate: ShapeCandidate | undefined) => {
    if (candidate) retained.set(candidateIdentity(candidate), candidate);
  };
  // In preserve mode stability is inserted first so the fixed representative
  // cap cannot drop it after all geometry regions have been populated. Repack
  // retains the established five-representative search path exactly.
  if (opts.rootPlacement === 'preserve') {
    retain([...child.candidates].sort((a, b) => stableCandidateCompare(a, b, opts))[0]);
  }
  for (let region = 0; region < opts.aspectBuckets.length; region++) {
    retain(child.candidates.filter((candidate) => candidate.geometry.aspectRegion === region)
      .sort(candidateCompare)[0]);
  }
  retain([...child.candidates].sort((a, b) =>
    a.geometry.area - b.geometry.area || candidateCompare(a, b))[0]);
  if (opts.rootPlacement !== 'preserve') {
    retain([...child.candidates].sort((a, b) => stableCandidateCompare(a, b, opts))[0]);
  }
  for (const candidate of [...child.candidates].sort(candidateCompare)) retain(candidate);
  const limit = opts.rootPlacement === 'preserve' ? CHILD_REPRESENTATIVE_LIMIT : 5;
  child.representatives = [...retained.values()].slice(0, limit);
  return child.representatives;
}

function sampleCounts(total: number, large: boolean): number[] {
  if (!large && total <= 8) return Array.from({ length: total }, (_, index) => index + 1);
  const center = Math.max(1, Math.round(Math.sqrt(total)));
  if (large) {
    // Large groups use only the calm near-square band counts. Mixed child
    // forms are still chosen independently inside each band; dropping strip
    // and tower counts is the explicit bounded fallback.
    return [...new Set([center - 1, center, center + 1, Math.ceil(total / center)])]
      .filter((value) => value >= 1 && value <= total).sort((a, b) => a - b);
  }
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

function coefficientOfVariation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function blockCompare(a: BlockCandidate, b: BlockCandidate): number {
  return a.raggedness - b.raggedness ||
    a.bandConsistency - b.bandConsistency ||
    a.orphanPenalty - b.orphanPenalty ||
    a.width * a.height - b.width * b.height ||
    a.width - b.width || a.height - b.height || compareStableText(a.signature, b.signature);
}

function blockStability(
  block: BlockCandidate,
  previousBounds: Readonly<Record<string, Bounds>> | undefined,
): number {
  if (!previousBounds) return Number.POSITIVE_INFINITY;
  const surviving = block.placements.flatMap((placement) => {
    const previous = previousBounds[placement.child.input.id];
    return previous ? [{ placement, previous }] : [];
  });
  if (surviving.length === 0) return Number.POSITIVE_INFINITY;
  const currentX = Math.min(...surviving.map(({ placement }) => placement.bounds.x));
  const currentY = Math.min(...surviving.map(({ placement }) => placement.bounds.y));
  const previousX = Math.min(...surviving.map(({ previous }) => previous.x));
  const previousY = Math.min(...surviving.map(({ previous }) => previous.y));
  return surviving.reduce((sum, { placement, previous }) => {
    const scale = Math.max(1, Math.hypot(previous.width, previous.height));
    return sum + (
      Math.hypot(
        placement.bounds.x - currentX - (previous.x - previousX),
        placement.bounds.y - currentY - (previous.y - previousY),
      ) +
      0.5 * Math.abs(placement.bounds.width - previous.width) +
      0.5 * Math.abs(placement.bounds.height - previous.height)
    ) / scale;
  }, 0) / surviving.length;
}

function pruneBlocks(
  blocks: readonly BlockCandidate[],
  limit: number,
  opts: ResolvedFrontierOptions,
): BlockCandidate[] {
  const bySignature = new Map<string, BlockCandidate>();
  for (const block of blocks) {
    const current = bySignature.get(block.signature);
    if (!current || blockCompare(block, current) < 0) bySignature.set(block.signature, block);
  }
  const unique = [...bySignature.values()];
  const retained = new Map<string, BlockCandidate>();
  const retain = (block: BlockCandidate | undefined) => {
    if (block) retained.set(block.signature, block);
  };
  const bestByRegion: Array<BlockCandidate | undefined> = new Array(opts.aspectBuckets.length);
  let smallestArea: BlockCandidate | undefined;
  let smallestWidth: BlockCandidate | undefined;
  let smallestHeight: BlockCandidate | undefined;
  let mostStable: BlockCandidate | undefined;
  for (const block of unique) {
    const region = bucketIndex(block.width / Math.max(1, block.height), opts.aspectBuckets);
    if (!bestByRegion[region] || blockCompare(block, bestByRegion[region]!) < 0) {
      bestByRegion[region] = block;
    }
    if (!smallestArea || block.width * block.height < smallestArea.width * smallestArea.height ||
      (block.width * block.height === smallestArea.width * smallestArea.height &&
        blockCompare(block, smallestArea) < 0)) smallestArea = block;
    if (!smallestWidth || block.width < smallestWidth.width ||
      (block.width === smallestWidth.width && blockCompare(block, smallestWidth) < 0)) {
      smallestWidth = block;
    }
    if (!smallestHeight || block.height < smallestHeight.height ||
      (block.height === smallestHeight.height && blockCompare(block, smallestHeight) < 0)) {
      smallestHeight = block;
    }
    if (opts.rootPlacement === 'preserve' &&
      (!mostStable || blockStability(block, opts.previousBounds) <
        blockStability(mostStable, opts.previousBounds) ||
        (blockStability(block, opts.previousBounds) ===
          blockStability(mostStable, opts.previousBounds) &&
          blockCompare(block, mostStable) < 0))) mostStable = block;
  }
  retain(mostStable);
  bestByRegion.forEach(retain);
  retain(smallestArea);
  retain(smallestWidth);
  retain(smallestHeight);
  const ordered = [...unique].sort(blockCompare);
  for (const block of ordered) {
    if (retained.size >= limit) break;
    retained.set(block.signature, block);
  }
  return [...retained.values()].slice(0, limit).sort(blockCompare);
}

function itemBlock(child: FrontierNode, candidate: ShapeCandidate): BlockCandidate {
  return {
    width: candidate.width,
    height: candidate.height,
    placements: [{ child, candidate, bounds: {
      x: 0, y: 0, width: candidate.width, height: candidate.height,
    } }],
    raggedness: 0,
    bandConsistency: 0,
    orphanPenalty: 0,
    grammar: 'item',
    signature: hashSignature(['item', child.input.id, candidate.signature]),
  };
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
    bandConsistency: (left.bandConsistency + right.bandConsistency) / 2,
    orphanPenalty: Math.max(left.orphanPenalty, right.orphanPenalty),
    grammar,
    signature: hashSignature([grammar, left.signature, right.signature]),
  };
}

function orderedBandFrontier(
  children: readonly FrontierNode[],
  start: number,
  end: number,
  horizontal: boolean,
  opts: ResolvedFrontierOptions,
  large: boolean,
): BlockCandidate[] {
  let states = representativeCandidates(children[start], opts).map((candidate) =>
    itemBlock(children[start], candidate));
  const limit = Math.min(large ? 4 : opts.beamWidth, INTERVAL_FRONTIER_LIMIT);
  for (let index = start + 1; index < end; index++) {
    const next = representativeCandidates(children[index], opts).map((candidate) =>
      itemBlock(children[index], candidate));
    const composed: BlockCandidate[] = [];
    for (const left of states) {
      for (const right of next) composed.push(combineBlocks(left, right, opts.gutter, horizontal));
    }
    states = pruneBlocks(composed, limit, opts);
  }
  return states;
}

function finalizeShelf(
  bands: readonly BlockCandidate[],
  ranges: readonly [number, number][],
  vertical: boolean,
  gutter: number,
  preferredCount: number,
): BlockCandidate {
  const outerMinor = Math.max(...bands.map((band) => vertical ? band.height : band.width));
  let major = 0;
  const placements: BlockPlacement[] = [];
  const bandExtents: number[] = [];
  const bandSizes: number[] = [];
  bands.forEach((band) => {
    const minorExtent = vertical ? band.height : band.width;
    const majorExtent = vertical ? band.width : band.height;
    const minorOffset = Math.floor((outerMinor - minorExtent) / 2);
    for (const placement of band.placements) {
      placements.push({
        ...placement,
        bounds: vertical
          ? { ...placement.bounds, x: placement.bounds.x + major,
            y: placement.bounds.y + minorOffset }
          : { ...placement.bounds, x: placement.bounds.x + minorOffset,
            y: placement.bounds.y + major },
      });
    }
    bandExtents.push(minorExtent);
    bandSizes.push(majorExtent);
    major += majorExtent + gutter;
  });
  major = Math.max(0, major - gutter);
  const raggedness = bandExtents.reduce((sum, extent) =>
    sum + ((outerMinor - extent) / Math.max(1, outerMinor)) ** 2, 0) /
    Math.max(1, bandExtents.length);
  const grammar = vertical ? 'ordered-columns' : 'ordered-shelves';
  return {
    width: vertical ? major : outerMinor,
    height: vertical ? outerMinor : major,
    placements,
    raggedness,
    bandConsistency: coefficientOfVariation(bandSizes),
    orphanPenalty: ranges.length > 1 && ranges.at(-1)![1] - ranges.at(-1)![0] === 1 ? 1 : 0,
    grammar,
    signature: hashSignature([grammar, String(preferredCount), ...bands.map((band) => band.signature)]),
  };
}

function mixedShelfBlocks(
  children: readonly FrontierNode[],
  opts: ResolvedFrontierOptions,
  stats: SearchStats,
): BlockCandidate[] {
  const large = children.length > opts.largeSiblingThreshold;
  const result: BlockCandidate[] = [];
  for (const preferredCount of sampleCounts(children.length, large)) {
    const ranges = balancedRanges(children.length, preferredCount);
    for (const vertical of [false, true]) {
      const bandFrontiers = ranges.map(([start, end]) =>
        orderedBandFrontier(children, start, end, !vertical, opts, large));
      interface ShelfState { bands: BlockCandidate[]; block: BlockCandidate }
      let states: ShelfState[] = bandFrontiers[0].map((band) => ({
        bands: [band],
        block: finalizeShelf([band], ranges.slice(0, 1), vertical, opts.gutter, preferredCount),
      }));
      for (let bandIndex = 1; bandIndex < bandFrontiers.length; bandIndex++) {
        const composed: ShelfState[] = [];
        for (const state of states) {
          for (const band of bandFrontiers[bandIndex]) {
            const bands = [...state.bands, band];
            composed.push({
              bands,
              block: finalizeShelf(
                bands,
                ranges.slice(0, bandIndex + 1),
                vertical,
                opts.gutter,
                preferredCount,
              ),
            });
          }
        }
        const limit = Math.min(large ? 4 : opts.beamWidth, INTERVAL_FRONTIER_LIMIT);
        const pruned = pruneBlocks(composed.map((state) => state.block), limit, opts);
        const bySignature = new Map(composed.map((state) => [state.block.signature, state]));
        states = pruned.map((block) => bySignature.get(block.signature)!);
      }
      result.push(...states.map((state) => state.block));
    }
  }
  stats.candidateCompositionCount += result.length;
  return pruneBlocks(result, opts.beamWidth, opts);
}

function guillotineBlocks(
  children: readonly FrontierNode[],
  opts: ResolvedFrontierOptions,
  stats: SearchStats,
): BlockCandidate[] {
  const count = children.length;
  if (count < 2 || count > Math.min(INTERVAL_SIBLING_LIMIT, opts.largeSiblingThreshold)) return [];
  const memo = new Map<string, BlockCandidate[]>();
  const interval = (start: number, end: number): BlockCandidate[] => {
    const key = `${start}:${end}`;
    const cached = memo.get(key);
    if (cached) return cached;
    if (end - start === 1) {
      const child = children[start];
      const representatives = representativeCandidates(child, opts);
      stats.intervalBaseAspectRegionCount += new Set(representatives.map((candidate) =>
        candidate.geometry.aspectRegion)).size;
      const blocks = representatives.map((candidate) => itemBlock(child, candidate));
      stats.intervalStateCount += blocks.length;
      stats.maximumIntervalFrontier = Math.max(stats.maximumIntervalFrontier, blocks.length);
      memo.set(key, blocks);
      return blocks;
    }
    let retained: BlockCandidate[] = [];
    for (let split = start + 1; split < end; split++) {
      const left = interval(start, split);
      const right = interval(split, end);
      const composed: BlockCandidate[] = [];
      for (const a of left) {
        for (const b of right) {
          composed.push(combineBlocks(a, b, opts.gutter, true));
          composed.push(combineBlocks(a, b, opts.gutter, false));
        }
      }
      stats.candidateCompositionCount += composed.length;
      retained = pruneBlocks(
        [...retained, ...composed],
        Math.min(opts.beamWidth, INTERVAL_FRONTIER_LIMIT),
        opts,
      );
    }
    stats.intervalStateCount += retained.length;
    stats.maximumIntervalFrontier = Math.max(stats.maximumIntervalFrontier, retained.length);
    memo.set(key, retained);
    return retained;
  };
  return interval(0, count);
}

function dominantBlocks(
  children: readonly FrontierNode[],
  opts: ResolvedFrontierOptions,
  stats: SearchStats,
): BlockCandidate[] {
  if (children.length < 3) return [];
  const significance = children.map((child) => child.candidates[0]?.subtreeNodeCount ?? 1);
  const average = significance.reduce((sum, value) => sum + value, 0) / significance.length;
  const dominantIndex = significance.findIndex((value) => value >= average * 1.8);
  if (dominantIndex !== 0 && dominantIndex !== children.length - 1) return [];
  const stripStart = dominantIndex === 0 ? 1 : 0;
  const stripEnd = dominantIndex === 0 ? children.length : children.length - 1;
  const stripChildren = children.slice(stripStart, stripEnd);
  const strips = mixedShelfBlocks(stripChildren, opts, stats);
  const dominantCandidates = representativeCandidates(children[dominantIndex], opts);
  const blocks: BlockCandidate[] = [];
  for (const dominant of dominantCandidates) {
    const dominantBlock = itemBlock(children[dominantIndex], dominant);
    for (const strip of strips) {
      const first = dominantIndex === 0 ? dominantBlock : strip;
      const second = dominantIndex === 0 ? strip : dominantBlock;
      for (const horizontal of [true, false]) {
        const combined = combineBlocks(first, second, opts.gutter, horizontal);
        blocks.push({
          ...combined,
          bandConsistency: 0,
          grammar: horizontal
            ? 'dominant-block-horizontal-strip'
            : 'dominant-block-vertical-strip',
          signature: hashSignature([
            horizontal ? 'dominant-horizontal' : 'dominant-vertical',
            first.signature,
            second.signature,
          ]),
        });
      }
    }
  }
  stats.candidateCompositionCount += blocks.length;
  return pruneBlocks(blocks, opts.beamWidth, opts);
}

function titleGeometry(
  node: PackedTreeNode,
  baseWidth: number,
  opts: ResolvedFrontierOptions,
): { width: number; height: number; penalty: number } {
  const label = defaultLabel(node, true);
  const width = Math.max(baseWidth, minimumPackedLabelWidth(label, label.maxLines ?? 2));
  const measured = measurePackedLabel(label, width, Number.MAX_SAFE_INTEGER);
  const height = Math.max(opts.titleBandHeight, measured.requiredHeight);
  return {
    width: Math.ceil(width),
    height,
    penalty: Math.max(0, measured.requiredWidth / Math.max(1, width) - LABEL_COMFORT_RATIO,
      measured.requiredHeight / Math.max(1, height) - LABEL_COMFORT_RATIO),
  };
}

type AggregateMetricKey = keyof Omit<PackedLayoutMetrics, 'area'>;

function aggregateChildMetrics(
  own: PackedLayoutMetrics,
  placements: readonly CandidatePlacement[],
): PackedLayoutMetrics {
  if (placements.length === 0) return own;
  const nodeWeight = placements.reduce((sum, placement) =>
    sum + placement.candidate.subtreeNodeCount, 0);
  const areaWeight = placements.reduce((sum, placement) =>
    sum + placement.candidate.visibleArea, 0);
  const nodeMetric = (key: AggregateMetricKey) =>
    (own[key] * nodeWeight + placements.reduce((sum, placement) =>
      sum + placement.candidate.metrics[key] * placement.candidate.subtreeNodeCount, 0)) /
    Math.max(1, nodeWeight * 2);
  const areaMetric = (key: AggregateMetricKey) =>
    (own[key] * areaWeight + placements.reduce((sum, placement) =>
      sum + placement.candidate.metrics[key] * placement.candidate.visibleArea, 0)) /
    Math.max(1, areaWeight * 2);
  return {
    ...own,
    aspectDeviation: own.aspectDeviation,
    raggedness: areaMetric('raggedness'),
    bandConsistency: areaMetric('bandConsistency'),
    whitespace: areaMetric('whitespace'),
    orphanPenalty: Math.max(own.orphanPenalty, ...placements.map((placement) =>
      placement.candidate.metrics.orphanPenalty)),
    alignmentComplexity: areaMetric('alignmentComplexity'),
    movement: nodeMetric('movement'),
    neighborhoodChange: nodeMetric('neighborhoodChange'),
    bandChange: nodeMetric('bandChange'),
    regionChange: nodeMetric('regionChange'),
    viewportOverflow: own.viewportOverflow,
  };
}

function completeCandidate(
  candidate: Omit<ShapeCandidate, 'geometry' | 'quality' | 'score'>,
  opts: ResolvedFrontierOptions,
): ShapeCandidate {
  const geometry = geometryFor(candidate.width, candidate.height, opts);
  const quality = qualityFor(
    candidate.metrics,
    candidate.labelPenalty,
    opts,
    candidate.frameAware,
    candidate.frameShapeDefect,
  );
  return {
    ...candidate,
    geometry,
    quality,
    score: scorePackedMetrics(candidate.metrics, opts.weights),
  };
}

function shapeFromBlock(
  node: PackedTreeNode,
  block: BlockCandidate,
  opts: ResolvedFrontierOptions,
  virtual: boolean,
): ShapeCandidate {
  const baseWidth = virtual ? block.width : block.width + 2 * opts.padding;
  const title = virtual
    ? { width: baseWidth, height: 0, penalty: 0 }
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
  const measuredLocalMetrics = measurePackedMetrics({
    width,
    height,
    targetAspect: virtual ? opts.targetAspect : width / Math.max(1, height),
    placements: placements.map((placement) => ({
      id: placement.child.input.id,
      bounds: placement.bounds,
    })),
    contentArea: placements.reduce((sum, placement) =>
      sum + placement.bounds.width * placement.bounds.height, 0),
    targetExtent: virtual ? opts.targetExtent : undefined,
  });
  // Grammar bookkeeping can understate a visibly ragged mixed-form band. Use
  // the final placed rectangles as an independent floor, while retaining any
  // stronger defect already discovered during bounded block composition.
  const localMetrics: PackedLayoutMetrics = {
    ...measuredLocalMetrics,
    raggedness: Math.max(measuredLocalMetrics.raggedness, block.raggedness),
    bandConsistency: Math.max(
      measuredLocalMetrics.bandConsistency,
      block.bandConsistency,
    ),
    orphanPenalty: Math.max(measuredLocalMetrics.orphanPenalty, block.orphanPenalty),
  };
  const metrics = aggregateChildMetrics(localMetrics, placements);
  const labelPenalty = Math.max(title.penalty, ...placements.map((placement) =>
    placement.candidate.labelPenalty));
  const frameShapeDefect = virtual && placements.length > 0
    ? placements.reduce((sum, placement) => {
      const aspect = placement.bounds.width / Math.max(1, placement.bounds.height);
      return sum + Math.max(0,
        Math.abs(Math.log(Math.max(0.0001, aspect))) -
          Math.log(FRAME_CHILD_EXTREME_ASPECT));
    }, 0) / placements.length
    : 0;
  return completeCandidate({
    width,
    height,
    placements,
    localMetrics,
    metrics,
    labelPenalty,
    subtreeNodeCount: virtual ? placements.reduce((sum, placement) =>
      sum + placement.candidate.subtreeNodeCount, 0) : 1 + placements.reduce((sum, placement) =>
      sum + placement.candidate.subtreeNodeCount, 0),
    subtreeLeafCount: placements.reduce((sum, placement) =>
      sum + placement.candidate.subtreeLeafCount, 0),
    visibleArea: width * height,
    frameShapeDefect,
    signature: hashSignature([node.id, block.grammar, String(width), String(height), block.signature]),
    grammar: block.grammar,
    frameAware: virtual,
  }, opts);
}

function withStabilityMetrics(
  candidate: ShapeCandidate,
  context: PackedLayoutContext,
  opts: ResolvedFrontierOptions,
): ShapeCandidate {
  if (!context.previousBounds || candidate.placements.length === 0) return candidate;
  const localMetrics = measurePackedMetrics({
    width: candidate.width,
    height: candidate.height,
    targetAspect: candidate.frameAware
      ? opts.targetAspect
      : candidate.width / Math.max(1, candidate.height),
    placements: candidate.placements.map((placement) => ({
      id: placement.child.input.id,
      bounds: placement.bounds,
    })),
    contentArea: candidate.placements.reduce((sum, placement) =>
      sum + placement.bounds.width * placement.bounds.height, 0),
    raggedness: candidate.localMetrics.raggedness,
    bandConsistency: candidate.localMetrics.bandConsistency,
    orphanPenalty: candidate.localMetrics.orphanPenalty,
    previousBounds: context.previousBounds,
    targetExtent: candidate.frameAware ? opts.targetExtent : undefined,
  });
  const metrics = aggregateChildMetrics(localMetrics, candidate.placements);
  return completeCandidate({ ...candidate, localMetrics, metrics }, opts);
}

function composeNode(
  node: PackedTreeNode,
  children: readonly FrontierNode[],
  opts: ResolvedFrontierOptions,
  context: PackedLayoutContext,
  stats: SearchStats,
  virtual = false,
): ShapeCandidate[] {
  const large = children.length > opts.largeSiblingThreshold;
  if (large) stats.largeNodeFallbackCount++;
  const blocks = [
    ...mixedShelfBlocks(children, opts, stats),
    ...dominantBlocks(children, opts, stats),
    ...(large ? [] : guillotineBlocks(children, opts, stats)),
  ];
  const prunedBlocks = pruneBlocks(blocks, Math.max(opts.beamWidth, opts.maxCandidates), opts);
  for (const block of prunedBlocks) {
    const regions = new Set(block.placements.map((placement) =>
      placement.candidate.geometry.aspectRegion));
    if (regions.size > 1) stats.mixedFormCompositionCount++;
    stats.grammarCandidateCounts[block.grammar] =
      (stats.grammarCandidateCounts[block.grammar] ?? 0) + 1;
  }
  const candidates = prunedBlocks.map((block) => withStabilityMetrics(
    shapeFromBlock(node, block, opts, virtual),
    context,
    opts,
  ));
  return pruneCandidates(candidates, opts, stats);
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
      const localMetrics = measurePackedMetrics({
        width: shape.width,
        height: shape.height,
        targetAspect: shape.width / Math.max(1, shape.height),
        placements: [],
        contentArea: shape.width * shape.height,
      });
      const labelPenalty = shape.text.fits
        ? Math.max(0, shape.text.requiredWidth / shape.width - LABEL_COMFORT_RATIO,
          shape.text.requiredHeight / shape.height - LABEL_COMFORT_RATIO)
        : Number.POSITIVE_INFINITY;
      return completeCandidate({
        width: shape.width,
        height: shape.height,
        placements: [],
        localMetrics,
        metrics: localMetrics,
        labelPenalty,
        subtreeNodeCount: 1,
        subtreeLeafCount: 1,
        visibleArea: shape.width * shape.height,
        frameShapeDefect: 0,
        signature: hashSignature(['leaf', input.id, shape.kind, String(shape.width),
          String(shape.height)]),
        grammar: `leaf-${shape.kind}`,
        frameAware: false,
      }, opts);
    });
    // The controlled leaf vocabulary has at most three legal forms (or one
    // expanded fallback), already spans its useful geometry regions, and is
    // below the public minimum frontier cap. Avoid running the general
    // multi-stage composition pruner for every leaf in very large forests.
    candidates.sort(candidateCompare);
    stats.geometryCandidatesBeforePruning += candidates.length;
    stats.geometryCandidatesAfterPruning += candidates.length;
    stats.qualityVariantsBeforePruning += candidates.length;
    stats.qualityVariantsAfterPruning += candidates.length;
  } else {
    candidates = composeNode(input, children, opts, context, stats);
  }
  stats.frontierNodeCount++;
  stats.totalFrontierCandidates += candidates.length;
  stats.maximumFrontierSize = Math.max(stats.maximumFrontierSize, candidates.length);
  for (const candidate of candidates) {
    const key = String(candidate.geometry.aspectRegion);
    stats.aspectRegionCounts[key] = (stats.aspectRegionCounts[key] ?? 0) + 1;
  }
  return { input, children, candidates };
}

function selectCandidate(
  candidates: readonly ShapeCandidate[],
  opts: ResolvedFrontierOptions,
  previousSelf?: Bounds,
): ShapeCandidate {
  if (!previousSelf || opts.rootPlacement !== 'preserve') {
    return [...candidates].sort(candidateCompare)[0];
  }
  const rootMovement = (candidate: ShapeCandidate) =>
    (Math.abs(candidate.width - previousSelf.width) +
      Math.abs(candidate.height - previousSelf.height)) /
    Math.max(1, previousSelf.width + previousSelf.height);
  const stable = [...candidates].sort((a, b) =>
    tier(a.quality.legibility, LEGIBILITY_TIER_QUANTUM) -
      tier(b.quality.legibility, LEGIBILITY_TIER_QUANTUM) ||
    a.quality.stability + rootMovement(a) - (b.quality.stability + rootMovement(b)) ||
    candidateCompare(a, b))[0];
  const visual = [...candidates].sort(visualCandidateCompare)[0];
  if (stable === visual || visual.quality.legibility > stable.quality.legibility) return stable;
  const stableMovement = stable.quality.stability + rootMovement(stable);
  const visualMovement = visual.quality.stability + rootMovement(visual);
  if (tier(visualMovement, STABILITY_TIER_QUANTUM) >
    tier(stableMovement, STABILITY_TIER_QUANTUM)) return stable;
  const stableVisual = stable.quality.rhythm + stable.quality.frame;
  const visualQuality = visual.quality.rhythm + visual.quality.frame;
  const improvement = (stableVisual - visualQuality) / Math.max(0.0001, stableVisual);
  return improvement >= opts.switchThreshold ? visual : stable;
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

interface RootPlacement {
  root: FrontierNode;
  candidate: ShapeCandidate;
  bounds: Bounds;
  anchor?: Bounds;
}

interface RootState {
  placements: RootPlacement[];
  key: readonly number[];
  signature: string;
}

function rootStateKey(placements: readonly RootPlacement[]): readonly number[] {
  const anchored = placements.filter((placement) => placement.anchor);
  const displacement = anchored.reduce((sum, placement) => {
    const anchor = placement.anchor!;
    return sum + Math.hypot(placement.bounds.x - anchor.x, placement.bounds.y - anchor.y) /
      Math.max(1, Math.hypot(anchor.width, anchor.height));
  }, 0);
  const ordered = [...placements].sort((a, b) =>
    a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x ||
    compareStableText(a.root.input.id, b.root.input.id));
  const semanticIndex = new Map(placements.map((placement, index) =>
    [placement.root.input.id, index]));
  let inversions = 0;
  for (let left = 0; left < ordered.length; left++) {
    for (let right = left + 1; right < ordered.length; right++) {
      if (semanticIndex.get(ordered[left].root.input.id)! >
        semanticIndex.get(ordered[right].root.input.id)!) inversions++;
    }
  }
  const width = Math.max(0, ...placements.map((placement) =>
    placement.bounds.x + placement.bounds.width));
  const height = Math.max(0, ...placements.map((placement) =>
    placement.bounds.y + placement.bounds.height));
  const guideComplexity = new Set(placements.flatMap((placement) =>
    [placement.bounds.x, placement.bounds.y])).size / Math.max(1, placements.length * 2);
  return [
    tier(displacement, 0.02),
    displacement,
    inversions,
    width * height,
    Math.abs(width - height),
    guideComplexity,
  ];
}

function compareRootState(a: RootState, b: RootState): number {
  return compareNumbers(a.key, b.key) || compareStableText(a.signature, b.signature);
}

function rootPositions(
  state: RootState,
  anchor: Bounds,
  width: number,
  height: number,
  gutter: number,
): Bounds[] {
  const candidates = new Map<string, Bounds>();
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return;
    const bounds = { x: Math.round(x), y: Math.round(y), width, height };
    candidates.set(`${bounds.x}:${bounds.y}`, bounds);
  };
  add(anchor.x, anchor.y);
  add(0, 0);
  // Keep the former deterministic right/down result in the candidate set as
  // a dominated fallback. The beam can therefore only improve on the old
  // local repair for the same chosen root forms.
  let greedy = { ...anchor, width, height };
  for (let iteration = 0; iteration <= state.placements.length * 2; iteration++) {
    const conflicts = state.placements.filter((placement) =>
      overlaps(greedy, placement.bounds, gutter));
    if (conflicts.length === 0) break;
    const right = Math.max(...conflicts.map((placement) =>
      placement.bounds.x + placement.bounds.width + gutter));
    const below = Math.max(...conflicts.map((placement) =>
      placement.bounds.y + placement.bounds.height + gutter));
    greedy = right - greedy.x <= below - greedy.y
      ? { ...greedy, x: right }
      : { ...greedy, y: below };
  }
  add(greedy.x, greedy.y);
  const appendX = Math.max(0, ...state.placements.map((placement) =>
    placement.bounds.x + placement.bounds.width + gutter));
  add(appendX, 0);
  const xs = new Set<number>([anchor.x, 0, appendX]);
  const ys = new Set<number>([anchor.y, 0]);
  for (const placement of state.placements.slice(-8)) {
    const other = placement.bounds;
    const right = other.x + other.width + gutter;
    const left = other.x - width - gutter;
    const below = other.y + other.height + gutter;
    const above = other.y - height - gutter;
    add(right, anchor.y);
    add(Math.max(0, left), anchor.y);
    add(anchor.x, below);
    add(anchor.x, Math.max(0, above));
    add(right, other.y);
    add(Math.max(0, left), other.y);
    add(other.x, below);
    add(other.x, Math.max(0, above));
    xs.add(right);
    if (left >= 0) xs.add(left);
    xs.add(other.x);
    ys.add(below);
    if (above >= 0) ys.add(above);
    ys.add(other.y);
  }
  let intersections = 0;
  for (const x of xs) {
    for (const y of ys) {
      add(x, y);
      if (++intersections >= 32) break;
    }
    if (intersections >= 32) break;
  }
  const legal = [...candidates.values()].filter((bounds) =>
    state.placements.every((placement) => !overlaps(bounds, placement.bounds, gutter)))
    .sort((a, b) =>
      Math.hypot(a.x - anchor.x, a.y - anchor.y) -
        Math.hypot(b.x - anchor.x, b.y - anchor.y) ||
      a.y - b.y || a.x - b.x)
    .slice(0, ROOT_POSITION_LIMIT);
  if (legal.length > 0) return legal;
  const fallbackY = Math.max(0, ...state.placements.map((placement) =>
    placement.bounds.y + placement.bounds.height + gutter));
  return [{ x: 0, y: fallbackY, width, height }];
}

function preservedLayout(
  roots: readonly FrontierNode[],
  opts: ResolvedFrontierOptions,
  context: PackedLayoutContext,
  stats: SearchStats,
  selectedGrammars: Record<string, number>,
  selectedNodeGrammars: Record<string, string>,
): { nodes: Record<string, Bounds>; order: string[]; selected: ShapeCandidate } {
  let states: RootState[] = [{ placements: [], key: [], signature: 'root-start' }];
  let appendX = 0;
  for (const root of roots) {
    const previous = context.previousBounds?.[root.input.id];
    const candidate = selectCandidate(root.candidates, opts, previous);
    const anchor = previous
      ? { ...previous, width: candidate.width, height: candidate.height }
      : { x: appendX, y: 0, width: candidate.width, height: candidate.height };
    const expanded: RootState[] = [];
    for (const state of states) {
      const positions = rootPositions(state, anchor, candidate.width, candidate.height, opts.gutter);
      stats.rootRepairStatesExplored += positions.length;
      for (const bounds of positions) {
        const placements = [...state.placements, {
          root,
          candidate,
          bounds,
          anchor: previous ? previous : undefined,
        }];
        expanded.push({
          placements,
          key: rootStateKey(placements),
          signature: hashSignature([state.signature, root.input.id, String(bounds.x),
            String(bounds.y), candidate.signature]),
        });
      }
    }
    states = expanded.sort(compareRootState).slice(0, ROOT_REPAIR_BEAM);
    stats.maximumRootRepairBeam = Math.max(stats.maximumRootRepairBeam, states.length);
    appendX = Math.max(appendX, ...states[0].placements.map((placement) =>
      placement.bounds.x + placement.bounds.width + opts.gutter));
  }
  const best = states.sort(compareRootState)[0];
  const width = Math.max(0, ...best.placements.map((placement) =>
    placement.bounds.x + placement.bounds.width));
  const height = Math.max(0, ...best.placements.map((placement) =>
    placement.bounds.y + placement.bounds.height));
  const forestBlock: BlockCandidate = {
    width,
    height,
    placements: best.placements.map((placement) => ({
      child: placement.root,
      candidate: placement.candidate,
      bounds: placement.bounds,
    })),
    raggedness: 0,
    bandConsistency: 0,
    orphanPenalty: 0,
    grammar: 'preserved-root-beam',
    signature: best.signature,
  };
  const selected = withStabilityMetrics(shapeFromBlock(
    { id: '__gchrp2_preserved_root__', name: '' },
    forestBlock,
    opts,
    true,
  ), context, opts);
  const nodes: Record<string, Bounds> = {};
  const order: string[] = [];
  for (const placement of best.placements) {
    nodes[placement.root.input.id] = { ...placement.bounds };
    selectedNodeGrammars[placement.root.input.id] = placement.candidate.grammar;
    order.push(placement.root.input.id);
    flattenCandidate(
      placement.candidate,
      nodes,
      order,
      selectedGrammars,
      selectedNodeGrammars,
    );
  }
  return { nodes, order, selected };
}

export function layoutPackedFrontier(
  roots: readonly PackedTreeNode[],
  options: PackedTreeOptions,
  context: PackedLayoutContext = {},
): PackedTreeLayout {
  const opts = resolveOptions(options, context);
  const stats: SearchStats = {
    frontierNodeCount: 0,
    totalFrontierCandidates: 0,
    maximumFrontierSize: 0,
    candidateCompositionCount: 0,
    mixedFormCompositionCount: 0,
    intervalStateCount: 0,
    maximumIntervalFrontier: 0,
    intervalBaseAspectRegionCount: 0,
    geometryCandidatesBeforePruning: 0,
    geometryCandidatesAfterPruning: 0,
    qualityVariantsBeforePruning: 0,
    qualityVariantsAfterPruning: 0,
    largeNodeFallbackCount: 0,
    rootRepairStatesExplored: 0,
    maximumRootRepairBeam: 0,
    aspectRegionCounts: {},
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
      stats,
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
    revision: 'shape-function-3',
    searchStrategy: 'bounded-mixed-form',
    qualityModel: 'tiered-significance-weighted',
    frontierNodeCount: stats.frontierNodeCount,
    totalFrontierCandidates: stats.totalFrontierCandidates,
    averageFrontierSize: stats.frontierNodeCount > 0
      ? stats.totalFrontierCandidates / stats.frontierNodeCount
      : 0,
    maximumFrontierSize: stats.maximumFrontierSize,
    candidateCompositionCount: stats.candidateCompositionCount,
    mixedFormCompositionCount: stats.mixedFormCompositionCount,
    intervalStateCount: stats.intervalStateCount,
    maximumIntervalFrontier: stats.maximumIntervalFrontier,
    intervalBaseAspectRegionCount: stats.intervalBaseAspectRegionCount,
    geometryCandidatesBeforePruning: stats.geometryCandidatesBeforePruning,
    geometryCandidatesAfterPruning: stats.geometryCandidatesAfterPruning,
    qualityVariantsBeforePruning: stats.qualityVariantsBeforePruning,
    qualityVariantsAfterPruning: stats.qualityVariantsAfterPruning,
    largeNodeFallbackCount: stats.largeNodeFallbackCount,
    reducedGrammarNodeCount: stats.largeNodeFallbackCount,
    rootRepairStatesExplored: stats.rootRepairStatesExplored,
    maximumRootRepairBeam: stats.maximumRootRepairBeam,
    aspectRegionCounts: stats.aspectRegionCounts,
    selectedQualityTiers: {
      legibility: selected.quality.key[0],
      frameDefect: selected.quality.key[1],
      stability: selected.quality.key[2],
      rhythm: selected.quality.key[3],
      frame: selected.quality.key[4],
      compactness: selected.quality.key[5],
    },
    selectedMetrics: selected.metrics,
    selectedScore: selected.score,
    selectedGrammar: selected.grammar,
    selectedGrammarCounts: selectedGrammars,
    selectedNodeGrammars,
    grammarCandidateCounts: stats.grammarCandidateCounts,
  };
  return { nodes, size: { width, height }, semanticOrder, diagnostics };
}
