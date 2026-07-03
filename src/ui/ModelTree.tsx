import { useMemo, useState, type ReactNode } from 'react';
import { StandaloneIcon } from '../canvas/figures/icons';
import {
  ELEMENT_TYPES,
  ELEMENT_TYPE_MAP,
  relationshipLabel,
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
import { showContextMenu, SEPARATOR, type MenuItem } from './ContextMenu';

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
    />
  );
}

function ModelTreeInner({
  model,
  collapsed,
  setCollapsed,
  renamingId,
  setRenamingId,
}: {
  model: ModelState;
  collapsed: Set<string>;
  setCollapsed: (s: Set<string>) => void;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
}) {
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

  const itemLabel = (id: string): string => {
    const el = model.elements[id];
    if (el) return el.name;
    const rel = model.relationships[id];
    if (rel) {
      const src = model.elements[rel.sourceId] ?? model.relationships[rel.sourceId];
      const tgt = model.elements[rel.targetId] ?? model.relationships[rel.targetId];
      const base = rel.name !== '' ? rel.name : relationshipLabel(rel.type);
      return `${base} (${src?.name ?? '?'} → ${tgt?.name ?? '?'})`;
    }
    const view = model.views[id];
    if (view) return view.name;
    return '?';
  };

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
    const isCollapsed = collapsed.has(folderId);
    const subfolders = [...folder.folderIds].sort((a, b) =>
      (model.folders[a]?.name ?? '').localeCompare(model.folders[b]?.name ?? ''),
    );
    const items = [...folder.itemIds].sort((a, b) => itemLabel(a).localeCompare(itemLabel(b)));
    return (
      <div key={folderId}>
        <div onClick={() => toggle(folderId)}>
          <TreeRow
            id={folderId}
            depth={depth}
            icon={<span className="tree-chevron">{isCollapsed ? '▸' : '▾'}</span>}
            label={folder.name}
            onContextMenu={(x, y) => showContextMenu(x, y, folderMenu(folder))}
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
                    onContextMenu={(x, y) => showContextMenu(x, y, conceptMenu(itemId))}
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
                    onContextMenu={(x, y) => showContextMenu(x, y, conceptMenu(itemId))}
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
                      showContextMenu(x, y, [
                        { label: 'Open View', onClick: () => openView(itemId) },
                        SEPARATOR,
                        ...conceptMenu(itemId),
                      ])
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
        const sel = useStore.getState().selection;
        if (e.key === 'Delete' && sel.source === 'tree' && sel.ids.length > 0) {
          deleteItems(sel.ids);
        }
        if (e.key === 'F2' && sel.source === 'tree' && sel.ids.length === 1) {
          setRenamingId(sel.ids[0]);
        }
      }}
    >
      <TreeRow
        id={model.info.id}
        depth={0}
        icon={<span className="tree-model-icon">◈</span>}
        label={model.info.name}
        onContextMenu={(x, y) => showContextMenu(x, y, rootMenu)}
        renaming={renamingId === model.info.id}
        onRenamed={finishRename(model.info.id)}
      />
      {model.rootFolderIds.map((fid) => renderFolder(fid, 1))}
    </div>
  );
}
