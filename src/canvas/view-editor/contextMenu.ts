import {
  addGroupToView,
  addNoteToView,
  deleteItems,
  deleteViewObjects,
  reorderNode,
  setConnectionBendpoints,
} from '../../model/ops';
import { setSelection } from '../../model/store';
import type { Bounds, ModelState } from '../../model/types';
import { SEPARATOR, showContextMenu, type MenuItem } from '../../ui/ContextMenu';
import { hasClipboard, pasteNodes } from '../clipboard';
import type { Point } from '../geometry';

export function showEmptyCanvasContextMenu({
  clientX,
  clientY,
  viewId,
  parentId,
  parentAbs,
  point,
  absBounds,
  startEdit,
  zoomBy,
  zoomTo,
  fitToView,
}: {
  clientX: number;
  clientY: number;
  viewId: string;
  parentId: string;
  parentAbs: Pick<Bounds, 'x' | 'y'>;
  point: Point;
  absBounds: Map<string, Bounds>;
  startEdit: (nodeId: string) => void;
  zoomBy: (factor: number) => void;
  zoomTo: (zoom: number) => void;
  fitToView: () => void;
}) {
  showContextMenu(clientX, clientY, [
    {
      label: 'Paste (Ctrl+V)',
      disabled: !hasClipboard(),
      onClick: () => {
        const ids = pasteNodes(viewId, point);
        if (ids.length > 0) setSelection('view', ids);
      },
    },
    { label: 'Select All (Ctrl+A)', onClick: () => setSelection('view', [...absBounds.keys()]) },
    SEPARATOR,
    {
      label: 'New Note',
      onClick: () => {
        const noteId = addNoteToView(viewId, parentId, {
          x: Math.round(point.x - parentAbs.x),
          y: Math.round(point.y - parentAbs.y),
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
          x: Math.round(point.x - parentAbs.x),
          y: Math.round(point.y - parentAbs.y),
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
}

export function showViewObjectContextMenu({
  clientX,
  clientY,
  id,
  ids,
  model,
  startEdit,
}: {
  clientX: number;
  clientY: number;
  id: string;
  ids: string[];
  model: ModelState;
  startEdit: (nodeId: string) => void;
}) {
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
  showContextMenu(clientX, clientY, items);
}
