import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { AnalysisGraphResult } from '../../model/analysis-graph';
import type { ElkGraphLayoutResult } from '../../model/layout/elk-graph';
import { ELEMENT_TYPE_MAP } from '../../model/metamodel';
import { SEPARATOR, showContextMenu } from '../ContextMenu';
import {
  edgePoints,
  graphContentBounds,
  nodeLabelLayout,
  pathData,
  resolveRelationshipLabel,
  type VisualiserBounds,
} from './presentation';
import {
  centerAtZoom,
  fitViewport,
  panByScreenDelta,
  zoomAtPoint,
  type VisualiserViewport,
} from './viewport';

export interface VisualiserCanvasProps {
  graph: AnalysisGraphResult;
  layout: ElkGraphLayoutResult;
  showRelationshipNames: boolean;
  onSelectConcept: (id: string) => void;
  onOpenConcept: (id: string) => void;
}

interface PanState {
  pointerId: number;
  x: number;
  y: number;
}

const BUTTON_ZOOM_FACTOR = 1.2;
const WHEEL_ZOOM_FACTOR = 1.12;

function editableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

function viewportSize(element: HTMLElement | null): { width: number; height: number } {
  const rect = element?.getBoundingClientRect();
  return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
}

export function VisualiserCanvas({
  graph,
  layout,
  showRelationshipNames,
  onSelectConcept,
  onOpenConcept,
}: VisualiserCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const contentBounds = useMemo(
    () => graphContentBounds(graph, layout, showRelationshipNames),
    [graph, layout, showRelationshipNames],
  );
  const [viewport, setViewportState] = useState<VisualiserViewport>({ zoom: 1, x: 0, y: 0 });
  const viewportRef = useRef(viewport);
  const [pan, setPan] = useState<PanState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceHeldRef = useRef(false);

  const setViewport = useCallback((next: VisualiserViewport) => {
    viewportRef.current = next;
    setViewportState(next);
  }, []);

  const fitToView = useCallback(() => {
    setViewport(fitViewport(contentBounds, viewportSize(canvasRef.current)));
  }, [contentBounds, setViewport]);

  const centerContentAt = useCallback((zoom: number) => {
    setViewport(centerAtZoom(contentBounds, viewportSize(canvasRef.current), zoom));
  }, [contentBounds, setViewport]);

  const zoomAtCenter = useCallback((factor: number) => {
    const size = viewportSize(canvasRef.current);
    setViewport(zoomAtPoint(
      viewportRef.current,
      viewportRef.current.zoom * factor,
      { x: size.width / 2, y: size.height / 2 },
    ));
  }, [setViewport]);

  const centerNode = useCallback((bounds: VisualiserBounds) => {
    const size = viewportSize(canvasRef.current);
    const zoom = viewportRef.current.zoom;
    setViewport({
      zoom,
      x: size.width / 2 - (bounds.x + bounds.width / 2) * zoom,
      y: size.height / 2 - (bounds.y + bounds.height / 2) * zoom,
    });
  }, [setViewport]);

  useEffect(() => {
    fitToView();
  }, [fitToView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => fitToView());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [fitToView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = event.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
      setViewport(zoomAtPoint(
        viewportRef.current,
        viewportRef.current.zoom * factor,
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
      ));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [setViewport]);

  useEffect(() => {
    return () => {
      panRef.current = null;
      spaceHeldRef.current = false;
    };
  }, []);

  const setSpace = (held: boolean) => {
    spaceHeldRef.current = held;
    setSpaceHeld(held);
  };

  const finishPan = (event?: ReactPointerEvent<HTMLDivElement>) => {
    const current = panRef.current;
    if (!current || (event && event.pointerId !== current.pointerId)) return;
    if (event && canvasRef.current?.hasPointerCapture?.(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
    panRef.current = null;
    setPan(null);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    const onInteractiveChrome = Boolean(target?.closest(
      '.visualiser-zoom-controls, button, input, select, textarea, [contenteditable="true"]',
    ));
    if (onInteractiveChrome) return;
    const onNode = Boolean(target?.closest('.visualiser-node'));
    const start = event.button === 1 || (event.button === 0 && (spaceHeldRef.current || !onNode));
    if (!start) return;
    event.preventDefault();
    canvasRef.current?.focus({ preventScroll: true });
    canvasRef.current?.setPointerCapture?.(event.pointerId);
    const next = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    panRef.current = next;
    setPan(next);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = panRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    setViewport(panByScreenDelta(viewportRef.current, {
      x: event.clientX - current.x,
      y: event.clientY - current.y,
    }));
    const next = { ...current, x: event.clientX, y: event.clientY };
    panRef.current = next;
    setPan(next);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editableTarget(event.target)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (!spaceHeldRef.current) setSpace(true);
      return;
    }
    switch (event.key) {
      case '+':
      case '=':
        event.preventDefault();
        zoomAtCenter(BUTTON_ZOOM_FACTOR);
        break;
      case '-':
      case '_':
        event.preventDefault();
        zoomAtCenter(1 / BUTTON_ZOOM_FACTOR);
        break;
      case '0':
        event.preventDefault();
        centerContentAt(1);
        break;
      case '1':
        event.preventDefault();
        fitToView();
        break;
    }
  };

  const onKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.code === 'Space') setSpace(false);
  };

  const onContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    canvasRef.current?.focus({ preventScroll: true });
    const nodeElement = event.target instanceof Element
      ? event.target.closest<SVGGElement>('[data-concept-id]')
      : null;
    const conceptId = nodeElement?.dataset.conceptId;
    if (conceptId) {
      const bounds = layout.nodes[conceptId];
      showContextMenu(event.clientX, event.clientY, [
        { label: 'Select', onClick: () => onSelectConcept(conceptId) },
        { label: 'Open', onClick: () => onOpenConcept(conceptId) },
        SEPARATOR,
        {
          label: 'Center on node',
          disabled: !bounds,
          onClick: () => { if (bounds) centerNode(bounds); },
        },
        { label: 'Fit to view', onClick: fitToView },
      ]);
      return;
    }
    showContextMenu(event.clientX, event.clientY, [
      { label: 'Fit to view', onClick: fitToView },
      { label: 'Zoom in', onClick: () => zoomAtCenter(BUTTON_ZOOM_FACTOR) },
      { label: 'Zoom out', onClick: () => zoomAtCenter(1 / BUTTON_ZOOM_FACTOR) },
      { label: '100%', onClick: () => centerContentAt(1) },
    ]);
  };

  return (
    <div
      ref={canvasRef}
      className={'visualiser-canvas' + (pan ? ' is-panning' : '') + (spaceHeld ? ' is-space-held' : '')}
      tabIndex={0}
      role="application"
      aria-label="Visualiser graph. Use the mouse wheel to zoom and drag the background to pan."
      data-zoom={viewport.zoom}
      data-viewport-x={viewport.x}
      data-viewport-y={viewport.y}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPan}
      onPointerCancel={finishPan}
      onLostPointerCapture={finishPan}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => setSpace(false)}
      onContextMenu={onContextMenu}
    >
      <svg aria-label="Visualiser diagram" role="img">
        <defs>
          <marker id="visualiser-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 Z" />
          </marker>
        </defs>
        <g
          className="visualiser-viewport"
          transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}
        >
          {graph.edges.map((edge) => {
            const points = edgePoints(edge, layout);
            const label = resolveRelationshipLabel(edge, layout, showRelationshipNames);
            const labelStartY = label
              ? label.height / 2 - ((label.lines.length - 1) * label.lineHeight) / 2
                + label.fontSize * 0.35
              : 0;
            return (
              <g key={edge.id} className="visualiser-edge-group">
                <path
                  className="visualiser-edge"
                  d={pathData(points)}
                  markerEnd="url(#visualiser-arrow)"
                  vectorEffect="non-scaling-stroke"
                />
                {label && (
                  <g
                    className="visualiser-edge-label"
                    data-label-source={label.source}
                    transform={`translate(${label.x} ${label.y})`}
                  >
                    <rect width={label.width} height={label.height} rx="4" />
                    <text x={label.width / 2} style={{ fontSize: label.fontSize }}>
                      {label.lines.map((line, index) => (
                        <tspan
                          key={`${index}:${line}`}
                          x={label.width / 2}
                          y={labelStartY + index * label.lineHeight}
                        >
                          {line}
                        </tspan>
                      ))}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          {graph.nodes.map((node) => {
            const bounds = layout.nodes[node.id];
            if (!bounds) return null;
            const fill = node.kind === 'element' ? ELEMENT_TYPE_MAP[node.type].fill : '#f1f4f7';
            const label = nodeLabelLayout(node, bounds.width, bounds.height);
            return (
              <g
                key={node.id}
                className={'visualiser-node' + (node.focus ? ' focus' : '')}
                data-concept-id={node.id}
                transform={`translate(${bounds.x} ${bounds.y})`}
                onClick={() => onSelectConcept(node.id)}
                onDoubleClick={() => onOpenConcept(node.id)}
              >
                <rect
                  width={bounds.width}
                  height={bounds.height}
                  rx={node.compact ? 14 : 4}
                  fill={fill}
                  vectorEffect="non-scaling-stroke"
                />
                <text x={bounds.width / 2} style={{ fontSize: label.fontSize }}>
                  {label.lines.map((line, index) => (
                    <tspan
                      key={`${index}:${line}`}
                      x={bounds.width / 2}
                      y={label.startY + index * label.lineHeight}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="visualiser-zoom-controls" role="group" aria-label="Visualiser zoom controls">
        <button type="button" aria-label="Zoom out" title="Zoom out (-)" onClick={() => zoomAtCenter(1 / BUTTON_ZOOM_FACTOR)}>−</button>
        <button type="button" className="visualiser-zoom-percent" aria-label="Reset zoom to 100%" title="Reset zoom to 100% (0)" onClick={() => centerContentAt(1)}>{Math.round(viewport.zoom * 100)}%</button>
        <button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomAtCenter(BUTTON_ZOOM_FACTOR)}>+</button>
        <button type="button" className="visualiser-fit-button" aria-label="Fit graph to view" title="Fit graph to view (1)" onClick={fitToView}>Fit</button>
      </div>
    </div>
  );
}
