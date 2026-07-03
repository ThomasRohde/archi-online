import { useMemo, useRef } from 'react';
import { useStore } from '../model/store';
import type { Bounds } from '../model/types';
import { ConnectionView } from './ConnectionView';
import { connectionPolyline } from './geometry';
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

export function ViewEditor({ viewId }: { viewId: string }) {
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
