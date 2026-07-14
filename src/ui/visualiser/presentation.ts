import { pointAlong } from '../../canvas/geometry';
import type {
  AnalysisGraphEdge,
  AnalysisGraphNode,
  AnalysisGraphResult,
} from '../../model/analysis-graph';
import {
  type ElkGraph,
  type ElkGraphLabel,
  type ElkGraphLayoutOptions,
  type ElkGraphLayoutResult,
  type ElkGraphPort,
} from '../../model/layout/elk-graph';
import {
  ELEMENT_TYPE_MAP,
  elementLabel,
  relationshipLabel,
} from '../../model/metamodel';

export interface VisualiserPoint {
  x: number;
  y: number;
}

export interface VisualiserBounds extends VisualiserPoint {
  width: number;
  height: number;
}

export interface NodeLabelLayout {
  fontSize: number;
  lineHeight: number;
  lines: string[];
  startY: number;
}

export interface RelationshipLabelLayout extends ElkGraphLabel {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  textWidth: number;
}

export interface ResolvedRelationshipLabel extends RelationshipLabelLayout, VisualiserBounds {
  source: 'elk' | 'fallback';
}

export interface VisualiserLayoutRequest {
  graph: ElkGraph;
  options: ElkGraphLayoutOptions;
}

const RELATIONSHIP_LABEL_FONT_SIZE = 10;
const RELATIONSHIP_LABEL_LINE_HEIGHT = 12;
const RELATIONSHIP_LABEL_MAX_TEXT_WIDTH = 160;
const RELATIONSHIP_LABEL_HORIZONTAL_PADDING = 8;
const RELATIONSHIP_LABEL_VERTICAL_PADDING = 5;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function approximateTextWidth(text: string, fontSize: number): number {
  return Array.from(text).reduce((width, character) => {
    if (character === ' ') return width + fontSize * 0.32;
    if (/[ilI1'.,:;]/.test(character)) return width + fontSize * 0.28;
    if (/[mMwW@#%&]/.test(character)) return width + fontSize * 0.82;
    if (/[A-Z]/.test(character)) return width + fontSize * 0.64;
    return width + fontSize * 0.54;
  }, 0);
}

function splitWord(word: string, maxWidth: number, fontSize: number): string[] {
  const chunks: string[] = [];
  let chunk = '';
  for (const character of word) {
    if (chunk && approximateTextWidth(chunk + character, fontSize) > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk += character;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
): string[] {
  const normalizedMaxWidth = Math.max(fontSize, maxWidth);
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    for (const chunk of splitWord(word, normalizedMaxWidth, fontSize)) {
      const candidate = line ? `${line} ${chunk}` : chunk;
      if (line && approximateTextWidth(candidate, fontSize) > normalizedMaxWidth) {
        lines.push(line);
        line = chunk;
      } else {
        line = candidate;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function nodeLabelText(node: AnalysisGraphNode): string {
  return node.name || (node.kind === 'element'
    ? elementLabel(node.type)
    : relationshipLabel(node.type));
}

export function nodeLabelLayout(
  node: AnalysisGraphNode,
  width: number,
  height: number,
): NodeLabelLayout {
  const fontSize = node.compact ? 10 : 11;
  const lineHeight = fontSize * 1.2;
  const lines = wrapText(nodeLabelText(node), Math.max(fontSize, width - 16), fontSize);
  const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.35;
  return { fontSize, lineHeight, lines, startY };
}

export function visualiserNodeSize(node: AnalysisGraphNode): { width: number; height: number } {
  const width = node.kind === 'relationship' ? 96 : ELEMENT_TYPE_MAP[node.type].width;
  const baseHeight = node.kind === 'relationship' ? 28 : ELEMENT_TYPE_MAP[node.type].height;
  const label = nodeLabelLayout(node, width, baseHeight);
  return {
    width,
    height: Math.max(baseHeight, Math.ceil(label.lines.length * label.lineHeight + 12)),
  };
}

export function relationshipLabelLayout(
  edge: AnalysisGraphEdge,
  showRelationshipNames: boolean,
): RelationshipLabelLayout | null {
  const text = edge.name.trim();
  if (!showRelationshipNames || !text || edge.segment === 'source') return null;
  const lines = wrapText(
    text,
    RELATIONSHIP_LABEL_MAX_TEXT_WIDTH,
    RELATIONSHIP_LABEL_FONT_SIZE,
  );
  const textWidth = Math.min(
    RELATIONSHIP_LABEL_MAX_TEXT_WIDTH,
    Math.max(...lines.map((line) => approximateTextWidth(line, RELATIONSHIP_LABEL_FONT_SIZE))),
  );
  return {
    id: `${edge.id}:label`,
    text,
    lines,
    fontSize: RELATIONSHIP_LABEL_FONT_SIZE,
    lineHeight: RELATIONSHIP_LABEL_LINE_HEIGHT,
    textWidth,
    width: Math.ceil(textWidth + RELATIONSHIP_LABEL_HORIZONTAL_PADDING * 2),
    height: Math.ceil(
      lines.length * RELATIONSHIP_LABEL_LINE_HEIGHT + RELATIONSHIP_LABEL_VERTICAL_PADDING * 2,
    ),
  };
}

function port(id: string, side: ElkGraphPort['side']): ElkGraphPort {
  return { id, side, width: 1, height: 1 };
}

export function buildVisualiserLayoutRequest(
  graph: AnalysisGraphResult,
  showRelationshipNames: boolean,
): VisualiserLayoutRequest {
  const portsByNode = new Map<string, ElkGraphPort[]>();
  const edges = graph.edges.map((edge) => {
    const sourcePortId = `${edge.id}:source-port`;
    const targetPortId = `${edge.id}:target-port`;
    const sourcePorts = portsByNode.get(edge.sourceId) ?? [];
    sourcePorts.push(port(sourcePortId, 'east'));
    portsByNode.set(edge.sourceId, sourcePorts);
    const targetPorts = portsByNode.get(edge.targetId) ?? [];
    targetPorts.push(port(targetPortId, 'west'));
    portsByNode.set(edge.targetId, targetPorts);
    const label = relationshipLabelLayout(edge, showRelationshipNames);
    return {
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      sourcePortId,
      targetPortId,
      ...(label
        ? { labels: [{ id: label.id, text: label.text, width: label.width, height: label.height }] }
        : {}),
    };
  });
  const nodes = graph.nodes.map((node) => {
    const ports = portsByNode.get(node.id);
    return {
      id: node.id,
      ...visualiserNodeSize(node),
      ...(ports?.length ? { portConstraints: 'fixed-side' as const, ports } : {}),
    };
  });
  const compactOptions: ElkGraphLayoutOptions = {
    direction: 'right',
    edgeRouting: 'orthogonal',
    nodeSpacing: 40,
    layerSpacing: 80,
    layoutOptions: {
      'elk.portAlignment.east': 'JUSTIFIED',
      'elk.portAlignment.west': 'JUSTIFIED',
    },
  };
  const labelledOptions: ElkGraphLayoutOptions = {
    direction: 'right',
    edgeRouting: 'orthogonal',
    nodeSpacing: 56,
    layerSpacing: 112,
    layoutOptions: {
      'elk.spacing.edgeEdge': 18,
      'elk.spacing.edgeNode': 20,
      'elk.layered.spacing.edgeEdgeBetweenLayers': 16,
      'elk.layered.spacing.edgeNodeBetweenLayers': 20,
      'elk.spacing.edgeLabel': 6,
      'elk.spacing.labelNode': 12,
      'elk.edgeLabels.inline': false,
      'elk.layered.edgeLabels.sideSelection': 'SMART_DOWN',
      'elk.layered.edgeLabels.centerLabelPlacementStrategy': 'SPACE_EFFICIENT_LAYER',
      'elk.layered.mergeEdges': false,
      'elk.portAlignment.east': 'JUSTIFIED',
      'elk.portAlignment.west': 'JUSTIFIED',
    },
  };
  return {
    graph: { nodes, edges },
    options: showRelationshipNames ? labelledOptions : compactOptions,
  };
}

export function edgePoints(
  edge: AnalysisGraphEdge,
  layout: ElkGraphLayoutResult,
): VisualiserPoint[] {
  const routed = layout.edges[edge.id]?.points;
  if (routed?.length) return routed;
  const source = layout.nodes[edge.sourceId];
  const target = layout.nodes[edge.targetId];
  if (!source || !target) return [];
  return [
    { x: source.x + source.width / 2, y: source.y + source.height / 2 },
    { x: target.x + target.width / 2, y: target.y + target.height / 2 },
  ];
}

export function pathData(points: readonly VisualiserPoint[]): string {
  return points
    .map((candidate, index) => `${index === 0 ? 'M' : 'L'}${candidate.x} ${candidate.y}`)
    .join(' ');
}

export function resolveRelationshipLabel(
  edge: AnalysisGraphEdge,
  layout: ElkGraphLayoutResult,
  showRelationshipNames: boolean,
): ResolvedRelationshipLabel | null {
  const label = relationshipLabelLayout(edge, showRelationshipNames);
  if (!label) return null;
  const elkLabel = layout.edges[edge.id]?.labels?.find((candidate) => candidate.id === label.id);
  if (
    elkLabel &&
    [elkLabel.x, elkLabel.y, elkLabel.width, elkLabel.height].every(Number.isFinite)
  ) {
    return { ...label, ...elkLabel, source: 'elk' };
  }
  const points = edgePoints(edge, layout);
  if (points.length < 2) return null;
  const midpoint = pointAlong(points, 0.5).point;
  return {
    ...label,
    x: midpoint.x - label.width / 2,
    y: midpoint.y - label.height - 6,
    source: 'fallback',
  };
}

export function graphContentBounds(
  graph: AnalysisGraphResult,
  layout: ElkGraphLayoutResult,
  showRelationshipNames: boolean,
): VisualiserBounds {
  const boxes: VisualiserBounds[] = Object.values(layout.nodes);
  const points = graph.edges.flatMap((edge) => edgePoints(edge, layout));
  const labels = graph.edges.flatMap((edge) => {
    const label = resolveRelationshipLabel(edge, layout, showRelationshipNames);
    return label ? [label] : [];
  });
  const xValues = [
    ...boxes.flatMap((box) => [box.x, box.x + box.width]),
    ...points.map((candidate) => candidate.x),
    ...labels.flatMap((box) => [box.x, box.x + box.width]),
  ];
  const yValues = [
    ...boxes.flatMap((box) => [box.y, box.y + box.height]),
    ...points.map((candidate) => candidate.y),
    ...labels.flatMap((box) => [box.y, box.y + box.height]),
  ];
  if (xValues.length === 0 || yValues.length === 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  const minX = Math.min(...xValues);
  const minY = Math.min(...yValues);
  const maxX = Math.max(...xValues);
  const maxY = Math.max(...yValues);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
