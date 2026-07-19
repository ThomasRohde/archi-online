import type { Bounds } from '../types';
import { compareStableText } from '../stable-order';

export type PackedTreeMode = 'grid' | 'treemap';
export type PackedTreeAlgorithm = 'auto' | 'squarify' | 'strip';
export type PackedTreeSort = 'name' | 'weight' | 'none';

export interface PackedTreeNode {
  id: string;
  name?: string;
  /** Treemap leaf weight; non-finite or <= 0 falls back to 1. */
  weight?: number;
  children?: readonly PackedTreeNode[];
}

/** Weights of the layout cost terms; see docs for the aesthetic model. */
export interface PackedAestheticWeights {
  aspect?: number;
  raggedness?: number;
  whitespace?: number;
}

export interface PackedTreeOptions {
  mode?: PackedTreeMode;
  /** Treemap tiling; 'auto' = squarify when sort is 'weight', else order-preserving strip. */
  algorithm?: PackedTreeAlgorithm;
  leafWidth?: number;
  leafHeight?: number;
  padding?: number;
  gutter?: number;
  /** Container label strip kept clear of children. */
  titleBandHeight?: number;
  /** Width/height goal for containers; deviation is penalized in log space. */
  targetAspect?: number;
  /** Sorting is a pre-step only — packing never permutes sibling order. */
  sort?: PackedTreeSort;
  /** Grid: fixed items per row, bypassing the balanced row search. */
  columns?: number;
  aesthetics?: PackedAestheticWeights;
  minCellWidth?: number;
  minCellHeight?: number;
}

export interface PackedTreeLayout {
  /** Bounds are parent-relative; root entries are relative to (0, 0). */
  nodes: Record<string, Bounds>;
  size: { width: number; height: number };
}

interface ResolvedOptions {
  mode: PackedTreeMode;
  algorithm: PackedTreeAlgorithm;
  leafWidth: number;
  leafHeight: number;
  padding: number;
  gutter: number;
  titleBandHeight: number;
  targetAspect: number;
  sort: PackedTreeSort;
  columns: number | null;
  weights: { aspect: number; raggedness: number; whitespace: number };
  minCellWidth: number;
  minCellHeight: number;
}

/** Above this sibling count the balanced row search falls back to a fixed-count scan. */
const BALANCED_ROWS_LIMIT = 100;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, finite(value, fallback)));
}

function resolveOptions(options: PackedTreeOptions | undefined): ResolvedOptions {
  const columns = finite(options?.columns, 0);
  return {
    mode: options?.mode === 'treemap' ? 'treemap' : 'grid',
    algorithm: options?.algorithm === 'squarify' || options?.algorithm === 'strip'
      ? options.algorithm
      : 'auto',
    leafWidth: clamp(options?.leafWidth, 120, 10, 2000),
    leafHeight: clamp(options?.leafHeight, 55, 10, 2000),
    padding: clamp(options?.padding, 12, 0, 200),
    gutter: clamp(options?.gutter, 12, 0, 200),
    titleBandHeight: clamp(options?.titleBandHeight, 30, 0, 200),
    targetAspect: clamp(options?.targetAspect, 1.6, 0.2, 8),
    sort: options?.sort === 'weight' || options?.sort === 'none' ? options.sort : 'name',
    columns: columns >= 1 ? Math.floor(columns) : null,
    weights: {
      aspect: clamp(options?.aesthetics?.aspect, 1, 0, 100),
      raggedness: clamp(options?.aesthetics?.raggedness, 0.5, 0, 100),
      whitespace: clamp(options?.aesthetics?.whitespace, 0.25, 0, 100),
    },
    minCellWidth: clamp(options?.minCellWidth, 60, 4, 2000),
    minCellHeight: clamp(options?.minCellHeight, 30, 4, 2000),
  };
}

interface MeasuredNode {
  node: PackedTreeNode;
  children: MeasuredNode[];
  /** Effective weight: leaf fallback-1 weight, or descendant sum for containers. */
  weight: number;
  width: number;
  height: number;
  /** Grid mode: row partition of `children`, computed once at measure time. */
  plan: RowPlan | null;
}

function effectiveLeafWeight(node: PackedTreeNode, opts: ResolvedOptions): number {
  const raw = finite(node.weight, 1);
  const weight = raw > 0 ? raw : 1;
  const minWeight = (opts.minCellWidth * opts.minCellHeight) / (opts.leafWidth * opts.leafHeight);
  return Math.max(weight, minWeight);
}

function sortSiblings(items: MeasuredNode[], opts: ResolvedOptions): MeasuredNode[] {
  if (opts.sort === 'none') return items;
  const sorted = [...items];
  if (opts.sort === 'weight') {
    sorted.sort((a, b) =>
      b.weight - a.weight ||
      compareStableText(a.node.name ?? '', b.node.name ?? '') ||
      compareStableText(a.node.id, b.node.id));
  } else {
    sorted.sort((a, b) =>
      compareStableText(a.node.name ?? '', b.node.name ?? '') ||
      compareStableText(a.node.id, b.node.id));
  }
  return sorted;
}

// --- Grid mode -------------------------------------------------------------

interface RowPlan {
  /** Sibling index ranges per row: rows[r] = [start, endExclusive]. */
  rows: Array<[number, number]>;
  extent: { width: number; height: number };
  cost: number;
}

function rowWidth(widths: readonly number[], start: number, end: number, gutter: number): number {
  let total = 0;
  for (let i = start; i < end; i++) total += widths[i];
  return total + (end - start - 1) * gutter;
}

function planFromRows(
  items: readonly MeasuredNode[],
  rows: Array<[number, number]>,
  opts: ResolvedOptions,
): RowPlan {
  let extentWidth = 0;
  let extentHeight = 0;
  const widths = items.map((item) => item.width);
  const rowWidths: number[] = [];
  for (const [start, end] of rows) {
    let height = 0;
    for (let i = start; i < end; i++) height = Math.max(height, items[i].height);
    const width = rowWidth(widths, start, end, opts.gutter);
    rowWidths.push(width);
    extentWidth = Math.max(extentWidth, width);
    extentHeight += height;
  }
  extentHeight += (rows.length - 1) * opts.gutter;
  const aspectDev = Math.abs(Math.log((extentWidth / extentHeight) / opts.targetAspect));
  let raggedness = 0;
  for (const width of rowWidths) {
    raggedness += ((extentWidth - width) / extentWidth) ** 2;
  }
  raggedness /= rows.length;
  let contentArea = 0;
  for (const item of items) contentArea += item.width * item.height;
  const whitespace = Math.max(0, 1 - contentArea / (extentWidth * extentHeight));
  const cost =
    opts.weights.aspect * aspectDev +
    opts.weights.raggedness * raggedness +
    opts.weights.whitespace * whitespace;
  return { rows, extent: { width: extentWidth, height: extentHeight }, cost };
}

function fixedCountRows(count: number, total: number): Array<[number, number]> {
  const rows: Array<[number, number]> = [];
  for (let start = 0; start < total; start += count) {
    rows.push([start, Math.min(start + count, total)]);
  }
  return rows;
}

/**
 * Partition the ordered items into rows whose widths stay within `budget`,
 * minimizing the squared slack per row (optimal line breaking). A single item
 * may exceed the budget (unavoidable overflow row).
 */
function balancedRowsForBudget(
  items: readonly MeasuredNode[],
  budget: number,
  gutter: number,
): Array<[number, number]> {
  const n = items.length;
  const widths = items.map((item) => item.width);
  const best = new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY);
  const breakAt = new Array<number>(n + 1).fill(-1);
  best[n] = 0;
  for (let start = n - 1; start >= 0; start--) {
    let width = 0;
    for (let end = start + 1; end <= n; end++) {
      width += widths[end - 1];
      if (end > start + 1) width += gutter;
      if (width > budget && end > start + 1) break;
      const slack = budget - width;
      const cost = slack * slack + best[end];
      // <= so equal-cost partitions prefer longer early rows (top-heavy reads better).
      if (cost <= best[start]) {
        best[start] = cost;
        breakAt[start] = end;
      }
    }
  }
  const rows: Array<[number, number]> = [];
  for (let start = 0; start < n; start = breakAt[start]) {
    rows.push([start, breakAt[start]]);
  }
  return rows;
}

function bestRowPlan(items: readonly MeasuredNode[], opts: ResolvedOptions): RowPlan {
  const n = items.length;
  if (opts.columns !== null) {
    return planFromRows(items, fixedCountRows(opts.columns, n), opts);
  }
  let best: RowPlan | null = null;
  const consider = (candidate: RowPlan) => {
    if (
      best === null ||
      candidate.cost < best.cost ||
      (candidate.cost === best.cost && candidate.rows.length < best.rows.length)
    ) {
      best = candidate;
    }
  };
  if (n > BALANCED_ROWS_LIMIT) {
    for (let count = 1; count <= n; count++) {
      consider(planFromRows(items, fixedCountRows(count, n), opts));
    }
    return best!;
  }
  const widths = items.map((item) => item.width);
  const budgets = new Set<number>();
  let prefix = 0;
  for (let i = 0; i < n; i++) {
    prefix += widths[i] + (i > 0 ? opts.gutter : 0);
    budgets.add(prefix);
  }
  for (const budget of [...budgets].sort((a, b) => a - b)) {
    consider(planFromRows(items, balancedRowsForBudget(items, budget, opts.gutter), opts));
  }
  return best!;
}

function measureGrid(node: PackedTreeNode, opts: ResolvedOptions): MeasuredNode {
  const childNodes = node.children ?? [];
  if (childNodes.length === 0) {
    return {
      node,
      children: [],
      weight: effectiveLeafWeight(node, opts),
      width: opts.leafWidth,
      height: opts.leafHeight,
      plan: null,
    };
  }
  const children = sortSiblings(childNodes.map((child) => measureGrid(child, opts)), opts);
  const plan = bestRowPlan(children, opts);
  return {
    node,
    children,
    weight: children.reduce((sum, child) => sum + child.weight, 0),
    width: plan.extent.width + 2 * opts.padding,
    height: plan.extent.height + opts.titleBandHeight + opts.padding,
    plan,
  };
}

function placeGridChildren(
  parent: MeasuredNode,
  origin: { x: number; y: number },
  opts: ResolvedOptions,
  out: Record<string, Bounds>,
): void {
  if (parent.plan === null) return;
  let y = origin.y;
  for (const [start, end] of parent.plan.rows) {
    let x = origin.x;
    let rowHeight = 0;
    for (let i = start; i < end; i++) {
      const child = parent.children[i];
      out[child.node.id] = { x, y, width: child.width, height: child.height };
      placeGridChildren(child, { x: opts.padding, y: opts.titleBandHeight }, opts, out);
      x += child.width + opts.gutter;
      rowHeight = Math.max(rowHeight, child.height);
    }
    y += rowHeight + opts.gutter;
  }
}

function layoutGrid(roots: readonly PackedTreeNode[], opts: ResolvedOptions): PackedTreeLayout {
  const measured = sortSiblings(roots.map((root) => measureGrid(root, opts)), opts);
  const plan = bestRowPlan(measured, opts);
  const virtualRoot: MeasuredNode = {
    node: { id: '' },
    children: measured,
    weight: 0,
    width: plan.extent.width,
    height: plan.extent.height,
    plan,
  };
  const nodes: Record<string, Bounds> = {};
  placeGridChildren(virtualRoot, { x: 0, y: 0 }, opts, nodes);
  return { nodes, size: { width: plan.extent.width, height: plan.extent.height } };
}

// --- Treemap mode ----------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function measureTreemap(node: PackedTreeNode, opts: ResolvedOptions): MeasuredNode {
  const childNodes = node.children ?? [];
  if (childNodes.length === 0) {
    return {
      node,
      children: [],
      weight: effectiveLeafWeight(node, opts),
      width: 0,
      height: 0,
      plan: null,
    };
  }
  const children = sortSiblings(childNodes.map((child) => measureTreemap(child, opts)), opts);
  return {
    node,
    children,
    weight: children.reduce((sum, child) => sum + child.weight, 0),
    width: 0,
    height: 0,
    plan: null,
  };
}

function worstAspect(weights: readonly number[], side: number, scale: number): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const thickness = (total * scale) / side;
  let worst = 0;
  for (const weight of weights) {
    const length = (weight * scale) / thickness;
    worst = Math.max(worst, length / thickness, thickness / length);
  }
  return worst;
}

/**
 * Squarified tiling (Bruls et al. 2000) processing items in the given order —
 * order is never permuted here; callers control it via the sort pre-step.
 */
function squarifyRects(items: readonly MeasuredNode[], rect: Rect): Rect[] {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const scale = (rect.width * rect.height) / total;
  const rects: Rect[] = new Array(items.length);
  let remaining: Rect = { ...rect };
  let index = 0;
  while (index < items.length) {
    const side = Math.min(remaining.width, remaining.height);
    const row: number[] = [items[index].weight];
    let end = index + 1;
    while (end < items.length) {
      const candidate = [...row, items[end].weight];
      if (worstAspect(candidate, side, scale) > worstAspect(row, side, scale)) break;
      row.push(items[end].weight);
      end++;
    }
    const rowTotal = row.reduce((sum, weight) => sum + weight, 0);
    const thickness = (rowTotal * scale) / side;
    const horizontal = remaining.width >= remaining.height;
    let offset = 0;
    for (let i = index; i < end; i++) {
      const length = (items[i].weight * scale) / thickness;
      rects[i] = horizontal
        ? { x: remaining.x, y: remaining.y + offset, width: thickness, height: length }
        : { x: remaining.x + offset, y: remaining.y, width: length, height: thickness };
      offset += length;
    }
    remaining = horizontal
      ? {
        x: remaining.x + thickness,
        y: remaining.y,
        width: remaining.width - thickness,
        height: remaining.height,
      }
      : {
        x: remaining.x,
        y: remaining.y + thickness,
        width: remaining.width,
        height: remaining.height - thickness,
      };
    index = end;
  }
  return rects;
}

/**
 * Strip tiling (Bederson et al. 2002): horizontal strips in sibling order —
 * the best readability/aspect trade-off for ordered data.
 */
function stripRects(items: readonly MeasuredNode[], rect: Rect): Rect[] {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const scale = (rect.width * rect.height) / total;
  const averageDistortion = (weights: readonly number[]): number => {
    const stripTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const height = (stripTotal * scale) / rect.width;
    let sum = 0;
    for (const weight of weights) {
      const width = (weight * scale) / height;
      sum += Math.max(width / height, height / width);
    }
    return sum / weights.length;
  };
  const rects: Rect[] = new Array(items.length);
  let index = 0;
  let y = rect.y;
  while (index < items.length) {
    const strip: number[] = [items[index].weight];
    let end = index + 1;
    while (end < items.length) {
      const candidate = [...strip, items[end].weight];
      if (averageDistortion(candidate) > averageDistortion(strip)) break;
      strip.push(items[end].weight);
      end++;
    }
    const stripTotal = strip.reduce((sum, weight) => sum + weight, 0);
    const height = (stripTotal * scale) / rect.width;
    let x = rect.x;
    for (let i = index; i < end; i++) {
      const width = (items[i].weight * scale) / height;
      rects[i] = { x, y, width, height };
      x += width;
    }
    y += height;
    index = end;
  }
  return rects;
}

function shrinkForGutter(rect: Rect, amount: number, minWidth: number, minHeight: number): Rect {
  const dx = Math.min(amount, Math.max(0, (rect.width - minWidth) / 2));
  const dy = Math.min(amount, Math.max(0, (rect.height - minHeight) / 2));
  return {
    x: rect.x + dx,
    y: rect.y + dy,
    width: rect.width - 2 * dx,
    height: rect.height - 2 * dy,
  };
}

function roundRect(rect: Rect): Rect {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  return {
    x,
    y,
    width: Math.round(rect.x + rect.width) - x,
    height: Math.round(rect.y + rect.height) - y,
  };
}

function placeTreemapChildren(
  parent: MeasuredNode,
  contentRect: Rect,
  parentOrigin: { x: number; y: number },
  opts: ResolvedOptions,
  useSquarify: boolean,
  out: Record<string, Bounds>,
): void {
  const raw = useSquarify
    ? squarifyRects(parent.children, contentRect)
    : stripRects(parent.children, contentRect);
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const cell = roundRect(
      shrinkForGutter(raw[i], opts.gutter / 2, opts.minCellWidth, opts.minCellHeight),
    );
    out[child.node.id] = {
      x: cell.x - parentOrigin.x,
      y: cell.y - parentOrigin.y,
      width: cell.width,
      height: cell.height,
    };
    if (child.children.length > 0) {
      const inner: Rect = {
        x: cell.x + opts.padding,
        y: cell.y + opts.titleBandHeight,
        width: Math.max(1, cell.width - 2 * opts.padding),
        height: Math.max(1, cell.height - opts.titleBandHeight - opts.padding),
      };
      placeTreemapChildren(child, inner, { x: cell.x, y: cell.y }, opts, useSquarify, out);
    }
  }
}

function layoutTreemap(roots: readonly PackedTreeNode[], opts: ResolvedOptions): PackedTreeLayout {
  const measured = sortSiblings(roots.map((root) => measureTreemap(root, opts)), opts);
  const totalWeight = measured.reduce((sum, item) => sum + item.weight, 0);
  const area = totalWeight * opts.leafWidth * opts.leafHeight;
  const width = Math.round(Math.sqrt(area * opts.targetAspect));
  const height = Math.round(area / width);
  const useSquarify = opts.algorithm === 'squarify' ||
    (opts.algorithm === 'auto' && opts.sort === 'weight');
  const virtualRoot: MeasuredNode = {
    node: { id: '' },
    children: measured,
    weight: totalWeight,
    width,
    height,
    plan: null,
  };
  const nodes: Record<string, Bounds> = {};
  placeTreemapChildren(
    virtualRoot,
    { x: 0, y: 0, width, height },
    { x: 0, y: 0 },
    opts,
    useSquarify,
    nodes,
  );
  return { nodes, size: { width, height } };
}

// --- Entry point -----------------------------------------------------------

function assertUniqueIds(roots: readonly PackedTreeNode[]): void {
  const seen = new Set<string>();
  const visit = (node: PackedTreeNode) => {
    if (seen.has(node.id)) throw new Error(`Duplicate packed-tree node id: ${node.id}`);
    seen.add(node.id);
    for (const child of node.children ?? []) visit(child);
  };
  for (const root of roots) visit(root);
}

/**
 * Lay out a tree of nested rectangles. Grid mode tiles uniform leaf cells into
 * balanced rows (containers grow to fit); treemap mode sizes leaves by weight.
 * Deterministic: identical input yields identical output.
 */
export function layoutPackedTree(
  roots: readonly PackedTreeNode[],
  options?: PackedTreeOptions,
): PackedTreeLayout {
  if (roots.length === 0) return { nodes: {}, size: { width: 0, height: 0 } };
  assertUniqueIds(roots);
  const opts = resolveOptions(options);
  return opts.mode === 'treemap' ? layoutTreemap(roots, opts) : layoutGrid(roots, opts);
}
