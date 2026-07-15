import {
  addGroupToView,
  addNoteToView,
  alignableNodeIds,
  alignNodes,
  deleteItems,
  deleteViewObjects,
  deleteViewObjectsKeepingChildren,
  distributeNodes,
  duplicateViewObjects,
  matchSize,
  reorderViewObjects,
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
  useSettingsStore,
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
  cutNodes,
  pasteNodes,
} from '../clipboard';
import type { Point } from '../geometry';
import { sameTypeViewObjectIds } from './bounds';
import { conceptTransformationMenuItems } from '../../ui/concept-transform-menu';
import { requestGenerateViewFor } from '../../ui/GenerateViewDialog';

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
  const readOnly = modelStore.getState().readOnly;
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
      label: settings.pasteSpecialMode === 'reference'
        ? 'Paste Special (References)'
        : 'Paste Special (Duplicates)',
      disabled:
        modelStore.getState().readOnly ||
        !canPasteTo('view') ||
        (settings.pasteSpecialMode === 'reference' && !canPasteAsReferenceTo(sessionId)),
      onClick: () => {
        const ids = pasteNodes(
          viewId,
          point,
          modelStore,
          sessionId,
          settings.pasteSpecialMode,
        );
        if (ids.length > 0) setSelection('view', ids, modelStore);
      },
    },
    {
      label: 'Select All (Ctrl+A)',
      onClick: () => setSelection('view', [...absBounds.keys()], modelStore),
    },
    SEPARATOR,
    {
      label: 'Grid and Guides',
      children: [
        {
          label: settings.gridVisible ? 'Hide Grid' : 'Show Grid',
          onClick: () => useSettingsStore.getState().setSetting(
            'gridVisible',
            !settings.gridVisible,
          ),
        },
        {
          label: settings.snapToGrid ? 'Disable Snap to Grid' : 'Enable Snap to Grid',
          onClick: () => useSettingsStore.getState().setSetting(
            'snapToGrid',
            !settings.snapToGrid,
          ),
        },
        {
          label: settings.snapToAlignmentGuides
            ? 'Disable Alignment Guides'
            : 'Enable Alignment Guides',
          onClick: () => useSettingsStore.getState().setSetting(
            'snapToAlignmentGuides',
            !settings.snapToAlignmentGuides,
          ),
        },
      ],
    },
    SEPARATOR,
    {
      label: 'New Note',
      disabled: readOnly,
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
      disabled: readOnly,
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
  const readOnly = modelStore.getState().readOnly;
  const node = model.nodes[id];
  const selectedNodeIds = ids.filter((selectedId) => Boolean(model.nodes[selectedId]));
  if (node) {
    if (node.nodeType === 'element' || node.nodeType === 'group' || node.nodeType === 'note') {
      items.push({ label: 'Rename (F2)', disabled: readOnly, onClick: () => startEdit(id) });
    }
    items.push({
      label: 'Order',
      disabled: readOnly,
      children: [
        {
          label: 'Bring to Front',
          onClick: () => reorderViewObjects(selectedNodeIds, 'front', modelStore),
        },
        {
          label: 'Bring Forward',
          onClick: () => reorderViewObjects(selectedNodeIds, 'forward', modelStore),
        },
        {
          label: 'Send Backward',
          onClick: () => reorderViewObjects(selectedNodeIds, 'backward', modelStore),
        },
        {
          label: 'Send to Back',
          onClick: () => reorderViewObjects(selectedNodeIds, 'back', modelStore),
        },
      ],
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
      disabled: readOnly,
      onClick: () => setConnectionBendpoints(id, [], modelStore),
    });
    items.push(SEPARATOR);
  }
  if (ids.some((i) => model.nodes[i])) {
    items.push({
      label: 'Cut (Ctrl+X)',
      disabled: readOnly,
      onClick: () => {
        const cutIds = cutNodes(ids, modelStore, sessionId);
        if (cutIds.length > 0) setSelection('view', [], modelStore);
      },
    });
    items.push({
      label: 'Copy (Ctrl+C)',
      onClick: () => copyNodes(ids, modelStore, sessionId),
    });
    items.push({
      label: 'Duplicate (Ctrl+D)',
      disabled: readOnly,
      onClick: () => {
        const newIds = duplicateViewObjects(viewId, ids, settings.pasteOffset, modelStore);
        if (newIds.length) setSelection('view', newIds, modelStore);
      },
    });
    items.push(SEPARATOR);
  }
  items.push({
    label: 'Select Objects of Same Type',
    onClick: () => setSelection(
      'view',
      sameTypeViewObjectIds(model, viewId, ids),
      modelStore,
    ),
  });
  items.push({
    label: 'Delete from View (Del)',
    disabled: readOnly,
    onClick: () => deleteViewObjects(ids, modelStore),
  });
  items.push({
    label: 'Delete from View but Keep Children',
    disabled: readOnly,
    onClick: () => deleteViewObjectsKeepingChildren(ids, modelStore),
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
  ).map((item) => readOnly ? { ...item, disabled: true } : item);
  if (transformationItems.length > 0) {
    items.push(SEPARATOR, ...transformationItems);
  }
  const generationIds = conceptIds.filter((conceptId) => Boolean(model.elements[conceptId]));
  items.push(SEPARATOR, {
    label: 'Generate View For…',
    disabled: modelStore.getState().readOnly || generationIds.length === 0,
    onClick: () => requestGenerateViewFor(generationIds),
  });
  if (conceptIds.length > 0) {
    items.push({
      label: 'Delete from Model',
      danger: true,
      disabled: readOnly,
      onClick: () => deleteItems(conceptIds, modelStore),
    });
  }
  const alignIds = alignableNodeIds(model, ids);
  if (alignIds.length >= 2) {
    const anchor = alignmentAnchorMode(settings);
    items.push(SEPARATOR);
    items.push({
      label: 'Align',
      disabled: readOnly,
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
        disabled: readOnly,
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
      disabled: readOnly,
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
