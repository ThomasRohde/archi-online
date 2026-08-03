import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  evaluatePackedTreeLayout,
  layoutPackedTree,
  wrapPackedText,
  type PackedTreeLayout,
  type PackedTreeNode,
  type PackedTreeOptions,
} from '../src/model/layout/packed-tree';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');

function label(name: string, depth: number, parent: boolean) {
  const fontSizePx = [16, 14.67, 13.33, 12][Math.min(depth, 3)];
  return {
    text: name,
    fontSizePx,
    lineHeightPx: fontSizePx * 1.25,
    maxLines: parent ? 2 : 3,
    horizontalPadding: 8,
    verticalPadding: parent ? 4 : 6,
    minFontSizePx: fontSizePx,
  };
}

function tree(
  id: string,
  name: string,
  children: PackedTreeNode[] = [],
  depth = 0,
): PackedTreeNode {
  const normalizedChildren = children.map((child) => relabelDepth(child, depth + 1));
  return {
    id,
    name,
    label: label(name, depth, normalizedChildren.length > 0),
    ...(normalizedChildren.length > 0 ? { children: normalizedChildren } : {}),
  };
}

function relabelDepth(node: PackedTreeNode, depth: number): PackedTreeNode {
  const children = node.children?.map((child) => relabelDepth(child, depth + 1));
  return {
    ...node,
    label: label(node.name ?? '', depth, Boolean(children?.length)),
    ...(children?.length ? { children } : {}),
  };
}

function leaves(prefix: string, names: readonly string[]): PackedTreeNode[] {
  return names.map((name, index) => tree(`${prefix}-${index}`, name));
}

function representativeForest(): PackedTreeNode[] {
  return [tree('archi-online', 'Archi Online', [
    tree('authoring', 'Model Authoring', leaves('authoring', [
      'Element Management', 'Relationship Management', 'Model Tree Navigation',
      'Multi-Model Workspaces', 'Specialization Management', 'Property Management',
    ])),
    tree('diagramming', 'Diagramming', [
      ...leaves('diagramming', [
        'View Editing', 'Figure Rendering', 'Connection Routing', 'Nesting and Containers',
        'Alignment and Distribution', 'Presentation Mode',
      ]),
      tree('automatic-layout', 'Automatic Layout', leaves('layout', [
        'Layered Graph Layout (ELK)', 'Packed Capability Maps — GCHRP-2',
      ])),
    ]),
    tree('scripting', 'Scripting and Automation', [
      tree('jarchi', 'jArchi Compatibility', leaves('jarchi', [
        'Selectors and Collections', 'Model Mutation API', 'Bulk Layout API',
      ])),
      ...leaves('scripting', ['Script Editor and IntelliSense', 'Script Library']),
    ]),
    tree('extensibility', 'Extensibility', leaves('extensibility', [
      'Extension Packages', 'Command and Menu Contributions', 'Panel Contributions',
      'Event Bridge', 'Extension Storage',
    ])),
    tree('persistence', 'Persistence and Interoperability', leaves('persistence', [
      'ArchiMate File Round-Trip', 'Browser Autosave and Recovery',
      'Open Exchange Import and Export', 'CSV Import and Export', 'Image Export',
      'Model Sharing and Links',
    ])),
    tree('standards', 'Standards Fidelity', leaves('standards', [
      'Metamodel Enforcement', 'Relationship Rules Matrix', 'Viewpoint Filtering',
      'C4 Notation', 'Archi Visual Parity',
    ])),
    tree('platform', 'Platform Services', leaves('platform', [
      'Offline PWA Runtime', 'Undo and Redo History', 'Keyboard Shortcuts', 'Theming',
      'Documentation and Help',
    ])),
  ])];
}

function syntheticForest(): PackedTreeNode[] {
  const longNames = [
    'Customer Identity, Authentication and Access Management',
    'Payments and Cash Management',
    'Financial Crime Prevention and Detection',
    'Enterprise Data Governance and Regulatory Reporting',
    'Partner Ecosystem and Distribution Channel Management',
  ];
  let leafIndex = 0;
  return Array.from({ length: 8 }, (_, rootIndex) => {
    const domains = Array.from({ length: 12 }, (_, domainIndex) => {
      const domainOrdinal = rootIndex * 12 + domainIndex;
      const count = domainOrdinal < 60 ? 17 : 16;
      const domainLeaves = Array.from({ length: count }, () => {
        const index = leafIndex++;
        return tree(
          `synthetic-leaf-${index}`,
          `${longNames[index % longNames.length]} ${String(index + 1).padStart(4, '0')}`,
        );
      });
      return tree(
        `synthetic-domain-${domainOrdinal}`,
        `Enterprise Capability Domain ${domainOrdinal + 1}`,
        domainLeaves,
      );
    });
    return tree(`synthetic-root-${rootIndex}`, `Business Area ${rootIndex + 1}`, domains);
  });
}

const legacyOptions: PackedTreeOptions = { mode: 'grid', sort: 'name', targetAspect: 1.6 };
const frontierOptions: PackedTreeOptions = {
  mode: 'grid',
  gridAlgorithm: 'frontier',
  leafSizing: 'text-aware',
  sort: 'name',
  targetAspect: 1.6,
  frontier: { maxCandidatesPerNode: 16, beamWidth: 20 },
  aesthetics: {
    aspect: 1,
    raggedness: 2.5,
    whitespace: 0.5,
    orphan: 1.2,
    alignment: 0.6,
    movement: 1.5,
    neighborhood: 0.8,
  },
};

function nodeCount(roots: readonly PackedTreeNode[]): number {
  return roots.reduce((sum, node) =>
    sum + 1 + nodeCount(node.children ?? []), 0);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function benchmark(
  roots: readonly PackedTreeNode[],
  options: PackedTreeOptions,
  repeats: number,
): { layout: PackedTreeLayout; medianMs: number } {
  const timings: number[] = [];
  let layout: PackedTreeLayout | undefined;
  for (let repeat = 0; repeat < repeats; repeat++) {
    const start = performance.now();
    layout = layoutPackedTree(roots, options);
    timings.push(performance.now() - start);
  }
  return { layout: layout!, medianMs: median(timings) };
}

function result(
  roots: readonly PackedTreeNode[],
  layout: PackedTreeLayout,
  medianMs: number,
) {
  const metrics = evaluatePackedTreeLayout({
    roots,
    nodes: layout.nodes,
    size: layout.size,
    targetAspect: 1.6,
  });
  return {
    totalNodes: nodeCount(roots),
    width: layout.size.width,
    height: layout.size.height,
    ...metrics,
    averageFrontierSize: layout.diagnostics?.averageFrontierSize ?? 1,
    maximumFrontierSize: layout.diagnostics?.maximumFrontierSize ?? 1,
    candidateCompositionCount: layout.diagnostics?.candidateCompositionCount ?? 0,
    selectedGrammar: layout.diagnostics?.selectedGrammar ?? 'balanced-rows',
    selectedGrammarCounts: layout.diagnostics?.selectedGrammarCounts ?? { 'balanced-rows': 1 },
    rootGrammars: Object.fromEntries(roots.map((root) => [
      root.id,
      layout.diagnostics?.selectedNodeGrammars[root.id] ?? 'balanced-rows',
    ])),
    medianMs,
  };
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface AbsoluteNode {
  node: PackedTreeNode;
  bounds: { x: number; y: number; width: number; height: number };
  depth: number;
}

function absoluteNodes(roots: readonly PackedTreeNode[], layout: PackedTreeLayout): AbsoluteNode[] {
  const nodes: AbsoluteNode[] = [];
  const visit = (node: PackedTreeNode, parentX: number, parentY: number, depth: number) => {
    const relative = layout.nodes[node.id];
    const bounds = {
      x: parentX + relative.x,
      y: parentY + relative.y,
      width: relative.width,
      height: relative.height,
    };
    nodes.push({ node, bounds, depth });
    for (const child of node.children ?? []) visit(child, bounds.x, bounds.y, depth + 1);
  };
  for (const root of roots) visit(root, 0, 0, 0);
  return nodes;
}

function panel(
  title: string,
  x: number,
  roots: readonly PackedTreeNode[],
  layout: PackedTreeLayout,
): string {
  const panelWidth = 1100;
  const panelHeight = 900;
  const scale = Math.min((panelWidth - 40) / layout.size.width, (panelHeight - 80) / layout.size.height);
  const colors = ['#d7b65d', '#efd88f', '#f5e7ba', '#fbf4df'];
  const body = absoluteNodes(roots, layout).map(({ node, bounds, depth }, index) => {
    const parent = Boolean(node.children?.length);
    const fill = colors[Math.min(depth, colors.length - 1)];
    const fontSize = parent ? Math.max(11, 15 - depth) : 12;
    const maxWidth = Math.max(fontSize, bounds.width - 12);
    const lines = wrapPackedText(node.name ?? '', maxWidth, fontSize)
      .slice(0, parent ? 2 : Math.max(1, Math.floor((bounds.height - 10) / (fontSize * 1.2))));
    const startY = parent
      ? bounds.y + fontSize + 5
      : bounds.y + bounds.height / 2 - ((lines.length - 1) * fontSize * 1.2) / 2 + fontSize * 0.35;
    const text = lines.map((line, lineIndex) =>
      `<tspan x="${bounds.x + bounds.width / 2}" y="${startY + lineIndex * fontSize * 1.2}">${escapeXml(line)}</tspan>`).join('');
    return `<g><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" rx="3" fill="${fill}" stroke="#6f5c2f" stroke-width="1.2"/><clipPath id="clip-${x}-${index}"><rect x="${bounds.x + 3}" y="${bounds.y + 3}" width="${Math.max(0, bounds.width - 6)}" height="${Math.max(0, bounds.height - 6)}"/></clipPath><text clip-path="url(#clip-${x}-${index})" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="${fontSize}" font-weight="${parent ? 650 : 400}" fill="#282313">${text}</text></g>`;
  }).join('');
  return `<g transform="translate(${x} 0)"><rect width="${panelWidth}" height="${panelHeight}" rx="14" fill="#fbfaf6" stroke="#d8d2c4"/><text x="20" y="32" font-family="Segoe UI, sans-serif" font-size="22" font-weight="700" fill="#2f2b23">${escapeXml(title)}</text><text x="20" y="54" font-family="Segoe UI, sans-serif" font-size="13" fill="#6f685d">${layout.size.width} × ${layout.size.height} · ${nodeCount(roots)} capabilities</text><g transform="translate(20 68) scale(${scale})">${body}</g></g>`;
}

const representative = representativeForest();
const synthetic = syntheticForest();
const representativeLegacy = benchmark(representative, legacyOptions, 3);
const representativeFrontier = benchmark(representative, frontierOptions, 3);
const syntheticLegacy = benchmark(synthetic, legacyOptions, 3);
const syntheticFrontier = benchmark(synthetic, frontierOptions, 3);
const stable = layoutPackedTree(representative, {
  ...frontierOptions,
  rootPlacement: 'preserve',
}, { previousBounds: representativeFrontier.layout.nodes });
const stabilityMetrics = evaluatePackedTreeLayout({
  roots: representative,
  nodes: stable.nodes,
  size: stable.size,
  targetAspect: 1.6,
  previousBounds: representativeFrontier.layout.nodes,
});

const report = {
  generatedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cpu: cpus()[0]?.model ?? 'unknown',
    note: 'Timing is observational only and never influences layout decisions.',
  },
  representative: {
    balancedRows: result(representative, representativeLegacy.layout, representativeLegacy.medianMs),
    frontier: result(representative, representativeFrontier.layout, representativeFrontier.medianMs),
    stableRerunMovement: stabilityMetrics.movement,
  },
  synthetic1700: {
    balancedRows: result(synthetic, syntheticLegacy.layout, syntheticLegacy.medianMs),
    frontier: result(synthetic, syntheticFrontier.layout, syntheticFrontier.medianMs),
  },
};

const reportPath = join(rootDirectory, 'tools', 'benchmarks', 'packed-layout-results.json');
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2240" height="940" viewBox="0 0 2240 940"><rect width="2240" height="940" fill="#f0ede6"/><g transform="translate(20 20)">${panel('Balanced rows · fixed leaves', 0, representative, representativeLegacy.layout)}${panel('GCHRP-2 frontier · text-aware leaves', 1120, representative, representativeFrontier.layout)}</g></svg>`;
const svgPath = join(rootDirectory, 'public', 'examples', 'gchrp2-comparison.svg');
writeFileSync(svgPath, svg, 'utf8');
const pngPath = join(rootDirectory, 'public', 'examples', 'gchrp2-comparison.png');
await sharp(Buffer.from(svg)).png().toFile(pngPath);

console.log(JSON.stringify({ reportPath, svgPath, pngPath, report }, null, 2));
