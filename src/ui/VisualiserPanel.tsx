import { useEffect, useMemo, useRef, useState } from 'react';
import { buildAnalysisGraph, type AnalysisGraphResult } from '../model/analysis-graph';
import { conceptsFromSelection } from '../model/analysis';
import { VIEWPOINTS } from '../model/data/viewpoints';
import {
  ELEMENT_TYPES,
  ELEMENT_TYPE_MAP,
  RELATIONSHIP_TYPES,
  elementLabel,
  relationshipLabel,
} from '../model/metamodel';
import {
  layoutElkGraph,
  type ElkGraph,
  type ElkGraphLayoutResult,
} from '../model/layout/elk-graph';
import { setSelection } from '../model/store';
import { pointAlong } from '../canvas/geometry';
import { copyPngBlobToClipboard, rasterizeSvg } from '../canvas/export/svg-image';
import { saveBlobToDisk, sanitizeFileName } from '../persistence/files';
import { useAnalysisPreferences } from '../settings/analysis-preferences';
import { useModelStoreApi, useStore } from './store-hooks';

export interface LayoutRequestGate {
  next(): number;
  isCurrent(token: number): boolean;
}

export function createLayoutRequestGate(): LayoutRequestGate {
  let current = 0;
  return {
    next: () => ++current,
    isCurrent: (token) => token === current,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function graphBounds(layout: ElkGraphLayoutResult) {
  const nodes = Object.values(layout.nodes);
  if (nodes.length === 0) return { x: 0, y: 0, width: 1, height: 1 };
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function edgePoints(
  edge: AnalysisGraphResult['edges'][number],
  layout: ElkGraphLayoutResult,
): Array<{ x: number; y: number }> {
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

function pathData(points: Array<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');
}

export interface AnalysisGraphRenderOptions {
  showRelationshipNames?: boolean;
}

interface EdgeLabel {
  text: string;
  x: number;
  y: number;
}

function edgeLabel(
  edge: AnalysisGraphResult['edges'][number],
  points: Array<{ x: number; y: number }>,
  showRelationshipNames: boolean,
): EdgeLabel | null {
  const text = edge.name.trim();
  if (!showRelationshipNames || !text || edge.segment === 'source' || points.length < 2) {
    return null;
  }
  const midpoint = pointAlong(points, 0.5).point;
  return { text, x: midpoint.x, y: midpoint.y - 5 };
}

function analysisGraphDocument(
  graph: AnalysisGraphResult,
  layout: ElkGraphLayoutResult,
  options: AnalysisGraphRenderOptions = {},
) {
  const content = graphBounds(layout);
  const margin = 28;
  const box = {
    x: content.x - margin,
    y: content.y - margin,
    width: Math.max(1, content.width + margin * 2),
    height: Math.max(1, content.height + margin * 2),
  };
  const edges = graph.edges.map((edge) => {
    const points = edgePoints(edge, layout);
    if (points.length < 2) return '';
    const label = edgeLabel(edge, points, options.showRelationshipNames ?? false);
    const labelMarkup = label
      ? `<text class="visualiser-edge-label" x="${label.x}" y="${label.y}" text-anchor="middle" font-size="10" fill="#526170" stroke="#ffffff" stroke-width="3" stroke-linejoin="round" paint-order="stroke">${escapeXml(label.text)}</text>`
      : '';
    return `<g><path d="${pathData(points)}" fill="none" stroke="#596979" stroke-width="1.4" marker-end="url(#arrow)"/>${labelMarkup}</g>`;
  }).join('');
  const nodes = graph.nodes.map((node) => {
    const bounds = layout.nodes[node.id];
    if (!bounds) return '';
    const fill = node.kind === 'element' ? ELEMENT_TYPE_MAP[node.type].fill : '#f1f4f7';
    const label = node.name || (node.kind === 'element'
      ? elementLabel(node.type)
      : relationshipLabel(node.type));
    return `<g transform="translate(${bounds.x} ${bounds.y})"><rect width="${bounds.width}" height="${bounds.height}" rx="${node.compact ? 13 : 4}" fill="${fill}" stroke="${node.focus ? '#1f6feb' : '#526170'}" stroke-width="${node.focus ? 2 : 1.2}"/><text x="${bounds.width / 2}" y="${bounds.height / 2 + 4}" text-anchor="middle" font-size="${node.compact ? 10 : 12}" fill="#1f2730">${escapeXml(label)}</text></g>`;
  }).join('');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}" viewBox="${box.x} ${box.y} ${box.width} ${box.height}" font-family="Segoe UI,system-ui,sans-serif"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="#ffffff"/><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#596979"/></marker></defs>${edges}${nodes}</svg>`;
  return { svg, width: box.width, height: box.height, box };
}

export function renderAnalysisGraphSvg(
  graph: AnalysisGraphResult,
  layout: ElkGraphLayoutResult,
  options: AnalysisGraphRenderOptions = {},
): string {
  return analysisGraphDocument(graph, layout, options).svg;
}

function currentConceptId(): string | null {
  const state = useStore.getState();
  return conceptsFromSelection(state.model, state.selection).at(-1) ?? null;
}

export interface VisualiserPanelProps {
  layoutGraph?: (graph: ElkGraph) => Promise<ElkGraphLayoutResult>;
}

const defaultVisualiserLayout = (graph: ElkGraph) => layoutElkGraph(graph, { direction: 'right' });

export function VisualiserPanel({ layoutGraph = defaultVisualiserLayout }: VisualiserPanelProps) {
  const modelStore = useModelStoreApi();
  const model = useStore((state) => state.model);
  const selection = useStore((state) => state.selection);
  const preferences = useAnalysisPreferences((state) => state.preferences);
  const setPreferences = useAnalysisPreferences((state) => state.setPreferences);
  const [history, setHistory] = useState<string[]>(() => {
    const selected = currentConceptId();
    return selected ? [selected] : [];
  });
  const [layoutState, setLayoutState] = useState<{
    graph: AnalysisGraphResult;
    layout: ElkGraphLayoutResult;
  } | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const ownSelection = useRef(false);
  const gate = useRef(createLayoutRequestGate());
  const focusId = history.at(-1) ?? null;
  const selectionKey = `${selection.source}:${selection.ids.join('|')}`;

  useEffect(() => {
    if (!model) {
      setHistory([]);
      return;
    }
    if (ownSelection.current) {
      ownSelection.current = false;
      return;
    }
    if (preferences.pinned) return;
    const selected = conceptsFromSelection(model, selection).at(-1);
    if (selected && selected !== focusId) setHistory([selected]);
  }, [focusId, model, preferences.pinned, selection, selectionKey]);

  const graph = useMemo(() => {
    if (!model || !focusId) return null;
    return buildAnalysisGraph(model, {
      focusIds: [focusId],
      depth: preferences.depth,
      direction: preferences.direction,
      viewpointId: preferences.viewpointId,
      elementTypes: preferences.elementTypes,
      relationshipTypes: preferences.relationshipTypes,
    });
  }, [focusId, model, preferences]);
  const layout = layoutState?.graph === graph ? layoutState.layout : null;

  useEffect(() => {
    if (!graph) {
      setLayoutState(null);
      return;
    }
    const token = gate.current.next();
    setError('');
    void layoutGraph({
      nodes: graph.nodes.map((node) => node.kind === 'relationship'
        ? { id: node.id, width: 96, height: 28 }
        : {
            id: node.id,
            width: ELEMENT_TYPE_MAP[node.type].width,
            height: ELEMENT_TYPE_MAP[node.type].height,
          }),
      edges: graph.edges.map((edge) => ({
        id: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
      })),
    }).then((next) => {
      if (gate.current.isCurrent(token)) setLayoutState({ graph, layout: next });
    }).catch((reason) => {
      if (gate.current.isCurrent(token)) {
        setLayoutState(null);
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    });
  }, [graph, layoutGraph, revision]);

  const navigate = (id: string) => {
    if (id === focusId) return;
    setHistory((current) => [...current, id]);
  };
  const selectConcept = (id: string) => {
    ownSelection.current = true;
    setSelection('tree', [id], modelStore);
  };
  const exportGraph = async (format: 'svg' | 'png' | 'clipboard') => {
    if (!graph || !layout || !model) return;
    const document = analysisGraphDocument(graph, layout, {
      showRelationshipNames: preferences.showRelationshipNames,
    });
    const focus = model.elements[focusId ?? ''] ?? model.relationships[focusId ?? ''];
    const base = sanitizeFileName(`Visualiser - ${focus?.name || 'Analysis'}`);
    if (format === 'svg') {
      await saveBlobToDisk(
        new Blob([document.svg], { type: 'image/svg+xml;charset=utf-8' }),
        `${base}.svg`,
        { description: 'SVG image', accept: { 'image/svg+xml': ['.svg'] } },
      );
      return;
    }
    const png = rasterizeSvg(document.svg, document.width, document.height, 2);
    if (format === 'clipboard') await copyPngBlobToClipboard(png);
    else await saveBlobToDisk(await png, `${base}.png`, {
      description: 'PNG image', accept: { 'image/png': ['.png'] },
    });
  };

  const document = graph && layout
    ? analysisGraphDocument(graph, layout, {
        showRelationshipNames: preferences.showRelationshipNames,
      })
    : null;
  return (
    <div className="visualiser-panel" data-focus-id={focusId ?? ''}>
      <div className="visualiser-toolbar">
        <button className="tb-btn small" disabled={history.length < 2} onClick={() => setHistory((current) => current.slice(0, -1))}>Back</button>
        <button className="tb-btn small" onClick={() => {
          const selected = currentConceptId();
          if (selected) setHistory([selected]);
        }}>Home</button>
        <button className={'tb-btn small' + (preferences.pinned ? ' active' : '')} aria-pressed={preferences.pinned} onClick={() => setPreferences({ pinned: !preferences.pinned })}>Pin</button>
        <button className="tb-btn small" disabled={!graph} onClick={() => setRevision((value) => value + 1)}>Relayout</button>
      </div>
      <div className="visualiser-controls">
        <label>Depth <select value={preferences.depth} onChange={(event) => setPreferences({ depth: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map((depth) => <option key={depth}>{depth}</option>)}</select></label>
        <label>Direction <select value={preferences.direction} onChange={(event) => setPreferences({ direction: event.target.value as typeof preferences.direction })}><option value="both">Both</option><option value="outgoing">Outgoing</option><option value="incoming">Incoming</option></select></label>
        <label>Viewpoint <select value={preferences.viewpointId} onChange={(event) => setPreferences({ viewpointId: event.target.value })}><option value="">All</option>{VIEWPOINTS.map((viewpoint) => <option key={viewpoint.id} value={viewpoint.id}>{viewpoint.name}</option>)}</select></label>
        <label className="visualiser-toggle"><input type="checkbox" checked={preferences.showRelationshipNames} onChange={(event) => setPreferences({ showRelationshipNames: event.target.checked })}/>Relationship names</label>
        <details className="visualiser-filters"><summary>Type filters</summary><div><strong>Elements</strong>{ELEMENT_TYPES.map((definition) => <label key={definition.type}><input type="checkbox" checked={preferences.elementTypes.includes(definition.type)} onChange={() => setPreferences({ elementTypes: preferences.elementTypes.includes(definition.type) ? preferences.elementTypes.filter((type) => type !== definition.type) : [...preferences.elementTypes, definition.type] })}/>{definition.label}</label>)}<strong>Relationships</strong>{RELATIONSHIP_TYPES.map((definition) => <label key={definition.type}><input type="checkbox" checked={preferences.relationshipTypes.includes(definition.type)} onChange={() => setPreferences({ relationshipTypes: preferences.relationshipTypes.includes(definition.type) ? preferences.relationshipTypes.filter((type) => type !== definition.type) : [...preferences.relationshipTypes, definition.type] })}/>{definition.label}</label>)}</div></details>
      </div>
      <div className="visualiser-export"><button className="tb-btn small" disabled={!layout} onClick={() => void exportGraph('svg')}>SVG</button><button className="tb-btn small" disabled={!layout} onClick={() => void exportGraph('png')}>PNG</button><button className="tb-btn small" disabled={!layout} onClick={() => void exportGraph('clipboard')}>Copy PNG</button>{graph?.truncated && <span className="visualiser-truncated">Limited to {graph.maxConcepts} concepts — tighten filters.</span>}</div>
      <div className="visualiser-canvas">
        {!model && <div className="empty-hint">No model open.</div>}
        {model && !focusId && <div className="empty-hint">Select an element or relationship.</div>}
        {error && <div className="empty-hint">{error}</div>}
        {graph && layout && document && <svg viewBox={`${document.box.x} ${document.box.y} ${document.box.width} ${document.box.height}`} aria-label="Visualiser graph">
          <defs><marker id="visualiser-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" /></marker></defs>
          {graph.edges.map((edge) => {
            const points = edgePoints(edge, layout);
            const label = edgeLabel(edge, points, preferences.showRelationshipNames);
            return <g key={edge.id}><path className="visualiser-edge" d={pathData(points)} markerEnd="url(#visualiser-arrow)" />{label && <text className="visualiser-edge-label" x={label.x} y={label.y}>{label.text}</text>}</g>;
          })}
          {graph.nodes.map((node) => {
            const bounds = layout.nodes[node.id];
            if (!bounds) return null;
            const fill = node.kind === 'element' ? ELEMENT_TYPE_MAP[node.type].fill : '#f1f4f7';
            const label = node.name || (node.kind === 'element' ? elementLabel(node.type) : relationshipLabel(node.type));
            return <g key={node.id} className={'visualiser-node' + (node.focus ? ' focus' : '')} data-concept-id={node.id} transform={`translate(${bounds.x} ${bounds.y})`} onClick={() => selectConcept(node.id)} onDoubleClick={() => navigate(node.id)}><rect width={bounds.width} height={bounds.height} rx={node.compact ? 14 : 4} fill={fill}/><text x={bounds.width / 2} y={bounds.height / 2 + 4}>{label}</text></g>;
          })}
        </svg>}
      </div>
      {graph && <div className="visualiser-status">{graph.elementIds.length} elements · {graph.relationshipIds.length} relationships</div>}
    </div>
  );
}
