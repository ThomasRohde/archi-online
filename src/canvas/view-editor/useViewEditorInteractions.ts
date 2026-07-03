import { useRef, useState } from 'react';
import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react';
import { relationshipLabel } from '../../model/metamodel';
import {
  addGroupToView,
  addNoteToView,
  commitMove,
  createElementOnView,
  createRelationshipOnView,
  deleteViewObjects,
  renameItem,
  setConnectionBendpoints,
  type MoveEntry,
} from '../../model/ops';
import { isAllowedRelationship, validRelationshipTypes } from '../../model/rules';
import { openView, setActiveTool, setSelection, useStore, type Tool } from '../../model/store';
import type { Bounds, DiagramView, ModelState } from '../../model/types';
import {
  defaultElementSize,
  defaultGroupSize,
  defaultNoteSize,
  defaultTextStyle,
  useSettingsStore,
} from '../../settings/app-settings';
import { showContextMenu } from '../../ui/ContextMenu';
import { copyNodes, pasteNodes } from '../clipboard';
import { closestSegment, connectionPolyline, rectsIntersect, toRelativeBendpoint, type Point } from '../geometry';
import { containerAt, dropTargetFor, selectionRoots } from './bounds';
import { showEmptyCanvasContextMenu, showViewObjectContextMenu } from './contextMenu';
import { addDroppedItemsToView } from './drop';
import type { EditState, Interaction, Viewport } from './types';

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
  const settings = useSettingsStore((s) => s.settings);
  const [inter, setInter] = useState<Interaction>({ kind: 'none' });
  const [edit, setEdit] = useState<EditState | null>(null);
  const interRef = useRef(inter);
  interRef.current = inter;

  const snap = (v: number, disable?: boolean) =>
    disable || !settings.snapToGrid
      ? Math.round(v)
      : Math.round(v / settings.gridSize) * settings.gridSize;

  const hitFromEvent = (
    e: { clientX: number; clientY: number },
  ): { nodeId?: string; connId?: string; handle?: string; bendIndex?: number } => {
    // Element under the cursor, not the event target: pointer capture retargets
    // events to the svg root mid-gesture.
    let el = document.elementFromPoint(e.clientX, e.clientY);
    while (el && el !== svgRef.current) {
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
    const m = useStore.getState().model;
    const node = m?.nodes[nodeId];
    if (!m || !node) return;
    let initial = '';
    if (node.nodeType === 'element') initial = m.elements[node.elementId]?.name ?? '';
    else if (node.nodeType === 'group') initial = node.name;
    else if (node.nodeType === 'note') initial = node.content;
    else return;
    setEdit({ nodeId, initial });
  };

  const commitEdit = (text: string | null) => {
    if (edit && text !== null && model) {
      const node = model.nodes[edit.nodeId];
      if (node?.nodeType === 'element') renameItem(node.elementId, text);
      else if (node) renameItem(edit.nodeId, text);
    }
    setEdit(null);
  };

  const finishConnect = (targetNodeId: string, clientX: number, clientY: number) => {
    if (!model) return;
    const cur = interRef.current;
    if (cur.kind !== 'connect') return;
    const tool = useStore.getState().activeTool;
    setInter({ kind: 'none' });
    const srcNode = model.nodes[cur.sourceNodeId];
    const tgtNode = model.nodes[targetNodeId];
    if (srcNode?.nodeType !== 'element' || tgtNode?.nodeType !== 'element') return;
    const srcType = model.elements[srcNode.elementId]?.type;
    const tgtType = model.elements[tgtNode.elementId]?.type;
    if (!srcType || !tgtType) return;
    if (tool.kind === 'create-relationship') {
      const res = createRelationshipOnView(tool.type, viewId, cur.sourceNodeId, targetNodeId);
      if (res) setSelection('view', [res.connectionId]);
      setActiveTool({ kind: 'select' });
    } else if (tool.kind === 'magic-connector') {
      const types = validRelationshipTypes(srcType, tgtType);
      showContextMenu(
        clientX,
        clientY,
        types.map((t) => ({
          label: relationshipLabel(t),
          onClick: () => {
            const res = createRelationshipOnView(t, viewId, cur.sourceNodeId, targetNodeId);
            if (res) setSelection('view', [res.connectionId]);
          },
        })),
      );
      setActiveTool({ kind: 'select' });
    }
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!model || !view) return;
    if (edit) commitEdit(null);
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      setInter({ kind: 'pan', startX: e.clientX, startY: e.clientY, vx: viewport.x, vy: viewport.y });
      svgRef.current!.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    svgRef.current!.setPointerCapture(e.pointerId);
    const p = toView(e.clientX, e.clientY);
    const hit = hitFromEvent(e);
    const tool = useStore.getState().activeTool;

    if (tool.kind === 'create-element' || tool.kind === 'create-note' || tool.kind === 'create-group') {
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
        const { nodeId } = createElementOnView(
          tool.type,
          viewId,
          parentId,
          bounds,
          undefined,
          textDefaults,
        );
        setSelection('view', [nodeId]);
        setActiveTool({ kind: 'select' });
        setTimeout(() => startEdit(nodeId), 0);
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
        );
        setSelection('view', [id]);
        setActiveTool({ kind: 'select' });
        setTimeout(() => startEdit(id), 0);
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
        );
        setSelection('view', [id]);
        setActiveTool({ kind: 'select' });
      }
      return;
    }

    if (tool.kind === 'create-relationship' || tool.kind === 'magic-connector') {
      const cur = interRef.current;
      if (cur.kind === 'connect') {
        if (hit.nodeId) finishConnect(hit.nodeId, e.clientX, e.clientY);
        else {
          setInter({ kind: 'none' });
          setActiveTool({ kind: 'select' });
        }
      } else if (hit.nodeId && model.nodes[hit.nodeId]?.nodeType === 'element') {
        setInter({ kind: 'connect', sourceNodeId: hit.nodeId, current: p, hoverNodeId: null });
      }
      return;
    }

    if (hit.handle && hit.nodeId) {
      const abs = absBounds.get(hit.nodeId)!;
      setInter({ kind: 'resize', nodeId: hit.nodeId, handle: hit.handle, startAbs: abs, currentAbs: abs });
      return;
    }
    if (hit.connId !== undefined && hit.bendIndex !== undefined) {
      setSelection('view', [hit.connId]);
      setInter({ kind: 'bend', connId: hit.connId, index: hit.bendIndex, current: p, isNew: false });
      return;
    }
    if (hit.nodeId) {
      const cur = useStore.getState().selection;
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
      const cur = useStore.getState().selection;
      if (e.ctrlKey && cur.source === 'view') {
        setSelection(
          'view',
          cur.ids.includes(hit.connId) ? cur.ids.filter((i) => i !== hit.connId) : [...cur.ids, hit.connId],
        );
      } else {
        setSelection('view', [hit.connId]);
      }
      setInter({ kind: 'maybe-bend', start: p, connId: hit.connId });
      return;
    }
    setInter({ kind: 'marquee', start: p, current: p, additive: e.ctrlKey });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!model) return;
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
          const sel = useStore.getState().selection;
          const ids = sel.source === 'view' && sel.ids.includes(cur.nodeId) ? sel.ids : [cur.nodeId];
          const rootIds = selectionRoots(model, ids);
          if (rootIds.length > 0) {
            setInter({ kind: 'move', start: cur.start, current: p, rootIds, dropParentId: null });
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
          const src = absBounds.get(conn?.sourceId ?? '');
          const tgt = absBounds.get(conn?.targetId ?? '');
          if (!conn || !src || !tgt) break;
          const points = connectionPolyline(src, tgt, conn.bendpoints);
          const seg = closestSegment(points, cur.start);
          setInter({ kind: 'bend', connId: cur.connId, index: seg.index, current: p, isNew: true });
        }
        break;
      }
      case 'move': {
        const dropParentId = dropTargetFor(model, viewId, absBounds, p, cur.rootIds);
        setInter({ ...cur, current: p, dropParentId });
        break;
      }
      case 'resize': {
        const { startAbs, handle } = cur;
        let { x, y, width, height } = startAbs;
        const dx = p.x - (handle.includes('w') ? startAbs.x : startAbs.x + startAbs.width);
        const dy = p.y - (handle.includes('n') ? startAbs.y : startAbs.y + startAbs.height);
        if (handle.includes('e')) {
          width = Math.max(settings.minNodeSize, snap(startAbs.width + dx, e.altKey));
        }
        if (handle.includes('s')) {
          height = Math.max(settings.minNodeSize, snap(startAbs.height + dy, e.altKey));
        }
        if (handle.includes('w')) {
          const nx = snap(startAbs.x + dx, e.altKey);
          width = Math.max(settings.minNodeSize, startAbs.width + (startAbs.x - nx));
          x = startAbs.x + startAbs.width - width;
        }
        if (handle.includes('n')) {
          const ny = snap(startAbs.y + dy, e.altKey);
          height = Math.max(settings.minNodeSize, startAbs.height + (startAbs.y - ny));
          y = startAbs.y + startAbs.height - height;
        }
        setInter({ ...cur, currentAbs: { x, y, width, height } });
        break;
      }
      case 'marquee':
        setInter({ ...cur, current: p });
        break;
      case 'connect': {
        const hit = hitFromEvent(e);
        setInter({ ...cur, current: p, hoverNodeId: hit.nodeId ?? null });
        break;
      }
      case 'bend':
        setInter({ ...cur, current: p });
        break;
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (!model) return;
    const cur = interRef.current;
    const p = toView(e.clientX, e.clientY);
    switch (cur.kind) {
      case 'pan':
        if (e.button === 1 || e.button === 0) setInter({ kind: 'none' });
        break;
      case 'maybe-move':
      case 'maybe-bend':
        setInter({ kind: 'none' });
        break;
      case 'move': {
        const dx = cur.current.x - cur.start.x;
        const dy = cur.current.y - cur.start.y;
        const newParent = cur.dropParentId ?? viewId;
        const parentAbs =
          newParent === viewId ? { x: 0, y: 0 } : (absBounds.get(newParent) ?? { x: 0, y: 0 });
        const entries: MoveEntry[] = cur.rootIds.map((id) => {
          const abs = absBounds.get(id)!;
          return {
            id,
            parentId: newParent,
            bounds: {
              x: snap(abs.x + dx - parentAbs.x, e.altKey),
              y: snap(abs.y + dy - parentAbs.y, e.altKey),
              width: abs.width,
              height: abs.height,
            },
          };
        });
        setInter({ kind: 'none' });
        commitMove(entries);
        break;
      }
      case 'resize': {
        const node = model.nodes[cur.nodeId]!;
        const parentAbs =
          node.parentId === viewId ? { x: 0, y: 0 } : (absBounds.get(node.parentId) ?? { x: 0, y: 0 });
        setInter({ kind: 'none' });
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
        ]);
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
          if (!cur.additive) setSelection('view', []);
          break;
        }
        const hitIds: string[] = [];
        for (const [id, b] of absBounds) {
          if (rectsIntersect(r, b)) hitIds.push(id);
        }
        const prev = useStore.getState().selection;
        setSelection(
          'view',
          cur.additive && prev.source === 'view' ? [...new Set([...prev.ids, ...hitIds])] : hitIds,
        );
        break;
      }
      case 'connect': {
        const hit = hitFromEvent(e);
        if (hit.nodeId && hit.nodeId !== cur.sourceNodeId) {
          finishConnect(hit.nodeId, e.clientX, e.clientY);
        }
        break;
      }
      case 'bend': {
        const conn = model.connections[cur.connId];
        const src = absBounds.get(conn?.sourceId ?? '');
        const tgt = absBounds.get(conn?.targetId ?? '');
        setInter({ kind: 'none' });
        if (!conn || !src || !tgt) break;
        const srcC = { x: src.x + src.width / 2, y: src.y + src.height / 2 };
        const tgtC = { x: tgt.x + tgt.width / 2, y: tgt.y + tgt.height / 2 };
        const newBps = [...conn.bendpoints];
        const bp = toRelativeBendpoint(p, srcC, tgtC);
        if (cur.isNew) newBps.splice(cur.index, 0, bp);
        else newBps[cur.index] = bp;
        setConnectionBendpoints(cur.connId, newBps);
        break;
      }
      default:
        break;
    }
  };

  const onDoubleClick = (e: ReactMouseEvent) => {
    if (!model) return;
    const hit = hitFromEvent(e);
    if (hit.connId !== undefined && hit.bendIndex !== undefined) {
      const conn = model.connections[hit.connId];
      if (conn) {
        const newBps = conn.bendpoints.filter((_, i) => i !== hit.bendIndex);
        setConnectionBendpoints(hit.connId, newBps);
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
    const sel = useStore.getState().selection;
    const viewSel = sel.source === 'view' ? sel.ids : [];
    if (e.key === 'Escape') {
      setInter({ kind: 'none' });
      setActiveTool({ kind: 'select' });
      setSelection('view', []);
      return;
    }
    if (e.key === 'Delete' && viewSel.length > 0) {
      deleteViewObjects(viewSel);
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
      copyNodes(viewSel);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      const ids = pasteNodes(viewId);
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
        snap,
        zoomBy,
        zoomTo,
        fitToView,
      });
      return;
    }
    const sel = useStore.getState().selection;
    if (!(sel.source === 'view' && sel.ids.includes(id))) setSelection('view', [id]);
    const ids = useStore.getState().selection.ids;
    showViewObjectContextMenu({
      clientX: e.clientX,
      clientY: e.clientY,
      viewId,
      id,
      ids,
      model,
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
    const created = addDroppedItemsToView({
      ids,
      model,
      viewId,
      absBounds,
      point: p,
      snap,
      settings,
    });
    if (created.length > 0) setSelection('view', created);
  };

  const connectHover: { id: string; valid: boolean } | null = (() => {
    if (!model || inter.kind !== 'connect' || !inter.hoverNodeId) return null;
    const tool = activeTool;
    const srcNode = model.nodes[inter.sourceNodeId];
    const tgtNode = model.nodes[inter.hoverNodeId];
    if (srcNode?.nodeType !== 'element' || tgtNode?.nodeType !== 'element')
      return { id: inter.hoverNodeId, valid: false };
    const srcType = model.elements[srcNode.elementId]?.type;
    const tgtType = model.elements[tgtNode.elementId]?.type;
    if (!srcType || !tgtType) return { id: inter.hoverNodeId, valid: false };
    const valid =
      tool.kind === 'create-relationship'
        ? isAllowedRelationship(tool.type, srcType, tgtType)
        : validRelationshipTypes(srcType, tgtType).length > 0;
    return { id: inter.hoverNodeId, valid };
  })();

  const cursor =
    inter.kind === 'pan'
      ? 'grabbing'
      : spaceHeld
        ? 'grab'
        : activeTool.kind === 'select'
          ? undefined
          : activeTool.kind === 'create-relationship' || activeTool.kind === 'magic-connector'
            ? 'crosshair'
            : 'copy';

  return {
    inter,
    edit,
    connectHover,
    commitEdit,
    cursor,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onDoubleClick,
      onKeyDown,
      onContextMenu,
      onDragOver,
      onDrop,
    },
  };
}
