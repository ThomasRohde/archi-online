import { useEffect, useMemo, useRef } from 'react';
import { c4ViewType } from '../model/c4';
import {
  alignableNodeIds,
  createNestedConnectionVisibilityResolver,
  deleteViewObjects,
  duplicateViewObjects,
} from '../model/ops';
import { getActiveModelStore, setSelection } from '../model/store';
import { useModelStoreApi, useStore } from '../ui/store-hooks';
import { getActiveModelSession } from '../model/workspace';
import type { Bounds } from '../model/types';
import { setCanvasStatus } from '../ui/canvas-status';
import { useSettingsStore } from '../settings/app-settings';
import { ConnectionView } from './ConnectionView';
import { evaluateLabelExpression } from '../model/label-expression';
import {
  createConnectionRouteResolver,
  type Point,
} from './geometry';
import { computeAbsBounds, deriveLiveViewState } from './view-editor/bounds';
import { NodeView } from './view-editor/NodeView';
import { isConnectableGhosted } from './view-editor/viewpoint-ghost';
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
  const modelStore = useModelStoreApi();
  const model = useStore((s) => s.model);
  const selection = useStore((s) => s.selection);
  const activeTool = useStore((s) => s.activeTool);
  const settings = useSettingsStore((s) => s.settings);
  const alignmentAnchor = settings.alignmentAnchor;
  const pasteOffset = settings.pasteOffset;
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

  // Publish the active view's zoom to the status bar (see canvas-status.ts).
  const isActive = useStore((s) => s.activeViewId === viewId);
  useEffect(() => {
    if (isActive) setCanvasStatus({ zoom: viewport.zoom });
  }, [isActive, viewport.zoom]);

  useEffect(() => {
    if (!isActive) return;
    const onWindowKeyDown = (event: KeyboardEvent) => {
      const activeSession = getActiveModelSession();
      const ownsActiveModel = activeSession
        ? activeSession.store === modelStore
        : getActiveModelStore() === modelStore;
      if (!ownsActiveModel) return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return;
      }
      const state = modelStore.getState();
      if (state.readOnly || state.selection.source !== 'view' || state.selection.ids.length === 0) {
        return;
      }
      if (event.key === 'Delete') {
        event.preventDefault();
        deleteViewObjects(state.selection.ids, modelStore);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        const ids = duplicateViewObjects(
          viewId,
          state.selection.ids,
          pasteOffset,
          modelStore,
        );
        if (ids.length > 0) setSelection('view', ids, modelStore);
      }
    };
    window.addEventListener('keydown', onWindowKeyDown);
    return () => window.removeEventListener('keydown', onWindowKeyDown);
  }, [isActive, modelStore, pasteOffset, viewId]);

  if (!model || !view) return null;

  // Wrap the interaction move handler to also report the cursor position (in
  // view coordinates) to the status bar; clear it when the pointer leaves.
  const onCanvasPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    handlers.onPointerMove(e);
    if (isActive) {
      const p = toView(e.clientX, e.clientY);
      setCanvasStatus({ x: p.x, y: p.y });
    }
  };
  const onCanvasPointerLeave = () => setCanvasStatus({ x: null, y: null });

  const activeC4ViewType = c4ViewType(view);
  const { moveDelta, dropParentId, resizeOverride, liveAbs } = deriveLiveViewState(
    model,
    viewId,
    absBounds,
    inter,
  );
  const viewSelected = selection.source === 'view' ? new Set(selection.ids) : new Set<string>();
  // The element Align / Match Size snap the rest of the selection to. Only
  // meaningful when ≥ 2 alignable nodes are selected (matches the ops).
  const anchorId = (() => {
    if (selection.source !== 'view' || selection.ids.length < 2) return null;
    const alignable = alignableNodeIds(model, selection.ids);
    if (alignable.length < 2) return null;
    return alignmentAnchor === 0 ? alignable[0] : alignable[alignable.length - 1];
  })();
  const singleSelected = viewSelected.size === 1 && inter.kind === 'none' ? [...viewSelected][0] : null;
  const selectedNodeForHandles =
    singleSelected && model.nodes[singleSelected] ? singleSelected : null;
  const selectedConnectionCandidate = singleSelected ? model.connections[singleSelected] : undefined;
  const editNodeAbs = edit ? liveAbs.get(edit.nodeId) : undefined;
  const isConnectionVisible = createNestedConnectionVisibilityResolver(model, settings);
  const selectedConnection =
    selectedConnectionCandidate && isConnectionVisible(selectedConnectionCandidate.id)
      ? selectedConnectionCandidate
      : undefined;
  const storedRoutes = createConnectionRouteResolver(model, liveAbs, {
    isVisible: isConnectionVisible,
  });
  const previewConnections = new Map<string, typeof selectedConnection>();
  if (inter.kind === 'bend') {
    const connection = model.connections[inter.connId];
    const endpoints = storedRoutes.endpointPoints(inter.connId);
    if (connection && endpoints) {
      previewConnections.set(inter.connId, {
        ...connection,
        bendpoints: bendpointPreview(
          connection,
          endpoints.source,
          endpoints.target,
          inter,
        ),
      });
    }
  }
  const routes = createConnectionRouteResolver(model, liveAbs, {
    connection: (connectionId) => previewConnections.get(connectionId),
    isVisible: isConnectionVisible,
  });

  return (
    <div className="view-editor">
      <svg
        ref={svgRef}
        className="view-svg"
        style={{ cursor }}
        tabIndex={0}
        onPointerDown={handlers.onPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={handlers.onPointerUp}
        onPointerLeave={onCanvasPointerLeave}
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
              anchorId={anchorId}
              c4ViewType={activeC4ViewType}
              viewpoint={view.viewpoint}
            />
          ))}
          <g>
            {connections.map((conn) => {
              const points = routes(conn.id);
              if (!points) return null;
              const displayConnection = previewConnections.get(conn.id) ?? conn;
              return (
                <ConnectionView
                  key={conn.id}
                  conn={displayConnection}
                  rel={conn.relationshipId ? model.relationships[conn.relationshipId] : undefined}
                  points={points}
                  selected={viewSelected.has(conn.id)}
                  c4ViewType={activeC4ViewType}
                  ghosted={
                    isConnectableGhosted(model, conn.id, view.viewpoint)
                  }
                  displayLabel={conn.labelExpression !== undefined ? evaluateLabelExpression(model, conn.id, conn.labelExpression).text : undefined}
                />
              );
            })}
          </g>
          <BendpointHandles
            conn={selectedConnection}
            sourcePoint={selectedConnection ? routes.endpointPoints(selectedConnection.id)?.source : undefined}
            targetPoint={selectedConnection ? routes.endpointPoints(selectedConnection.id)?.target : undefined}
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
  const settings = useSettingsStore((s) => s.settings);
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
  const isConnectionVisible = createNestedConnectionVisibilityResolver(model, settings);
  const routes = createConnectionRouteResolver(model, absBounds, {
    isVisible: isConnectionVisible,
  });

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
            // Clicking empty canvas selects the view itself (its properties),
            // like Archi's diagram background; clicking an object selects it.
            if (hit) setSelection('view', [hit.id]);
            else setSelection('tree', [viewId]);
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
              viewpoint={view.viewpoint}
            />
          ))}
          <g>
            {connections.map((conn) => {
              const points = routes(conn.id);
              if (!points) return null;
              return (
                <ConnectionView
                  key={conn.id}
                  conn={conn}
                  rel={conn.relationshipId ? model.relationships[conn.relationshipId] : undefined}
                  points={points}
                  selected={viewSelected.has(conn.id)}
                  c4ViewType={activeC4ViewType}
                  ghosted={
                    isConnectableGhosted(model, conn.id, view.viewpoint)
                  }
                  displayLabel={conn.labelExpression !== undefined ? evaluateLabelExpression(model, conn.id, conn.labelExpression).text : undefined}
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
