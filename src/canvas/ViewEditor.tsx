import { useMemo, useRef } from 'react';
import { c4ViewType } from '../model/c4';
import { setSelection, useStore } from '../model/store';
import type { Bounds } from '../model/types';
import { ConnectionView } from './ConnectionView';
import { connectionPolyline, type Point } from './geometry';
import { computeAbsBounds, deriveLiveViewState } from './view-editor/bounds';
import { NodeView } from './view-editor/NodeView';
import {
  BendpointHandles,
  DirectEditOverlay,
  MarqueeOverlay,
  PendingConnectionOverlay,
  ResizeHandles,
  ZoomControls,
  bendpointPreview,
} from './view-editor/overlays';
import { useCanvasViewport } from './view-editor/useCanvasViewport';
import { useViewEditorInteractions } from './view-editor/useViewEditorInteractions';

export type { Viewport } from './view-editor/types';

export interface ViewEditorProps {
  viewId: string;
  readOnly?: boolean;
}

export function ViewEditor({ viewId, readOnly: readOnlyProp }: ViewEditorProps) {
  const readOnlyStore = useStore((s) => s.readOnly);
  const readOnly = readOnlyProp ?? readOnlyStore;
  return readOnly ? <ReadOnlyViewEditor viewId={viewId} /> : <EditableViewEditor viewId={viewId} />;
}

function readOnlyHitTarget(
  target: EventTarget | null,
  root: SVGSVGElement,
): { id: string } | null {
  let el = target instanceof Element ? target : null;
  while (el && el !== root) {
    const nodeId = el.getAttribute('data-node-id');
    if (nodeId) return { id: nodeId };
    const connId = el.getAttribute('data-conn-id');
    if (connId) return { id: connId };
    el = el.parentElement;
  }
  return null;
}

function EditableViewEditor({ viewId }: { viewId: string }) {
  const model = useStore((s) => s.model);
  const selection = useStore((s) => s.selection);
  const activeTool = useStore((s) => s.activeTool);
  const svgRef = useRef<SVGSVGElement>(null);

  const view = model?.views[viewId];
  const absBounds = useMemo(
    () => (model && view ? computeAbsBounds(model, viewId) : new Map<string, Bounds>()),
    [model, view, viewId],
  );
  const connections = useMemo(
    () => (model ? Object.values(model.connections).filter((c) => c.viewId === viewId) : []),
    [model, viewId],
  );

  const viewportApi = useCanvasViewport(viewId, svgRef, absBounds);
  const { viewport, setViewport, toView, zoomTo, zoomBy, fitToView, spaceHeld, spaceRef } =
    viewportApi;
  const { inter, edit, connectHover, commitEdit, cursor, handlers } =
    useViewEditorInteractions({
      model,
      view,
      viewId,
      svgRef,
      absBounds,
      viewport,
      activeTool,
      toView,
      setViewport,
      zoomTo,
      zoomBy,
      fitToView,
      spaceHeld,
      spaceRef,
    });

  if (!model || !view) return null;

  const activeC4ViewType = c4ViewType(view);
  const { moveDelta, dropParentId, resizeOverride, liveAbs } = deriveLiveViewState(
    model,
    viewId,
    absBounds,
    inter,
  );
  const viewSelected = selection.source === 'view' ? new Set(selection.ids) : new Set<string>();
  const singleSelected = viewSelected.size === 1 && inter.kind === 'none' ? [...viewSelected][0] : null;
  const selectedNodeForHandles =
    singleSelected && model.nodes[singleSelected] ? singleSelected : null;
  const selectedConnection = singleSelected ? model.connections[singleSelected] : undefined;
  const editNodeAbs = edit ? liveAbs.get(edit.nodeId) : undefined;

  return (
    <div className="view-editor">
      <svg
        ref={svgRef}
        className="view-svg"
        style={{ cursor }}
        tabIndex={0}
        onPointerDown={handlers.onPointerDown}
        onPointerMove={handlers.onPointerMove}
        onPointerUp={handlers.onPointerUp}
        onDoubleClick={handlers.onDoubleClick}
        onKeyDown={handlers.onKeyDown}
        onContextMenu={handlers.onContextMenu}
        onDragOver={handlers.onDragOver}
        onDrop={handlers.onDrop}
      >
        <g transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.zoom})`}>
          {view.childIds.map((id) => (
            <NodeView
              key={id}
              model={model}
              nodeId={id}
              moveDelta={moveDelta}
              resize={resizeOverride}
              dropParentId={dropParentId}
              connectSource={inter.kind === 'connect' ? inter.sourceNodeId : null}
              connectHover={connectHover}
              c4ViewType={activeC4ViewType}
            />
          ))}
          <g>
            {connections.map((conn) => {
              const src = liveAbs.get(conn.sourceId);
              const tgt = liveAbs.get(conn.targetId);
              if (!src || !tgt) return null;
              const bendpoints = bendpointPreview(conn, src, tgt, inter);
              return (
                <ConnectionView
                  key={conn.id}
                  conn={{ ...conn, bendpoints }}
                  rel={conn.relationshipId ? model.relationships[conn.relationshipId] : undefined}
                  points={connectionPolyline(src, tgt, bendpoints)}
                  selected={viewSelected.has(conn.id)}
                  c4ViewType={activeC4ViewType}
                />
              );
            })}
          </g>
          <BendpointHandles
            conn={selectedConnection}
            sourceBounds={selectedConnection ? liveAbs.get(selectedConnection.sourceId) : undefined}
            targetBounds={selectedConnection ? liveAbs.get(selectedConnection.targetId) : undefined}
          />
          <ResizeHandles
            nodeId={selectedNodeForHandles}
            bounds={selectedNodeForHandles ? liveAbs.get(selectedNodeForHandles) : undefined}
          />
          <MarqueeOverlay inter={inter} />
          <PendingConnectionOverlay
            inter={inter}
            sourceBounds={inter.kind === 'connect' ? liveAbs.get(inter.sourceNodeId) : undefined}
          />
        </g>
      </svg>
      <DirectEditOverlay
        edit={edit}
        editNodeAbs={editNodeAbs}
        viewport={viewport}
        commitEdit={commitEdit}
      />
      <ZoomControls viewport={viewport} zoomBy={zoomBy} zoomTo={zoomTo} fitToView={fitToView} />
    </div>
  );
}

function ReadOnlyViewEditor({ viewId }: { viewId: string }) {
  const model = useStore((s) => s.model);
  const selection = useStore((s) => s.selection);
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const emptyMoveDelta = useMemo(() => new Map<string, Point>(), []);

  const view = model?.views[viewId];
  const absBounds = useMemo(
    () => (model && view ? computeAbsBounds(model, viewId) : new Map<string, Bounds>()),
    [model, view, viewId],
  );
  const connections = useMemo(
    () => (model ? Object.values(model.connections).filter((c) => c.viewId === viewId) : []),
    [model, viewId],
  );
  const { viewport, setViewport, zoomTo, zoomBy, fitToView } = useCanvasViewport(
    viewId,
    svgRef,
    absBounds,
  );

  if (!model || !view) return null;

  const activeC4ViewType = c4ViewType(view);
  const viewSelected = selection.source === 'view' ? new Set(selection.ids) : new Set<string>();

  const stopPan = (pointerId: number, target: SVGSVGElement) => {
    if (panRef.current?.pointerId !== pointerId) return;
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    panRef.current = null;
  };

  return (
    <div className="view-editor read-only">
      <svg
        ref={svgRef}
        className="view-svg"
        style={{ cursor: 'default' }}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button === 0) {
            const hit = readOnlyHitTarget(event.target, event.currentTarget);
            setSelection('view', hit ? [hit.id] : []);
            return;
          }
          if (event.button !== 1) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          panRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: viewport.x,
            originY: viewport.y,
          };
        }}
        onPointerMove={(event) => {
          const pan = panRef.current;
          if (!pan || pan.pointerId !== event.pointerId) return;
          setViewport({
            ...viewport,
            x: pan.originX + event.clientX - pan.startX,
            y: pan.originY + event.clientY - pan.startY,
          });
        }}
        onPointerUp={(event) => stopPan(event.pointerId, event.currentTarget)}
        onPointerCancel={(event) => stopPan(event.pointerId, event.currentTarget)}
        onContextMenu={(event) => event.preventDefault()}
      >
        <g transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.zoom})`}>
          {view.childIds.map((id) => (
            <NodeView
              key={id}
              model={model}
              nodeId={id}
              moveDelta={emptyMoveDelta}
              resize={null}
              dropParentId={null}
              connectSource={null}
              connectHover={null}
              c4ViewType={activeC4ViewType}
            />
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
                  c4ViewType={activeC4ViewType}
                />
              );
            })}
          </g>
        </g>
      </svg>
      <ZoomControls viewport={viewport} zoomBy={zoomBy} zoomTo={zoomTo} fitToView={fitToView} />
    </div>
  );
}
