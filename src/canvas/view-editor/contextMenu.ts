import {
  addGroupToView,
  addNoteToView,
  alignableNodeIds,
  alignNodes,
  deleteItems,
  deleteViewObjects,
  distributeNodes,
  duplicateViewObjects,
  matchSize,
  reorderNode,
  setConnectionBendpoints,
} from '../../model/ops';
import { setActiveTool, setSelection, type ModelStore } from '../../model/store';
import type { Bounds, ModelState } from '../../model/types';
import {
  alignmentAnchorMode,
  defaultGroupSize,
  defaultNoteSize,
  defaultTextStyle,
  type AppSettings,
} from '../../settings/app-settings';
import {
  alignBottomIcon,
  alignCenterIcon,
  alignLeftIcon,
  alignMiddleIcon,
  alignRightIcon,
  alignTopIcon,
  distributeHorizontalIcon,
  distributeVerticalIcon,
  matchHeightIcon,
  matchSizeIcon,
  matchWidthIcon,
} from './alignment-icons';
import { extensionRegistry } from '../../extensions/registry';
import {
  extensionMenuItems,
  SEPARATOR,
  showContextMenu,
  type MenuItem,
} from '../../ui/ContextMenu';
import {
  canPasteAsReferenceTo,
  canPasteTo,
  copyNodes,
  pasteNodes,
} from '../clipboard';
import type { Point } from '../geometry';
import { conceptTransformationMenuItems } from '../../ui/concept-transform-menu';

export function showEmptyCanvasContextMenu({
  clientX,
  clientY,
  viewId,
  parentId,
  parentAbs,
  point,
  absBounds,
  startEdit,
  settings,
  modelStore,
  sessionId,
  snap,
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
  settings: AppSettings;
  modelStore: ModelStore;
  sessionId: string;
  snap: (value: number) => number;
  zoomBy: (factor: number) => void;
  zoomTo: (zoom: number) => void;
  fitToView: () => void;
}) {
  const items: MenuItem[] = [
    {
      label: 'Paste (Ctrl+V)',
      disabled: !canPasteTo('view') || modelStore.getState().readOnly,
      onClick: () => {
        const ids = pasteNodes(viewId, point, modelStore, sessionId);
        if (ids.length > 0) setSelection('view', ids, modelStore);
      },
    },
    {
      label: 'Paste as Reference',
      disabled: !canPasteAsReferenceTo(sessionId) || modelStore.getState().readOnly,
      onClick: () => {
        const ids = pasteNodes(viewId, point, modelStore, sessionId, 'reference');
        if (ids.length > 0) setSelection('view', ids, modelStore);
      },
    },
    {
      label: 'Select All (Ctrl+A)',
      onClick: () => setSelection('view', [...absBounds.keys()], modelStore),
    },
    SEPARATOR,
    {
      label: 'New Note',
      onClick: () => {
        const def = defaultNoteSize(settings);
        const textDefaults = defaultTextStyle(settings);
        const noteId = addNoteToView(
          viewId,
          parentId,
          {
            x: snap(point.x - parentAbs.x),
            y: snap(point.y - parentAbs.y),
            width: def.width,
            height: def.height,
          },
          '',
          textDefaults,
          modelStore,
        );
        setSelection('view', [noteId], modelStore);
        setTimeout(() => startEdit(noteId), 0);
      },
    },
    {
      label: 'New Group',
      onClick: () => {
        const def = defaultGroupSize(settings);
        const textDefaults = defaultTextStyle(settings);
        const groupId = addGroupToView(
          viewId,
          parentId,
          {
            x: snap(point.x - parentAbs.x),
            y: snap(point.y - parentAbs.y),
            width: def.width,
            height: def.height,
          },
          'Group',
          textDefaults,
          modelStore,
        );
        setSelection('view', [groupId], modelStore);
      },
    },
    SEPARATOR,
    { label: 'Zoom In (Ctrl+=)', onClick: () => zoomBy(settings.buttonZoomFactor) },
    { label: 'Zoom Out (Ctrl+-)', onClick: () => zoomBy(1 / settings.buttonZoomFactor) },
    { label: 'Zoom 100% (Ctrl+0)', onClick: () => zoomTo(1) },
    { label: 'Fit to Window (Home)', onClick: fitToView },
  ];
  const trigger = {
    x: clientX,
    y: clientY,
    viewId,
    sessionId,
    modelId: modelStore.getState().model?.info.id ?? null,
  };
  const extensionItems = extensionMenuItems('view.context', trigger);
  showContextMenu(
    clientX,
    clientY,
    extensionItems.length > 0 ? [...items, SEPARATOR, ...extensionItems] : items,
    (reason) => {
      if (reason === 'escape') setActiveTool({ kind: 'select' }, modelStore);
    },
  );
  void extensionRegistry.emitEvent('view.contextMenu', trigger);
}

export function showViewObjectContextMenu({
  clientX,
  clientY,
  viewId,
  id,
  ids,
  model,
  settings,
  modelStore,
  sessionId,
  startEdit,
}: {
  clientX: number;
  clientY: number;
  viewId: string;
  id: string;
  ids: string[];
  model: ModelState;
  settings: AppSettings;
  modelStore: ModelStore;
  sessionId: string;
  startEdit: (nodeId: string) => void;
}) {
  const items: MenuItem[] = [];
  const node = model.nodes[id];
  if (node) {
    if (node.nodeType === 'element' || node.nodeType === 'group' || node.nodeType === 'note') {
      items.push({ label: 'Rename (F2)', onClick: () => startEdit(id) });
    }
    items.push({
      label: 'Bring to Front',
      onClick: () => reorderNode(id, 'front', modelStore),
    });
    items.push({
      label: 'Send to Back',
      onClick: () => reorderNode(id, 'back', modelStore),
    });
    items.push(SEPARATOR);
  }
  const conn = model.connections[id];
  if (
    conn &&
    (model.views[conn.viewId]?.connectionRouterType ?? 0) === 0 &&
    conn.bendpoints.length > 0
  ) {
    items.push({
      label: 'Remove All Bendpoints',
      onClick: () => setConnectionBendpoints(id, [], modelStore),
    });
    items.push(SEPARATOR);
  }
  if (ids.some((i) => model.nodes[i])) {
    items.push({
      label: 'Copy (Ctrl+C)',
      onClick: () => copyNodes(ids, modelStore, sessionId),
    });
    items.push({
      label: 'Duplicate (Ctrl+D)',
      onClick: () => {
        const newIds = duplicateViewObjects(viewId, ids, settings.pasteOffset, modelStore);
        if (newIds.length) setSelection('view', newIds, modelStore);
      },
    });
    items.push(SEPARATOR);
  }
  items.push({
    label: 'Delete from View (Del)',
    onClick: () => deleteViewObjects(ids, modelStore),
  });
  const conceptIds = ids
    .map((i) => {
      const n = model.nodes[i];
      if (n?.nodeType === 'element') return n.elementId;
      const c = model.connections[i];
      return c?.relationshipId;
    })
    .filter((x): x is string => !!x);
  const transformationItems = conceptTransformationMenuItems(
    model,
    ids,
    modelStore,
    settings,
  );
  if (transformationItems.length > 0) {
    items.push(SEPARATOR, ...transformationItems);
  }
  if (conceptIds.length > 0) {
    items.push({
      label: 'Delete from Model',
      danger: true,
      onClick: () => deleteItems(conceptIds, modelStore),
    });
  }
  const alignIds = alignableNodeIds(model, ids);
  if (alignIds.length >= 2) {
    const anchor = alignmentAnchorMode(settings);
    items.push(SEPARATOR);
    items.push({
      label: 'Align',
      children: [
        { label: 'Align Left', icon: alignLeftIcon, onClick: () => alignNodes(alignIds, 'left', anchor, modelStore) },
        { label: 'Align Center', icon: alignCenterIcon, onClick: () => alignNodes(alignIds, 'center', anchor, modelStore) },
        { label: 'Align Right', icon: alignRightIcon, onClick: () => alignNodes(alignIds, 'right', anchor, modelStore) },
        { label: 'Align Top', icon: alignTopIcon, onClick: () => alignNodes(alignIds, 'top', anchor, modelStore) },
        { label: 'Align Middle', icon: alignMiddleIcon, onClick: () => alignNodes(alignIds, 'middle', anchor, modelStore) },
        { label: 'Align Bottom', icon: alignBottomIcon, onClick: () => alignNodes(alignIds, 'bottom', anchor, modelStore) },
      ],
    });
    if (alignIds.length >= 3) {
      items.push({
        label: 'Distribute',
        children: [
          {
            label: 'Distribute Horizontally',
            icon: distributeHorizontalIcon,
            onClick: () => distributeNodes(alignIds, 'horizontal', modelStore),
          },
          {
            label: 'Distribute Vertically',
            icon: distributeVerticalIcon,
            onClick: () => distributeNodes(alignIds, 'vertical', modelStore),
          },
        ],
      });
    }
    items.push({
      label: 'Match Size',
      children: [
        { label: 'Match Width', icon: matchWidthIcon, onClick: () => matchSize(alignIds, 'width', anchor, modelStore) },
        { label: 'Match Height', icon: matchHeightIcon, onClick: () => matchSize(alignIds, 'height', anchor, modelStore) },
        { label: 'Match Size', icon: matchSizeIcon, onClick: () => matchSize(alignIds, 'both', anchor, modelStore) },
      ],
    });
  }
  const trigger = {
    x: clientX,
    y: clientY,
    viewId,
    sessionId,
    modelId: modelStore.getState().model?.info.id ?? null,
    targetId: id,
    selectionIds: ids,
  };
  const extensionItems = extensionMenuItems('selection.context', trigger);
  showContextMenu(
    clientX,
    clientY,
    extensionItems.length > 0 ? [...items, SEPARATOR, ...extensionItems] : items,
    (reason) => {
      if (reason === 'escape') setActiveTool({ kind: 'select' }, modelStore);
    },
  );
  void extensionRegistry.emitEvent('view.contextMenu', trigger);
}
