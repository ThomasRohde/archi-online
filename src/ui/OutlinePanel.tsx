import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StaticViewContent } from '../canvas/export/StaticViewSvg';
import { contentViewBox } from '../canvas/export/view-image';
import {
  requestPanTo,
  subscribeViewport,
  type ViewportInfo,
} from '../canvas/viewport-bus';
import { useStore } from '../model/store';
import type { Bounds } from '../model/types';

const EMPTY_VIEW_BOX = contentViewBox({ x: 0, y: 0, width: 0, height: 0 });

function viewBoxAttribute(bounds: Bounds): string {
  return `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`;
}

export function OutlinePanel() {
  const model = useStore((state) => state.model);
  const activeViewId = useStore((state) => state.activeViewId);
  const contentRef = useRef<SVGGElement>(null);
  const dragPointerId = useRef<number | null>(null);
  const [viewBox, setViewBox] = useState<Bounds>(EMPTY_VIEW_BOX);
  const [viewport, setViewport] = useState<ViewportInfo | null>(null);
  const [dragging, setDragging] = useState(false);
  const view = activeViewId && model ? model.views[activeViewId] : undefined;

  useLayoutEffect(() => {
    if (!model || !view || !contentRef.current) return;
    setViewBox(contentViewBox(contentRef.current.getBBox()));
  }, [model, view]);

  useEffect(() => {
    if (!activeViewId || !view) {
      setViewport(null);
      return;
    }
    return subscribeViewport(activeViewId, setViewport);
  }, [activeViewId, view]);

  if (!model || !activeViewId || !view) {
    return <div className="outline-empty">No active view</div>;
  }

  const panToPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const ctm = event.currentTarget.getScreenCTM();
    if (!ctm) return;
    const inverse = ctm.inverse();
    requestPanTo(
      activeViewId,
      inverse.a * event.clientX + inverse.c * event.clientY + inverse.e,
      inverse.b * event.clientX + inverse.d * event.clientY + inverse.f,
    );
  };

  const stopDragging = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragPointerId.current !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragPointerId.current = null;
    setDragging(false);
  };

  return (
    <div className="outline-panel">
      <svg
        className={`outline-svg${dragging ? ' dragging' : ''}`}
        viewBox={viewBoxAttribute(viewBox)}
        preserveAspectRatio="xMidYMid meet"
        aria-label={`Outline of ${view.name}`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          dragPointerId.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          panToPointer(event);
        }}
        onPointerMove={(event) => {
          if (dragPointerId.current === event.pointerId) panToPointer(event);
        }}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <g ref={contentRef}>
          <StaticViewContent model={model} viewId={activeViewId} />
        </g>
        {viewport && (
          <rect
            className="outline-viewport"
            x={viewport.x}
            y={viewport.y}
            width={viewport.width}
            height={viewport.height}
            fill="rgba(25, 118, 210, 0.08)"
            stroke="#1976d2"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
      </svg>
    </div>
  );
}
