import type { Bounds } from '../types';

export interface PackedLayoutMetrics {
  area: number;
  aspectDeviation: number;
  raggedness: number;
  whitespace: number;
  orphanPenalty: number;
  alignmentComplexity: number;
  movement: number;
  neighborhoodChange: number;
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

function previousReadingOrder(
  ids: readonly string[],
  previous: Readonly<Record<string, Bounds>>,
): string[] {
  return ids.filter((id) => previous[id]).sort((a, b) =>
    previous[a].y - previous[b].y || previous[a].x - previous[b].x || a.localeCompare(b));
}

function neighborLoss(current: readonly string[], previous: readonly string[]): number {
  if (previous.length < 2) return 0;
  const currentPairs = new Set<string>();
  for (let index = 1; index < current.length; index++) {
    currentPairs.add(`${current[index - 1]}\u0000${current[index]}`);
  }
  let lost = 0;
  for (let index = 1; index < previous.length; index++) {
    if (!currentPairs.has(`${previous[index - 1]}\u0000${previous[index]}`)) lost++;
  }
  return lost / (previous.length - 1);
}

export function measurePackedMetrics(input: {
  width: number;
  height: number;
  targetAspect: number;
  placements: readonly PackedMetricPlacement[];
  contentArea: number;
  raggedness?: number;
  orphanPenalty?: number;
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
  const ids = input.placements.map((placement) => placement.id);
  const currentOrder = [...input.placements].sort((a, b) =>
    a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x || a.id.localeCompare(b.id))
    .map((placement) => placement.id);
  const previousOrder = input.previousBounds
    ? previousReadingOrder(ids, input.previousBounds)
    : [];
  const target = input.targetExtent;
  const overflowArea = target
    ? Math.max(0, input.width - target.width) * input.height +
      Math.max(0, input.height - target.height) * Math.min(input.width, target.width)
    : 0;
  return {
    area,
    aspectDeviation: Math.abs(Math.log(Math.max(0.0001, aspect / input.targetAspect))),
    raggedness: Math.max(0, input.raggedness ?? 0),
    whitespace: Math.max(0, 1 - input.contentArea / area),
    orphanPenalty: Math.max(0, input.orphanPenalty ?? 0),
    alignmentComplexity,
    movement,
    neighborhoodChange: neighborLoss(currentOrder, previousOrder),
    viewportOverflow: overflowArea / area,
  };
}

export function scorePackedMetrics(
  metrics: PackedLayoutMetrics,
  weights: ResolvedPackedAestheticWeights,
): number {
  return weights.aspect * metrics.aspectDeviation +
    weights.raggedness * metrics.raggedness +
    weights.whitespace * metrics.whitespace +
    weights.orphan * metrics.orphanPenalty +
    weights.alignment * metrics.alignmentComplexity +
    weights.movement * metrics.movement +
    weights.neighborhood * metrics.neighborhoodChange +
    weights.overflow * metrics.viewportOverflow;
}

function bandTerms(placements: readonly PackedMetricPlacement[]): {
  raggedness: number;
  orphanPenalty: number;
} {
  if (placements.length < 2) return { raggedness: 0, orphanPenalty: 0 };
  const terms = (axis: 'x' | 'y') => {
    const bands = new Map<number, PackedMetricPlacement[]>();
    for (const placement of placements) {
      const key = placement.bounds[axis];
      const band = bands.get(key) ?? [];
      band.push(placement);
      bands.set(key, band);
    }
    const ends = [...bands.values()].map((band) => Math.max(...band.map(({ bounds }) =>
      axis === 'y' ? bounds.x + bounds.width : bounds.y + bounds.height)));
    const maximum = Math.max(...ends);
    const raggedness = ends.reduce((sum, end) =>
      sum + ((maximum - end) / Math.max(1, maximum)) ** 2, 0) / ends.length;
    const orphanPenalty = bands.size > 1 && [...bands.values()].at(-1)?.length === 1 ? 1 : 0;
    return { raggedness, orphanPenalty };
  };
  const rows = terms('y');
  const columns = terms('x');
  return rows.raggedness + rows.orphanPenalty <= columns.raggedness + columns.orphanPenalty
    ? rows
    : columns;
}

/** Pure algorithm-comparison diagnostics over final parent-relative bounds. */
export function evaluatePackedTreeLayout(input: {
  roots: readonly PackedMetricTreeNode[];
  nodes: Readonly<Record<string, Bounds>>;
  size: { width: number; height: number };
  targetAspect?: number;
  previousBounds?: Readonly<Record<string, Bounds>>;
}): PackedLayoutMetrics {
  const groups: PackedLayoutMetrics[] = [];
  const visit = (
    parent: PackedMetricTreeNode | undefined,
    children: readonly PackedMetricTreeNode[],
  ) => {
    if (children.length === 0) return;
    const placements = children.map((child) => ({ id: child.id, bounds: input.nodes[child.id] }));
    const width = parent ? input.nodes[parent.id].width : input.size.width;
    const height = parent ? input.nodes[parent.id].height : input.size.height;
    const bands = bandTerms(placements);
    groups.push(measurePackedMetrics({
      width,
      height,
      targetAspect: input.targetAspect ?? 1.6,
      placements,
      contentArea: placements.reduce((sum, placement) =>
        sum + placement.bounds.width * placement.bounds.height, 0),
      raggedness: bands.raggedness,
      orphanPenalty: bands.orphanPenalty,
      previousBounds: input.previousBounds,
    }));
    for (const child of children) visit(child, child.children ?? []);
  };
  visit(undefined, input.roots);
  const divisor = Math.max(1, groups.length);
  const average = (key: Exclude<keyof PackedLayoutMetrics, 'area'>) =>
    groups.reduce((sum, metrics) => sum + metrics[key], 0) / divisor;
  return {
    area: input.size.width * input.size.height,
    aspectDeviation: Math.abs(Math.log(
      (input.size.width / Math.max(1, input.size.height)) / (input.targetAspect ?? 1.6),
    )),
    raggedness: average('raggedness'),
    whitespace: average('whitespace'),
    orphanPenalty: average('orphanPenalty'),
    alignmentComplexity: average('alignmentComplexity'),
    movement: average('movement'),
    neighborhoodChange: average('neighborhoodChange'),
    viewportOverflow: average('viewportOverflow'),
  };
}
