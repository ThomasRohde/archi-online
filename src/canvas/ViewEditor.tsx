import { useMemo, useRef, useState } from 'react';
import { openView, setSelection, useStore } from '../model/store';
import type { Bounds, ModelState } from '../model/types';
import { ConnectionView } from './ConnectionView';
import { connectionPolyline } from './geometry';
import { NodeFigure } from './figures/NodeFigure';

export interface Viewport {
  zoom: number;
  x: number;
  y: number;
}

const viewports = new Map<string, Viewport>();

function computeAbsBounds(model: ModelState, viewId: string): Map<string, Bounds> {
  const map = new Map<string, Bounds>();
  const walk = (ids: string[], ox: number, oy: number) => {
    for (const id of ids) {
      const node = model.nodes[id];
      if (!node) continue;
      const b = {
        x: ox + node.bounds.x,
        y: oy + node.bounds.y,
        width: node.bounds.width,
        height: node.bounds.height,
      };
      map.set(id, b);
      walk(node.childIds, b.x, b.y);
    }
  };
  const view = model.views[viewId];
  if (view) walk(view.childIds, 0, 0);
  return map;
}

function NodeView({ model, nodeId }: { model: ModelState; nodeId: string }) {
  const node = model.nodes[nodeId];
  const selected = useStore(
    (s) => s.selection.source === 'view' && s.selection.ids.includes(nodeId),
  );
  if (!node) return null;
  const element = node.nodeType === 'element' ? model.elements[node.elementId] : undefined;
  const refView = node.nodeType === 'ref' ? model.views[node.refViewId] : undefined;
  const { width, height } = node.bounds;
  return (
    <g transform={`translate(${node.bounds.x},${node.bounds.y})`} data-node-id={nodeId}>
      <NodeFigure node={node} element={element} refView={refView} width={width} height={height} />
      {selected && (
        <rect
          x={-1}
          y={-1}
          width={width + 2}
          height={height + 2}
          fill="none"
          stroke="#2a6cc4"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          pointerEvents="none"
        />
      )}
      {node.childIds.map((cid) => (
        <NodeView key={cid} model={model} nodeId={cid} />
      ))}
    </g>
  );
}

export function ViewEditor({ viewId }: { viewId: string }) {
  const model = useStore((s) => s.model);
  const selection = useStore((s) => s.selection);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewportState] = useState<Viewport>(
    () => viewports.get(viewId) ?? { zoom: 1, x: 20, y: 20 },
  );
  const panRef = useRef<{ startX: number; startY: number; vx: number; vy: number } | null>(null);

  const setViewport = (v: Viewport) => {
    viewports.set(viewId, v);
    setViewportState(v);
  };

  const view = model?.views[viewId];
  const absBounds = useMemo(
    () => (model && view ? computeAbsBounds(model, viewId) : new Map<string, Bounds>()),
    [model, view, viewId],
  );

  const connections = useMemo(() => {
    if (!model) return [];
    return Object.values(model.connections).filter((c) => c.viewId === viewId);
  }, [model, viewId]);

  if (!model || !view) return null;

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const zoom = Math.min(4, Math.max(0.2, viewport.zoom * factor));
      const rect = svgRef.current!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      // keep cursor position stable while zooming
      const wx = (cx - viewport.x) / viewport.zoom;
      const wy = (cy - viewport.y) / viewport.zoom;
      setViewport({ zoom, x: cx - wx * zoom, y: cy - wy * zoom });
    } else if (e.shiftKey) {
      setViewport({ ...viewport, x: viewport.x - e.deltaY });
    } else {
      setViewport({ ...viewport, x: viewport.x - e.deltaX, y: viewport.y - e.deltaY });
    }
  };

  const nodeIdFromEvent = (e: React.PointerEvent | React.MouseEvent): string | null => {
    let el = e.target as Element | null;
    while (el && el !== svgRef.current) {
      const id = el.getAttribute?.('data-node-id') ?? el.getAttribute?.('data-conn-id');
      if (id) return id;
      el = el.parentElement;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1) {
      // middle-drag pan
      panRef.current = { startX: e.clientX, startY: e.clientY, vx: viewport.x, vy: viewport.y };
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const id = nodeIdFromEvent(e);
    if (id) {
      const cur = useStore.getState().selection;
      if (e.ctrlKey && cur.source === 'view') {
        setSelection(
          'view',
          cur.ids.includes(id) ? cur.ids.filter((i) => i !== id) : [...cur.ids, id],
        );
      } else if (!(cur.source === 'view' && cur.ids.includes(id))) {
        setSelection('view', [id]);
      }
    } else {
      setSelection('view', []);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (panRef.current) {
      setViewport({
        ...viewport,
        x: panRef.current.vx + (e.clientX - panRef.current.startX),
        y: panRef.current.vy + (e.clientY - panRef.current.startY),
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (panRef.current && e.button === 1) {
      panRef.current = null;
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const id = nodeIdFromEvent(e);
    if (!id) return;
    const node = model.nodes[id];
    if (node?.nodeType === 'ref') openView(node.refViewId);
  };

  const viewSelected = selection.source === 'view' ? new Set(selection.ids) : new Set<string>();

  return (
    <div className="view-editor">
      <svg
        ref={svgRef}
        className="view-svg"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.zoom})`}>
          {view.childIds.map((id) => (
            <NodeView key={id} model={model} nodeId={id} />
          ))}
          <g>
            {connections.map((conn) => {
              const src = absBounds.get(conn.sourceId);
              const tgt = absBounds.get(conn.targetId);
              if (!src || !tgt) return null;
              return (
                <ConnectionView
                  key={conn.id}
                  conn={conn}
                  rel={conn.relationshipId ? model.relationships[conn.relationshipId] : undefined}
                  points={connectionPolyline(src, tgt, conn.bendpoints)}
                  selected={viewSelected.has(conn.id)}
                />
              );
            })}
          </g>
        </g>
      </svg>
      <div className="zoom-indicator">{Math.round(viewport.zoom * 100)}%</div>
    </div>
  );
}
