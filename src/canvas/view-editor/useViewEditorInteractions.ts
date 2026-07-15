import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react';
import { elementLabel } from '../../model/metamodel';
import { newId } from '../../model/id';
import { C4_ELEMENT_TYPES } from '../../model/c4';
import {
  addGroupToView,
  addImageToView,
  addLegendToView,
  addNoteToView,
  applyFormatPainterSnapshot,
  analyzeConnectionReconnection,
  analyzeMagicConnectionTarget,
  analyzeMagicTargetCreation,
  canCreatePlainConnection,
  captureDiagramStyleSnapshot,
  createC4ElementOnView,
  commitMove,
  createElementOnView,
  createMagicConnectionOnView,
  createMagicTargetOnView,
  createPlainConnectionOnView,
  createRelationshipOnView,
  createNestedConnectionVisibilityResolver,
  deleteViewObjects,
  duplicateViewObjects,
  renameItem,
  setConceptProfiles,
  setConnectionBendpoints,
  isAutomaticRelationshipTriggerEnabled,
  type MoveEntry,
} from '../../model/ops';
import { isAllowedRelationship } from '../../model/rules';
import {
  openView as openModelView,
  finishPaletteToolUse,
  runBatch,
  setActiveTool as setModelActiveTool,
  setSelection as setModelSelection,
  type Tool,
} from '../../model/store';
import { useModelStoreApi } from '../../ui/store-hooks';
import { getModelSessionForStore } from '../../model/workspace';
import type { Bounds, DiagramView, ModelState } from '../../model/types';
import {
  defaultElementSize,
  defaultGroupSize,
  defaultNoteSize,
  defaultTextStyle,
  useSettingsStore,
} from '../../settings/app-settings';
import { showContextMenu } from '../../ui/ContextMenu';
import { requestNestingChange } from '../../ui/automatic-relationships';
import { requestConnectionReconnection } from '../../ui/connection-reconnection';
import { copyNodes, cutNodes, pasteNodes } from '../clipboard';
import {
  closestSegment,
  createConnectionRouteResolver,
  pointAlong,
  rectsIntersect,
  toRelativeBendpoint,
  type Point,
} from '../geometry';
import {
  containerAt,
  dropTargetFor,
  selectionRoots,
  snapMoveToAlignmentGuides,
  snapResizeToAlignmentGuides,
} from './bounds';
import { showEmptyCanvasContextMenu, showViewObjectContextMenu } from './contextMenu';
import { addDroppedItemsToView, planDroppedItemsToView } from './drop';
import {
  buildMagicConnectionMenuItems,
  buildMagicTargetMenuItems,
} from './magic-connector-menu';
import type { EditState, Interaction, Viewport } from './types';

export {
  buildMagicConnectionMenuItems,
  buildMagicTargetMenuItems,
};

interface UseViewEditorInteractionsParams {
  model: ModelState | null;
  view: DiagramView | undefined;
  viewId: string;
  svgRef: RefObject<SVGSVGElement>;
  absBounds: Map<string, Bounds>;
  viewport: Viewport;
  activeTool: Tool;
  toView: (clientX: number, clientY: number) => Point;
  setViewport: (viewport: Viewport) => void;
  zoomTo: (zoom: number) => void;
  zoomBy: (factor: number) => void;
  fitToView: () => void;
  spaceHeld: boolean;
  spaceRef: MutableRefObject<boolean>;
}

export function useViewEditorInteractions({
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
}: UseViewEditorInteractionsParams) {
  const modelStore = useModelStoreApi();
  const sessionId = getModelSessionForStore(modelStore)?.id ?? 'legacy-single-model';
  const setSelection = (source: 'tree' | 'view', ids: string[]) =>
    setModelSelection(source, ids, modelStore);
  const setActiveTool = (tool: Tool) => setModelActiveTool(tool, modelStore);
  const openView = (id: string) => openModelView(id, modelStore);
  const settings = useSettingsStore((s) => s.settings);
  const [inter, setInter] = useState<Interaction>({ kind: 'none' });
  const [edit, setEdit] = useState<EditState | null>(null);
  const interRef = useRef(inter);
  const activePointerIdRef = useRef<number | null>(null);
  const interactionModelRef = useRef<{
    model: ModelState | null;
    modelEpoch: number;
  } | null>(null);
  const interactionContextRef = useRef({ model, viewId });
  interRef.current = inter;
  const isConnectionVisible = model
    ? createNestedConnectionVisibilityResolver(model, settings)
    : () => false;
  const connectionRoutes = model
    ? createConnectionRouteResolver(model, absBounds, { isVisible: isConnectionVisible })
    : undefined;

  const snap = (v: number, disable?: boolean) =>
    disable || !settings.snapToGrid
      ? Math.round(v)
      : Math.round(v / settings.gridSize) * settings.gridSize;

  const hitFromEvent = (
    e: { clientX: number; clientY: number },
  ): {
    nodeId?: string;
    connId?: string;
    handle?: string;
    bendIndex?: number;
    connectionEnd?: 'source' | 'target';
  } => {
    // Element under the cursor, not the event target: pointer capture retargets
    // events to the svg root mid-gesture.
    let el = document.elementFromPoint(e.clientX, e.clientY);
    while (el && el !== svgRef.current) {
      const connectionEnd = el.getAttribute?.('data-connection-endpoint-handle');
      if (connectionEnd === 'source' || connectionEnd === 'target') {
        return {
          connId: el.getAttribute('data-connection-endpoint-id') ?? undefined,
          connectionEnd,
        };
      }
      const handle = el.getAttribute?.('data-handle');
      if (handle) return { handle, nodeId: el.getAttribute('data-handle-node') ?? undefined };
      const bp = el.getAttribute?.('data-bendpoint');
      if (bp) {
        const [connId, idx] = bp.split('@');
        return { connId, bendIndex: parseInt(idx, 10) };
      }
      const nid = el.getAttribute?.('data-node-id');
      if (nid) return { nodeId: nid };
      const cid = el.getAttribute?.('data-conn-id');
      if (cid) return { connId: cid };
      el = el.parentElement;
    }
    return {};
  };

  const startEdit = (nodeId: string) => {
    // Read fresh state: often called right after an op, before this render updates.
    const m = modelStore.getState().model;
    const node = m?.nodes[nodeId];
    if (!m || !node) return;
    if (node.nodeType === 'note' && node.legendOptions) return;
    let initial: string;
    if (node.nodeType === 'element') initial = m.elements[node.elementId]?.name ?? '';
    else if (node.nodeType === 'group') initial = node.name;
    else if (node.nodeType === 'note') initial = node.content;
    else return;
    setEdit({ nodeId, initial });
  };

  const commitEdit = (text: string | null) => {
    if (edit && text !== null && model) {
      const node = model.nodes[edit.nodeId];
      if (node?.nodeType === 'element') renameItem(node.elementId, text, modelStore);
      else if (node) renameItem(edit.nodeId, text, modelStore);
    }
    setEdit(null);
  };

  const restoreCanvasFocus = () => {
    setTimeout(() => svgRef.current?.focus(), 0);
  };

  const ownsPointer = (pointerId: number) => activePointerIdRef.current === pointerId;

  const captureInteractionModel = () => {
    const state = modelStore.getState();
    interactionModelRef.current = { model: state.model, modelEpoch: state.modelEpoch };
  };

  const interactionModelIsCurrent = () => {
    const source = interactionModelRef.current;
    if (!source) return true;
    const state = modelStore.getState();
    return state.model === source.model && state.modelEpoch === source.modelEpoch;
  };

  const clearInteraction = () => {
    interactionModelRef.current = null;
    setInter({ kind: 'none' });
  };

  const capturePointer = (pointerId: number, preserveInteractionModel = false) => {
    if (!preserveInteractionModel || !interactionModelRef.current) captureInteractionModel();
    svgRef.current!.setPointerCapture(pointerId);
    activePointerIdRef.current = pointerId;
  };

  const safelyReleasePointerCapture = useCallback((pointerId: number) => {
    const svg = svgRef.current;
    try {
      if (
        svg &&
        typeof svg.hasPointerCapture === 'function' &&
        svg.hasPointerCapture(pointerId)
      ) {
        svg.releasePointerCapture(pointerId);
      }
    } catch {
      // Capture can disappear between the ownership check and release.
    }
  }, [svgRef]);

  useEffect(() => {
    const previous = interactionContextRef.current;
    interactionContextRef.current = { model, viewId };
    if (previous.model === model && previous.viewId === viewId) return;
    const pointerId = activePointerIdRef.current;
    if (pointerId === null && interRef.current.kind === 'none') return;
    activePointerIdRef.current = null;
    interactionModelRef.current = null;
    setInter({ kind: 'none' });
    if (pointerId === null) return;
    safelyReleasePointerCapture(pointerId);
  }, [model, safelyReleasePointerCapture, viewId]);

  const releasePointer = (pointerId: number) => {
    if (!ownsPointer(pointerId)) return false;
    // Clear ownership before release: releasePointerCapture may synchronously
    // dispatch lostpointercapture in browsers and test doubles.
    activePointerIdRef.current = null;
    safelyReleasePointerCapture(pointerId);
    return true;
  };

  const cancelPointerInteraction = (pointerId: number) => {
    if (!ownsPointer(pointerId)) return;
    activePointerIdRef.current = null;
    clearInteraction();
    safelyReleasePointerCapture(pointerId);
  };

  const commitEditAndRestoreFocus = (text: string) => {
    commitEdit(text);
    restoreCanvasFocus();
  };

  const cancelEditAndSelect = () => {
    setEdit(null);
    setActiveTool({ kind: 'select' });
    restoreCanvasFocus();
  };

  const finishConnect = (
    targetId: string | undefined,
    clientX: number,
    clientY: number,
    elementFirst = false,
  ) => {
    const currentModel = modelStore.getState().model;
    if (!currentModel) {
      clearInteraction();
      return;
    }
    const cur = interRef.current;
    if (cur.kind !== 'connect') return;
    const tool = modelStore.getState().activeTool;
    clearInteraction();
    const srcNode = currentModel.nodes[cur.sourceId];
    const tgtNode = targetId ? currentModel.nodes[targetId] : undefined;
    if (tool.kind === 'create-plain-connection') {
      const connectionId = targetId
        ? createPlainConnectionOnView(viewId, cur.sourceId, targetId, modelStore)
        : null;
      if (connectionId) setSelection('view', [connectionId]);
      finishPaletteToolUse(tool, modelStore);
      return;
    }
    if (srcNode?.nodeType !== 'element') return;
    if (tool.kind === 'create-relationship') {
      if (tgtNode?.nodeType !== 'element') {
        finishPaletteToolUse(tool, modelStore);
        return;
      }
      const res = createRelationshipOnView(
        tool.type,
        viewId,
        cur.sourceId,
        tgtNode.id,
        modelStore,
      );
      if (res) setSelection('view', [res.connectionId]);
      finishPaletteToolUse(tool, modelStore);
    } else if (tool.kind === 'magic-connector') {
      if (tgtNode?.nodeType === 'element') {
        const analysis = analyzeMagicConnectionTarget(currentModel, {
          viewId,
          sourceNodeId: cur.sourceId,
          targetNodeId: tgtNode.id,
        });
        const items = buildMagicConnectionMenuItems(
          analysis,
          (option, relationshipId) => {
            const res = createMagicConnectionOnView({
              viewId,
              sourceNodeId: cur.sourceId,
              targetNodeId: tgtNode.id,
              direction: option.direction,
              relationshipType: option.relationshipType,
              relationshipId,
            }, modelStore);
            if (res) setSelection('view', [res.connectionId]);
          },
        );
        if (items.length > 0) {
          showContextMenu(clientX, clientY, items, (reason) => {
            if (reason === 'escape') setActiveTool({ kind: 'select' });
          });
        }
      } else {
        const point = toView(clientX, clientY);
        const containerId =
          tgtNode?.nodeType === 'group'
            ? tgtNode.id
            : (containerAt(currentModel, viewId, absBounds, point, new Set()) ?? viewId);
        const parentId =
          containerId === viewId || currentModel.nodes[containerId]?.nodeType === 'group'
            ? containerId
            : viewId;
        const parentAbs =
          parentId === viewId ? { x: 0, y: 0 } : (absBounds.get(parentId) ?? { x: 0, y: 0 });
        const analysis = analyzeMagicTargetCreation(currentModel, {
          viewId,
          sourceNodeId: cur.sourceId,
        });
        const items = buildMagicTargetMenuItems(analysis, elementFirst, (pair) => {
          const size = defaultElementSize(pair.elementType, settings);
          const result = createMagicTargetOnView({
            viewId,
            sourceNodeId: cur.sourceId,
            parentId,
            bounds: {
              x: snap(point.x - parentAbs.x - size.width / 2),
              y: snap(point.y - parentAbs.y - size.height / 2),
              width: size.width,
              height: size.height,
            },
            elementType: pair.elementType,
            relationshipType: pair.relationshipType,
            defaults: defaultTextStyle(settings),
          }, modelStore);
          if (!result) return;
          setSelection('view', [result.nodeId]);
          setTimeout(() => startEdit(result.nodeId), 0);
        });
        if (items.length > 0) {
          showContextMenu(clientX, clientY, items, (reason) => {
            if (reason === 'escape') setActiveTool({ kind: 'select' });
          });
        }
      }
      finishPaletteToolUse(tool, modelStore);
    }
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!model || !view) return;
    if (activePointerIdRef.current !== null && !ownsPointer(e.pointerId)) return;
    if (activePointerIdRef.current !== null && !interactionModelIsCurrent()) {
      cancelPointerInteraction(e.pointerId);
      return;
    }
    svgRef.current?.focus();
    if (edit) commitEdit(null);
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      setInter({ kind: 'pan', startX: e.clientX, startY: e.clientY, vx: viewport.x, vy: viewport.y });
      capturePointer(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const continuingConnect = interRef.current.kind === 'connect';
    if (continuingConnect && !interactionModelIsCurrent()) {
      clearInteraction();
      return;
    }
    capturePointer(e.pointerId, continuingConnect);
    const p = toView(e.clientX, e.clientY);
    const hit = hitFromEvent(e);
    const tool = modelStore.getState().activeTool;

    if (tool.kind === 'format-painter') {
      const targetId = hit.nodeId ?? hit.connId;
      if (!targetId) return;
      if (!tool.snapshot) {
        const snapshot = captureDiagramStyleSnapshot(model, targetId);
        if (snapshot) setActiveTool({ ...tool, snapshot });
        return;
      }
      if (applyFormatPainterSnapshot(targetId, tool.snapshot, modelStore)) {
        finishPaletteToolUse(tool, modelStore);
      }
      return;
    }

    if (
      tool.kind === 'create-element' ||
      tool.kind === 'create-c4-element' ||
      tool.kind === 'create-image' ||
      tool.kind === 'create-note' ||
      tool.kind === 'create-legend' ||
      tool.kind === 'create-group'
    ) {
      const parentId = containerAt(model, viewId, absBounds, p, new Set()) ?? viewId;
      const parentAbs = parentId === viewId ? { x: 0, y: 0 } : absBounds.get(parentId)!;
      const textDefaults = defaultTextStyle(settings);
      if (tool.kind === 'create-element') {
        const def = defaultElementSize(tool.type, settings);
        const bounds = {
          x: snap(p.x - parentAbs.x - def.width / 2, e.altKey),
          y: snap(p.y - parentAbs.y - def.height / 2, e.altKey),
          width: def.width,
          height: def.height,
        };
        const automatic =
          model.nodes[parentId]?.nodeType === 'element' &&
          isAutomaticRelationshipTriggerEnabled('palette', settings);
        if (automatic) {
          const nodeId = newId();
          const elementId = newId();
          void requestNestingChange(
            {
              viewId,
              trigger: 'palette',
              entries: [
                {
                  kind: 'create-element',
                  nodeId,
                  elementId,
                  elementType: tool.type,
                  name: elementLabel(tool.type),
                  profileIds: tool.profileId ? [tool.profileId] : [],
                  parentId,
                  bounds,
                  defaults: textDefaults,
                },
              ],
            },
            settings,
            modelStore,
          ).then((result) => {
            finishPaletteToolUse(tool, modelStore);
            if (!result || !modelStore.getState().model?.nodes[nodeId]) return;
            setSelection('view', [nodeId]);
            setTimeout(() => startEdit(nodeId), 0);
          });
        } else {
          let nodeId = '';
          runBatch('Create Specialized Element', () => {
            const created = createElementOnView(
              tool.type,
              viewId,
              parentId,
              bounds,
              undefined,
              textDefaults,
              modelStore,
            );
            nodeId = created.nodeId;
            if (tool.profileId) setConceptProfiles(created.elementId, [tool.profileId], modelStore);
          }, modelStore);
          setSelection('view', [nodeId]);
          finishPaletteToolUse(tool, modelStore);
          setTimeout(() => startEdit(nodeId), 0);
        }
      } else if (tool.kind === 'create-c4-element') {
        const def = defaultElementSize(C4_ELEMENT_TYPES[tool.c4Kind], settings);
        const bounds = {
          x: snap(p.x - parentAbs.x - def.width / 2, e.altKey),
          y: snap(p.y - parentAbs.y - def.height / 2, e.altKey),
          width: Math.max(def.width, 150),
          height: Math.max(def.height, 72),
        };
        const { nodeId } = createC4ElementOnView(
          tool.c4Kind,
          viewId,
          parentId,
          bounds,
          undefined,
          tool.c4Properties,
          textDefaults,
          modelStore,
        );
        setSelection('view', [nodeId]);
        finishPaletteToolUse(tool, modelStore);
        setTimeout(() => startEdit(nodeId), 0);
      } else if (tool.kind === 'create-image') {
        const width = 120;
        const height = 80;
        const id = addImageToView(
          viewId,
          parentId,
          {
            x: snap(p.x - parentAbs.x - width / 2, e.altKey),
            y: snap(p.y - parentAbs.y - height / 2, e.altKey),
            width,
            height,
          },
          tool.imagePath,
          textDefaults,
          modelStore,
        );
        setSelection('view', [id]);
        finishPaletteToolUse(tool, modelStore);
      } else if (tool.kind === 'create-note') {
        const def = defaultNoteSize(settings);
        const id = addNoteToView(
          viewId,
          parentId,
          {
            x: snap(p.x - parentAbs.x),
            y: snap(p.y - parentAbs.y),
            width: def.width,
            height: def.height,
          },
          '',
          textDefaults,
          modelStore,
        );
        setSelection('view', [id]);
        finishPaletteToolUse(tool, modelStore);
        setTimeout(() => startEdit(id), 0);
      } else if (tool.kind === 'create-legend') {
        const id = addLegendToView(
          viewId,
          parentId,
          {
            x: snap(p.x - parentAbs.x),
            y: snap(p.y - parentAbs.y),
            width: 210,
            height: 320,
          },
          {
            rowsPerColumn: settings.legendRowsPerColumn,
            colorScheme: settings.legendColorScheme as 0 | 1 | 2,
            sortMethod: settings.legendSortMethod as 0 | 1,
          },
          {},
          modelStore,
        );
        if (id) setSelection('view', [id]);
        finishPaletteToolUse(tool, modelStore);
      } else {
        const def = defaultGroupSize(settings);
        const id = addGroupToView(
          viewId,
          parentId,
          {
            x: snap(p.x - parentAbs.x),
            y: snap(p.y - parentAbs.y),
            width: def.width,
            height: def.height,
          },
          'Group',
          textDefaults,
          modelStore,
        );
        setSelection('view', [id]);
        finishPaletteToolUse(tool, modelStore);
      }
      return;
    }

    if (
      tool.kind === 'create-relationship' ||
      tool.kind === 'create-plain-connection' ||
      tool.kind === 'magic-connector'
    ) {
      const cur = interRef.current;
      if (cur.kind === 'connect') {
        finishConnect(hit.nodeId ?? hit.connId, e.clientX, e.clientY, e.ctrlKey || e.metaKey);
      } else {
        const sourceId = hit.nodeId ?? hit.connId;
        const sourceIsValid = sourceId && (
          tool.kind === 'create-plain-connection'
            ? Boolean(model.nodes[sourceId] ?? model.connections[sourceId])
            : model.nodes[sourceId]?.nodeType === 'element'
        );
        if (sourceId && sourceIsValid) {
          setInter({ kind: 'connect', sourceId, current: p, hoverConnectableId: null });
        }
      }
      return;
    }

    if (hit.handle && hit.nodeId) {
      const abs = absBounds.get(hit.nodeId)!;
      setInter({
        kind: 'resize',
        nodeId: hit.nodeId,
        handle: hit.handle,
        startAbs: abs,
        currentAbs: abs,
        guides: [],
        guideSnapped: { x: false, y: false },
      });
      return;
    }
    if (hit.connectionEnd && hit.connId) {
      setSelection('view', [hit.connId]);
      setInter({
        kind: 'reconnect',
        connId: hit.connId,
        end: hit.connectionEnd,
        current: p,
        hoverConnectableId: null,
      });
      return;
    }
    if (hit.connId !== undefined && hit.bendIndex !== undefined) {
      setSelection('view', [hit.connId]);
      setInter({
        kind: 'bend',
        connId: hit.connId,
        index: hit.bendIndex,
        start: p,
        current: p,
        isNew: false,
      });
      return;
    }
    if (hit.nodeId) {
      const cur = modelStore.getState().selection;
      if (e.ctrlKey && cur.source === 'view') {
        setSelection(
          'view',
          cur.ids.includes(hit.nodeId) ? cur.ids.filter((i) => i !== hit.nodeId) : [...cur.ids, hit.nodeId],
        );
      } else if (!(cur.source === 'view' && cur.ids.includes(hit.nodeId))) {
        setSelection('view', [hit.nodeId]);
      }
      setInter({ kind: 'maybe-move', start: p, nodeId: hit.nodeId });
      return;
    }
    if (hit.connId) {
      const cur = modelStore.getState().selection;
      if (e.ctrlKey && cur.source === 'view') {
        setSelection(
          'view',
          cur.ids.includes(hit.connId) ? cur.ids.filter((i) => i !== hit.connId) : [...cur.ids, hit.connId],
        );
      } else {
        setSelection('view', [hit.connId]);
      }
      setInter(
        view.connectionRouterType === 2
          ? { kind: 'none' }
          : { kind: 'maybe-bend', start: p, connId: hit.connId },
      );
      return;
    }
    setInter({ kind: 'marquee', start: p, current: p, additive: e.ctrlKey });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const idleConnect = activePointerIdRef.current === null && interRef.current.kind === 'connect';
    if (!model || (!ownsPointer(e.pointerId) && !idleConnect)) return;
    if (!interactionModelIsCurrent()) {
      if (ownsPointer(e.pointerId)) cancelPointerInteraction(e.pointerId);
      else clearInteraction();
      return;
    }
    const cur = interRef.current;
    if (cur.kind === 'none') return;
    const p = toView(e.clientX, e.clientY);
    switch (cur.kind) {
      case 'pan':
        setViewport({
          ...viewport,
          x: cur.vx + (e.clientX - cur.startX),
          y: cur.vy + (e.clientY - cur.startY),
        });
        break;
      case 'maybe-move': {
        if (
          Math.hypot(p.x - cur.start.x, p.y - cur.start.y) * viewport.zoom >
          settings.moveDragThreshold
        ) {
          const sel = modelStore.getState().selection;
          const ids = sel.source === 'view' && sel.ids.includes(cur.nodeId) ? sel.ids : [cur.nodeId];
          const rootIds = selectionRoots(model, ids);
          if (rootIds.length > 0) {
            setInter({
              kind: 'move',
              start: cur.start,
              current: p,
              rootIds,
              dropParentId: null,
              guides: [],
              guideSnapped: { x: false, y: false },
            });
          }
        }
        break;
      }
      case 'maybe-bend': {
        if (
          Math.hypot(p.x - cur.start.x, p.y - cur.start.y) * viewport.zoom >
          settings.bendDragThreshold
        ) {
          const conn = model.connections[cur.connId];
          const points = conn ? connectionRoutes?.(conn.id) : undefined;
          if (!conn || !points) break;
          const seg = closestSegment(points, cur.start);
          setInter({
            kind: 'bend',
            connId: cur.connId,
            index: seg.index,
            start: cur.start,
            current: p,
            isNew: true,
          });
        }
        break;
      }
      case 'move': {
        const dropParentId = dropTargetFor(model, viewId, absBounds, p, cur.rootIds);
        const rawDelta = { x: p.x - cur.start.x, y: p.y - cur.start.y };
        const guideResult = settings.snapToAlignmentGuides && !e.altKey
          ? snapMoveToAlignmentGuides(
              model,
              absBounds,
              cur.rootIds,
              rawDelta,
              6 / viewport.zoom,
            )
          : { delta: rawDelta, guides: [], snapped: { x: false, y: false } };
        setInter({
          ...cur,
          current: {
            x: cur.start.x + guideResult.delta.x,
            y: cur.start.y + guideResult.delta.y,
          },
          dropParentId,
          guides: guideResult.guides,
          guideSnapped: guideResult.snapped,
        });
        break;
      }
      case 'resize': {
        const { startAbs, handle } = cur;
        let { x, y, width, height } = startAbs;
        const dx = p.x - (handle.includes('w') ? startAbs.x : startAbs.x + startAbs.width);
        const dy = p.y - (handle.includes('n') ? startAbs.y : startAbs.y + startAbs.height);
        if (handle.includes('e')) {
          width = Math.max(settings.minNodeSize, startAbs.width + dx);
        }
        if (handle.includes('s')) {
          height = Math.max(settings.minNodeSize, startAbs.height + dy);
        }
        if (handle.includes('w')) {
          const nx = startAbs.x + dx;
          width = Math.max(settings.minNodeSize, startAbs.width + (startAbs.x - nx));
          x = startAbs.x + startAbs.width - width;
        }
        if (handle.includes('n')) {
          const ny = startAbs.y + dy;
          height = Math.max(settings.minNodeSize, startAbs.height + (startAbs.y - ny));
          y = startAbs.y + startAbs.height - height;
        }
        const rawBounds = { x, y, width, height };
        const guideResult = settings.snapToAlignmentGuides && !e.altKey
          ? snapResizeToAlignmentGuides(
              model,
              absBounds,
              cur.nodeId,
              rawBounds,
              handle,
              6 / viewport.zoom,
              settings.minNodeSize,
            )
          : { bounds: rawBounds, guides: [], snapped: { x: false, y: false } };
        ({ x, y, width, height } = guideResult.bounds);
        if (!guideResult.snapped.x) {
          if (handle.includes('e')) width = Math.max(settings.minNodeSize, snap(rawBounds.width, e.altKey));
          if (handle.includes('w')) {
            const nx = snap(rawBounds.x, e.altKey);
            width = Math.max(settings.minNodeSize, startAbs.x + startAbs.width - nx);
            x = startAbs.x + startAbs.width - width;
          }
        }
        if (!guideResult.snapped.y) {
          if (handle.includes('s')) height = Math.max(settings.minNodeSize, snap(rawBounds.height, e.altKey));
          if (handle.includes('n')) {
            const ny = snap(rawBounds.y, e.altKey);
            height = Math.max(settings.minNodeSize, startAbs.y + startAbs.height - ny);
            y = startAbs.y + startAbs.height - height;
          }
        }
        setInter({
          ...cur,
          currentAbs: { x, y, width, height },
          guides: guideResult.guides,
          guideSnapped: guideResult.snapped,
        });
        break;
      }
      case 'marquee':
        setInter({ ...cur, current: p });
        break;
      case 'connect': {
        const hit = hitFromEvent(e);
        setInter({ ...cur, current: p, hoverConnectableId: hit.nodeId ?? hit.connId ?? null });
        break;
      }
      case 'reconnect': {
        const hit = hitFromEvent(e);
        const hoverConnectableId = hit.nodeId ?? hit.connId ?? null;
        setInter({ ...cur, current: p, hoverConnectableId });
        break;
      }
      case 'bend':
        setInter({ ...cur, current: { x: snap(p.x, e.altKey), y: snap(p.y, e.altKey) } });
        break;
    }
  };

  const onPointerLeave = () => {
    const cur = interRef.current;
    if (activePointerIdRef.current !== null) {
      if (cur.kind === 'move' || cur.kind === 'resize') {
        setInter({ ...cur, guides: [] });
      }
      return;
    }
    if (cur.kind !== 'connect') return;
    if (!interactionModelIsCurrent()) {
      clearInteraction();
      return;
    }
    const bounds = absBounds.get(cur.sourceId);
    const route = bounds ? undefined : connectionRoutes?.(cur.sourceId);
    const sourcePoint = bounds
      ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      : route && route.length >= 2
        ? pointAlong(route, 0.5).point
        : cur.current;
    setInter({ ...cur, current: sourcePoint, hoverConnectableId: null });
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (!ownsPointer(e.pointerId)) return;
    if (!interactionModelIsCurrent()) {
      cancelPointerInteraction(e.pointerId);
      return;
    }
    releasePointer(e.pointerId);
    const currentModel = modelStore.getState().model;
    if (!model || !currentModel) {
      clearInteraction();
      return;
    }
    const cur = interRef.current;
    const p = toView(e.clientX, e.clientY);
    let keepInteractionModel = false;
    switch (cur.kind) {
      case 'pan':
        if (e.button === 1 || e.button === 0) setInter({ kind: 'none' });
        break;
      case 'maybe-move':
      case 'maybe-bend':
        setInter({ kind: 'none' });
        break;
      case 'move': {
        const dx = e.altKey ? p.x - cur.start.x : cur.current.x - cur.start.x;
        const dy = e.altKey ? p.y - cur.start.y : cur.current.y - cur.start.y;
        const newParent = cur.dropParentId ?? viewId;
        const validRoots = cur.rootIds.every(
          (id) => Boolean(currentModel.nodes[id] && absBounds.get(id)),
        );
        const validParent = newParent === viewId
          ? Boolean(currentModel.views[viewId])
          : Boolean(currentModel.nodes[newParent] && absBounds.get(newParent));
        if (!validRoots || !validParent) {
          setInter({ kind: 'none' });
          break;
        }
        const parentAbs =
          newParent === viewId ? { x: 0, y: 0 } : absBounds.get(newParent)!;
        const entries: MoveEntry[] = cur.rootIds.map((id) => {
          const abs = absBounds.get(id)!;
          return {
            id,
            parentId: newParent,
            bounds: {
              x: cur.guideSnapped.x && !e.altKey
                ? abs.x + dx - parentAbs.x
                : snap(abs.x + dx - parentAbs.x, e.altKey),
              y: cur.guideSnapped.y && !e.altKey
                ? abs.y + dy - parentAbs.y
                : snap(abs.y + dy - parentAbs.y, e.altKey),
              width: abs.width,
              height: abs.height,
            },
          };
        });
        setInter({ kind: 'none' });
        const changesParent = entries.some(
          (entry) => currentModel.nodes[entry.id]?.parentId !== entry.parentId,
        );
        const changesElementNesting = entries.some((entry) => {
          const node = currentModel.nodes[entry.id];
          if (node?.nodeType !== 'element') return false;
          return (
            currentModel.nodes[node.parentId]?.nodeType === 'element' ||
            currentModel.nodes[entry.parentId]?.nodeType === 'element'
          );
        });
        if (
          changesParent &&
          changesElementNesting &&
          isAutomaticRelationshipTriggerEnabled('move', settings)
        ) {
          void requestNestingChange(
            {
              viewId,
              trigger: 'move',
              entries: entries.map((entry) => ({
                kind: 'move',
                nodeId: entry.id,
                parentId: entry.parentId,
                bounds: entry.bounds,
              })),
            },
            settings,
            modelStore,
          );
        } else {
          commitMove(entries, modelStore);
        }
        break;
      }
      case 'resize': {
        const node = currentModel.nodes[cur.nodeId];
        const nodeAbs = absBounds.get(cur.nodeId);
        const parentAbs = node?.parentId === viewId
          ? { x: 0, y: 0 }
          : node
            ? absBounds.get(node.parentId)
            : undefined;
        setInter({ kind: 'none' });
        if (!node || !nodeAbs || !parentAbs) break;
        commitMove([
          {
            id: cur.nodeId,
            parentId: node.parentId,
            bounds: {
              x: cur.currentAbs.x - parentAbs.x,
              y: cur.currentAbs.y - parentAbs.y,
              width: cur.currentAbs.width,
              height: cur.currentAbs.height,
            },
          },
        ], modelStore);
        break;
      }
      case 'marquee': {
        const r: Bounds = {
          x: Math.min(cur.start.x, cur.current.x),
          y: Math.min(cur.start.y, cur.current.y),
          width: Math.abs(cur.current.x - cur.start.x),
          height: Math.abs(cur.current.y - cur.start.y),
        };
        setInter({ kind: 'none' });
        if (r.width < 3 && r.height < 3) {
          // A plain click on empty canvas selects the view itself so its
          // properties (name, viewpoint, …) show — like clicking the diagram
          // background in Archi. Escape still clears to nothing.
          if (!cur.additive) setSelection('tree', [viewId]);
          break;
        }
        const hitIds: string[] = [];
        for (const [id, b] of absBounds) {
          if (rectsIntersect(r, b)) hitIds.push(id);
        }
        const prev = modelStore.getState().selection;
        setSelection(
          'view',
          cur.additive && prev.source === 'view' ? [...new Set([...prev.ids, ...hitIds])] : hitIds,
        );
        break;
      }
      case 'connect': {
        const hit = hitFromEvent(e);
        const targetId = hit.nodeId ?? hit.connId;
        if (!targetId || targetId !== cur.sourceId) {
          finishConnect(targetId, e.clientX, e.clientY, e.ctrlKey || e.metaKey);
        } else {
          keepInteractionModel = true;
        }
        break;
      }
      case 'reconnect': {
        const hit = hitFromEvent(e);
        const endpointId = hit.nodeId ?? hit.connId;
        setInter({ kind: 'none' });
        if (endpointId) {
          void requestConnectionReconnection({
            connectionId: cur.connId,
            end: cur.end,
            endpointId,
          }, modelStore);
        }
        break;
      }
      case 'bend': {
        const conn = model.connections[cur.connId];
        const endpoints = conn ? connectionRoutes?.endpointPoints(conn.id) : undefined;
        setInter({ kind: 'none' });
        if (!conn || !endpoints) break;
        // A plain click on an existing bendpoint is not a drag — committing
        // would snap it to the grid and nudge it under the cursor.
        if (
          !cur.isNew &&
          Math.hypot(p.x - cur.start.x, p.y - cur.start.y) * viewport.zoom <=
            settings.bendDragThreshold
        ) {
          break;
        }
        const newBps = [...conn.bendpoints];
        const sp = { x: snap(p.x, e.altKey), y: snap(p.y, e.altKey) };
        const bp = toRelativeBendpoint(sp, endpoints.source, endpoints.target);
        if (cur.isNew) newBps.splice(cur.index, 0, bp);
        else newBps[cur.index] = bp;
        setConnectionBendpoints(cur.connId, newBps, modelStore);
        break;
      }
      default:
        break;
    }
    if (!keepInteractionModel) interactionModelRef.current = null;
  };

  const onPointerCancel = (e: ReactPointerEvent) => {
    cancelPointerInteraction(e.pointerId);
  };

  const onLostPointerCapture = (e: ReactPointerEvent) => {
    cancelPointerInteraction(e.pointerId);
  };

  const onDoubleClick = (e: ReactMouseEvent) => {
    if (!model) return;
    const hit = hitFromEvent(e);
    if (
      modelStore.getState().activeTool.kind === 'format-painter' &&
      !hit.nodeId &&
      !hit.connId
    ) {
      setActiveTool({ kind: 'select' });
      return;
    }
    if (hit.connId !== undefined && hit.bendIndex !== undefined) {
      const conn = model.connections[hit.connId];
      if (conn) {
        const newBps = conn.bendpoints.filter((_, i) => i !== hit.bendIndex);
        setConnectionBendpoints(hit.connId, newBps, modelStore);
      }
      return;
    }
    if (!hit.nodeId) return;
    const node = model.nodes[hit.nodeId];
    if (node?.nodeType === 'ref') openView(node.refViewId);
    else if (node) startEdit(hit.nodeId);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (!model || edit) return;
    const sel = modelStore.getState().selection;
    const viewSel = sel.source === 'view' ? sel.ids : [];
    if (e.key === 'Escape') {
      const pointerId = activePointerIdRef.current;
      if (pointerId === null) clearInteraction();
      else cancelPointerInteraction(pointerId);
      setActiveTool({ kind: 'select' });
      setSelection('view', []);
      return;
    }
    if (e.key === 'Delete' && viewSel.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      deleteViewObjects(viewSel, modelStore);
      return;
    }
    if (e.key === 'F2' && viewSel.length === 1) {
      startEdit(viewSel[0]);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelection('view', [...absBounds.keys()]);
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      fitToView();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      zoomTo(1);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      zoomBy(settings.buttonZoomFactor);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault();
      zoomBy(1 / settings.buttonZoomFactor);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && viewSel.length > 0) {
      copyNodes(viewSel, modelStore, sessionId);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x' && viewSel.length > 0) {
      e.preventDefault();
      const cutIds = cutNodes(viewSel, modelStore, sessionId);
      if (cutIds.length > 0) setSelection('view', []);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      const ids = pasteNodes(viewId, undefined, modelStore, sessionId);
      if (ids.length > 0) setSelection('view', ids);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && viewSel.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      const ids = duplicateViewObjects(viewId, viewSel, settings.pasteOffset, modelStore);
      if (ids.length > 0) setSelection('view', ids);
      return;
    }
    const arrow: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    if (arrow[e.key] && viewSel.length > 0) {
      e.preventDefault();
      const step = e.shiftKey ? settings.gridSize : 1;
      const roots = selectionRoots(model, viewSel);
      commitMove(
        roots.map((id) => {
          const node = model.nodes[id]!;
          return {
            id,
            parentId: node.parentId,
            bounds: {
              ...node.bounds,
              x: node.bounds.x + arrow[e.key].x * step,
              y: node.bounds.y + arrow[e.key].y * step,
            },
          };
        }),
        modelStore,
      );
    }
  };

  const onContextMenu = (e: ReactMouseEvent) => {
    if (!model) return;
    e.preventDefault();
    const hit = hitFromEvent(e);
    const id = hit.nodeId ?? hit.connId;
    if (!id) {
      const p = toView(e.clientX, e.clientY);
      const parentId = containerAt(model, viewId, absBounds, p, new Set()) ?? viewId;
      const parentAbs = parentId === viewId ? { x: 0, y: 0 } : absBounds.get(parentId)!;
      showEmptyCanvasContextMenu({
        clientX: e.clientX,
        clientY: e.clientY,
        viewId,
        parentId,
        parentAbs,
        point: p,
        absBounds,
        startEdit,
        settings,
        modelStore,
        sessionId,
        snap,
        zoomBy,
        zoomTo,
        fitToView,
      });
      return;
    }
    const sel = modelStore.getState().selection;
    if (!(sel.source === 'view' && sel.ids.includes(id))) setSelection('view', [id]);
    const ids = modelStore.getState().selection.ids;
    showViewObjectContextMenu({
      clientX: e.clientX,
      clientY: e.clientY,
      viewId,
      id,
      ids,
      model,
      settings,
      modelStore,
      sessionId,
      startEdit,
    });
  };

  const onDragOver = (e: ReactDragEvent) => {
    if (e.dataTransfer.types.includes('application/x-archi-ids')) e.preventDefault();
  };

  const onDrop = (e: ReactDragEvent) => {
    if (!model) return;
    e.preventDefault();
    let ids: string[];
    try {
      ids = JSON.parse(e.dataTransfer.getData('application/x-archi-ids'));
    } catch {
      return;
    }
    if (!Array.isArray(ids)) return;
    const p = toView(e.clientX, e.clientY);
    const input = planDroppedItemsToView({
      ids,
      model,
      viewId,
      absBounds,
      point: p,
      snap,
      settings,
    });
    const entersElementParent = input.entries.some(
      (entry) =>
        entry.kind === 'add-occurrence' &&
        model.nodes[entry.parentId]?.nodeType === 'element',
    );
    if (
      entersElementParent &&
      isAutomaticRelationshipTriggerEnabled('tree', settings)
    ) {
      void requestNestingChange(input, settings, modelStore).then((result) => {
        if (result && result.applied.nodeIds.length > 0) {
          setSelection('view', result.applied.nodeIds);
        }
      });
    } else {
      const created = addDroppedItemsToView({
        ids,
        model,
        viewId,
        absBounds,
        point: p,
        snap,
        settings,
        modelStore,
      });
      if (created.length > 0) setSelection('view', created);
    }
  };

  const connectHover: { id: string; valid: boolean } | null = (() => {
    if (!model || inter.kind !== 'connect' || !inter.hoverConnectableId) return null;
    const tool = activeTool;
    const srcNode = model.nodes[inter.sourceId];
    const tgtNode = model.nodes[inter.hoverConnectableId];
    if (tool.kind === 'create-plain-connection') {
      return {
        id: inter.hoverConnectableId,
        valid: canCreatePlainConnection(model, viewId, inter.sourceId, inter.hoverConnectableId),
      };
    }
    if (srcNode?.nodeType !== 'element')
      return { id: inter.hoverConnectableId, valid: false };
    if (tool.kind === 'magic-connector' && tgtNode?.nodeType === 'group') {
      return {
        id: inter.hoverConnectableId,
        valid: analyzeMagicTargetCreation(model, {
          viewId,
          sourceNodeId: inter.sourceId,
        }).pairs.length > 0,
      };
    }
    if (tgtNode?.nodeType !== 'element') {
      return tool.kind === 'magic-connector'
        ? null
        : { id: inter.hoverConnectableId, valid: false };
    }
    const srcType = model.elements[srcNode.elementId]?.type;
    const tgtType = model.elements[tgtNode.elementId]?.type;
    if (!srcType || !tgtType) return { id: inter.hoverConnectableId, valid: false };
    const valid =
      tool.kind === 'create-relationship'
        ? isAllowedRelationship(tool.type, srcType, tgtType)
        : analyzeMagicConnectionTarget(model, {
            viewId,
            sourceNodeId: inter.sourceId,
            targetNodeId: inter.hoverConnectableId,
          }).groups.some((group) => group.options.length > 0);
    return { id: inter.hoverConnectableId, valid };
  })();

  const reconnectHover: { id: string; valid: boolean } | null = (() => {
    if (!model || inter.kind !== 'reconnect' || !inter.hoverConnectableId) return null;
    const plan = analyzeConnectionReconnection(model, {
      connectionId: inter.connId,
      end: inter.end,
      endpointId: inter.hoverConnectableId,
    });
    return { id: inter.hoverConnectableId, valid: plan.valid };
  })();

  const cursor =
    inter.kind === 'pan'
      ? 'grabbing'
      : inter.kind === 'reconnect'
        ? 'crosshair'
        : spaceHeld
          ? 'grab'
          : activeTool.kind === 'select'
            ? undefined
            : activeTool.kind === 'create-relationship' ||
                activeTool.kind === 'create-plain-connection' ||
                activeTool.kind === 'magic-connector'
              ? 'crosshair'
              : 'copy';

  return {
    inter,
    edit,
    connectHover,
    reconnectHover,
    commitEdit,
    commitEditAndRestoreFocus,
    cancelEditAndSelect,
    cursor,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture,
      onPointerLeave,
      onDoubleClick,
      onKeyDown,
      onContextMenu,
      onDragOver,
      onDrop,
    },
  };
}
