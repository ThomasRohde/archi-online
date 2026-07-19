import { describe, expect, it } from 'vitest';
import {
  layoutPackedTree,
  type PackedTreeLayout,
  type PackedTreeNode,
  type PackedTreeOptions,
} from '../src/model/layout/packed-tree';
import type { Bounds } from '../src/model/types';

const DEFAULTS = {
  leafWidth: 120,
  leafHeight: 55,
  padding: 12,
  gutter: 12,
  titleBandHeight: 30,
};

function leaf(id: string, weight?: number): PackedTreeNode {
  return { id, name: id, ...(weight !== undefined ? { weight } : {}) };
}

function container(id: string, children: PackedTreeNode[]): PackedTreeNode {
  return { id, name: id, children };
}

function uniformLeaves(count: number, prefix = 'leaf'): PackedTreeNode[] {
  return Array.from({ length: count }, (_, i) =>
    leaf(`${prefix}-${String(i).padStart(2, '0')}`));
}

/** Every parent/child pair in the input tree, plus per-parent sibling groups. */
function relationships(roots: readonly PackedTreeNode[]) {
  const pairs: Array<{ parent: PackedTreeNode; children: readonly PackedTreeNode[] }> = [];
  const visit = (node: PackedTreeNode) => {
    if (node.children && node.children.length > 0) {
      pairs.push({ parent: node, children: node.children });
      node.children.forEach(visit);
    }
  };
  roots.forEach(visit);
  return pairs;
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width &&
    a.y < b.y + b.height && b.y < a.y + a.height;
}

function assertInvariants(
  roots: readonly PackedTreeNode[],
  layout: PackedTreeLayout,
  options: PackedTreeOptions = {},
  tolerance = 0,
): void {
  const padding = options.padding ?? DEFAULTS.padding;
  const titleBand = options.titleBandHeight ?? DEFAULTS.titleBandHeight;
  for (const { parent, children } of relationships(roots)) {
    const parentBounds = layout.nodes[parent.id];
    const childBounds = children.map((child) => layout.nodes[child.id]);
    for (const bounds of childBounds) {
      expect(bounds.x).toBeGreaterThanOrEqual(padding - tolerance);
      expect(bounds.y).toBeGreaterThanOrEqual(titleBand - tolerance);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(
        parentBounds.width - padding + tolerance,
      );
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        parentBounds.height - padding + tolerance,
      );
    }
    for (let i = 0; i < childBounds.length; i++) {
      for (let j = i + 1; j < childBounds.length; j++) {
        expect(overlaps(childBounds[i], childBounds[j])).toBe(false);
      }
    }
  }
}

/** Grid rows of a sibling group, read top-to-bottom then left-to-right. */
function readingOrder(ids: readonly string[], layout: PackedTreeLayout): string[] {
  return [...ids].sort((a, b) =>
    layout.nodes[a].y - layout.nodes[b].y || layout.nodes[a].x - layout.nodes[b].x);
}

describe('layoutPackedTree — grid mode', () => {
  it('lays out a single leaf at the origin', () => {
    const layout = layoutPackedTree([leaf('a')]);
    expect(layout.nodes['a']).toEqual({ x: 0, y: 0, width: 120, height: 55 });
    expect(layout.size).toEqual({ width: 120, height: 55 });
  });

  it('returns an empty layout for no roots', () => {
    expect(layoutPackedTree([])).toEqual({ nodes: {}, size: { width: 0, height: 0 } });
  });

  it('rejects duplicate node ids', () => {
    expect(() => layoutPackedTree([leaf('a'), container('b', [leaf('a')])]))
      .toThrow(/duplicate/i);
  });

  it('keeps every leaf at the exact leaf size', () => {
    const tree = [container('root', [
      container('a', uniformLeaves(5, 'a')),
      container('b', [container('b1', uniformLeaves(3, 'b1')), ...uniformLeaves(2, 'b')]),
    ])];
    const layout = layoutPackedTree(tree, { leafWidth: 100, leafHeight: 40 });
    for (const id of Object.keys(layout.nodes)) {
      const node = layout.nodes[id];
      const isLeaf = !id.includes('root') && id !== 'a' && id !== 'b' && id !== 'b1';
      if (isLeaf) {
        expect(node.width).toBe(100);
        expect(node.height).toBe(40);
      }
    }
  });

  it('packs 12 uniform leaves into an exact 3-column, 4-row quantum grid', () => {
    const tree = [container('cap', uniformLeaves(12))];
    const layout = layoutPackedTree(tree);
    const cells = uniformLeaves(12).map((node) => layout.nodes[node.id]);
    const xs = [...new Set(cells.map((cell) => cell.x))].sort((a, b) => a - b);
    const ys = [...new Set(cells.map((cell) => cell.y))].sort((a, b) => a - b);
    expect(xs).toEqual([12, 144, 276]);
    expect(ys).toEqual([30, 97, 164, 231]);
    expect(layout.nodes['cap'].width).toBe(384 + 24);
    expect(layout.nodes['cap'].height).toBe(256 + 30 + 12);
  });

  it('balances rows instead of leaving a short last row (7 -> 3/2/2)', () => {
    const tree = [container('cap', uniformLeaves(7))];
    const layout = layoutPackedTree(tree);
    const cells = uniformLeaves(7).map((node) => layout.nodes[node.id]);
    const rowCounts = new Map<number, number>();
    for (const cell of cells) rowCounts.set(cell.y, (rowCounts.get(cell.y) ?? 0) + 1);
    expect([...rowCounts.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n))
      .toEqual([3, 2, 2]);
  });

  it('aligns uniform leaves on the quantum grid at every depth', () => {
    const tree = [container('root', [
      container('a', uniformLeaves(7, 'a')),
      container('b', uniformLeaves(4, 'b')),
      container('c', uniformLeaves(9, 'c')),
    ])];
    const layout = layoutPackedTree(tree);
    assertInvariants(tree, layout);
    for (const parent of ['a', 'b', 'c']) {
      const count = parent === 'a' ? 7 : parent === 'b' ? 4 : 9;
      for (const node of uniformLeaves(count, parent)) {
        const cell = layout.nodes[node.id];
        expect((cell.x - DEFAULTS.padding) % (120 + DEFAULTS.gutter)).toBe(0);
        expect((cell.y - DEFAULTS.titleBandHeight) % (55 + DEFAULTS.gutter)).toBe(0);
      }
    }
  });

  it('honors a fixed columns override', () => {
    const tree = [container('cap', uniformLeaves(10))];
    const layout = layoutPackedTree(tree, { columns: 5 });
    const ys = new Set(uniformLeaves(10).map((node) => layout.nodes[node.id].y));
    expect(ys.size).toBe(2);
  });

  it('is deterministic and independent of input order under name sort', () => {
    const children = [
      container('beta', uniformLeaves(3, 'x')),
      leaf('alpha'),
      container('gamma', uniformLeaves(5, 'y')),
    ];
    const shuffled = [children[2], children[0], children[1]];
    const a = layoutPackedTree([container('root', children)]);
    const b = layoutPackedTree([container('root', shuffled)]);
    expect(a).toEqual(b);
  });

  it('never permutes sibling order when sorting is disabled', () => {
    const ids = ['zeta', 'alpha', 'mike', 'echo', 'tango', 'bravo', 'kilo'];
    const tree = [container('cap', ids.map((id) => leaf(id)))];
    const layout = layoutPackedTree(tree, { sort: 'none' });
    expect(readingOrder(ids, layout)).toEqual(ids);
  });

  it('keeps untouched sibling subtrees byte-identical when a leaf is appended elsewhere', () => {
    const stableChildren = uniformLeaves(5, 'stable');
    const before = [container('root', [
      container('a', stableChildren),
      container('b', uniformLeaves(2, 'b')),
    ])];
    const after = [container('root', [
      container('a', stableChildren),
      container('b', uniformLeaves(3, 'b')),
    ])];
    const first = layoutPackedTree(before, { sort: 'none' });
    const second = layoutPackedTree(after, { sort: 'none' });
    expect(second.nodes['a']).toEqual(first.nodes['a']);
    for (const node of stableChildren) {
      expect(second.nodes[node.id]).toEqual(first.nodes[node.id]);
    }
  });

  it('keeps container aspect ratios sane across leaf counts', () => {
    for (let count = 1; count <= 40; count++) {
      const layout = layoutPackedTree([container('cap', uniformLeaves(count))]);
      const bounds = layout.nodes['cap'];
      const aspect = bounds.width / bounds.height;
      expect(aspect).toBeGreaterThanOrEqual(0.5);
      expect(aspect).toBeLessThanOrEqual(3.2);
    }
  });

  it('holds containment and non-overlap on a deep heterogeneous tree', () => {
    const tree = [
      container('l0', [
        container('l1a', [container('l2a', uniformLeaves(11, 'd')), ...uniformLeaves(2, 'e')]),
        container('l1b', uniformLeaves(6, 'f')),
        leaf('l1c'),
      ]),
      container('m0', uniformLeaves(3, 'g')),
      leaf('n0'),
    ];
    const layout = layoutPackedTree(tree);
    assertInvariants(tree, layout);
  });
});

describe('layoutPackedTree — treemap mode', () => {
  const options: PackedTreeOptions = { mode: 'treemap', sort: 'weight' };

  it('sizes leaf areas proportionally to weights', () => {
    const tree = [container('cap', [
      leaf('a', 6), leaf('b', 3), leaf('c', 2), leaf('d', 1),
    ])];
    const layout = layoutPackedTree(tree, { ...options, gutter: 0 });
    const area = (id: string) => layout.nodes[id].width * layout.nodes[id].height;
    expect(area('a') / area('d')).toBeGreaterThan(4.5);
    expect(area('a') / area('d')).toBeLessThan(7.5);
    expect(area('b') / area('c')).toBeGreaterThan(1.2);
    expect(area('b') / area('c')).toBeLessThan(1.9);
  });

  it('treats missing, zero, and negative weights as equal fallbacks', () => {
    const tree = [container('cap', [leaf('a'), leaf('b', 0), leaf('c', -5)])];
    const layout = layoutPackedTree(tree, { ...options, gutter: 0 });
    const areas = ['a', 'b', 'c'].map((id) =>
      layout.nodes[id].width * layout.nodes[id].height);
    expect(Math.max(...areas) / Math.min(...areas)).toBeLessThan(1.2);
  });

  it('keeps tiny weights above the minimum cell area', () => {
    const tree = [container('cap', [leaf('big', 1000), leaf('tiny', 0.0001)])];
    const layout = layoutPackedTree(tree, options);
    const cell = layout.nodes['tiny'];
    expect(cell.width * cell.height).toBeGreaterThanOrEqual(800);
  });

  it('preserves sibling order in strip layout', () => {
    const ids = ['zeta', 'alpha', 'mike', 'echo', 'tango'];
    const tree = [container('cap', ids.map((id, i) => leaf(id, [3, 1, 4, 1, 5][i])))];
    const layout = layoutPackedTree(tree, { mode: 'treemap', sort: 'none' });
    expect(readingOrder(ids, layout)).toEqual(ids);
  });

  it('routes auto algorithm by sort: weight -> squarify, otherwise strip', () => {
    const children = [leaf('a', 8), leaf('b', 4), leaf('c', 2), leaf('d', 1), leaf('e', 1)];
    const tree = [container('cap', children)];
    expect(layoutPackedTree(tree, { mode: 'treemap', sort: 'weight', algorithm: 'auto' }))
      .toEqual(layoutPackedTree(tree, { mode: 'treemap', sort: 'weight', algorithm: 'squarify' }));
    expect(layoutPackedTree(tree, { mode: 'treemap', sort: 'name', algorithm: 'auto' }))
      .toEqual(layoutPackedTree(tree, { mode: 'treemap', sort: 'name', algorithm: 'strip' }));
  });

  it('holds containment and non-overlap on nested weighted trees', () => {
    const tree = [
      container('l0', [
        container('l1a', [leaf('a', 5), leaf('b', 2), leaf('c', 1)]),
        container('l1b', [leaf('d', 8), leaf('e', 1)]),
        leaf('l1c', 3),
      ]),
      leaf('m0', 4),
    ];
    for (const algorithm of ['squarify', 'strip'] as const) {
      const layout = layoutPackedTree(tree, { mode: 'treemap', sort: 'weight', algorithm });
      assertInvariants(tree, layout, {}, 1);
    }
  });

  it('produces integer bounds', () => {
    const tree = [container('cap', [leaf('a', 3.7), leaf('b', 1.3), leaf('c', 2.9)])];
    const layout = layoutPackedTree(tree, options);
    for (const bounds of Object.values(layout.nodes)) {
      expect(Number.isInteger(bounds.x)).toBe(true);
      expect(Number.isInteger(bounds.y)).toBe(true);
      expect(Number.isInteger(bounds.width)).toBe(true);
      expect(Number.isInteger(bounds.height)).toBe(true);
    }
  });
});
