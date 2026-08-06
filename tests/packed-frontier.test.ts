import { describe, expect, it } from 'vitest';
import {
  createPackedLeafShapes,
  estimatePackedTextWidth,
  evaluatePackedTreeLayout,
  layoutPackedTree,
  measurePackedBandMetrics,
  measurePackedLabel,
  measurePackedMetrics,
  minimumPackedLabelWidth,
  wrapPackedText,
  type PackedLabelSpec,
  type PackedTreeLayout,
  type PackedTreeNode,
  type PackedTreeOptions,
} from '../src/model/layout/packed-tree';
import type { Bounds } from '../src/model/types';
import {
  capabilityLayoutFixtures,
  capabilityStressForest,
} from '../tools/capability-layout-fixtures';

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

  it('avoids one-item final bands for seven, eleven, and thirteen equal leaves', () => {
    for (const count of [7, 11, 13]) {
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

describe('shape-function-3 floorplanning regressions', () => {
  it('retains geometry regions, composes mixed child forms, and prunes in two bounded stages', () => {
    const fixture = capabilityLayoutFixtures().find((candidate) =>
      candidate.id === 'mixed-form')!;
    const layout = layoutPackedTree(fixture.roots, {
      ...FRONTIER,
      targetAspect: 8,
      frontier: { maxCandidatesPerNode: 12, beamWidth: 16 },
    });
    expectValid(fixture.roots, layout);
    const diagnostics = layout.diagnostics!;
    expect(diagnostics.revision).toBe('shape-function-3');
    expect(diagnostics.searchStrategy).toBe('bounded-mixed-form');
    expect(diagnostics.qualityModel).toBe('tiered-significance-weighted');
    expect(Object.values(diagnostics.aspectRegionCounts).filter((count) => count > 0).length)
      .toBeGreaterThanOrEqual(3);
    expect(diagnostics.mixedFormCompositionCount).toBeGreaterThan(0);
    expect(diagnostics.intervalBaseAspectRegionCount).toBeGreaterThan(0);
    expect(diagnostics.maximumIntervalFrontier).toBeLessThanOrEqual(8);
    expect(diagnostics.geometryCandidatesBeforePruning)
      .toBeGreaterThanOrEqual(diagnostics.geometryCandidatesAfterPruning);
    expect(diagnostics.qualityVariantsBeforePruning)
      .toBeGreaterThanOrEqual(diagnostics.qualityVariantsAfterPruning);
    expect(diagnostics.maximumFrontierSize).toBeLessThanOrEqual(12);
    const root = fixture.roots[0];
    const childRegions = new Set(root.children!.map((child) => {
      const bounds = layout.nodes[child.id];
      const aspect = bounds.width / bounds.height;
      return aspect < 0.85 ? 'portrait' : aspect > 1.3 ? 'landscape' : 'square';
    }));
    expect(childRegions.size).toBeGreaterThanOrEqual(2);
  });

  it('orders band consistency and detects band and broad-region stability breaks', () => {
    const good = [
      { id: 'a', bounds: { x: 0, y: 0, width: 80, height: 40 } },
      { id: 'b', bounds: { x: 90, y: 0, width: 80, height: 40 } },
      { id: 'c', bounds: { x: 0, y: 50, width: 80, height: 40 } },
      { id: 'd', bounds: { x: 90, y: 50, width: 80, height: 40 } },
    ];
    const inconsistent = good.map((placement) => placement.id === 'c' || placement.id === 'd'
      ? { ...placement, bounds: { ...placement.bounds, height: 80 } }
      : placement);
    expect(measurePackedBandMetrics(good, 'row').bandConsistency).toBe(0);
    expect(measurePackedBandMetrics(inconsistent, 'row').bandConsistency)
      .toBeGreaterThan(0);

    const previousBounds = Object.fromEntries(good.map((placement) =>
      [placement.id, placement.bounds]));
    const changed = [good[0], good[3], good[2], good[1]].map((placement, index) => ({
      id: placement.id,
      bounds: good[index].bounds,
    }));
    const metrics = measurePackedMetrics({
      width: 170,
      height: 90,
      targetAspect: 1.6,
      placements: changed,
      contentArea: 4 * 80 * 40,
      previousBounds,
    });
    expect(metrics.neighborhoodChange).toBeGreaterThan(0);
    expect(metrics.bandChange).toBeGreaterThan(0);
    expect(metrics.regionChange).toBeGreaterThan(0);
  });

  it('weights movement from a large subtree more than the same defect in a tiny subtree', () => {
    const largeChildren = Array.from({ length: 8 }, (_, index) => ({ id: `large-${index}` }));
    const roots = [{
      id: 'root',
      children: [
        { id: 'large', children: largeChildren },
        { id: 'small', children: [{ id: 'small-0' }, { id: 'small-1' }] },
      ],
    }];
    const nodes: Record<string, Bounds> = {
      root: { x: 0, y: 0, width: 800, height: 400 },
      large: { x: 0, y: 0, width: 600, height: 300 },
      small: { x: 610, y: 0, width: 180, height: 100 },
      ...Object.fromEntries(largeChildren.map((child, index) => [child.id, {
        x: (index % 4) * 120,
        y: Math.floor(index / 4) * 60,
        width: 100,
        height: 40,
      }])),
      'small-0': { x: 0, y: 0, width: 70, height: 40 },
      'small-1': { x: 80, y: 0, width: 70, height: 40 },
    };
    const previous = Object.fromEntries(Object.entries(nodes).map(([id, bounds]) =>
      [id, { ...bounds }]));
    const move = (ids: readonly string[]) => ({
      ...nodes,
      ...Object.fromEntries(ids.map((id) => [id, { ...nodes[id], x: nodes[id].x + 60 }])),
    });
    const largeMoved = evaluatePackedTreeLayout({
      roots,
      nodes: move(largeChildren.map((child) => child.id)),
      size: { width: 800, height: 400 },
      previousBounds: previous,
    });
    const smallMoved = evaluatePackedTreeLayout({
      roots,
      nodes: move(['small-0', 'small-1']),
      size: { width: 800, height: 400 },
      previousBounds: previous,
    });
    expect(largeMoved.movement).toBeGreaterThan(smallMoved.movement);
  });

  it('uses a bounded root beam that is no worse than legacy right/down repair', () => {
    const fixture = capabilityLayoutFixtures().find((candidate) =>
      candidate.id === 'preserved-collision')!;
    const baseline = layoutPackedTree(fixture.previousRoots!, FRONTIER);
    const rootIds = fixture.roots.map((root) => root.id);
    const root1X = baseline.nodes[rootIds[0]].width + 12;
    const root2X = root1X + baseline.nodes[rootIds[1]].width + 12;
    const root3X = root2X + baseline.nodes[rootIds[2]].width + 12;
    const previousBounds = {
      ...baseline.nodes,
      [rootIds[0]]: { ...baseline.nodes[rootIds[0]], x: 0, y: 0 },
      [rootIds[1]]: { ...baseline.nodes[rootIds[1]], x: root1X, y: 0 },
      [rootIds[2]]: { ...baseline.nodes[rootIds[2]], x: root2X, y: 0 },
      [rootIds[3]]: { ...baseline.nodes[rootIds[3]], x: root3X, y: 0 },
    };
    const preserved = layoutPackedTree(fixture.roots, {
      ...FRONTIER,
      rootPlacement: 'preserve',
    }, { previousBounds });
    const greedy: Record<string, Bounds> = {};
    const placed: Bounds[] = [];
    for (const id of rootIds) {
      const size = preserved.nodes[id];
      let current = { ...previousBounds[id], width: size.width, height: size.height };
      for (let iteration = 0; iteration <= placed.length * 2; iteration++) {
        const conflicts = placed.filter((other) => overlaps(current, other));
        if (conflicts.length === 0) break;
        const right = Math.max(...conflicts.map((other) => other.x + other.width + 12));
        const below = Math.max(...conflicts.map((other) => other.y + other.height + 12));
        current = right - current.x <= below - current.y
          ? { ...current, x: right }
          : { ...current, y: below };
      }
      greedy[id] = current;
      placed.push(current);
    }
    const displacement = (bounds: Readonly<Record<string, Bounds>>) => rootIds.reduce((sum, id) =>
      sum + Math.hypot(
        bounds[id].x - previousBounds[id].x,
        bounds[id].y - previousBounds[id].y,
      ), 0);
    const frameArea = (bounds: Readonly<Record<string, Bounds>>) =>
      Math.max(...rootIds.map((id) => bounds[id].x + bounds[id].width)) *
      Math.max(...rootIds.map((id) => bounds[id].y + bounds[id].height));
    expect(displacement(preserved.nodes) < displacement(greedy) ||
      frameArea(preserved.nodes) < frameArea(greedy)).toBe(true);
    expect(preserved.diagnostics?.selectedGrammar).toBe('preserved-root-beam');
    expect(preserved.diagnostics?.rootRepairStatesExplored).toBeGreaterThan(0);
    expect(preserved.diagnostics?.maximumRootRepairBeam).toBeLessThanOrEqual(24);
    expectValid(fixture.roots, preserved);
  });

  it('handles representative Unicode labels and long tokens deterministically', () => {
    const labels = [
      'Økonomi & Likviditetsstyring',
      'Kreditrisiko (IFRS 9)',
      'KYC/CDD — Kundekendskab 360°',
      'UnbrokenCapabilityIdentifierÆØÅ2026',
    ];
    for (const text of labels) {
      expect(estimatePackedTextWidth(text, 13)).toBeGreaterThan(0);
      const shapes = createPackedLeafShapes({ text, fontSizePx: 13, maxLines: 3 }, 120, 55);
      expect(shapes.every((shape) => shape.text.fits)).toBe(true);
      expect(shapes).toEqual(createPackedLeafShapes(
        { text, fontSizePx: 13, maxLines: 3 }, 120, 55,
      ));
    }
  });

  it('completes the deterministic 1,700-node forest within structural bounds', () => {
    const stress = capabilityStressForest();
    const layout = layoutPackedTree(stress, {
      ...FRONTIER,
      frontier: { maxCandidatesPerNode: 16, beamWidth: 20, largeSiblingThreshold: 14 },
    });
    expect(Object.keys(layout.nodes)).toHaveLength(1700);
    expect(layout.diagnostics?.maximumFrontierSize).toBeLessThanOrEqual(16);
    expect(layout.diagnostics?.maximumIntervalFrontier).toBeLessThanOrEqual(8);
    expect(layout.diagnostics?.largeNodeFallbackCount).toBeGreaterThan(0);
    expectValid(stress, layout);
  }, 20_000);
});
