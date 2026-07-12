import type { Bounds, DiagramConnection } from '../../model/types';
import { useSettingsStore } from '../../settings/app-settings';
import { bendpointPositions, toRelativeBendpoint } from '../geometry';
import type { EditState, Interaction, Viewport } from './types';

const HANDLES: { dir: string; fx: number; fy: number; cursor: string }[] = [
  { dir: 'nw', fx: 0, fy: 0, cursor: 'nwse-resize' },
  { dir: 'n', fx: 0.5, fy: 0, cursor: 'ns-resize' },
  { dir: 'ne', fx: 1, fy: 0, cursor: 'nesw-resize' },
  { dir: 'e', fx: 1, fy: 0.5, cursor: 'ew-resize' },
  { dir: 'se', fx: 1, fy: 1, cursor: 'nwse-resize' },
  { dir: 's', fx: 0.5, fy: 1, cursor: 'ns-resize' },
  { dir: 'sw', fx: 0, fy: 1, cursor: 'nesw-resize' },
  { dir: 'w', fx: 0, fy: 0.5, cursor: 'ew-resize' },
];

export function ResizeHandles({
  nodeId,
  bounds,
}: {
  nodeId: string | null;
  bounds: Bounds | undefined;
}) {
  if (!nodeId || !bounds) return null;
  return (
    <>
      {HANDLES.map((h) => (
        <rect
          key={h.dir}
          data-handle={h.dir}
          data-handle-node={nodeId}
          x={bounds.x + bounds.width * h.fx - 3.5}
          y={bounds.y + bounds.height * h.fy - 3.5}
          width={7}
          height={7}
          fill="#ffffff"
          stroke="#2a6cc4"
          strokeWidth={1.2}
          style={{ cursor: h.cursor }}
        />
      ))}
    </>
  );
}

export function BendpointHandles({
  conn,
  sourcePoint,
  targetPoint,
}: {
  conn: DiagramConnection | undefined;
  sourcePoint: import('../geometry').Point | undefined;
  targetPoint: import('../geometry').Point | undefined;
}) {
  if (!conn || !sourcePoint || !targetPoint) return null;
  return (
    <>
      {bendpointPositions(conn.bendpoints, sourcePoint, targetPoint).map((bp, i) => (
        <rect
          key={i}
          data-bendpoint={`${conn.id}@${i}`}
          x={bp.x - 3.5}
          y={bp.y - 3.5}
          width={7}
          height={7}
          fill="#ffffff"
          stroke="#2a6cc4"
          strokeWidth={1.2}
          style={{ cursor: 'move' }}
        />
      ))}
    </>
  );
}

export function MarqueeOverlay({ inter }: { inter: Interaction }) {
  if (inter.kind !== 'marquee') return null;
  return (
    <rect
      x={Math.min(inter.start.x, inter.current.x)}
      y={Math.min(inter.start.y, inter.current.y)}
      width={Math.abs(inter.current.x - inter.start.x)}
      height={Math.abs(inter.current.y - inter.start.y)}
      fill="rgba(42,108,196,0.08)"
      stroke="#2a6cc4"
      strokeWidth={1}
      strokeDasharray="4 3"
      pointerEvents="none"
    />
  );
}

export function PendingConnectionOverlay({
  inter,
  sourceBounds,
}: {
  inter: Interaction;
  sourceBounds: Bounds | undefined;
}) {
  if (inter.kind !== 'connect' || !sourceBounds) return null;
  const srcC = {
    x: sourceBounds.x + sourceBounds.width / 2,
    y: sourceBounds.y + sourceBounds.height / 2,
  };
  return (
    <line
      x1={srcC.x}
      y1={srcC.y}
      x2={inter.current.x}
      y2={inter.current.y}
      stroke="#2a6cc4"
      strokeWidth={1.2}
      strokeDasharray="5 3"
      pointerEvents="none"
    />
  );
}

export function DirectEditOverlay({
  edit,
  editNodeAbs,
  viewport,
  commitEdit,
}: {
  edit: EditState | null;
  editNodeAbs: Bounds | undefined;
  viewport: Viewport;
  commitEdit: (text: string | null) => void;
}) {
  if (!edit || !editNodeAbs) return null;
  return (
    <textarea
      className="direct-edit"
      style={{
        left: viewport.x + editNodeAbs.x * viewport.zoom,
        top: viewport.y + editNodeAbs.y * viewport.zoom,
        width: Math.max(60, editNodeAbs.width * viewport.zoom),
        height: Math.max(24, editNodeAbs.height * viewport.zoom),
      }}
      autoFocus
      defaultValue={edit.initial}
      onFocus={(e) => e.target.select()}
      onBlur={(e) => commitEdit(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commitEdit((e.target as HTMLTextAreaElement).value);
        }
        if (e.key === 'Escape') commitEdit(null);
      }}
    />
  );
}

export function ZoomControls({
  viewport,
  zoomBy,
  zoomTo,
  fitToView,
}: {
  viewport: Viewport;
  zoomBy: (factor: number) => void;
  zoomTo: (zoom: number) => void;
  fitToView: () => void;
}) {
  const buttonZoomFactor = useSettingsStore((s) => s.settings.buttonZoomFactor);
  return (
    <div className="zoom-controls">
      <button className="zoom-btn" title="Zoom out (Ctrl+-)" onClick={() => zoomBy(1 / buttonZoomFactor)}>
        -
      </button>
      <button className="zoom-btn zoom-pct" title="Reset to 100% (Ctrl+0)" onClick={() => zoomTo(1)}>
        {Math.round(viewport.zoom * 100)}%
      </button>
      <button className="zoom-btn" title="Zoom in (Ctrl+=)" onClick={() => zoomBy(buttonZoomFactor)}>
        +
      </button>
      <button className="zoom-btn" title="Fit to window (Home)" onClick={fitToView}>
        <svg viewBox="0 0 14 14" width="11" height="11">
          <path
            d="M1 5 V1 H5 M9 1 H13 V5 M13 9 V13 H9 M5 13 H1 V9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      </button>
    </div>
  );
}

export function bendpointPreview(
  conn: DiagramConnection,
  sourcePoint: import('../geometry').Point,
  targetPoint: import('../geometry').Point,
  inter: Interaction,
): DiagramConnection['bendpoints'] {
  if (inter.kind !== 'bend' || inter.connId !== conn.id) return conn.bendpoints;
  const bendpoints = [...conn.bendpoints];
  const bp = toRelativeBendpoint(inter.current, sourcePoint, targetPoint);
  if (inter.isNew) bendpoints.splice(inter.index, 0, bp);
  else bendpoints[inter.index] = bp;
  return bendpoints;
}
