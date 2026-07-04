import { useMemo, useRef, useState, type ReactNode } from 'react';
import { StandaloneIcon } from '../canvas/figures/icons';
import { extensionRegistry } from '../extensions/registry';
import {
  ELEMENT_TYPES,
  ELEMENT_TYPE_MAP,
  RELATIONSHIP_TYPES,
  type ElementType,
  type Layer,
} from '../model/metamodel';
import {
  addElement,
  addFolder,
  addView,
  deleteItems,
  moveItemsToFolder,
  renameItem,
} from '../model/ops';
import { openView, setSelection, useStore } from '../model/store';
import type { Folder, ModelState } from '../model/types';
import {
  extensionMenuItems,
  showContextMenu,
  SEPARATOR,
  type MenuItem,
} from './ContextMenu';
import { computeVisibleTreeItems, treeItemLabel, type TreeTypeFilter } from './tree-filter';

const FOLDER_LAYERS: Record<string, Layer[]> = {
  strategy: ['strategy'],
  business: ['business'],
  application: ['application'],
  technology: ['technology', 'physical'],
  motivation: ['motivation'],
  implementation_migration: ['implementation_migration'],
  other: ['other'],
};

function ElementIcon({ type }: { type: ElementType }) {
  const def = ELEMENT_TYPE_MAP[type];
  return (
    <span className="tree-el-icon" style={{ color: '#5c5c5c' }} title={def.label}>
      <StandaloneIcon type={type} size={13} />
    </span>
  );
}

interface RowProps {
  id: string;
  depth: number;
  icon: ReactNode;
  label: string;
  dim?: boolean;
  onDoubleClick?: () => void;
  onContextMenu?: (x: number, y: number) => void;
  draggable?: boolean;
  onDropIds?: (ids: string[]) => void;
  renaming: boolean;
  onRenamed: (name: string | null) => void;
}

function TreeRow(props: RowProps) {
  const selected = useStore(
    (s) => s.selection.source === 'tree' && s.selection.ids.includes(props.id),
  );
  const [dragOver, setDragOver] = useState(false);

  if (props.renaming) {
    return (
      <div className="tree-row renaming" style={{ paddingLeft: props.depth * 14 + 4 }}>
        <span className="tree-icon">{props.icon}</span>
        <input
          autoFocus
          defaultValue={props.label}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => props.onRenamed(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') props.onRenamed((e.target as HTMLInputElement).value);
            if (e.key === 'Escape') props.onRenamed(null);
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={'tree-row' + (selected ? ' selected' : '') + (dragOver ? ' drag-over' : '')}
      style={{ paddingLeft: props.depth * 14 + 4 }}
      draggable={props.draggable}
      onClick={(e) => {
        const cur = useStore.getState().selection;
        if (e.ctrlKey && cur.source === 'tree') {
          setSelection(
            'tree',
            cur.ids.includes(props.id)
              ? cur.ids.filter((i) => i !== props.id)
              : [...cur.ids, props.id],
          );
        } else {
          setSelection('tree', [props.id]);
        }
      }}
      onDoubleClick={props.onDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const cur = useStore.getState().selection;
        if (!(cur.source === 'tree' && cur.ids.includes(props.id))) {
          setSelection('tree', [props.id]);
        }
        props.onContextMenu?.(e.clientX, e.clientY);
      }}
      onDragStart={(e) => {
        const cur = useStore.getState().selection;
        const ids =
          cur.source === 'tree' && cur.ids.includes(props.id) ? cur.ids : [props.id];
        e.dataTransfer.setData('application/x-archi-ids', JSON.stringify(ids));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={
        props.onDropIds
          ? (e) => {
              if (e.dataTransfer.types.includes('application/x-archi-ids')) {
                e.preventDefault();
                setDragOver(true);
              }
            }
          : undefined
      }
      onDragLeave={() => setDragOver(false)}
      onDrop={
        props.onDropIds
          ? (e) => {
              e.preventDefault();
              setDragOver(false);
              try {
                const ids = JSON.parse(e.dataTransfer.getData('application/x-archi-ids'));
                if (Array.isArray(ids)) props.onDropIds!(ids);
              } catch {
                /* ignore malformed drops */
              }
            }
          : undefined
      }
    >
      <span className="tree-icon">{props.icon}</span>
      <span className={'tree-label' + (props.dim ? ' dim' : '')}>{props.label}</span>
    </div>
  );
}

export function ModelTree() {
  const model = useStore((s) => s.model);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [filterType, setFilterType] = useState<TreeTypeFilter>('all');

  if (!model) {
    return <div className="model-tree empty-hint">No model open.<br />Use File → New to create one.</div>;
  }
  return (
    <ModelTreeInner
      model={model}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      renamingId={renamingId}
      setRenamingId={setRenamingId}
      filterText={filterText}
      setFilterText={setFilterText}
      filterType={filterType}
      setFilterType={setFilterType}
    />
  );
}

function ModelTreeInner({
  model,
  collapsed,
  setCollapsed,
  renamingId,
  setRenamingId,
  filterText,
  setFilterText,
  filterType,
  setFilterType,
}: {
  model: ModelState;
  collapsed: Set<string>;
  setCollapsed: (s: Set<string>) => void;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  filterText: string;
  setFilterText: (text: string) => void;
  filterType: TreeTypeFilter;
  setFilterType: (type: TreeTypeFilter) => void;
}) {
  const filterInputRef = useRef<HTMLInputElement>(null);
  const visible = useMemo(
    () => computeVisibleTreeItems(model, filterText, filterType),
    [model, filterText, filterType],
  );
  const filtering = visible !== null;
  const clearFilter = () => {
    setFilterText('');
    setFilterType('all');
  };
  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  };

  const finishRename = (id: string) => (name: string | null) => {
    setRenamingId(null);
    if (name !== null && name.trim() !== '') renameItem(id, name.trim());
  };

  const showTreeContextMenu = (x: number, y: number, items: MenuItem[], targetId: string) => {
    const trigger = {
      x,
      y,
      targetId,
      selectionIds: useStore.getState().selection.ids,
    };
    const extensionItems = extensionMenuItems('model-tree.context', trigger);
    showContextMenu(
      x,
      y,
      extensionItems.length > 0 ? [...items, SEPARATOR, ...extensionItems] : items,
    );
    void extensionRegistry.emitEvent('tree.contextMenu', trigger);
  };

  const itemLabel = (id: string): string => treeItemLabel(model, id);

  const conceptMenu = (id: string): MenuItem[] => {
    const sel = useStore.getState().selection;
    const ids = sel.source === 'tree' && sel.ids.includes(id) ? sel.ids : [id];
    return [
      { label: 'Rename', onClick: () => setRenamingId(id) },
      SEPARATOR,
      {
        label: ids.length > 1 ? `Delete ${ids.length} items` : 'Delete',
        danger: true,
        onClick: () => deleteItems(ids),
      },
    ];
  };

  const folderMenu = (folder: Folder): MenuItem[] => {
    const items: MenuItem[] = [];
    const layers = folder.folderType ? FOLDER_LAYERS[folder.folderType] : undefined;
    // find root folder type by walking up for subfolders
    let top: Folder = folder;
    while (top.parentId !== null) top = model.folders[top.parentId];
    const topLayers = top.folderType ? FOLDER_LAYERS[top.folderType] : layers;
    if (topLayers) {
      items.push({
        label: 'New Element',
        children: topLayers.flatMap((layer) =>
          ELEMENT_TYPES.filter((d) => d.layer === layer).map((d) => ({
            label: d.label,
            icon: <ElementIcon type={d.type} />,
            onClick: () => {
              const id = addElement(d.type, undefined, folder.id);
              setSelection('tree', [id]);
              setRenamingId(id);
            },
          })),
        ),
      });
    }
    if (top.folderType === 'diagrams') {
      items.push({
        label: 'New ArchiMate View',
        onClick: () => {
          const id = addView('New View', folder.id);
          setSelection('tree', [id]);
          openView(id);
          setRenamingId(id);
        },
      });
    }
    items.push({
      label: 'New Folder',
      onClick: () => {
        const id = addFolder(folder.id);
        setRenamingId(id);
      },
    });
    if (folder.parentId !== null) {
      items.push(SEPARATOR);
      items.push({ label: 'Rename', onClick: () => setRenamingId(folder.id) });
      items.push({ label: 'Delete', danger: true, onClick: () => deleteItems([folder.id]) });
    }
    return items;
  };

  const renderFolder = (folderId: string, depth: number): ReactNode => {
    const folder = model.folders[folderId];
    if (!folder) return null;
    if (filtering && !visible.has(folderId)) return null;
    // While filtering, matches must be reachable: ignore collapse state.
    const isCollapsed = !filtering && collapsed.has(folderId);
    const subfolders = [...folder.folderIds].sort((a, b) =>
      (model.folders[a]?.name ?? '').localeCompare(model.folders[b]?.name ?? ''),
    );
    const allItems = filtering
      ? folder.itemIds.filter((id) => visible.has(id))
      : folder.itemIds;
    const items = [...allItems].sort((a, b) => itemLabel(a).localeCompare(itemLabel(b)));
    return (
      <div key={folderId}>
        <div onClick={() => toggle(folderId)}>
          <TreeRow
            id={folderId}
            depth={depth}
            icon={<span className="tree-chevron">{isCollapsed ? '▸' : '▾'}</span>}
            label={folder.name}
            onContextMenu={(x, y) => showTreeContextMenu(x, y, folderMenu(folder), folderId)}
            draggable={folder.parentId !== null}
            onDropIds={(ids) => moveItemsToFolder(ids, folderId)}
            renaming={renamingId === folderId}
            onRenamed={finishRename(folderId)}
          />
        </div>
        {!isCollapsed && (
          <div>
            {subfolders.map((sub) => renderFolder(sub, depth + 1))}
            {items.map((itemId) => {
              const el = model.elements[itemId];
              if (el) {
                return (
                  <TreeRow
                    key={itemId}
                    id={itemId}
                    depth={depth + 1}
                    icon={<ElementIcon type={el.type} />}
                    label={el.name}
                    onContextMenu={(x, y) => showTreeContextMenu(x, y, conceptMenu(itemId), itemId)}
                    draggable
                    renaming={renamingId === itemId}
                    onRenamed={finishRename(itemId)}
                  />
                );
              }
              const rel = model.relationships[itemId];
              if (rel) {
                return (
                  <TreeRow
                    key={itemId}
                    id={itemId}
                    depth={depth + 1}
                    icon={<span className="tree-rel-icon">→</span>}
                    label={itemLabel(itemId)}
                    dim
                    onContextMenu={(x, y) => showTreeContextMenu(x, y, conceptMenu(itemId), itemId)}
                    draggable
                    renaming={renamingId === itemId}
                    onRenamed={finishRename(itemId)}
                  />
                );
              }
              const view = model.views[itemId];
              if (view) {
                return (
                  <TreeRow
                    key={itemId}
                    id={itemId}
                    depth={depth + 1}
                    icon={<span className="tree-view-icon">▦</span>}
                    label={view.name}
                    onDoubleClick={() => openView(itemId)}
                    onContextMenu={(x, y) =>
                      showTreeContextMenu(
                        x,
                        y,
                        [
                          { label: 'Open View', onClick: () => openView(itemId) },
                          SEPARATOR,
                          ...conceptMenu(itemId),
                        ],
                        itemId,
                      )
                    }
                    draggable
                    renaming={renamingId === itemId}
                    onRenamed={finishRename(itemId)}
                  />
                );
              }
              return null;
            })}
          </div>
        )}
      </div>
    );
  };

  const rootMenu: MenuItem[] = useMemo(
    () => [{ label: 'Rename', onClick: () => setRenamingId(model.info.id) }],
    [model.info.id, setRenamingId],
  );

  return (
    <div
      className="model-tree"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
          e.preventDefault();
          filterInputRef.current?.focus();
          return;
        }
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
        const sel = useStore.getState().selection;
        if (e.key === 'Delete' && sel.source === 'tree' && sel.ids.length > 0) {
          deleteItems(sel.ids);
        }
        if (e.key === 'F2' && sel.source === 'tree' && sel.ids.length === 1) {
          setRenamingId(sel.ids[0]);
        }
      }}
    >
      <div className="tree-filter">
        <input
          ref={filterInputRef}
          className="tree-filter-input"
          type="search"
          placeholder="Filter (Ctrl+F)"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              clearFilter();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <select
          className="tree-filter-type"
          title="Filter by type"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as TreeTypeFilter)}
        >
          <option value="all">All</option>
          <option value="elements">Elements</option>
          <option value="relationships">Relationships</option>
          <option value="views">Views</option>
          <option value="folders">Folders</option>
          <optgroup label="Element types">
            {ELEMENT_TYPES.map((d) => (
              <option key={d.type} value={d.type}>
                {d.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Relationship types">
            {RELATIONSHIP_TYPES.map((d) => (
              <option key={d.type} value={d.type}>
                {d.label}
              </option>
            ))}
          </optgroup>
        </select>
        {(filterText !== '' || filterType !== 'all') && (
          <button className="tree-filter-clear" title="Clear filter" onClick={clearFilter}>
            ✕
          </button>
        )}
      </div>
      <TreeRow
        id={model.info.id}
        depth={0}
        icon={<span className="tree-model-icon">◈</span>}
        label={model.info.name}
        onContextMenu={(x, y) => showTreeContextMenu(x, y, rootMenu, model.info.id)}
        renaming={renamingId === model.info.id}
        onRenamed={finishRename(model.info.id)}
      />
      {model.rootFolderIds.map((fid) => renderFolder(fid, 1))}
      {filtering && visible.size === 0 && (
        <div className="tree-filter-empty">No matches.</div>
      )}
    </div>
  );
}
