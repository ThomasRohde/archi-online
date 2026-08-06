import { compareStableText } from '../stable-order';
import type { Bounds } from '../types';

export interface PackedLayoutMetrics {
  area: number;
  aspectDeviation: number;
  raggedness: number;
  /** Normalised variation in ordinary shelf row heights or column widths. */
  bandConsistency: number;
  whitespace: number;
  orphanPenalty: number;
  alignmentComplexity: number;
  movement: number;
  neighborhoodChange: number;
  /** Fraction of surviving siblings that changed major row/column membership. */
  bandChange: number;
  /** Fraction of surviving siblings that changed coarse parent-relative region. */
  regionChange: number;
  viewportOverflow: number;
}

export interface ResolvedPackedAestheticWeights {
  aspect: number;
  raggedness: number;
  whitespace: number;
  orphan: number;
  alignment: number;
  movement: number;
  neighborhood: number;
  overflow: number;
}

export interface PackedMetricPlacement {
  id: string;
  bounds: Bounds;
}

export interface PackedMetricTreeNode {
  id: string;
  children?: readonly PackedMetricTreeNode[];
}

interface BandMeasurement {
  axis: 'row' | 'column';
  bands: PackedMetricPlacement[][];
  raggedness: number;
  orphanPenalty: number;
  consistency: number;
}

function mergedGuideCount(values: readonly number[], tolerance = 2): number {
  const sorted = [...values].sort((a, b) => a - b);
  let count = 0;
  let previous = Number.NEGATIVE_INFINITY;
  for (const value of sorted) {
    if (value - previous > tolerance) {
      count++;
      previous = value;
    }
  }
  return count;
}

function coefficientOfVariation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Cluster sibling rectangles into major rows or columns. Layout coordinates
 * are integral, but a two-pixel tolerance also makes evidence robust to
 * rounded imports and avoids exact-floating-coordinate band detection.
 */
function clusterBands(
  placements: readonly PackedMetricPlacement[],
  axis: 'row' | 'column',
  tolerance = 2,
): PackedMetricPlacement[][] {
  const coordinate = (placement: PackedMetricPlacement) =>
    axis === 'row' ? placement.bounds.y : placement.bounds.x;
  const secondary = (placement: PackedMetricPlacement) =>
    axis === 'row' ? placement.bounds.x : placement.bounds.y;
  const sorted = [...placements].sort((a, b) =>
    coordinate(a) - coordinate(b) || secondary(a) - secondary(b) ||
    compareStableText(a.id, b.id));
  const bands: PackedMetricPlacement[][] = [];
  const anchors: number[] = [];
  for (const placement of sorted) {
    const value = coordinate(placement);
    let index = anchors.findIndex((anchor) => Math.abs(anchor - value) <= tolerance);
    if (index < 0) {
      index = bands.length;
      bands.push([]);
      anchors.push(value);
    }
    bands[index].push(placement);
  }
  for (const band of bands) {
    band.sort((a, b) => secondary(a) - secondary(b) || compareStableText(a.id, b.id));
  }
  return bands;
}

function measureOrientation(
  placements: readonly PackedMetricPlacement[],
  axis: 'row' | 'column',
): BandMeasurement {
  if (placements.length < 2) {
    return { axis, bands: placements.length ? [[...placements]] : [], raggedness: 0,
      orphanPenalty: 0, consistency: 0 };
  }
  const bands = clusterBands(placements, axis);
  const ends = bands.map((band) => Math.max(...band.map(({ bounds }) =>
    axis === 'row' ? bounds.x + bounds.width : bounds.y + bounds.height)));
  const starts = bands.map((band) => Math.min(...band.map(({ bounds }) =>
    axis === 'row' ? bounds.x : bounds.y)));
  const extents = ends.map((end, index) => end - starts[index]);
  const maximum = Math.max(1, ...extents);
  const raggedness = extents.reduce((sum, extent) =>
    sum + ((maximum - extent) / maximum) ** 2, 0) / Math.max(1, extents.length);
  const crossSizes = bands.map((band) => Math.max(...band.map(({ bounds }) =>
    axis === 'row' ? bounds.height : bounds.width)));
  return {
    axis,
    bands,
    raggedness,
    orphanPenalty: bands.length > 1 && bands.at(-1)?.length === 1 ? 1 : 0,
    consistency: coefficientOfVariation(crossSizes),
  };
}

function preferredBands(placements: readonly PackedMetricPlacement[]): BandMeasurement {
  const rows = measureOrientation(placements, 'row');
  const columns = measureOrientation(placements, 'column');
  const cost = (measurement: BandMeasurement) =>
    measurement.raggedness + measurement.orphanPenalty + measurement.consistency;
  return cost(rows) <= cost(columns) ? rows : columns;
}

/** Evidence/test helper for obvious good/bad rhythm examples. */
export function measurePackedBandMetrics(
  placements: readonly PackedMetricPlacement[],
  axis?: 'row' | 'column',
): { axis: 'row' | 'column'; raggedness: number; orphanPenalty: number; bandConsistency: number } {
  const measurement = axis ? measureOrientation(placements, axis) : preferredBands(placements);
  return {
    axis: measurement.axis,
    raggedness: measurement.raggedness,
    orphanPenalty: measurement.orphanPenalty,
    bandConsistency: measurement.consistency,
  };
}

function readingOrder(placements: readonly PackedMetricPlacement[]): string[] {
  return [...placements].sort((a, b) =>
    a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x || compareStableText(a.id, b.id))
    .map((placement) => placement.id);
}

function neighborPairs(order: readonly string[]): Set<string> {
  const pairs = new Set<string>();
  for (let index = 1; index < order.length; index++) {
    const pair = [order[index - 1], order[index]].sort(compareStableText);
    pairs.add(`${pair[0]}\u0000${pair[1]}`);
  }
  return pairs;
}

function neighborLoss(current: readonly string[], previous: readonly string[]): number {
  if (previous.length < 2) return 0;
  const currentPairs = neighborPairs(current);
  const previousPairs = neighborPairs(previous);
  let lost = 0;
  for (const pair of previousPairs) if (!currentPairs.has(pair)) lost++;
  return previousPairs.size > 0 ? lost / previousPairs.size : 0;
}

function boundsPlacements(
  ids: readonly string[],
  bounds: Readonly<Record<string, Bounds>>,
): PackedMetricPlacement[] {
  return ids.flatMap((id) => bounds[id] ? [{ id, bounds: bounds[id] }] : []);
}

function bandMembership(
  placements: readonly PackedMetricPlacement[],
  axis: 'row' | 'column',
): Map<string, number> {
  const bands = clusterBands(placements, axis);
  const divisor = Math.max(1, bands.length - 1);
  return new Map(bands.flatMap((band, index) =>
    band.map((placement) => [placement.id, index / divisor] as const)));
}

function bandMembershipChange(
  current: readonly PackedMetricPlacement[],
  previous: readonly PackedMetricPlacement[],
): number {
  if (current.length < 2 || previous.length < 2) return 0;
  const currentBands = preferredBands(current);
  const previousBands = preferredBands(previous);
  if (currentBands.axis !== previousBands.axis) return 1;
  const currentMembership = bandMembership(current, currentBands.axis);
  const previousMembership = bandMembership(previous, previousBands.axis);
  let changed = 0;
  let surviving = 0;
  for (const [id, before] of previousMembership) {
    const after = currentMembership.get(id);
    if (after === undefined) continue;
    if (Math.abs(after - before) > 0.34) changed++;
    surviving++;
  }
  return surviving > 0 ? changed / surviving : 0;
}

function extent(placements: readonly PackedMetricPlacement[]): { width: number; height: number } {
  return {
    width: Math.max(1, ...placements.map(({ bounds }) => bounds.x + bounds.width)),
    height: Math.max(1, ...placements.map(({ bounds }) => bounds.y + bounds.height)),
  };
}

function region(bounds: Bounds, parent: { width: number; height: number }): number {
  const column = Math.min(2, Math.max(0, Math.floor(
    ((bounds.x + bounds.width / 2) / Math.max(1, parent.width)) * 3,
  )));
  const row = Math.min(2, Math.max(0, Math.floor(
    ((bounds.y + bounds.height / 2) / Math.max(1, parent.height)) * 3,
  )));
  return row * 3 + column;
}

function regionChange(
  current: readonly PackedMetricPlacement[],
  previous: readonly PackedMetricPlacement[],
  currentExtent: { width: number; height: number },
): number {
  if (previous.length === 0) return 0;
  const previousExtent = extent(previous);
  const currentById = new Map(current.map((placement) => [placement.id, placement.bounds]));
  let changed = 0;
  let surviving = 0;
  for (const placement of previous) {
    const next = currentById.get(placement.id);
    if (!next) continue;
    if (region(placement.bounds, previousExtent) !== region(next, currentExtent)) changed++;
    surviving++;
  }
  return surviving > 0 ? changed / surviving : 0;
}

export function measurePackedMetrics(input: {
  width: number;
  height: number;
  targetAspect: number;
  placements: readonly PackedMetricPlacement[];
  contentArea: number;
  raggedness?: number;
  orphanPenalty?: number;
  bandConsistency?: number;
  previousBounds?: Readonly<Record<string, Bounds>>;
  targetExtent?: { width: number; height: number };
}): PackedLayoutMetrics {
  const area = Math.max(1, input.width * input.height);
  const aspect = input.width / Math.max(1, input.height);
  const verticalGuides = input.placements.flatMap(({ bounds }) =>
    [bounds.x, bounds.x + bounds.width]);
  const horizontalGuides = input.placements.flatMap(({ bounds }) =>
    [bounds.y, bounds.y + bounds.height]);
  const guideCount = mergedGuideCount(verticalGuides) + mergedGuideCount(horizontalGuides);
  const alignmentComplexity = input.placements.length > 0
    ? guideCount / (input.placements.length * 2)
    : 0;
  const measuredBands = preferredBands(input.placements);
  const ids = input.placements.map((placement) => placement.id);
  const previousPlacements = input.previousBounds
    ? boundsPlacements(ids, input.previousBounds)
    : [];
  let movement = 0;
  let surviving = 0;
  if (input.previousBounds) {
    for (const placement of input.placements) {
      const previous = input.previousBounds[placement.id];
      if (!previous) continue;
      const scale = Math.max(1, Math.hypot(previous.width, previous.height));
      movement += (
        Math.hypot(placement.bounds.x - previous.x, placement.bounds.y - previous.y) +
        0.5 * Math.abs(placement.bounds.width - previous.width) +
        0.5 * Math.abs(placement.bounds.height - previous.height)
      ) / scale;
      surviving++;
    }
  }
  if (surviving > 0) movement /= surviving;
  const target = input.targetExtent;
  const targetWidth = target && Number.isFinite(target.width) && target.width > 0
    ? target.width
    : undefined;
  const targetHeight = target && Number.isFinite(target.height) && target.height > 0
    ? target.height
    : undefined;
  const overflowArea = targetWidth && targetHeight
    ? Math.max(0, input.width - targetWidth) * input.height +
      Math.max(0, input.height - targetHeight) * Math.min(input.width, targetWidth)
    : 0;
  return {
    area,
    aspectDeviation: Math.abs(Math.log(Math.max(0.0001, aspect / input.targetAspect))),
    raggedness: Math.max(0, input.raggedness ?? measuredBands.raggedness),
    bandConsistency: Math.max(0, input.bandConsistency ?? measuredBands.consistency),
    whitespace: Math.max(0, 1 - input.contentArea / area),
    orphanPenalty: Math.max(0, input.orphanPenalty ?? measuredBands.orphanPenalty),
    alignmentComplexity,
    movement,
    neighborhoodChange: neighborLoss(readingOrder(input.placements),
      readingOrder(previousPlacements)),
    bandChange: bandMembershipChange(input.placements, previousPlacements),
    regionChange: regionChange(input.placements, previousPlacements, {
      width: input.width,
      height: input.height,
    }),
    viewportOverflow: overflowArea / area,
  };
}

/**
 * Compatibility scalar for diagnostics and within-tier weighting. Candidate
 * selection in the frontier uses a lexicographic quality key instead.
 */
export function scorePackedMetrics(
  metrics: PackedLayoutMetrics,
  weights: ResolvedPackedAestheticWeights,
): number {
  return weights.aspect * metrics.aspectDeviation +
    weights.raggedness * (metrics.raggedness + metrics.bandConsistency) +
    weights.whitespace * metrics.whitespace +
    weights.orphan * metrics.orphanPenalty +
    weights.alignment * metrics.alignmentComplexity +
    weights.movement * (metrics.movement + metrics.bandChange + metrics.regionChange) +
    weights.neighborhood * metrics.neighborhoodChange +
    weights.overflow * metrics.viewportOverflow;
}

interface MetricGroup {
  metrics: PackedLayoutMetrics;
  nodeWeight: number;
  areaWeight: number;
}

/** Pure algorithm-comparison diagnostics over final parent-relative bounds. */
export function evaluatePackedTreeLayout(input: {
  roots: readonly PackedMetricTreeNode[];
  nodes: Readonly<Record<string, Bounds>>;
  size: { width: number; height: number };
  targetAspect?: number;
  previousBounds?: Readonly<Record<string, Bounds>>;
}): PackedLayoutMetrics {
  const groups: MetricGroup[] = [];
  const visit = (
    parent: PackedMetricTreeNode | undefined,
    children: readonly PackedMetricTreeNode[],
  ): number => {
    if (children.length === 0) return 0;
    const placements = children.map((child) => ({ id: child.id, bounds: input.nodes[child.id] }));
    const width = parent ? input.nodes[parent.id].width : input.size.width;
    const height = parent ? input.nodes[parent.id].height : input.size.height;
    const bands = preferredBands(placements);
    const descendantCounts = children.map((child) => 1 + visit(child, child.children ?? []));
    const nodeWeight = descendantCounts.reduce((sum, count) => sum + count, 0);
    const areaWeight = Math.max(1, placements.reduce((sum, placement) =>
      sum + placement.bounds.width * placement.bounds.height, 0));
    groups.push({
      metrics: measurePackedMetrics({
        width,
        height,
        targetAspect: input.targetAspect ?? 1.6,
        placements,
        contentArea: areaWeight,
        raggedness: bands.raggedness,
        orphanPenalty: bands.orphanPenalty,
        bandConsistency: bands.consistency,
        previousBounds: input.previousBounds,
      }),
      nodeWeight: Math.max(1, nodeWeight),
      areaWeight,
    });
    return nodeWeight;
  };
  visit(undefined, input.roots);
  const weighted = (key: keyof PackedLayoutMetrics, weight: 'nodeWeight' | 'areaWeight') => {
    const divisor = groups.reduce((sum, group) => sum + group[weight], 0);
    return divisor > 0
      ? groups.reduce((sum, group) => sum + group.metrics[key] * group[weight], 0) / divisor
      : 0;
  };
  return {
    area: input.size.width * input.size.height,
    aspectDeviation: Math.abs(Math.log(
      (input.size.width / Math.max(1, input.size.height)) / (input.targetAspect ?? 1.6),
    )),
    raggedness: weighted('raggedness', 'areaWeight'),
    bandConsistency: weighted('bandConsistency', 'areaWeight'),
    whitespace: weighted('whitespace', 'areaWeight'),
    orphanPenalty: groups.reduce((maximum, group) =>
      Math.max(maximum, group.metrics.orphanPenalty), 0),
    alignmentComplexity: weighted('alignmentComplexity', 'areaWeight'),
    movement: weighted('movement', 'nodeWeight'),
    neighborhoodChange: weighted('neighborhoodChange', 'nodeWeight'),
    bandChange: weighted('bandChange', 'nodeWeight'),
    regionChange: weighted('regionChange', 'nodeWeight'),
    viewportOverflow: weighted('viewportOverflow', 'areaWeight'),
  };
}
