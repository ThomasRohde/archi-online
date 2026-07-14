import { useEffect, useMemo, useRef, useState } from 'react';
import { buildAnalysisGraph, type AnalysisGraphResult } from '../model/analysis-graph';
import { conceptsFromSelection } from '../model/analysis';
import { VIEWPOINTS } from '../model/data/viewpoints';
import {
  ELEMENT_TYPES,
  ELEMENT_TYPE_MAP,
  RELATIONSHIP_TYPES,
} from '../model/metamodel';
import {
  layoutElkGraph,
  type ElkGraph,
  type ElkGraphLayoutOptions,
  type ElkGraphLayoutResult,
} from '../model/layout/elk-graph';
import { setSelection } from '../model/store';
import { copyPngBlobToClipboard, rasterizeSvg } from '../canvas/export/svg-image';
import { saveBlobToDisk, sanitizeFileName } from '../persistence/files';
import { useAnalysisPreferences } from '../settings/analysis-preferences';
import { useModelStoreApi, useStore } from './store-hooks';
import { VisualiserCanvas } from './visualiser/VisualiserCanvas';
import {
  buildVisualiserLayoutRequest,
  edgePoints,
  escapeXml,
  graphContentBounds,
  nodeLabelLayout,
  pathData,
  resolveRelationshipLabel,
} from './visualiser/presentation';

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

export interface AnalysisGraphRenderOptions {
  showRelationshipNames?: boolean;
}

function analysisGraphDocument(
  graph: AnalysisGraphResult,
  layout: ElkGraphLayoutResult,
  options: AnalysisGraphRenderOptions = {},
) {
  const showRelationshipNames = options.showRelationshipNames ?? false;
  const content = graphContentBounds(graph, layout, showRelationshipNames);
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
    const label = resolveRelationshipLabel(edge, layout, showRelationshipNames);
    const labelStartY = label
      ? label.height / 2 - ((label.lines.length - 1) * label.lineHeight) / 2
        + label.fontSize * 0.35
      : 0;
    const labelText = label?.lines.map((line, index) => (
      `<tspan x="${label.width / 2}" y="${labelStartY + index * label.lineHeight}">${escapeXml(line)}</tspan>`
    )).join('') ?? '';
    const labelMarkup = label
      ? `<g class="visualiser-edge-label" data-label-source="${label.source}" transform="translate(${label.x} ${label.y})"><rect width="${label.width}" height="${label.height}" rx="4" fill="#ffffff" stroke="#b8c3cf" stroke-width="1"/><text x="${label.width / 2}" text-anchor="middle" font-size="${label.fontSize}" fill="#445364">${labelText}</text></g>`
      : '';
    return `<g><path d="${pathData(points)}" fill="none" stroke="#596979" stroke-width="1.4" marker-end="url(#arrow)"/>${labelMarkup}</g>`;
  }).join('');
  const nodes = graph.nodes.map((node) => {
    const bounds = layout.nodes[node.id];
    if (!bounds) return '';
    const fill = node.kind === 'element' ? ELEMENT_TYPE_MAP[node.type].fill : '#f1f4f7';
    const label = nodeLabelLayout(node, bounds.width, bounds.height);
    const labelMarkup = label.lines.map((line, index) => `<tspan x="${bounds.width / 2}" y="${label.startY + index * label.lineHeight}">${escapeXml(line)}</tspan>`).join('');
    return `<g transform="translate(${bounds.x} ${bounds.y})"><rect width="${bounds.width}" height="${bounds.height}" rx="${node.compact ? 13 : 4}" fill="${fill}" stroke="${node.focus ? '#1f6feb' : '#526170'}" stroke-width="${node.focus ? 2 : 1.2}"/><text x="${bounds.width / 2}" text-anchor="middle" font-size="${label.fontSize}" fill="#1f2730">${labelMarkup}</text></g>`;
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
  layoutGraph?: (
    graph: ElkGraph,
    options?: ElkGraphLayoutOptions,
  ) => Promise<ElkGraphLayoutResult>;
}

const defaultVisualiserLayout = (graph: ElkGraph, options?: ElkGraphLayoutOptions) => (
  layoutElkGraph(graph, options)
);

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
    showRelationshipNames: boolean;
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
  const layout = layoutState?.graph === graph
    && layoutState.showRelationshipNames === preferences.showRelationshipNames
    ? layoutState.layout
    : null;

  useEffect(() => {
    if (!graph) {
      setLayoutState(null);
      return;
    }
    const token = gate.current.next();
    setError('');
    const request = buildVisualiserLayoutRequest(graph, preferences.showRelationshipNames);
    void layoutGraph(request.graph, request.options).then((next) => {
      if (gate.current.isCurrent(token)) setLayoutState({
        graph,
        showRelationshipNames: preferences.showRelationshipNames,
        layout: next,
      });
    }).catch((reason) => {
      if (gate.current.isCurrent(token)) {
        setLayoutState(null);
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    });
  }, [graph, layoutGraph, preferences.showRelationshipNames, revision]);

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
      {graph && layout ? (
        <VisualiserCanvas
          graph={graph}
          layout={layout}
          showRelationshipNames={preferences.showRelationshipNames}
          onSelectConcept={selectConcept}
          onOpenConcept={navigate}
        />
      ) : <div className="visualiser-canvas visualiser-canvas-empty">
        {!model && <div className="empty-hint">No model open.</div>}
        {model && !focusId && <div className="empty-hint">Select an element or relationship.</div>}
        {error && <div className="empty-hint">{error}</div>}
      </div>}
      {graph && <div className="visualiser-status">{graph.elementIds.length} elements · {graph.relationshipIds.length} relationships</div>}
    </div>
  );
}
