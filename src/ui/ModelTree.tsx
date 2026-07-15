import {
  createContext,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StandaloneIcon } from '../canvas/figures/icons';
import { extensionRegistry } from '../extensions/registry';
import { C4_VIEW_TYPE_LABELS, C4_VIEW_TYPES } from '../model/c4';
import {
  ELEMENT_TYPES,
  ELEMENT_TYPE_MAP,
  type ElementType,
  type Layer,
} from '../model/metamodel';
import {
  addElement,
  addFolder,
  addView,
  createC4TemplateView,
  deleteItems,
  duplicateItems,
  moveItemsToFolder,
  renameItem,
  setConceptProfiles,
} from '../model/ops';
import { openView, runBatch, setSelection } from '../model/store';
import { ModelStoreProvider, useModelStoreApi, useStore, useWorkspaceStore } from './store-hooks';
import {
  canPasteTo,
  copyTreeItems,
  pasteTreeItems,
} from '../canvas/clipboard';
import { activateModelSession, getModelSessionForStore, type ModelSession } from '../model/workspace';
import type { Folder, ModelState } from '../model/types';
import {
  extensionMenuItems,
  showContextMenu,
  SEPARATOR,
  type MenuItem,
} from './ContextMenu';
import { requestGenerateViewFor } from './GenerateViewDialog';
import { onRevealRequest } from './tree-bus';
import {
  DEFAULT_TREE_SEARCH_CRITERIA,
  collectTreeSearchCatalog,
  compileTreeSearch,
  resetTreeSearchCriteria,
  searchModelTree,
  treeSearchCatalogSignature,
  type TreeSearchCriteria,
  type TreeSearchResult,
} from './tree-filter';
import {
  closeModelSession,
  closeModelSessions,
  saveModelSession,
} from './model-session-actions';
import { useSettingsStore } from '../settings/app-settings';
import { conceptTransformationMenuItems } from './concept-transform-menu';
import { TreeSearchBar } from './TreeSearchBar';
import { matchesShortcut } from './shortcuts';
import {
  getTreeRowsForWindow,
  getTreeRowWindow,
  projectModelTreeRows,
  TREE_ROW_HEIGHT,
  type ProjectedTreeRow,
} from './tree-row-projection';

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
    <span className="tree-el-icon" style={{ color: 'var(--chrome-icon)' }} title={def.label}>
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
  level?: number;
  expanded?: boolean;
  tabIndex?: number;
  onFocus?: () => void;
  onActivate?: () => void;
  posInSet?: number;
  setSize?: number;
}

const ModelTreeActiveContext = createContext(true);

function TreeRow(props: RowProps) {
  const modelStore = useModelStoreApi();
  const activeModel = useContext(ModelTreeActiveContext);
  const selected = useStore(
    (s) => activeModel && s.selection.source === 'tree' && s.selection.ids.includes(props.id),
  );
  const [dragOver, setDragOver] = useState(false);

  if (props.renaming) {
    return (
      <div
        className="tree-row renaming"
        role="treeitem"
        aria-level={props.level ?? props.depth + 1}
        style={{ paddingLeft: props.depth * 14 + 4 }}
      >
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
      data-tree-id={props.id}
      role="treeitem"
      aria-level={props.level ?? props.depth + 1}
      aria-posinset={props.posInSet}
      aria-setsize={props.setSize}
      aria-selected={selected}
      aria-expanded={props.expanded}
      tabIndex={props.tabIndex ?? -1}
      onFocus={props.onFocus}
      draggable={props.draggable}
      onClick={(e) => {
        const cur = modelStore.getState().selection;
        if (e.ctrlKey && cur.source === 'tree') {
          setSelection(
            'tree',
            cur.ids.includes(props.id)
              ? cur.ids.filter((i) => i !== props.id)
              : [...cur.ids, props.id],
            modelStore,
          );
        } else {
          setSelection('tree', [props.id], modelStore);
        }
        props.onActivate?.();
      }}
      onDoubleClick={props.onDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const cur = modelStore.getState().selection;
        if (!(cur.source === 'tree' && cur.ids.includes(props.id))) {
          setSelection('tree', [props.id], modelStore);
        }
        props.onContextMenu?.(e.clientX, e.clientY);
      }}
      onDragStart={(e) => {
        const cur = modelStore.getState().selection;
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
  const order = useWorkspaceStore((s) => s.order);
  const sessions = useWorkspaceStore((s) => s.sessions);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);
  const modelRevision = useWorkspaceStore((s) => s.modelRevision);
  const settings = useSettingsStore((s) => s.settings);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [legacyRenamingId, setLegacyRenamingId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [criteria, setCriteria] = useState<TreeSearchCriteria>(() => ({
    ...DEFAULT_TREE_SEARCH_CRITERIA,
    searchName: settings.treeSearchName,
    searchDocumentation: settings.treeSearchDocumentation,
    searchPropertyValues: settings.treeSearchPropertyValue,
    includeViews: settings.treeSearchViews,
    showAllFolders: settings.treeSearchShowAllFolders,
    matchCase: settings.treeSearchMatchCase,
    useRegex: settings.treeSearchRegex,
  }));
  const searchableModels = useMemo(() => {
    void modelRevision;
    return order.length > 0
      ? order.flatMap((sessionId) => {
          const sessionModel = sessions[sessionId]?.store.getState().model;
          return sessionModel ? [sessionModel] : [];
        })
      : model ? [model] : [];
  }, [model, modelRevision, order, sessions]);
  const catalog = useMemo(() => collectTreeSearchCatalog(searchableModels), [searchableModels]);
  const catalogSignature = treeSearchCatalogSignature(catalog);
  const previousCatalogSignature = useRef<string | null>(null);
  const deferredCriteria = useDeferredValue(criteria);
  const compiled = useMemo(() => compileTreeSearch(deferredCriteria), [deferredCriteria]);
  const results = useMemo(() => {
    void modelRevision;
    void refreshToken;
    const next: Record<string, TreeSearchResult> = {};
    if (order.length > 0) {
      for (const sessionId of order) {
        const sessionModel = sessions[sessionId]?.store.getState().model;
        if (sessionModel) next[sessionId] = searchModelTree(sessionModel, compiled);
      }
    } else if (model) {
      next.legacy = searchModelTree(model, compiled);
    }
    return next;
  }, [compiled, model, modelRevision, order, refreshToken, sessions]);
  const allFolderKeys = order.length > 0
    ? order.flatMap((sessionId) =>
        Object.keys(sessions[sessionId]?.store.getState().model?.folders ?? {}).map(
          (folderId) => `${sessionId}:${folderId}`,
        ))
    : Object.keys(model?.folders ?? {}).map((id) => `legacy:${id}`);
  const matchCount = Object.values(results).reduce((sum, result) => sum + result.matchedIds.size, 0);

  useEffect(() => {
    setCriteria((current) => ({
      ...current,
      searchName: settings.treeSearchName,
      searchDocumentation: settings.treeSearchDocumentation,
      searchPropertyValues: settings.treeSearchPropertyValue,
      includeViews: settings.treeSearchViews,
      showAllFolders: settings.treeSearchShowAllFolders,
      matchCase: settings.treeSearchMatchCase,
      useRegex: settings.treeSearchRegex,
    }));
  }, [
    settings.treeSearchDocumentation,
    settings.treeSearchMatchCase,
    settings.treeSearchName,
    settings.treeSearchPropertyValue,
    settings.treeSearchRegex,
    settings.treeSearchShowAllFolders,
    settings.treeSearchViews,
  ]);

  useEffect(() => {
    const previous = previousCatalogSignature.current;
    previousCatalogSignature.current = catalogSignature;
    if (previous !== null && previous !== catalogSignature) {
      setCriteria((current) => ({ ...current, propertyKeys: [], specializations: [] }));
    }
  }, [catalogSignature]);

  const setSearchPreference = (
    key: 'searchName' | 'searchDocumentation' | 'searchPropertyValues' | 'includeViews'
      | 'showAllFolders' | 'matchCase' | 'useRegex',
    value: boolean,
  ) => {
    const settingKey = {
      searchName: 'treeSearchName',
      searchDocumentation: 'treeSearchDocumentation',
      searchPropertyValues: 'treeSearchPropertyValue',
      includeViews: 'treeSearchViews',
      showAllFolders: 'treeSearchShowAllFolders',
      matchCase: 'treeSearchMatchCase',
      useRegex: 'treeSearchRegex',
    } as const;
    setCriteria((current) => ({ ...current, [key]: value }));
    setSetting(settingKey[key], value);
  };
  const resetSearch = () => {
    setCriteria((current) => resetTreeSearchCriteria(current));
    setSetting('treeSearchName', true);
    setSetting('treeSearchDocumentation', false);
    setSetting('treeSearchPropertyValue', false);
    setSetting('treeSearchViews', false);
  };
  const clearSearchForReveal = useCallback(() => {
    setCriteria((current) => ({
      ...current,
      query: '',
      propertyKeys: [],
      conceptTypes: [],
      specializations: [],
      includeViews: false,
    }));
    setSetting('treeSearchViews', false);
  }, [setSetting]);
  useEffect(() => onRevealRequest((id, requestedSessionId) => {
    const sessionId = order.length > 0 ? (requestedSessionId ?? activeSessionId) : 'legacy';
    if (!sessionId) return;
    const sessionModel = sessionId === 'legacy'
      ? model
      : sessions[sessionId]?.store.getState().model;
    if (!sessionModel) return;
    const item = sessionModel.elements[id]
      ?? sessionModel.relationships[id]
      ?? sessionModel.views[id];
    const isModelRoot = sessionModel.info.id === id;
    if (!item && !sessionModel.folders[id] && !isModelRoot) return;

    const result = results[sessionId];
    if (result?.active && !result.visibleIds.has(id)) clearSearchForReveal();

    const ancestors = new Set<string>();
    let folderId: string | null | undefined = item
      ? item.folderId
      : (sessionModel.folders[id]?.parentId ?? null);
    while (folderId) {
      ancestors.add(folderId);
      folderId = sessionModel.folders[folderId]?.parentId;
    }
    const ancestorKeys = new Set([...ancestors].map((ancestorId) =>
      `${sessionId}:${ancestorId}`));
    ancestorKeys.add(`${sessionId}:${sessionModel.info.id}`);
    setCollapsed((current) => new Set([...current].filter((key) => !ancestorKeys.has(key))));

    const scroll = (attempt: number) => {
      const container = treeContainerRef.current;
      const owner = sessionId === 'legacy'
        ? container?.querySelector<HTMLElement>('.legacy-model-tree-session')
        : [...(container?.querySelectorAll<HTMLElement>('[data-model-session-id]') ?? [])]
            .find((candidate) => candidate.dataset.modelSessionId === sessionId);
      if (owner) owner.dispatchEvent(new CustomEvent('archi-tree-reveal-row', { detail: { id } }));
      else if (attempt < 3) requestAnimationFrame(() => scroll(attempt + 1));
    };
    requestAnimationFrame(() => scroll(0));
  }), [activeSessionId, clearSearchForReveal, model, order, results, sessions]);
  const searchBar = searchableModels.length > 0 ? (
    <TreeSearchBar
      criteria={criteria}
      setCriteria={setCriteria}
      compiled={compiled}
      catalog={catalog}
      matchCount={matchCount}
      setPreference={setSearchPreference}
      onReset={resetSearch}
      onRefresh={() => setRefreshToken((value) => value + 1)}
      filtering={compiled.active}
      onExpandAll={() => setCollapsed(new Set())}
      onCollapseAll={() => setCollapsed(new Set(allFolderKeys))}
    />
  ) : null;

  if (order.length > 0) {
    return (
      <div
        ref={treeContainerRef}
        className="model-tree workspace-model-tree"
        tabIndex={0}
        onKeyDownCapture={(event) => {
          if (matchesShortcut('tree-filter', event)) {
            event.preventDefault();
            event.currentTarget.querySelector<HTMLInputElement>('.tree-filter-input')?.focus();
          }
        }}
      >
        {searchBar}
        {order.map((sessionId) => {
          const session = sessions[sessionId];
          const result = results[sessionId];
          return session && result && (!result.active || result.visibleIds.has(
            session.store.getState().model!.info.id,
          )) ? (
            <ScopedModelTree
              key={sessionId}
              session={session}
              active={sessionId === activeSessionId}
              collapsed={collapsed}
              setCollapsed={setCollapsed}
              searchResult={result}
            />
          ) : null;
        })}
        {compiled.active && matchCount === 0 && <div className="tree-filter-empty">No matches.</div>}
      </div>
    );
  }

  if (!model) {
    return <div className="model-tree empty-hint">No model open.<br />Use File → New to create one.</div>;
  }
  return (
    <div ref={treeContainerRef} className="model-tree" tabIndex={0}>
      {searchBar}
      {(!results.legacy.active || results.legacy.visibleIds.has(model.info.id)) && (
        <ModelTreeInner
          model={model}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          renamingId={legacyRenamingId}
          setRenamingId={setLegacyRenamingId}
          searchResult={results.legacy}
          collapsePrefix="legacy"
          dirty={useStore.getState().dirty}
          embedded={false}
        />
      )}
      {compiled.active && matchCount === 0 && <div className="tree-filter-empty">No matches.</div>}
    </div>
  );
}

function ScopedModelTree({
  session,
  active,
  collapsed,
  setCollapsed,
  searchResult,
}: {
  session: ModelSession;
  active: boolean;
  collapsed: Set<string>;
  setCollapsed: (value: Set<string>) => void;
  searchResult: TreeSearchResult;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  return (
    <ModelStoreProvider store={session.store}>
      <ModelTreeActiveContext.Provider value={active}>
        <ScopedModelTreeContent
          sessionId={session.id}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          renamingId={renamingId}
          setRenamingId={setRenamingId}
          searchResult={searchResult}
        />
      </ModelTreeActiveContext.Provider>
    </ModelStoreProvider>
  );
}

function ScopedModelTreeContent({
  sessionId,
  collapsed,
  setCollapsed,
  renamingId,
  setRenamingId,
  searchResult,
}: {
  sessionId: string;
  collapsed: Set<string>;
  setCollapsed: (value: Set<string>) => void;
  renamingId: string | null;
  setRenamingId: (value: string | null) => void;
  searchResult: TreeSearchResult;
}) {
  const model = useStore((state) => state.model);
  const dirty = useStore((state) => state.dirty);
  if (!model) return null;
  return (
    <ModelTreeInner
      model={model}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      renamingId={renamingId}
      setRenamingId={setRenamingId}
      searchResult={searchResult}
      collapsePrefix={sessionId}
      dirty={dirty}
      embedded
    />
  );
}

function ModelTreeInner({
  model,
  collapsed,
  setCollapsed,
  renamingId,
  setRenamingId,
  searchResult,
  collapsePrefix,
  dirty,
  embedded,
}: {
  model: ModelState;
  collapsed: Set<string>;
  setCollapsed: (s: Set<string>) => void;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  searchResult: TreeSearchResult;
  collapsePrefix: string;
  dirty: boolean;
  embedded: boolean;
}) {
  const modelStore = useModelStoreApi();
  const treeRef = useRef<HTMLDivElement>(null);
  const readOnly = useStore((s) => s.readOnly);
  const settings = useSettingsStore((s) => s.settings);
  const visible = searchResult.visibleIds;
  const filtering = searchResult.active;
  const rows = useMemo(
    () => projectModelTreeRows(model, collapsed, collapsePrefix, filtering, visible),
    [collapsePrefix, collapsed, filtering, model, visible],
  );
  const [focusedId, setFocusedId] = useState(model.info.id);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(440);
  const virtualized = rows.length > 100;
  const activeFocusedId = rows.some((row) => row.id === focusedId)
    ? focusedId
    : rows[0]?.id;
  const rowWindow = virtualized
    ? getTreeRowWindow(rows.length, scrollTop, viewportHeight)
    : { start: 0, end: rows.length, offset: 0, totalHeight: rows.length * TREE_ROW_HEIGHT };

  useEffect(() => {
    const element = treeRef.current;
    if (!element) return;
    const measure = () => setViewportHeight(Math.max(TREE_ROW_HEIGHT, element.clientHeight || 440));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [virtualized]);

  const toggle = (id: string) => {
    if (filtering) return;
    const key = `${collapsePrefix}:${id}`;
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsed(next);
  };

  const focusRowAt = (index: number, select = true) => {
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (!row) return;
    setFocusedId(row.id);
    if (select) setSelection('tree', [row.id], modelStore);
    if (virtualized && treeRef.current) {
      const top = index * TREE_ROW_HEIGHT;
      const bottom = top + TREE_ROW_HEIGHT;
      const currentTop = treeRef.current.scrollTop;
      const currentBottom = currentTop + treeRef.current.clientHeight;
      if (top < currentTop || bottom > currentBottom) {
        treeRef.current.scrollTop = Math.max(0, top - treeRef.current.clientHeight / 2);
        setScrollTop(treeRef.current.scrollTop);
      }
    }
    requestAnimationFrame(() => {
      [...(treeRef.current?.querySelectorAll<HTMLElement>('[data-tree-id]') ?? [])]
        .find((candidate) => candidate.dataset.treeId === row.id)
        ?.focus();
    });
  };

  useEffect(() => {
    const element = treeRef.current;
    if (!element) return;
    const reveal = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      const index = id ? rows.findIndex((row) => row.id === id) : -1;
      if (index >= 0) focusRowAt(index);
    };
    element.addEventListener('archi-tree-reveal-row', reveal);
    return () => element.removeEventListener('archi-tree-reveal-row', reveal);
  });

  const finishRename = (id: string) => (name: string | null) => {
    setRenamingId(null);
    if (name !== null && name.trim() !== '') renameItem(id, name.trim(), modelStore);
  };

  const showTreeContextMenu = (x: number, y: number, items: MenuItem[], targetId: string) => {
    const session = getModelSessionForStore(modelStore);
    const trigger = {
      x,
      y,
      sessionId: session?.id ?? null,
      modelId: model.info.id,
      targetId,
      selectionIds: modelStore.getState().selection.ids,
    };
    const extensionItems = extensionMenuItems('model-tree.context', trigger);
    showContextMenu(
      x,
      y,
      extensionItems.length > 0 ? [...items, SEPARATOR, ...extensionItems] : items,
    );
    void extensionRegistry.emitEvent('tree.contextMenu', trigger);
  };

  const conceptMenu = (id: string): MenuItem[] => {
    const sel = modelStore.getState().selection;
    const ids = sel.source === 'tree' && sel.ids.includes(id) ? sel.ids : [id];
    const canDuplicate = ids.some((i) => model.elements[i] || model.views[i]);
    const items: MenuItem[] = [
      { label: 'Rename', onClick: () => setRenamingId(id) },
      ...(canDuplicate
        ? [
            {
              label: 'Copy (Ctrl+C)',
              onClick: () => copyTreeItems(modelStore, collapsePrefix, ids),
            } as MenuItem,
          ]
        : []),
      ...(canDuplicate
        ? [
            {
              label: 'Duplicate',
              disabled: readOnly,
              onClick: () => {
                const newIds = duplicateItems(ids, modelStore);
                if (newIds.length) setSelection('tree', newIds, modelStore);
              },
            } as MenuItem,
          ]
        : []),
    ];
    const transformationItems = conceptTransformationMenuItems(
      model,
      ids,
      modelStore,
      settings,
    );
    if (transformationItems.length > 0) {
      items.push(SEPARATOR, ...transformationItems);
    }
    const generationIds = ids.filter((selectedId) => Boolean(model.elements[selectedId]));
    items.push(SEPARATOR, {
      label: 'Generate View For…',
      disabled: readOnly || generationIds.length === 0,
      onClick: () => requestGenerateViewFor(generationIds),
    });
    items.push(SEPARATOR, {
      label: ids.length > 1 ? `Delete ${ids.length} items` : 'Delete',
      danger: true,
      onClick: () => deleteItems(ids, modelStore),
    });
    return items;
  };

  const folderMenu = (folder: Folder): MenuItem[] => {
    const items: MenuItem[] = [];
    if (embedded) {
      items.push({
        label: 'Paste (Ctrl+V)',
        disabled: !canPasteTo('tree') || readOnly,
        onClick: () => {
          const ids = pasteTreeItems(modelStore, collapsePrefix);
          if (ids.length) setSelection('tree', ids, modelStore);
        },
      });
      items.push(SEPARATOR);
    }
    const layers = folder.folderType ? FOLDER_LAYERS[folder.folderType] : undefined;
    // find root folder type by walking up for subfolders
    let top: Folder = folder;
    while (top.parentId !== null) top = model.folders[top.parentId];
    const topLayers = top.folderType ? FOLDER_LAYERS[top.folderType] : layers;
    if (topLayers) {
      const definitions = topLayers.flatMap((layer) =>
        ELEMENT_TYPES.filter((definition) => definition.layer === layer),
      );
      const specializationItems = Object.values(model.profiles)
        .flatMap((profile) => {
          const definition = definitions.find((candidate) => candidate.type === profile.conceptType);
          if (!definition) return [];
          return [{
            label: `${profile.name} (${definition.label})`,
            icon: <ElementIcon type={definition.type} />,
            onClick: () => {
              let id = '';
              runBatch('Create Specialized Element', () => {
                id = addElement(definition.type, profile.name, folder.id, modelStore);
                setConceptProfiles(id, [profile.id], modelStore);
              }, modelStore);
              setSelection('tree', [id], modelStore);
              setRenamingId(id);
            },
          } as MenuItem];
        });
      items.push({
        label: 'New Element',
        children: [
          ...specializationItems,
          ...(specializationItems.length > 0 ? [SEPARATOR] : []),
          ...definitions.map((d) => ({
            label: d.label,
            icon: <ElementIcon type={d.type} />,
            onClick: () => {
              const id = addElement(d.type, undefined, folder.id, modelStore);
              setSelection('tree', [id], modelStore);
              setRenamingId(id);
            },
          })),
        ],
      });
    }
    if (top.folderType === 'diagrams') {
      items.push({
        label: 'New ArchiMate View',
        onClick: () => {
          const id = addView('New View', folder.id, modelStore);
          setSelection('tree', [id], modelStore);
          openView(id, modelStore);
          setRenamingId(id);
        },
      });
      items.push({
        label: 'New C4 View',
        children: C4_VIEW_TYPES.map((viewType) => ({
          label: C4_VIEW_TYPE_LABELS[viewType],
          onClick: () => {
            const id = createC4TemplateView(viewType, folder.id, modelStore);
            if (!modelStore.getState().model?.views[id]) return;
            setSelection('tree', [id], modelStore);
            openView(id, modelStore);
          },
        })),
      });
    }
    items.push({
      label: 'New Folder',
      onClick: () => {
        const id = addFolder(folder.id, 'New Folder', modelStore);
        setRenamingId(id);
      },
    });
    if (folder.parentId !== null) {
      items.push(SEPARATOR);
      items.push({ label: 'Rename', onClick: () => setRenamingId(folder.id) });
      items.push({
        label: 'Delete',
        danger: true,
        onClick: () => deleteItems([folder.id], modelStore),
      });
    }
    return items;
  };

  const renderProjectedRow = (row: ProjectedTreeRow) => {
    const common = {
      id: row.id,
      depth: row.level - 1,
      label: row.kind === 'model' ? `${row.label}${dirty ? ' *' : ''}` : row.label,
      level: row.level,
      posInSet: row.posInSet,
      setSize: row.setSize,
      expanded: row.expandable ? row.expanded : undefined,
      tabIndex: activeFocusedId === row.id ? 0 : -1,
      onFocus: () => setFocusedId(row.id),
      renaming: renamingId === row.id,
      onRenamed: finishRename(row.id),
    };
    if (row.kind === 'model') {
      return (
        <TreeRow
          {...common}
          icon={<span className="tree-model-icon">{row.expanded ? '▾' : '▸'} ◈</span>}
          onDoubleClick={() => toggle(row.id)}
          onContextMenu={(x, y) => showTreeContextMenu(x, y, rootMenu(), row.id)}
        />
      );
    }
    if (row.kind === 'folder') {
      const folder = model.folders[row.id];
      return (
        <TreeRow
          {...common}
          icon={<span className="tree-chevron">{row.expanded ? '▾' : '▸'}</span>}
          onActivate={() => toggle(row.id)}
          onContextMenu={(x, y) => showTreeContextMenu(x, y, folderMenu(folder), row.id)}
          draggable={folder.parentId !== null}
          onDropIds={(ids) => moveItemsToFolder(ids, row.id, modelStore)}
        />
      );
    }
    if (row.kind === 'element') {
      return (
        <TreeRow
          {...common}
          icon={<ElementIcon type={model.elements[row.id].type} />}
          onContextMenu={(x, y) => showTreeContextMenu(x, y, conceptMenu(row.id), row.id)}
          draggable
        />
      );
    }
    if (row.kind === 'relationship') {
      return (
        <TreeRow
          {...common}
          icon={<span className="tree-rel-icon">→</span>}
          dim
          onContextMenu={(x, y) => showTreeContextMenu(x, y, conceptMenu(row.id), row.id)}
          draggable
        />
      );
    }
    return (
      <TreeRow
        {...common}
        icon={<span className="tree-view-icon">▦</span>}
        onDoubleClick={() => openView(row.id, modelStore)}
        onContextMenu={(x, y) => showTreeContextMenu(
          x,
          y,
          [
            { label: 'Open View', onClick: () => openView(row.id, modelStore) },
            SEPARATOR,
            ...conceptMenu(row.id),
          ],
          row.id,
        )}
        draggable
      />
    );
  };

  const rootMenu = (): MenuItem[] => {
    const items: MenuItem[] = [{ label: 'Rename', onClick: () => setRenamingId(model.info.id) }];
    if (!embedded) return items;
    const workspace = useWorkspaceStore.getState();
    return [
      { label: 'Save', onClick: () => void saveModelSession(collapsePrefix) },
      { label: 'Save As…', onClick: () => void saveModelSession(collapsePrefix, true) },
      {
        label: 'Paste (Ctrl+V)',
        disabled: !canPasteTo('tree') || readOnly,
        onClick: () => {
          const ids = pasteTreeItems(modelStore, collapsePrefix);
          if (ids.length) setSelection('tree', ids, modelStore);
        },
      },
      SEPARATOR,
      { label: 'Close Model', onClick: () => void closeModelSession(collapsePrefix) },
      {
        label: 'Close Other Models',
        disabled: workspace.order.length < 2,
        onClick: () =>
          void closeModelSessions(workspace.order.filter((id) => id !== collapsePrefix)),
      },
      {
        label: 'Close All Models',
        onClick: () => void closeModelSessions([...workspace.order]),
      },
    ];
  };
  return (
    <div
      ref={treeRef}
      className={`${embedded ? 'model-tree-session' : 'model-tree-session legacy-model-tree-session'}${virtualized ? ' virtualized' : ''}`}
      data-model-session-id={embedded ? collapsePrefix : undefined}
      role="tree"
      aria-label={`${model.info.name} model tree`}
      tabIndex={-1}
      onScroll={virtualized ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}
      onPointerDownCapture={() => {
        if (embedded) activateModelSession(collapsePrefix);
      }}
      onFocusCapture={() => {
        if (embedded) activateModelSession(collapsePrefix);
      }}
      onClickCapture={() => {
        if (embedded) activateModelSession(collapsePrefix);
      }}
      onKeyDown={(e) => {
        if (matchesShortcut('tree-filter', e)) {
          e.preventDefault();
          treeRef.current
            ?.closest('.model-tree, .workspace-model-tree')
            ?.querySelector<HTMLInputElement>('.tree-filter-input')
            ?.focus();
          return;
        }
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
        const sel = modelStore.getState().selection;
        const currentIndex = Math.max(0, rows.findIndex((row) => row.id === activeFocusedId));
        const selectOnMove = !(e.ctrlKey || e.metaKey);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          focusRowAt(e.key === 'ArrowDown'
            ? currentIndex + 1
            : e.key === 'ArrowUp'
              ? currentIndex - 1
              : e.key === 'Home'
                ? 0
                : rows.length - 1, selectOnMove);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const row = rows[currentIndex];
          if (row?.expandable && !row.expanded) toggle(row.id);
          else if (rows[currentIndex + 1]?.parentId === row?.id) {
            focusRowAt(currentIndex + 1, selectOnMove);
          }
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const row = rows[currentIndex];
          if (row?.expandable && row.expanded) toggle(row.id);
          else if (row?.parentId) {
            focusRowAt(
              rows.findIndex((candidate) => candidate.id === row.parentId),
              selectOnMove,
            );
          }
          return;
        }
        if (e.key === ' ') {
          const row = rows[currentIndex];
          if (!row) return;
          e.preventDefault();
          const currentIds = sel.source === 'tree' ? sel.ids : [];
          setSelection(
            'tree',
            currentIds.includes(row.id)
              ? currentIds.filter((id) => id !== row.id)
              : [...currentIds, row.id],
            modelStore,
          );
          return;
        }
        if (e.key === 'Enter') {
          const row = rows[currentIndex];
          if (row?.kind === 'view') {
            e.preventDefault();
            openView(row.id, modelStore);
          }
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && sel.source === 'tree') {
          e.preventDefault();
          copyTreeItems(modelStore, collapsePrefix, sel.ids);
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && embedded) {
          e.preventDefault();
          const ids = pasteTreeItems(modelStore, collapsePrefix);
          if (ids.length) setSelection('tree', ids, modelStore);
          return;
        }
        if (e.key === 'Delete' && sel.source === 'tree' && sel.ids.length > 0) {
          e.preventDefault();
          deleteItems(sel.ids, modelStore);
        }
        if (matchesShortcut('rename', e) && sel.source === 'tree' && sel.ids.length === 1) {
          setRenamingId(sel.ids[0]);
        }
      }}
    >
      <div
        className="tree-row-window"
        role="none"
        style={{ height: virtualized ? rowWindow.totalHeight : undefined }}
      >
        {(virtualized
          ? getTreeRowsForWindow(rows, rowWindow, activeFocusedId)
          : rows.map((row, index) => ({ row, index }))).map(({ row, index }) => (
          <div
            key={row.id}
            role="none"
            className="tree-row-slot"
            style={virtualized
              ? { position: 'absolute', top: index * TREE_ROW_HEIGHT }
              : undefined}
          >
            {renderProjectedRow(row)}
          </div>
        ))}
      </div>
    </div>
  );
}
