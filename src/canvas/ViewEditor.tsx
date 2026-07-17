import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { c4ViewType } from '../model/c4';
import {
  alignableNodeIds,
  createNestedConnectionVisibilityResolver,
  deleteViewObjects,
  duplicateViewObjects,
} from '../model/ops';
import { getActiveModelStore, setSelection } from '../model/store';
import { useModelStoreApi, useStore } from '../ui/store-hooks';
import { getActiveModelSession, getModelSessionForStore } from '../model/workspace';
import type { Bounds } from '../model/types';
import {
  clearCanvasStatus,
  setCanvasStatus,
} from '../ui/canvas-status';
import { matchesShortcut } from '../ui/shortcuts';
import { createFrameThrottle } from '../ui/frame-throttle';
import { useSettingsStore } from '../settings/app-settings';
import { ConnectionView } from './ConnectionView';
import { evaluateLabelExpression } from '../model/label-expression';
import {
  createConnectionRouteResolver,
  pointAlong,
  type Point,
} from './geometry';
import { computeAbsBounds, deriveLiveViewState } from './view-editor/bounds';
import { NodeView } from './view-editor/NodeView';
import { isConnectableGhosted } from './view-editor/viewpoint-ghost';
import {
  BendpointHandles,
  ConnectionEndpointHandles,
  DirectEditOverlay,
  MarqueeOverlay,
  PendingConnectionOverlay,
  PendingReconnectionOverlay,
  ResizeHandles,
  ZoomControls,
  bendpointPreview,
} from './view-editor/overlays';
import { useCanvasViewport } from './view-editor/useCanvasViewport';
import { useViewEditorInteractions } from './view-editor/useViewEditorInteractions';
import { copyNodes, cutNodes } from './clipboard';
import { evaluateCachedLabelExpression } from './view-editor/label-cache';
import {
  createNodeInteractionVersions,
  pruneStableRoutes,
  stableRoutePoints,
} from './view-editor/live-render';
import {
  showEmptyCanvasContextMenu,
  showViewObjectContextMenu,
} from './view-editor/contextMenu';
import {
  reconnectIntentMessage,
  reconnectIntentTone,
} from './view-editor/reconnect-intent';
import { selectionMatchesObject } from '../model/analysis';

export type { Viewport } from './view-editor/types';

export interface ViewEditorProps {
  viewId: string;
  readOnly?: boolean;
}

export function ViewEditor({ viewId, readOnly: readOnlyProp }: ViewEditorProps) {
  const readOnlyStore = useStore((s) => s.readOnly);
  const readOnly = readOnlyProp ?? readOnlyStore;
  return readOnly ? (
    <ReadOnlyViewEditor
      viewId={viewId}
      editorReadOnly={readOnlyProp === undefined && readOnlyStore}
    />
  ) : <EditableViewEditor viewId={viewId} />;
}

function ViewGrid({ patternId, gridSize }: { patternId: string; gridSize: number }) {
  return (
    <>
      <defs>
        <pattern
          id={patternId}
          width={gridSize}
          height={gridSize}
          patternUnits="userSpaceOnUse"
        >
          <path
            className="view-grid-line"
            d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
          />
        </pattern>
      </defs>
      <rect
        data-view-grid
        className="view-grid"
        x={-100000}
        y={-100000}
        width={200000}
        height={200000}
        fill={`url(#${patternId})`}
      />
    </>
  );
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
  const gridPatternId = `view-grid-${useId().replace(/:/g, '')}`;
  const stableRoutesRef = useRef(new Map<string, Point[]>());
  const sessionId =
    getModelSessionForStore(modelStore)?.id ?? 'legacy-single-model';
  const cursorPublisher = useMemo(
    () =>
      createFrameThrottle((point: Point) =>
        setCanvasStatus(sessionId, viewId, { x: point.x, y: point.y })),
    [sessionId, viewId],
  );

  const view = model?.views[viewId];
  const absBounds = useMemo(
    () => (model && view ? computeAbsBounds(model, viewId) : new Map<string, Bounds>()),
    [model, view, viewId],
  );
  const connections = useMemo(
    () => (model ? Object.values(model.connections).filter((c) => c.viewId === viewId) : []),
    [model, viewId],
  );
  const connectionIds = useMemo(
    () => new Set(connections.map((connection) => connection.id)),
    [connections],
  );
  pruneStableRoutes(stableRoutesRef.current, connectionIds);
  const isConnectionVisible = useMemo(
    () => model
      ? createNestedConnectionVisibilityResolver(model, {
          hiddenRelationsTypes: settings.hiddenRelationsTypes,
          useNestedConnections: settings.useNestedConnections,
        })
      : () => false,
    [model, settings.hiddenRelationsTypes, settings.useNestedConnections],
  );

  const viewportApi = useCanvasViewport(viewId, svgRef, absBounds, modelStore);
  const { viewport, setViewport, toView, zoomTo, zoomBy, fitToView, spaceHeld, spaceRef } =
    viewportApi;
  const {
    inter,
    edit,
    connectHover,
    reconnectIntent,
    commitEdit,
    commitEditAndRestoreFocus,
    cancelEditAndSelect,
    cursor,
    handlers,
  } =
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
    if (isActive) setCanvasStatus(sessionId, viewId, { zoom: viewport.zoom });
  }, [isActive, sessionId, viewId, viewport.zoom]);

  useEffect(
    () => () => {
      cursorPublisher.cancel();
      clearCanvasStatus(sessionId, viewId);
    },
    [cursorPublisher, sessionId, viewId],
  );

  useEffect(() => {
    if (!reconnectIntent) return;
    setCanvasStatus(sessionId, viewId, {
      message: reconnectIntentMessage(reconnectIntent),
      tone: reconnectIntentTone(reconnectIntent),
    });
  }, [reconnectIntent, sessionId, viewId]);

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
      if (matchesShortcut('delete', event)) {
        event.preventDefault();
        deleteViewObjects(state.selection.ids, modelStore);
      } else if (matchesShortcut('duplicate', event)) {
        event.preventDefault();
        const ids = duplicateViewObjects(
          viewId,
          state.selection.ids,
          pasteOffset,
          modelStore,
        );
        if (ids.length > 0) setSelection('view', ids, modelStore);
      } else if (matchesShortcut('cut', event)) {
        event.preventDefault();
        const cutIds = cutNodes(
          state.selection.ids,
          modelStore,
          activeSession?.id ?? 'legacy-single-model',
        );
        if (cutIds.length > 0) setSelection('view', [], modelStore);
      }
    };
    window.addEventListener('keydown', onWindowKeyDown);
    return () => window.removeEventListener('keydown', onWindowKeyDown);
  }, [isActive, modelStore, pasteOffset, viewId]);

  const liveViewState = useMemo(
    () => model ? deriveLiveViewState(model, viewId, absBounds, inter) : null,
    [absBounds, inter, model, viewId],
  );
  const storedRoutes = useMemo(
    () =>
      model && liveViewState && inter.kind === 'bend'
        ? createConnectionRouteResolver(model, liveViewState.liveAbs, {
            isVisible: isConnectionVisible,
            orthogonalAnchors: settings.useOrthogonalConnectionAnchors,
            prewarmViewId: viewId,
          })
        : null,
    [
      inter.kind,
      isConnectionVisible,
      liveViewState,
      model,
      settings.useOrthogonalConnectionAnchors,
      viewId,
    ],
  );
  const previewConnection = useMemo(() => {
    if (!model || inter.kind !== 'bend' || !storedRoutes) return undefined;
    const connection = model.connections[inter.connId];
    const endpoints = storedRoutes.endpointPoints(inter.connId);
    return connection && endpoints
      ? {
        ...connection,
        bendpoints: bendpointPreview(
          connection,
          endpoints.source,
          endpoints.target,
          inter,
        ),
      }
      : undefined;
  }, [inter, model, storedRoutes]);
  const previewConnectionForId = useCallback(
    (connectionId: string) =>
      previewConnection?.id === connectionId ? previewConnection : undefined,
    [previewConnection],
  );
  const routes = useMemo(
    () =>
      model && liveViewState
        ? createConnectionRouteResolver(model, liveViewState.liveAbs, {
            connection: previewConnectionForId,
            isVisible: isConnectionVisible,
            orthogonalAnchors: settings.useOrthogonalConnectionAnchors,
            prewarmViewId: viewId,
          })
        : null,
    [
      isConnectionVisible,
      liveViewState,
      model,
      previewConnectionForId,
      settings.useOrthogonalConnectionAnchors,
      viewId,
    ],
  );

  if (!model || !view || !liveViewState || !routes) return null;

  // Wrap the interaction move handler to also report the cursor position (in
  // view coordinates) to the status bar; clear it when the pointer leaves.
  const onCanvasPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    handlers.onPointerMove(e);
    if (isActive) {
      const p = toView(e.clientX, e.clientY);
      cursorPublisher.push(p);
    }
  };
  const onCanvasPointerLeave = () => {
    handlers.onPointerLeave();
    cursorPublisher.cancel();
    setCanvasStatus(sessionId, viewId, { x: null, y: null });
  };

  const activeC4ViewType = c4ViewType(view);
  const alignmentGuides = inter.kind === 'move' || inter.kind === 'resize' ? inter.guides : [];
  const { moveDelta, dropParentId, resizeOverride, liveAbs } = liveViewState;
  const interactionVersions = createNodeInteractionVersions(model, {
    moveDelta,
    resize: resizeOverride,
    dropParentId,
    connectSourceId:
      inter.kind === 'connect' && model.nodes[inter.sourceId] ? inter.sourceId : null,
    connectHover,
    reconnectIntent,
  });
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
  const selectedConnection =
    selectedConnectionCandidate && isConnectionVisible(selectedConnectionCandidate.id)
      ? selectedConnectionCandidate
      : undefined;
  const pendingConnectionSourcePoint = (() => {
    if (inter.kind !== 'connect') return undefined;
    const bounds = liveAbs.get(inter.sourceId);
    if (bounds) {
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    }
    const route = routes(inter.sourceId);
    return route && route.length >= 2 ? pointAlong(route, 0.5).point : undefined;
  })();

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
        onPointerCancel={handlers.onPointerCancel}
        onLostPointerCapture={handlers.onLostPointerCapture}
        onPointerLeave={onCanvasPointerLeave}
        onDoubleClick={handlers.onDoubleClick}
        onKeyDown={handlers.onKeyDown}
        onContextMenu={handlers.onContextMenu}
        onDragOver={handlers.onDragOver}
        onDrop={handlers.onDrop}
      >
        <g transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.zoom})`}>
          {settings.gridVisible && (
            <ViewGrid patternId={gridPatternId} gridSize={settings.gridSize} />
          )}
          {view.childIds.map((id) => (
            <NodeView
              key={id}
              model={model}
              nodeId={id}
              moveDelta={moveDelta}
              resize={resizeOverride}
              dropParentId={dropParentId}
              connectSource={
                inter.kind === 'connect' && model.nodes[inter.sourceId] ? inter.sourceId : null
              }
              connectHover={connectHover}
              reconnectIntent={reconnectIntent}
              interactionVersions={interactionVersions}
              anchorId={anchorId}
              c4ViewType={activeC4ViewType}
              viewpoint={view.viewpoint}
            />
          ))}
          <g>
            {connections.map((conn) => {
              const nextPoints = routes(conn.id);
              if (!nextPoints) return null;
              const points = stableRoutePoints(stableRoutesRef.current.get(conn.id), nextPoints);
              stableRoutesRef.current.set(conn.id, points);
              const displayConnection =
                previewConnection?.id === conn.id ? previewConnection : conn;
              return (
                <ConnectionView
                  key={conn.id}
                  conn={displayConnection}
                  rel={conn.relationshipId ? model.relationships[conn.relationshipId] : undefined}
                  points={points}
                  selected={selectionMatchesObject(model, selection, conn.id)}
                  c4ViewType={activeC4ViewType}
                  ghosted={
                    isConnectableGhosted(model, conn.id, view.viewpoint)
                  }
                  displayLabel={conn.labelExpression !== undefined
                    ? evaluateCachedLabelExpression(
                        model,
                        conn.id,
                        conn.labelExpression,
                        evaluateLabelExpression,
                      ).text
                    : undefined}
                  interactionTone={
                    reconnectIntent?.targetId === conn.id
                      ? reconnectIntent.kind
                      : undefined
                  }
                />
              );
            })}
          </g>
          <ConnectionEndpointHandles
            conn={selectedConnection}
            points={selectedConnection ? routes(selectedConnection.id) : undefined}
            zoom={viewport.zoom}
          />
          <g className="alignment-guides" pointerEvents="none">
            {alignmentGuides.map((guide, index) => (
              <line
                key={`${guide.orientation}-${guide.position}-${index}`}
                className="alignment-guide"
                x1={guide.orientation === 'vertical' ? guide.position : guide.from}
                x2={guide.orientation === 'vertical' ? guide.position : guide.to}
                y1={guide.orientation === 'vertical' ? guide.from : guide.position}
                y2={guide.orientation === 'vertical' ? guide.to : guide.position}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
          <BendpointHandles
            conn={view.connectionRouterType === 2 ? undefined : selectedConnection}
            sourcePoint={selectedConnection ? routes.endpointPoints(selectedConnection.id)?.source : undefined}
            targetPoint={selectedConnection ? routes.endpointPoints(selectedConnection.id)?.target : undefined}
            zoom={viewport.zoom}
          />
          <ResizeHandles
            nodeId={selectedNodeForHandles}
            bounds={selectedNodeForHandles ? liveAbs.get(selectedNodeForHandles) : undefined}
            zoom={viewport.zoom}
          />
          <MarqueeOverlay inter={inter} />
          <PendingConnectionOverlay
            inter={inter}
            sourcePoint={pendingConnectionSourcePoint}
          />
          <PendingReconnectionOverlay
            inter={inter}
            points={inter.kind === 'reconnect' ? routes(inter.connId) : undefined}
            intent={reconnectIntent}
          />
        </g>
      </svg>
      <DirectEditOverlay
        edit={edit}
        editNodeAbs={editNodeAbs}
        viewport={viewport}
        commitEdit={commitEdit}
        commitEditAndRestoreFocus={commitEditAndRestoreFocus}
        cancelEdit={cancelEditAndSelect}
      />
      <ZoomControls viewport={viewport} zoomBy={zoomBy} zoomTo={zoomTo} fitToView={fitToView} />
    </div>
  );
}

function ReadOnlyViewEditor({
  viewId,
  editorReadOnly,
}: {
  viewId: string;
  editorReadOnly: boolean;
}) {
  const modelStore = useModelStoreApi();
  const model = useStore((s) => s.model);
  const selection = useStore((s) => s.selection);
  const settings = useSettingsStore((s) => s.settings);
  const svgRef = useRef<SVGSVGElement>(null);
  const gridPatternId = `view-grid-${useId().replace(/:/g, '')}`;
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const emptyMoveDelta = useMemo(() => new Map<string, Point>(), []);
  const emptyInteractionVersions = useMemo(() => new Map<string, string>(), []);
  const stableRoutesRef = useRef(new Map<string, Point[]>());
  const sessionId =
    getModelSessionForStore(modelStore)?.id ?? 'legacy-single-model';
  const cursorPublisher = useMemo(
    () =>
      createFrameThrottle((point: Point) =>
        setCanvasStatus(sessionId, viewId, { x: point.x, y: point.y })),
    [sessionId, viewId],
  );

  const view = model?.views[viewId];
  const absBounds = useMemo(
    () => (model && view ? computeAbsBounds(model, viewId) : new Map<string, Bounds>()),
    [model, view, viewId],
  );
  const connections = useMemo(
    () => (model ? Object.values(model.connections).filter((c) => c.viewId === viewId) : []),
    [model, viewId],
  );
  const connectionIds = useMemo(
    () => new Set(connections.map((connection) => connection.id)),
    [connections],
  );
  pruneStableRoutes(stableRoutesRef.current, connectionIds);
  const isConnectionVisible = useMemo(
    () => model
      ? createNestedConnectionVisibilityResolver(model, {
          hiddenRelationsTypes: settings.hiddenRelationsTypes,
          useNestedConnections: settings.useNestedConnections,
        })
      : () => false,
    [model, settings.hiddenRelationsTypes, settings.useNestedConnections],
  );
  const routes = useMemo(
    () => model
      ? createConnectionRouteResolver(model, absBounds, {
          isVisible: isConnectionVisible,
          orthogonalAnchors: settings.useOrthogonalConnectionAnchors,
          prewarmViewId: viewId,
        })
      : null,
    [
      absBounds,
      isConnectionVisible,
      model,
      settings.useOrthogonalConnectionAnchors,
      viewId,
    ],
  );
  const { viewport, setViewport, toView, zoomTo, zoomBy, fitToView } = useCanvasViewport(
    viewId,
    svgRef,
    absBounds,
    modelStore,
  );
  const isActive = useStore((s) => s.activeViewId === viewId);
  useEffect(() => {
    if (isActive) setCanvasStatus(sessionId, viewId, { zoom: viewport.zoom });
  }, [isActive, sessionId, viewId, viewport.zoom]);
  useEffect(
    () => () => {
      cursorPublisher.cancel();
      clearCanvasStatus(sessionId, viewId);
    },
    [cursorPublisher, sessionId, viewId],
  );

  if (!model || !view || !routes) return null;

  const activeC4ViewType = c4ViewType(view);
  const stopPan = (pointerId: number, target: SVGSVGElement) => {
    if (panRef.current?.pointerId !== pointerId) return;
    panRef.current = null;
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
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
            if (hit) setSelection('view', [hit.id], modelStore);
            else setSelection('tree', [viewId], modelStore);
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
          if (isActive) cursorPublisher.push(toView(event.clientX, event.clientY));
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
        onLostPointerCapture={(event) => stopPan(event.pointerId, event.currentTarget)}
        onPointerLeave={() => {
          cursorPublisher.cancel();
          setCanvasStatus(sessionId, viewId, { x: null, y: null });
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          const hit = readOnlyHitTarget(event.target, event.currentTarget);
          const sessionId = getModelSessionForStore(modelStore)?.id ?? 'legacy-single-model';
          if (hit) {
            const current = modelStore.getState().selection;
            const ids = current.source === 'view' && current.ids.includes(hit.id)
              ? current.ids
              : [hit.id];
            setSelection('view', ids, modelStore);
            showViewObjectContextMenu({
              clientX: event.clientX,
              clientY: event.clientY,
              viewId,
              id: hit.id,
              ids,
              model,
              settings,
              modelStore,
              sessionId,
              startEdit: () => undefined,
            });
            return;
          }
          if (!editorReadOnly) return;
          showEmptyCanvasContextMenu({
            clientX: event.clientX,
            clientY: event.clientY,
            viewId,
            parentId: viewId,
            parentAbs: { x: 0, y: 0 },
            point: toView(event.clientX, event.clientY),
            absBounds,
            startEdit: () => undefined,
            settings,
            modelStore,
            sessionId,
            snap: (value) => value,
            zoomBy,
            zoomTo,
            fitToView,
          });
        }}
        onKeyDown={(event) => {
          if (!matchesShortcut('copy', event)) return;
          const current = modelStore.getState().selection;
          if (current.source !== 'view' || current.ids.length === 0) return;
          event.preventDefault();
          copyNodes(current.ids, modelStore);
        }}
      >
        <g transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.zoom})`}>
          {editorReadOnly && settings.gridVisible && (
            <ViewGrid patternId={gridPatternId} gridSize={settings.gridSize} />
          )}
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
              reconnectIntent={null}
              interactionVersions={emptyInteractionVersions}
              c4ViewType={activeC4ViewType}
              viewpoint={view.viewpoint}
            />
          ))}
          <g>
            {connections.map((conn) => {
              const nextPoints = routes(conn.id);
              if (!nextPoints) return null;
              const points = stableRoutePoints(stableRoutesRef.current.get(conn.id), nextPoints);
              stableRoutesRef.current.set(conn.id, points);
              return (
                <ConnectionView
                  key={conn.id}
                  conn={conn}
                  rel={conn.relationshipId ? model.relationships[conn.relationshipId] : undefined}
                  points={points}
                  selected={selectionMatchesObject(model, selection, conn.id)}
                  c4ViewType={activeC4ViewType}
                  ghosted={
                    isConnectableGhosted(model, conn.id, view.viewpoint)
                  }
                  displayLabel={conn.labelExpression !== undefined
                    ? evaluateCachedLabelExpression(
                        model,
                        conn.id,
                        conn.labelExpression,
                        evaluateLabelExpression,
                      ).text
                    : undefined}
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
