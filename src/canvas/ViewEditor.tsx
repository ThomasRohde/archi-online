import { useEffect, useMemo, useRef, useState } from 'react';
import { ELEMENT_TYPE_MAP, relationshipLabel } from '../model/metamodel';
import {
  addElementNodeToView,
  addGroupToView,
  addNoteToView,
  addRefNodeToView,
  commitMove,
  createElementOnView,
  createRelationshipOnView,
  deleteItems,
  deleteViewObjects,
  renameItem,
  reorderNode,
  setConnectionBendpoints,
  type MoveEntry,
} from '../model/ops';
import { isAllowedRelationship, validRelationshipTypes } from '../model/rules';
import { openView, setActiveTool, setSelection, useStore } from '../model/store';
import type { Bounds, ModelState } from '../model/types';
import { showContextMenu, SEPARATOR, type MenuItem } from '../ui/ContextMenu';
import { ConnectionView } from './ConnectionView';
import { copyNodes, hasClipboard, pasteNodes } from './clipboard';
import {
  bendpointPositions,
  connectionPolyline,
  closestSegment,
  pointInRect,
  rectsIntersect,
  toRelativeBendpoint,
  type Point,
} from './geometry';
import { NodeFigure } from './figures/NodeFigure';

const GRID = 12;

export interface Viewport {
  zoom: number;
  x: number;
  y: number;
}

const viewports = new Map<string, Viewport>();

type Interaction =
  | { kind: 'none' }
  | { kind: 'pan'; startX: number; startY: number; vx: number; vy: number }
  | { kind: 'maybe-move'; start: Point; nodeId: string }
  | { kind: 'maybe-bend'; start: Point; connId: string }
  | {
      kind: 'move';
      start: Point;
      current: Point;
      rootIds: string[];
      dropParentId: string | null;
    }
  | {
      kind: 'resize';
      nodeId: string;
      handle: string;
      startAbs: Bounds;
      currentAbs: Bounds;
    }
  | { kind: 'marquee'; start: Point; current: Point; additive: boolean }
  | { kind: 'connect'; sourceNodeId: string; current: Point; hoverNodeId: string | null }
  | { kind: 'bend'; connId: string; index: number; current: Point; isNew: boolean };

interface EditState {
  nodeId: string;
  initial: string;
}

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

/** Roots of the selection: selected nodes none of whose ancestors are selected. */
function selectionRoots(model: ModelState, ids: string[]): string[] {
  const set = new Set(ids);
  return ids.filter((id) => {
    let p = model.nodes[id]?.parentId;
    while (p && model.nodes[p]) {
      if (set.has(p)) return false;
      p = model.nodes[p].parentId;
    }
    return !!model.nodes[id];
  });
}

function descendants(model: ModelState, id: string, into: Set<string>): void {
  into.add(id);
  for (const c of model.nodes[id]?.childIds ?? []) descendants(model, c, into);
}

const CONTAINER_TYPES = new Set(['element', 'group']);

function NodeView({
  model,
  nodeId,
  moveDelta,
  resize,
  dropParentId,
  connectSource,
  connectHover,
}: {
  model: ModelState;
  nodeId: string;
  moveDelta: Map<string, Point>;
  resize: { nodeId: string; rel: Bounds } | null;
  dropParentId: string | null;
  connectSource: string | null;
  connectHover: { id: string; valid: boolean } | null;
}) {
  const node = model.nodes[nodeId];
  const selected = useStore(
    (s) => s.selection.source === 'view' && s.selection.ids.includes(nodeId),
  );
  if (!node) return null;
  const element = node.nodeType === 'element' ? model.elements[node.elementId] : undefined;
  const refView = node.nodeType === 'ref' ? model.views[node.refViewId] : undefined;
  const delta = moveDelta.get(nodeId);
  const rel = resize?.nodeId === nodeId ? resize.rel : node.bounds;
  const x = rel.x + (delta?.x ?? 0);
  const y = rel.y + (delta?.y ?? 0);
  const { width, height } = rel;
  const highlight =
    dropParentId === nodeId ||
    connectSource === nodeId ||
    (connectHover?.id === nodeId && connectHover.valid);
  const invalid = connectHover?.id === nodeId && !connectHover.valid;
  return (
    <g transform={`translate(${x},${y})`} data-node-id={nodeId} opacity={delta ? 0.75 : 1}>
      <NodeFigure node={node} element={element} refView={refView} width={width} height={height} />
      {(selected || highlight || invalid) && (
        <rect
          x={-1.5}
          y={-1.5}
          width={width + 3}
          height={height + 3}
          fill="none"
          stroke={invalid ? '#c43a3a' : highlight ? '#1d9e46' : '#2a6cc4'}
          strokeWidth={highlight || invalid ? 2 : 1.2}
          pointerEvents="none"
        />
      )}
      {node.childIds.map((cid) => (
        <NodeView
          key={cid}
          model={model}
          nodeId={cid}
          moveDelta={moveDelta}
          resize={resize}
          dropParentId={dropParentId}
          connectSource={connectSource}
          connectHover={connectHover}
        />
      ))}
    </g>
  );
}

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

export function ViewEditor({ viewId }: { viewId: string }) {
  const model = useStore((s) => s.model);
  const selection = useStore((s) => s.selection);
  const activeTool = useStore((s) => s.activeTool);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewportState] = useState<Viewport>(
    () => viewports.get(viewId) ?? { zoom: 1, x: 20, y: 20 },
  );
  const [inter, setInter] = useState<Interaction>({ kind: 'none' });
  const [edit, setEdit] = useState<EditState | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const interRef = useRef(inter);
  interRef.current = inter;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const spaceRef = useRef(spaceHeld);
  spaceRef.current = spaceHeld;

  const setViewport = (v: Viewport) => {
    viewports.set(viewId, v);
    setViewportState(v);
  };
  const setViewportRefFn = useRef(setViewport);
  setViewportRefFn.current = setViewport;

  // Ctrl+wheel zoom must preventDefault to stop the browser's page zoom, but
  // React attaches onWheel passively — so use a native non-passive listener.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const vp = viewportRef.current;
      const set = setViewportRefFn.current;
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const zoom = Math.min(4, Math.max(0.1, vp.zoom * factor));
        const rect = svg.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const wx = (cx - vp.x) / vp.zoom;
        const wy = (cy - vp.y) / vp.zoom;
        set({ zoom, x: cx - wx * zoom, y: cy - wy * zoom });
      } else if (e.shiftKey) {
        set({ ...vp, x: vp.x - e.deltaY });
      } else {
        set({ ...vp, x: vp.x - e.deltaX, y: vp.y - e.deltaY });
      }
    };
    svg.addEventListener('wheel', onWheelNative, { passive: false });
    return () => svg.removeEventListener('wheel', onWheelNative);
  }, []);

  // hold Space for hand-tool panning with the left button
  useEffect(() => {
    const isTextTarget = (t: EventTarget | null) =>
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      (t instanceof HTMLElement && t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTextTarget(e.target)) {
        if (e.target === svgRef.current) e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    const clear = () => setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  const view = model?.views[viewId];
  const absBounds = useMemo(
    () => (model && view ? computeAbsBounds(model, viewId) : new Map<string, Bounds>()),
    [model, view, viewId],
  );
  const connections = useMemo(
    () => (model ? Object.values(model.connections).filter((c) => c.viewId === viewId) : []),
    [model, viewId],
  );

  if (!model || !view) return null;

  const toView = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewport.x) / viewport.zoom,
      y: (clientY - rect.top - viewport.y) / viewport.zoom,
    };
  };

  /** Zoom keeping the canvas centre stable. */
  const zoomTo = (zoom: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const z = Math.min(4, Math.max(0.1, zoom));
    const rect = svg.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const wx = (cx - viewport.x) / viewport.zoom;
    const wy = (cy - viewport.y) / viewport.zoom;
    setViewport({ zoom: z, x: cx - wx * z, y: cy - wy * z });
  };

  const zoomBy = (factor: number) => zoomTo(viewport.zoom * factor);

  /** Fit the whole diagram into the visible canvas. */
  const fitToView = () => {
    const svg = svgRef.current;
    if (!svg) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of absBounds.values()) {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    if (!isFinite(minX)) {
      setViewport({ zoom: 1, x: 20, y: 20 });
      return;
    }
    const rect = svg.getBoundingClientRect();
    const margin = 24;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const zoom = Math.min(
      1.5,
      Math.max(0.1, Math.min((rect.width - margin * 2) / bw, (rect.height - margin * 2) / bh)),
    );
    setViewport({
      zoom,
      x: (rect.width - bw * zoom) / 2 - minX * zoom,
      y: (rect.height - bh * zoom) / 2 - minY * zoom,
    });
  };

  const snap = (v: number, disable?: boolean) => (disable ? Math.round(v) : Math.round(v / GRID) * GRID);

  // ------------------------------------------------------------- helpers

  const hitFromEvent = (
    e: { clientX: number; clientY: number },
  ): { nodeId?: string; connId?: string; handle?: string; bendIndex?: number } => {
    // element under the cursor, not the event target: pointer capture retargets
    // events to the svg root mid-gesture
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

  /** Deepest container node at point, excluding a set of node ids (and their subtrees). */
  const containerAt = (p: Point, exclude: Set<string>): string | null => {
    let found: string | null = null;
    const walk = (ids: string[]): void => {
      // topmost = last in z-order; iterate normally, deeper matches overwrite
      for (const id of ids) {
        if (exclude.has(id)) continue;
        const node = model.nodes[id];
        const b = absBounds.get(id);
        if (!node || !b) continue;
        if (pointInRect(p, b) && CONTAINER_TYPES.has(node.nodeType)) {
          found = id;
          walk(node.childIds);
        }
      }
    };
    walk(view.childIds);
    return found;
  };

  const dropTargetFor = (p: Point, draggedRoots: string[]): string | null => {
    const exclude = new Set<string>();
    for (const r of draggedRoots) descendants(model, r, exclude);
    return containerAt(p, exclude);
  };

  const startEdit = (nodeId: string) => {
    // read fresh state: often called right after an op, before this render updates
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
    if (edit && text !== null) {
      const node = model.nodes[edit.nodeId];
      if (node?.nodeType === 'element') renameItem(node.elementId, text);
      else if (node) renameItem(edit.nodeId, text);
    }
    setEdit(null);
  };

  const finishConnect = (targetNodeId: string, clientX: number, clientY: number) => {
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

  // ------------------------------------------------------------ pointers

  const onPointerDown = (e: React.PointerEvent) => {
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

    // creation tools
    if (tool.kind === 'create-element' || tool.kind === 'create-note' || tool.kind === 'create-group') {
      const parentId = containerAt(p, new Set()) ?? viewId;
      const parentAbs = parentId === viewId ? { x: 0, y: 0 } : absBounds.get(parentId)!;
      if (tool.kind === 'create-element') {
        const def = ELEMENT_TYPE_MAP[tool.type];
        const bounds = {
          x: snap(p.x - parentAbs.x - def.width / 2, e.altKey),
          y: snap(p.y - parentAbs.y - def.height / 2, e.altKey),
          width: def.width,
          height: def.height,
        };
        const { nodeId } = createElementOnView(tool.type, viewId, parentId, bounds);
        setSelection('view', [nodeId]);
        setActiveTool({ kind: 'select' });
        // defer: the browser focuses the svg as the mousedown default action,
        // which would immediately blur (and close) the rename textarea
        setTimeout(() => startEdit(nodeId), 0);
      } else if (tool.kind === 'create-note') {
        const id = addNoteToView(viewId, parentId, {
          x: snap(p.x - parentAbs.x),
          y: snap(p.y - parentAbs.y),
          width: 185,
          height: 80,
        });
        setSelection('view', [id]);
        setActiveTool({ kind: 'select' });
        setTimeout(() => startEdit(id), 0);
      } else {
        const id = addGroupToView(viewId, parentId, {
          x: snap(p.x - parentAbs.x),
          y: snap(p.y - parentAbs.y),
          width: 400,
          height: 140,
        });
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

    // select tool
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

  const onPointerMove = (e: React.PointerEvent) => {
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
        if (Math.hypot(p.x - cur.start.x, p.y - cur.start.y) * viewport.zoom > 4) {
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
        if (Math.hypot(p.x - cur.start.x, p.y - cur.start.y) * viewport.zoom > 5) {
          const conn = model.connections[cur.connId];
          const src = absBounds.get(conn?.sourceId ?? '');
          const tgt = absBounds.get(conn?.targetId ?? '');
          if (!conn || !src || !tgt) break;
          const points = connectionPolyline(src, tgt, conn.bendpoints);
          const seg = closestSegment(points, cur.start);
          // new bendpoint sits on segment i, i.e. before existing bendpoint i;
          // rendered as a live preview and committed once on pointer-up
          setInter({ kind: 'bend', connId: cur.connId, index: seg.index, current: p, isNew: true });
        }
        break;
      }
      case 'move': {
        const dropParentId = dropTargetFor(p, cur.rootIds);
        setInter({ ...cur, current: p, dropParentId });
        break;
      }
      case 'resize': {
        const { startAbs, handle } = cur;
        let { x, y, width, height } = startAbs;
        const dx = p.x - (handle.includes('w') ? startAbs.x : startAbs.x + startAbs.width);
        const dy = p.y - (handle.includes('n') ? startAbs.y : startAbs.y + startAbs.height);
        if (handle.includes('e')) width = Math.max(20, snap(startAbs.width + dx, e.altKey));
        if (handle.includes('s')) height = Math.max(20, snap(startAbs.height + dy, e.altKey));
        if (handle.includes('w')) {
          const nx = snap(startAbs.x + dx, e.altKey);
          width = Math.max(20, startAbs.width + (startAbs.x - nx));
          x = startAbs.x + startAbs.width - width;
        }
        if (handle.includes('n')) {
          const ny = snap(startAbs.y + dy, e.altKey);
          height = Math.max(20, startAbs.height + (startAbs.y - ny));
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
      case 'bend': {
        setInter({ ...cur, current: p });
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
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
        // click-move-release on a target also completes the connection
        const hit = hitFromEvent(e);
        if (hit.nodeId && hit.nodeId !== cur.sourceNodeId) {
          finishConnect(hit.nodeId, e.clientX, e.clientY);
        }
        // otherwise stay in connect mode awaiting a click on the target
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

  const onDoubleClick = (e: React.MouseEvent) => {
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

  // ------------------------------------------------------------ keyboard

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (edit) return;
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
      zoomBy(1.2);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault();
      zoomBy(1 / 1.2);
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
      const step = e.shiftKey ? GRID : 1;
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

  // -------------------------------------------------------- context menu

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const hit = hitFromEvent(e);
    const id = hit.nodeId ?? hit.connId;
    if (!id) {
      // empty canvas
      const p = toView(e.clientX, e.clientY);
      const parentId = containerAt(p, new Set()) ?? viewId;
      const parentAbs = parentId === viewId ? { x: 0, y: 0 } : absBounds.get(parentId)!;
      showContextMenu(e.clientX, e.clientY, [
        {
          label: 'Paste (Ctrl+V)',
          disabled: !hasClipboard(),
          onClick: () => {
            const ids = pasteNodes(viewId, p);
            if (ids.length > 0) setSelection('view', ids);
          },
        },
        { label: 'Select All (Ctrl+A)', onClick: () => setSelection('view', [...absBounds.keys()]) },
        SEPARATOR,
        {
          label: 'New Note',
          onClick: () => {
            const noteId = addNoteToView(viewId, parentId, {
              x: Math.round(p.x - parentAbs.x),
              y: Math.round(p.y - parentAbs.y),
              width: 185,
              height: 80,
            });
            setSelection('view', [noteId]);
            setTimeout(() => startEdit(noteId), 0);
          },
        },
        {
          label: 'New Group',
          onClick: () => {
            const groupId = addGroupToView(viewId, parentId, {
              x: Math.round(p.x - parentAbs.x),
              y: Math.round(p.y - parentAbs.y),
              width: 400,
              height: 140,
            });
            setSelection('view', [groupId]);
          },
        },
        SEPARATOR,
        { label: 'Zoom In (Ctrl+=)', onClick: () => zoomBy(1.2) },
        { label: 'Zoom Out (Ctrl+-)', onClick: () => zoomBy(1 / 1.2) },
        { label: 'Zoom 100% (Ctrl+0)', onClick: () => zoomTo(1) },
        { label: 'Fit to Window (Home)', onClick: fitToView },
      ]);
      return;
    }
    const sel = useStore.getState().selection;
    if (!(sel.source === 'view' && sel.ids.includes(id))) setSelection('view', [id]);
    const ids = useStore.getState().selection.ids;
    const items: MenuItem[] = [];
    const node = model.nodes[id];
    if (node) {
      if (node.nodeType === 'element' || node.nodeType === 'group' || node.nodeType === 'note') {
        items.push({ label: 'Rename (F2)', onClick: () => startEdit(id) });
      }
      items.push({ label: 'Bring to Front', onClick: () => reorderNode(id, 'front') });
      items.push({ label: 'Send to Back', onClick: () => reorderNode(id, 'back') });
      items.push(SEPARATOR);
    }
    const conn = model.connections[id];
    if (conn && conn.bendpoints.length > 0) {
      items.push({
        label: 'Remove All Bendpoints',
        onClick: () => setConnectionBendpoints(id, []),
      });
      items.push(SEPARATOR);
    }
    items.push({
      label: 'Delete from View (Del)',
      onClick: () => deleteViewObjects(ids),
    });
    const conceptIds = ids
      .map((i) => {
        const n = model.nodes[i];
        if (n?.nodeType === 'element') return n.elementId;
        const c = model.connections[i];
        return c?.relationshipId;
      })
      .filter((x): x is string => !!x);
    if (conceptIds.length > 0) {
      items.push({
        label: 'Delete from Model',
        danger: true,
        onClick: () => deleteItems(conceptIds),
      });
    }
    showContextMenu(e.clientX, e.clientY, items);
  };

  // ----------------------------------------------------------- dnd (tree)

  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-archi-ids')) e.preventDefault();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    let ids: string[];
    try {
      ids = JSON.parse(e.dataTransfer.getData('application/x-archi-ids'));
    } catch {
      return;
    }
    if (!Array.isArray(ids)) return;
    const p = toView(e.clientX, e.clientY);
    const parentId = containerAt(p, new Set()) ?? viewId;
    const parentAbs = parentId === viewId ? { x: 0, y: 0 } : absBounds.get(parentId)!;
    const created: string[] = [];
    let i = 0;
    for (const id of ids) {
      if (model.elements[id]) {
        const def = ELEMENT_TYPE_MAP[model.elements[id].type];
        created.push(
          addElementNodeToView(viewId, id, parentId, {
            x: snap(p.x - parentAbs.x - def.width / 2 + i * 16),
            y: snap(p.y - parentAbs.y - def.height / 2 + i * 16),
            width: def.width,
            height: def.height,
          }),
        );
        i++;
      } else if (model.views[id] && id !== viewId) {
        created.push(
          addRefNodeToView(viewId, id, parentId, {
            x: snap(p.x - parentAbs.x + i * 16),
            y: snap(p.y - parentAbs.y + i * 16),
            width: 200,
            height: 140,
          }),
        );
        i++;
      }
    }
    if (created.length > 0) setSelection('view', created);
  };

  // ------------------------------------------------------------ rendering

  // move deltas per dragged root
  const moveDelta = new Map<string, Point>();
  let dropParentId: string | null = null;
  let resizeOverride: { nodeId: string; rel: Bounds } | null = null;
  if (inter.kind === 'move') {
    const dx = inter.current.x - inter.start.x;
    const dy = inter.current.y - inter.start.y;
    for (const id of inter.rootIds) moveDelta.set(id, { x: dx, y: dy });
    dropParentId = inter.dropParentId;
  } else if (inter.kind === 'resize') {
    const node = model.nodes[inter.nodeId];
    if (node) {
      const parentAbs =
        node.parentId === viewId ? { x: 0, y: 0 } : (absBounds.get(node.parentId) ?? { x: 0, y: 0 });
      resizeOverride = {
        nodeId: inter.nodeId,
        rel: {
          x: inter.currentAbs.x - parentAbs.x,
          y: inter.currentAbs.y - parentAbs.y,
          width: inter.currentAbs.width,
          height: inter.currentAbs.height,
        },
      };
    }
  }

  // effective absolute bounds (with live interaction adjustments) for connections
  const liveAbs = (() => {
    if (moveDelta.size === 0 && !resizeOverride) return absBounds;
    const map = new Map(absBounds);
    if (moveDelta.size > 0) {
      for (const [rootId, d] of moveDelta) {
        const subtree = new Set<string>();
        descendants(model, rootId, subtree);
        for (const id of subtree) {
          const b = map.get(id);
          if (b) map.set(id, { ...b, x: b.x + d.x, y: b.y + d.y });
        }
      }
    }
    if (resizeOverride) {
      const node = model.nodes[resizeOverride.nodeId]!;
      const parentAbs =
        node.parentId === viewId ? { x: 0, y: 0 } : (map.get(node.parentId) ?? { x: 0, y: 0 });
      map.set(resizeOverride.nodeId, {
        x: parentAbs.x + resizeOverride.rel.x,
        y: parentAbs.y + resizeOverride.rel.y,
        width: resizeOverride.rel.width,
        height: resizeOverride.rel.height,
      });
    }
    return map;
  })();

  const viewSelected = selection.source === 'view' ? new Set(selection.ids) : new Set<string>();
  const singleSelected =
    viewSelected.size === 1 && inter.kind === 'none' ? [...viewSelected][0] : null;
  const selectedNodeForHandles =
    singleSelected && model.nodes[singleSelected] ? singleSelected : null;

  const connectHover: { id: string; valid: boolean } | null = (() => {
    if (inter.kind !== 'connect' || !inter.hoverNodeId) return null;
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

  // inline edit overlay geometry
  const editNodeAbs = edit ? liveAbs.get(edit.nodeId) : undefined;

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

  return (
    <div className="view-editor">
      <svg
        ref={svgRef}
        className="view-svg"
        style={{ cursor }}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        onContextMenu={onContextMenu}
        onDragOver={onDragOver}
        onDrop={onDrop}
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
              // live bendpoint drag preview
              let bendpoints = conn.bendpoints;
              if (inter.kind === 'bend' && inter.connId === conn.id) {
                const srcC = { x: src.x + src.width / 2, y: src.y + src.height / 2 };
                const tgtC = { x: tgt.x + tgt.width / 2, y: tgt.y + tgt.height / 2 };
                bendpoints = [...conn.bendpoints];
                const bp = toRelativeBendpoint(inter.current, srcC, tgtC);
                if (inter.isNew) bendpoints.splice(inter.index, 0, bp);
                else bendpoints[inter.index] = bp;
              }
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
          {/* bendpoint handles for a single selected connection */}
          {singleSelected &&
            model.connections[singleSelected] &&
            (() => {
              const conn = model.connections[singleSelected];
              const src = liveAbs.get(conn.sourceId);
              const tgt = liveAbs.get(conn.targetId);
              if (!src || !tgt) return null;
              const srcC = { x: src.x + src.width / 2, y: src.y + src.height / 2 };
              const tgtC = { x: tgt.x + tgt.width / 2, y: tgt.y + tgt.height / 2 };
              return bendpointPositions(conn.bendpoints, srcC, tgtC).map((bp, i) => (
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
              ));
            })()}
          {/* resize handles */}
          {selectedNodeForHandles &&
            (() => {
              const b = liveAbs.get(selectedNodeForHandles);
              if (!b) return null;
              return HANDLES.map((h) => (
                <rect
                  key={h.dir}
                  data-handle={h.dir}
                  data-handle-node={selectedNodeForHandles}
                  x={b.x + b.width * h.fx - 3.5}
                  y={b.y + b.height * h.fy - 3.5}
                  width={7}
                  height={7}
                  fill="#ffffff"
                  stroke="#2a6cc4"
                  strokeWidth={1.2}
                  style={{ cursor: h.cursor }}
                />
              ));
            })()}
          {/* marquee */}
          {inter.kind === 'marquee' && (
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
          )}
          {/* pending connection rubber band */}
          {inter.kind === 'connect' &&
            (() => {
              const src = liveAbs.get(inter.sourceNodeId);
              if (!src) return null;
              const srcC = { x: src.x + src.width / 2, y: src.y + src.height / 2 };
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
            })()}
        </g>
      </svg>
      {/* inline rename overlay */}
      {edit && editNodeAbs && (
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
      )}
      <div className="zoom-controls">
        <button className="zoom-btn" title="Zoom out (Ctrl+-)" onClick={() => zoomBy(1 / 1.2)}>
          −
        </button>
        <button className="zoom-btn zoom-pct" title="Reset to 100% (Ctrl+0)" onClick={() => zoomTo(1)}>
          {Math.round(viewport.zoom * 100)}%
        </button>
        <button className="zoom-btn" title="Zoom in (Ctrl+=)" onClick={() => zoomBy(1.2)}>
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
    </div>
  );
}
