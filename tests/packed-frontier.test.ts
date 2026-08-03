import { describe, expect, it } from 'vitest';
import {
  createPackedLeafShapes,
  evaluatePackedTreeLayout,
  layoutPackedTree,
  measurePackedLabel,
  minimumPackedLabelWidth,
  wrapPackedText,
  type PackedLabelSpec,
  type PackedTreeLayout,
  type PackedTreeNode,
  type PackedTreeOptions,
} from '../src/model/layout/packed-tree';
import type { Bounds } from '../src/model/types';

const FRONTIER: PackedTreeOptions = {
  gridAlgorithm: 'frontier',
  leafSizing: 'text-aware',
  sort: 'none',
};

function leaf(id: string, name = id): PackedTreeNode {
  return {
    id,
    name,
    label: {
      text: name,
      fontSizePx: 13,
      lineHeightPx: 16.25,
      maxLines: 3,
      horizontalPadding: 8,
      verticalPadding: 6,
    },
  };
}

function parent(id: string, children: PackedTreeNode[], name = id): PackedTreeNode {
  return {
    ...leaf(id, name),
    label: { ...leaf(id, name).label!, maxLines: 2 },
    children,
  };
}

function relationships(roots: readonly PackedTreeNode[]) {
  const result: Array<{ parent: PackedTreeNode; children: readonly PackedTreeNode[] }> = [];
  const visit = (node: PackedTreeNode) => {
    if (node.children?.length) {
      result.push({ parent: node, children: node.children });
      node.children.forEach(visit);
    }
  };
  roots.forEach(visit);
  return result;
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width &&
    a.y < b.y + b.height && b.y < a.y + a.height;
}

function expectValid(roots: readonly PackedTreeNode[], layout: PackedTreeLayout): void {
  const ids: string[] = [];
  const collect = (node: PackedTreeNode) => {
    ids.push(node.id);
    node.children?.forEach(collect);
  };
  roots.forEach(collect);
  expect(Object.keys(layout.nodes).sort()).toEqual([...ids].sort());
  for (const bounds of Object.values(layout.nodes)) {
    expect(Object.values(bounds).every(Number.isFinite)).toBe(true);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  }
  for (const relation of relationships(roots)) {
    const parentBounds = layout.nodes[relation.parent.id];
    const children = relation.children.map((child) => layout.nodes[child.id]);
    for (const child of children) {
      expect(child.x).toBeGreaterThanOrEqual(12);
      expect(child.y).toBeGreaterThanOrEqual(30);
      expect(child.x + child.width).toBeLessThanOrEqual(parentBounds.width);
      expect(child.y + child.height).toBeLessThanOrEqual(parentBounds.height);
    }
    for (let left = 0; left < children.length; left++) {
      for (let right = left + 1; right < children.length; right++) {
        expect(overlaps(children[left], children[right])).toBe(false);
      }
    }
  }
  const rootBounds = roots.map((root) => layout.nodes[root.id]);
  for (let left = 0; left < rootBounds.length; left++) {
    for (let right = left + 1; right < rootBounds.length; right++) {
      expect(overlaps(rootBounds[left], rootBounds[right])).toBe(false);
    }
  }
}

describe('GCHRP-2 text estimation', () => {
  it('wraps whitespace and long tokens deterministically', () => {
    expect(wrapPackedText('Customer Identity Authentication', 90, 13))
      .toEqual(wrapPackedText('Customer Identity Authentication', 90, 13));
    expect(wrapPackedText('UnbrokenCapabilityIdentifier', 45, 13).length)
      .toBeGreaterThan(1);
  });

  it('selects controlled legal shapes and expands only when required', () => {
    const normal: PackedLabelSpec = {
      text: 'Customer Management', fontSizePx: 13, maxLines: 3,
    };
    const normalShapes = createPackedLeafShapes(normal, 120, 55);
    expect(normalShapes.length).toBeGreaterThan(1);
    expect(normalShapes.every((shape) => shape.text.fits)).toBe(true);
    expect(normalShapes.every((shape) => shape.kind !== 'expanded')).toBe(true);

    const extreme: PackedLabelSpec = {
      text: 'Customer Identity, Authentication and Access Management Across Every Enterprise Channel',
      fontSizePx: 16,
      lineHeightPx: 20,
      maxLines: 2,
    };
    const expanded = createPackedLeafShapes(extreme, 120, 55);
    expect(expanded).toHaveLength(1);
    expect(expanded[0].kind).toBe('expanded');
    expect(expanded[0].text.fits).toBe(true);
    expect(expanded[0].width).toBeGreaterThanOrEqual(minimumPackedLabelWidth(extreme, 2));
    expect(measurePackedLabel(extreme, expanded[0].width, expanded[0].height).lines)
      .toHaveLength(2);
  });
});

describe('GCHRP-2 bounded shape frontier', () => {
  const forest = [
    parent('customer', [
      leaf('identity', 'Customer Identity, Authentication and Access Management'),
      leaf('service', 'Customer Service'),
      leaf('insight', 'Customer Insight'),
      leaf('campaign', 'Campaign Management'),
      leaf('experience', 'Customer Experience Management'),
      leaf('consent', 'Consent and Preference Management'),
      leaf('complaints', 'Complaints Management'),
    ], 'Customer Management'),
    parent('finance', [
      leaf('payments', 'Payments and Cash Management'),
      leaf('crime', 'Financial Crime Prevention and Detection'),
      leaf('ledger', 'General Ledger'),
      leaf('tax', 'Tax Management'),
    ], 'Finance'),
    parent('people', [
      leaf('workforce', 'Workforce Planning'),
      leaf('learning', 'Learning and Development'),
      leaf('rewards', 'Rewards and Recognition'),
    ], 'People'),
  ];

  it('retains multiple forms, composes multiple ordered grammars, and is deterministic', () => {
    const first = layoutPackedTree(forest, FRONTIER);
    const second = layoutPackedTree(forest, FRONTIER);
    expect(first).toEqual(second);
    expectValid(forest, first);
    expect(first.diagnostics?.engine).toBe('GCHRP-2');
    expect(first.diagnostics?.maximumFrontierSize).toBeGreaterThan(1);
    expect(first.diagnostics?.averageFrontierSize).toBeGreaterThan(1);
    expect(first.diagnostics?.candidateCompositionCount).toBeGreaterThan(20);
    expect(first.diagnostics?.grammarCandidateCounts['ordered-shelves']).toBeGreaterThan(0);
    expect(first.diagnostics?.grammarCandidateCounts['ordered-columns']).toBeGreaterThan(0);
    expect(Object.keys(first.diagnostics?.grammarCandidateCounts ?? {}).some((grammar) =>
      grammar.startsWith('ordered-guillotine'))).toBe(true);
  });

  it('discovers a dominant subtree plus adjacent strip when eligibility is met', () => {
    const tree = [parent('dominant-root', [
      parent('dominant-child', Array.from({ length: 12 }, (_, index) =>
        leaf(`dominant-leaf-${index}`))),
      leaf('strip-a'),
      leaf('strip-b'),
      leaf('strip-c'),
    ])];
    const layout = layoutPackedTree(tree, FRONTIER);
    expect(Object.keys(layout.diagnostics?.grammarCandidateCounts ?? {}).some((grammar) =>
      grammar.startsWith('dominant-block'))).toBe(true);
    expectValid(tree, layout);
  });

  it('uses the complete forest and improves its target aspect over legacy local choices', () => {
    const legacy = layoutPackedTree(forest, { sort: 'none', targetAspect: 1.6 });
    const frontier = layoutPackedTree(forest, {
      ...FRONTIER,
      aesthetics: { aspect: 4, alignment: 0.1, raggedness: 0.8, whitespace: 0.2 },
    });
    const deviation = (layout: PackedTreeLayout) =>
      Math.abs(Math.log((layout.size.width / layout.size.height) / 1.6));
    expect(frontier.diagnostics?.maximumFrontierSize).toBeGreaterThan(1);
    expect(deviation(frontier)).toBeLessThan(deviation(legacy));
  });

  it('preserves explicit fixed-column compatibility even when frontier is requested', () => {
    const tree = [parent('root', Array.from({ length: 10 }, (_, index) =>
      leaf(`leaf-${index}`)))];
    const legacy = layoutPackedTree(tree, { columns: 5, sort: 'none' });
    const requested = layoutPackedTree(tree, {
      columns: 5, sort: 'none', gridAlgorithm: 'frontier', leafSizing: 'text-aware',
    });
    expect(requested).toEqual(legacy);
  });

  it('keeps preserved root anchors and repairs an overlap deterministically', () => {
    const baseline = layoutPackedTree(forest, FRONTIER);
    const previous = { ...baseline.nodes };
    previous.finance = { ...previous.customer };
    const preserved = layoutPackedTree(forest, {
      ...FRONTIER,
      rootPlacement: 'preserve',
    }, { previousBounds: previous });
    expect(preserved.nodes.customer.x).toBe(previous.customer.x);
    expect(preserved.nodes.customer.y).toBe(previous.customer.y);
    expect(overlaps(preserved.nodes.customer, preserved.nodes.finance)).toBe(false);
    expectValid(forest, preserved);
  });

  it('keeps semantic order across shelves, columns, name sorting, and stable id ties', () => {
    const ids = ['zeta', 'alpha-b', 'alpha-a', 'mike', 'echo', 'tango', 'bravo'];
    const tree = [parent('ordered-root', ids.map((id) =>
      leaf(id, id.startsWith('alpha') ? 'Alpha' : id)))];
    const none = layoutPackedTree(tree, { ...FRONTIER, targetAspect: 0.45 });
    const directNone = none.semanticOrder?.filter((id) => ids.includes(id));
    expect(directNone).toEqual(ids);
    expect(none.diagnostics?.selectedGrammarCounts['ordered-columns']).toBeGreaterThan(0);

    const named = layoutPackedTree(tree, { ...FRONTIER, sort: 'name' });
    const directNamed = named.semanticOrder?.filter((id) => ids.includes(id));
    expect(directNamed).toEqual(['alpha-a', 'alpha-b', 'bravo', 'echo', 'mike', 'tango', 'zeta']);
  });

  it('avoids one-item final bands for seven and eleven equal leaves', () => {
    for (const count of [7, 11]) {
      const tree = [parent(`rhythm-${count}`, Array.from({ length: count }, (_, index) =>
        leaf(`rhythm-${count}-${index}`, 'Equal Capability')))];
      const layout = layoutPackedTree(tree, FRONTIER);
      const metrics = evaluatePackedTreeLayout({
        roots: tree,
        nodes: layout.nodes,
        size: layout.size,
        targetAspect: 1.6,
      });
      expect(metrics.orphanPenalty).toBe(0);
      expectValid(tree, layout);
    }
  });

  it('uses prior geometry to reduce unaffected movement after a small insertion', () => {
    const baselineTree = [parent('stable-root', [
      parent('stable-a', [leaf('a-1'), leaf('a-2'), leaf('a-3'), leaf('a-4')]),
      parent('stable-b', [leaf('b-1'), leaf('b-2'), leaf('b-3')]),
      parent('stable-c', [leaf('c-1'), leaf('c-2'), leaf('c-3')]),
    ])];
    const changedTree = [parent('stable-root', [
      parent('stable-a', [leaf('a-1'), leaf('a-2'), leaf('a-new'), leaf('a-3'), leaf('a-4')]),
      parent('stable-b', [leaf('b-1'), leaf('b-2'), leaf('b-3')]),
      parent('stable-c', [leaf('c-1'), leaf('c-2'), leaf('c-3')]),
    ])];
    const baseline = layoutPackedTree(baselineTree, FRONTIER);
    const stable = layoutPackedTree(changedTree, {
      ...FRONTIER,
      rootPlacement: 'preserve',
    }, { previousBounds: baseline.nodes });
    const fresh = layoutPackedTree(changedTree, FRONTIER);
    const unaffected = ['stable-b', 'b-1', 'b-2', 'b-3', 'stable-c', 'c-1', 'c-2', 'c-3'];
    const movement = (layout: PackedTreeLayout) => unaffected.reduce((sum, id) => {
      const before = baseline.nodes[id];
      const after = layout.nodes[id];
      return sum + Math.abs(after.x - before.x) + Math.abs(after.y - before.y) +
        Math.abs(after.width - before.width) + Math.abs(after.height - before.height);
    }, 0);
    expect(movement(stable)).toBeLessThanOrEqual(movement(fresh));
    expectValid(changedTree, stable);

    const removedTree = [parent('stable-root', [
      parent('stable-a', [leaf('a-1'), leaf('a-3'), leaf('a-4')]),
      parent('stable-b', [leaf('b-1'), leaf('b-2'), leaf('b-3')]),
      parent('stable-c', [leaf('c-1'), leaf('c-2'), leaf('c-3')]),
    ])];
    expectValid(removedTree, layoutPackedTree(removedTree, {
      ...FRONTIER,
      rootPlacement: 'preserve',
    }, { previousBounds: baseline.nodes }));

    const renamedTree = [parent('stable-root', [
      parent('stable-a', [
        leaf('a-1', 'Customer Identity, Authentication and Access Management Across Channels'),
        leaf('a-2'), leaf('a-3'), leaf('a-4'),
      ]),
      parent('stable-b', [leaf('b-1'), leaf('b-2'), leaf('b-3')]),
      parent('stable-c', [leaf('c-1'), leaf('c-2'), leaf('c-3')]),
    ])];
    expectValid(renamedTree, layoutPackedTree(renamedTree, {
      ...FRONTIER,
      rootPlacement: 'preserve',
    }, { previousBounds: baseline.nodes }));
  });
});
