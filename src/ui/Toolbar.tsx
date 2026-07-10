import { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { autoListedExtensionCommands } from '../extensions/command-visibility';
import { extensionRegistry } from '../extensions/registry';
import {
  C4_VIEW_TYPE_LABELS,
  C4_VIEW_TYPES,
  c4ViewType,
  validateC4View,
} from '../model/c4';
import { serializeArchimate } from '../model/io/archimate-xml';
import {
  ELEMENTS_FILENAME,
  PROPERTIES_FILENAME,
  RELATIONS_FILENAME,
  type CsvImportFiles,
} from '../model/io/csv';
import { serializeExchange } from '../model/io/exchange-xml';
import {
  createC4TemplateView,
  importCsv,
  insertOrUpdateC4Legend,
} from '../model/ops';
import { openView, redo, setSelection, undo, useStore } from '../model/store';
import { getActiveModelSession } from '../model/workspace';
import {
  openModelFromDisk,
  sanitizeFileName,
  saveBlobToDisk,
  saveModelToDisk,
} from '../persistence/files';
import { getStoredGitHubToken, setStoredGitHubToken } from '../persistence/github';
import {
  INLINE_SHARE_THRESHOLD,
  encodeModelToInlineShare,
  getRememberedGistId,
  gistShareHref,
  saveShareGistForModel,
} from '../persistence/share';
import { copyViewPngToClipboard } from '../canvas/export/view-image';
import { showAlertDialog, showConfirmDialog, showPromptDialog } from './AppDialog';
import { showContextMenu, SEPARATOR, type MenuItem } from './ContextMenu';
import { ExportCsvDialog } from './ExportCsvDialog';
import { ExportImageDialog } from './ExportImageDialog';
import { PresentationMode } from './PresentationMode';
import { layoutBus } from './layout-bus';
import { createNewModelSession } from './model-session-actions';

/** Published documentation site (GitHub Pages). */
const DOCS_URL = 'https://thomasrohde.github.io/archi-online/';

const SHORTCUTS: [string, string][] = [
  ['Ctrl+S / Ctrl+O', 'Save / open model'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
  ['Ctrl+C / Ctrl+V', 'Copy / paste diagram objects or tree items (including across models)'],
  ['Ctrl+D', 'Duplicate (model tree or view selection)'],
  ['Ctrl+A', 'Select all on view'],
  ['Delete', 'Delete from view (canvas) or model (tree)'],
  ['F2 or double-click', 'Rename'],
  ['Arrows (+Shift)', 'Nudge selection by 1px (grid step)'],
  ['Ctrl+wheel / Ctrl+= / Ctrl+-', 'Zoom canvas (per view)'],
  ['Ctrl+0 / Home', 'Zoom 100% / fit diagram to window'],
  ['Middle-drag or Space+drag', 'Pan canvas'],
  ['Wheel / Shift+wheel', 'Scroll canvas'],
  ['Alt while dragging', 'Disable grid snap'],
  ['Escape', 'Cancel tool / clear selection'],
  ['Ctrl+Enter (editor)', 'Run script'],
  ['Double-click bendpoint', 'Remove bendpoint'],
  ['Ctrl+F (model tree)', 'Filter the model tree'],
  ['←/→, PgUp/PgDn (presentation)', 'Previous / next view'],
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function shareDecisionForInline(encodedLength: number): 'inline' | 'gist' {
  return encodedLength <= INLINE_SHARE_THRESHOLD ? 'inline' : 'gist';
}

export async function newModel(): Promise<void> {
  createNewModelSession();
}

export async function openModel(): Promise<void> {
  try {
    await openModelFromDisk();
  } catch (error) {
    await showAlertDialog({
      title: 'Could not open model',
      message: errorMessage(error),
      intent: 'error',
    });
  }
}

export async function saveModel(saveAs = false): Promise<void> {
  try {
    const session = getActiveModelSession();
    if (session) await saveModelToDisk(session.id, saveAs);
  } catch (error) {
    await showAlertDialog({
      title: 'Could not save model',
      message: errorMessage(error),
      intent: 'error',
    });
  }
}

async function copyShareLink(href: string): Promise<void> {
  await navigator.clipboard.writeText(href);
  await showAlertDialog({
    title: 'Share URL copied',
    message: 'The share URL has been copied to the clipboard.',
    details: 'Anyone with this link can read the model data contained in the link or referenced gist.',
  });
}

export async function shareModel(): Promise<void> {
  const { activeViewId, model } = useStore.getState();
  if (!model) return;
  const initialViewId = activeViewId && model.views[activeViewId] ? activeViewId : undefined;

  const inline = encodeModelToInlineShare(model, undefined, initialViewId);
  if (shareDecisionForInline(inline.encodedLength) === 'inline') {
    await copyShareLink(inline.href);
    return;
  }

  const useGist = await showConfirmDialog({
    title: 'Use GitHub Gist?',
    message: 'This model is too large for a reliable URL-only share link.',
    details:
      'A gist stores the .archimate file in GitHub. Secret gists are unlisted, but anyone with the link can read them.',
    confirmLabel: 'Use Gist',
    cancelLabel: 'Cancel',
  });
  if (!useGist) return;

  let token = await getStoredGitHubToken();
  if (!token) {
    const entered = await showPromptDialog({
      title: 'GitHub token',
      message: 'Enter a GitHub personal access token with gist scope.',
      placeholder: 'ghp_...',
      confirmLabel: 'Save token',
      cancelLabel: 'Cancel',
    });
    if (!entered) return;
    await setStoredGitHubToken(entered);
    token = entered.trim();
  }

  const rememberedGistId = await getRememberedGistId(model.info.id);
  const makePublic = rememberedGistId
    ? false
    : await showConfirmDialog({
        title: 'Gist visibility',
        message: 'Secret is recommended. Choose Public only when the model may be indexed and listed publicly.',
        details: 'This choice applies when creating a gist. Re-sharing an existing gist keeps its current visibility.',
        confirmLabel: 'Public',
        cancelLabel: 'Secret',
      });

  const xml = serializeArchimate(model);
  const fileName = `${model.info.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'model'}.archimate`;
  const saved = await saveShareGistForModel({
    token,
    modelId: model.info.id,
    xml,
    fileName,
    public: makePublic,
  });
  await copyShareLink(gistShareHref(saved.id, undefined, initialViewId));
}

async function runShareModel(): Promise<void> {
  try {
    await shareModel();
  } catch (error) {
    await showAlertDialog({
      title: 'Could not share model',
      message: errorMessage(error),
      intent: 'error',
    });
  }
}

async function exportModelToExchange(): Promise<void> {
  const s = useStore.getState();
  if (!s.model) return;
  try {
    const xml = serializeExchange(s.model);
    await saveBlobToDisk(
      new Blob([xml], { type: 'application/xml' }),
      `${sanitizeFileName(s.model.info.name)}.xml`,
      { description: 'ArchiMate Open Exchange', accept: { 'application/xml': ['.xml'] } },
    );
  } catch (error) {
    await showAlertDialog({
      title: 'Could not export model',
      message: errorMessage(error),
      intent: 'error',
    });
  }
}

/** Pick 1–3 Archi CSV files (elements/relations/properties, matched by file
 * name) and import them into the current model as one undo step. */
function importCsvFromDisk(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  input.multiple = true;
  input.onchange = async () => {
    const files = [...(input.files ?? [])];
    if (files.length === 0) return;
    const byRole: CsvImportFiles = {};
    for (const file of files) {
      const base = file.name.replace(/\.[^.]*$/, '');
      if (base.endsWith(ELEMENTS_FILENAME)) byRole.elements = await file.text();
      else if (base.endsWith(RELATIONS_FILENAME)) byRole.relations = await file.text();
      else if (base.endsWith(PROPERTIES_FILENAME)) byRole.properties = await file.text();
    }
    try {
      if (!byRole.elements && !byRole.relations && !byRole.properties) {
        throw new Error(
          'No matching files — names must end with "elements", "relations", or "properties" (e.g. elements.csv).',
        );
      }
      importCsv(byRole);
    } catch (error) {
      await showAlertDialog({
        title: 'Could not import CSV',
        message: errorMessage(error),
        intent: 'error',
      });
    }
  };
  input.click();
}

async function copyActiveViewImage(): Promise<void> {
  const s = useStore.getState();
  if (!s.model || !s.activeViewId) return;
  try {
    await copyViewPngToClipboard(s.model, s.activeViewId);
  } catch (error) {
    await showAlertDialog({
      title: 'Could not copy image',
      message: errorMessage(error),
      intent: 'error',
    });
  }
}

async function validateActiveC4View(): Promise<void> {
  const s = useStore.getState();
  if (!s.model || !s.activeViewId) return;
  const issues = validateC4View(s.model, s.activeViewId);
  await showAlertDialog({
    title: issues.length === 0 ? 'C4 validation passed' : 'C4 validation warnings',
    message:
      issues.length === 0
        ? 'No C4 issues were found in the active view.'
        : `${issues.length} issue${issues.length === 1 ? '' : 's'} found in the active C4 view.`,
    details: issues.map((issue) => issue.message).join('\n'),
  });
}

function createAndOpenC4View(viewType: (typeof C4_VIEW_TYPES)[number]): void {
  const id = createC4TemplateView(viewType);
  setSelection('tree', [id]);
  openView(id);
}

/* Toolbar glyphs — transcribed 1:1 from the App Chrome design mockup. */
type IconName =
  | 'new'
  | 'open'
  | 'save'
  | 'saveas'
  | 'share'
  | 'undo'
  | 'redo'
  | 'export'
  | 'present'
  | 'c4'
  | 'ext'
  | 'views'
  | 'docs'
  | 'help';

const TB_ICONS: Record<IconName, React.ReactNode> = {
  new: <path d="M6 3h7l5 5v13H6z M13 3v5h5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  open: <path d="M3 6h6l2 2h10v11H3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  save: <path d="M4 4h11l5 5v11H4z M9 4v5h7 M8 20v-6h8v6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  saveas: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M4 4h10l4 4v6.5 M4 4v16h7 M9 4v5h6" />
      <path d="M17.5 16.5v6 M14.5 19.5h6" strokeLinecap="round" />
    </g>
  ),
  share: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="17" cy="5.5" r="2.4" />
      <circle cx="17" cy="18.5" r="2.4" />
      <path d="M8.2 10.8 14.8 6.7 M8.2 13.2 14.8 17.3" />
    </g>
  ),
  undo: <path d="M9 7 5 11l4 4 M5 11h9a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />,
  redo: <path d="M15 7l4 4-4 4 M19 11h-9a5 5 0 0 0 0 10h3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />,
  export: <path d="M12 15V4 M8 8l4-4 4 4 M4 15v5h16v-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />,
  present: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M12 16v3 M8.5 20h7" />
      <path d="M10.5 8l4 2-4 2z" fill="currentColor" stroke="none" />
    </g>
  ),
  c4: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="3.5" width="7" height="7" />
      <rect x="13.5" y="3.5" width="7" height="7" />
      <rect x="3.5" y="13.5" width="7" height="7" />
      <rect x="13.5" y="13.5" width="7" height="7" />
    </g>
  ),
  ext: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <rect x="3.5" y="4" width="7.5" height="7.5" rx="1" />
      <rect x="13" y="12.5" width="7.5" height="7.5" rx="1" />
      <path d="M11 7.5h3.5a1.5 1.5 0 0 1 1.5 1.5v3.5" />
    </g>
  ),
  views: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M10 4v16 M3 9h7" />
    </g>
  ),
  docs: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 6.5C9.8 5 6.4 5 4 5.6v12.9c2.4-.6 5.8-.6 8 .9 2.2-1.5 5.6-1.5 8-.9V5.6C17.6 5 14.2 5 12 6.5z" />
      <path d="M12 6.5v12.8" />
    </g>
  ),
  help: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.4 9.4a2.6 2.6 0 1 1 3.6 2.4c-1 .5-1 1.1-1 2.1 M12 17h.01" />
    </g>
  ),
};

function TbIcon({ name }: { name: IconName }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      {TB_ICONS[name]}
    </svg>
  );
}

/** Props for a fast custom tooltip on a toolbar icon button (see styles.css).
 * `align: 'end'` right-anchors the tooltip for buttons near the right edge. */
function tip(text: string, align?: 'end') {
  return {
    'aria-label': text,
    'data-tip': text,
    ...(align ? { 'data-tip-align': align } : {}),
  };
}

export function Toolbar() {
  const [showHelp, setShowHelp] = useState(false);
  const [showExportImage, setShowExportImage] = useState(false);
  const [showExportCsv, setShowExportCsv] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const extensionSnapshot = useSyncExternalStore(
    (listener) => extensionRegistry.subscribe(listener),
    () => extensionRegistry.getSnapshot(),
    () => extensionRegistry.getSnapshot(),
  );
  const canUndo = useStore((s) => s.undoStack.length > 0);
  const canRedo = useStore((s) => s.redoStack.length > 0);
  const undoLabel = useStore((s) => s.undoStack[s.undoStack.length - 1]?.label);
  const redoLabel = useStore((s) => s.redoStack[s.redoStack.length - 1]?.label);
  const hasModel = useStore((s) => s.model !== null);
  const readOnly = useStore((s) => s.readOnly);
  const hasActiveView = useStore((s) => s.activeViewId !== null);
  const activeC4ViewType = useStore((s) => {
    if (!s.model || !s.activeViewId) return undefined;
    return c4ViewType(s.model.views[s.activeViewId]);
  });
  const exportMenuItems: MenuItem[] = [
    {
      label: 'View as image…',
      disabled: !hasActiveView,
      onClick: () => setShowExportImage(true),
    },
    {
      label: 'Copy view as image',
      disabled: !hasActiveView,
      onClick: () => void copyActiveViewImage(),
    },
    SEPARATOR,
    {
      label: 'Model to Open Exchange (.xml)…',
      onClick: () => void exportModelToExchange(),
    },
    {
      label: 'Model to CSV…',
      onClick: () => setShowExportCsv(true),
    },
    SEPARATOR,
    {
      label: 'Import CSV into model…',
      disabled: readOnly,
      onClick: () => importCsvFromDisk(),
    },
  ];
  const extensionMenuItems: MenuItem[] = extensionSnapshot.menus['extensions.menu'].map((item) => ({
    label: item.label,
    danger: item.danger,
    onClick: () => void extensionRegistry.runCommand(item.command),
  }));
  for (const command of autoListedExtensionCommands(extensionSnapshot)) {
    extensionMenuItems.push({
      label: command.title,
      onClick: () => void extensionRegistry.runCommand(command.id),
    });
  }
  const c4MenuItems: MenuItem[] = [
    {
      label: 'New C4 View',
      disabled: readOnly,
      children: C4_VIEW_TYPES.map((viewType) => ({
        label: C4_VIEW_TYPE_LABELS[viewType],
        onClick: () => createAndOpenC4View(viewType),
      })),
    },
    SEPARATOR,
    {
      label: 'Insert or Update Legend',
      disabled: readOnly || !activeC4ViewType,
      onClick: () => {
        const activeViewId = useStore.getState().activeViewId;
        if (activeViewId) insertOrUpdateC4Legend(activeViewId);
      },
    },
    {
      label: 'Validate Active C4 View',
      disabled: !activeC4ViewType,
      onClick: () => void validateActiveC4View(),
    },
  ];

  return (
    <div className="toolbar">
      <button className="tb-icon" {...tip('New model (Ctrl+Alt+N)')} onClick={() => void newModel()}>
        <TbIcon name="new" />
      </button>
      <button className="tb-icon" {...tip('Open .archimate file (Ctrl+O)')} onClick={() => void openModel()}>
        <TbIcon name="open" />
      </button>
      <button
        className="tb-icon"
        {...tip('Save model (Ctrl+S)')}
        disabled={!hasModel}
        onClick={() => saveModel(false)}
      >
        <TbIcon name="save" />
      </button>
      <button
        className="tb-icon"
        {...tip('Save model as…')}
        disabled={!hasModel}
        onClick={() => saveModel(true)}
      >
        <TbIcon name="saveas" />
      </button>
      <button
        className="tb-icon"
        {...tip('Share model')}
        disabled={!hasModel || readOnly}
        onClick={() => void runShareModel()}
      >
        <TbIcon name="share" />
      </button>
      <div className="toolbar-sep" />
      <button
        className="tb-icon"
        {...tip(canUndo ? `Undo ${undoLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)')}
        disabled={!canUndo}
        onClick={() => undo()}
      >
        <TbIcon name="undo" />
      </button>
      <button
        className="tb-icon"
        {...tip(canRedo ? `Redo ${redoLabel} (Ctrl+Y)` : 'Redo (Ctrl+Y)')}
        disabled={!canRedo}
        onClick={() => redo()}
      >
        <TbIcon name="redo" />
      </button>
      <div className="toolbar-sep" />
      <button
        className="tb-icon"
        {...tip('Import or export images, Open Exchange, and CSV')}
        disabled={!hasModel}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          showContextMenu(rect.left, rect.bottom + 4, exportMenuItems);
        }}
      >
        <TbIcon name="export" />
      </button>
      <button
        className="tb-icon"
        {...tip('Presentation mode — full-screen view walkthrough')}
        disabled={!hasActiveView}
        onClick={() => setPresenting(true)}
      >
        <TbIcon name="present" />
      </button>
      <button
        className="tb-icon"
        {...tip('Create and validate C4 views')}
        disabled={!hasModel}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          showContextMenu(rect.left, rect.bottom + 4, c4MenuItems);
        }}
      >
        <TbIcon name="c4" />
      </button>
      <div className="toolbar-spacer" />
      {extensionSnapshot.toolbarButtons.map((button) => (
        <button
          key={button.id}
          className="tb-icon tb-icon-text"
          title={button.label}
          onClick={() => void extensionRegistry.runCommand(button.command)}
        >
          {button.label}
        </button>
      ))}
      <button
        className="tb-icon"
        {...tip('Run extension commands', 'end')}
        disabled={extensionMenuItems.length === 0}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          showContextMenu(rect.left, rect.bottom + 4, extensionMenuItems);
        }}
      >
        <TbIcon name="ext" />
      </button>
      <button
        className="tb-icon"
        {...tip('Show or reopen panels', 'end')}
        onClick={(e) => {
          const bus = layoutBus();
          if (!bus) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const items: MenuItem[] = bus.getPanels().map((p) => ({
            label: p.title,
            icon: p.open ? <span className="menu-check">✓</span> : undefined,
            onClick: () => bus.showPanel(p.id),
          }));
          items.push(SEPARATOR);
          items.push({ label: 'Reset Layout', onClick: () => bus.reset() });
          showContextMenu(rect.left, rect.bottom + 4, items);
        }}
      >
        <TbIcon name="views" />
      </button>
      <button
        className="tb-icon"
        {...tip('Documentation', 'end')}
        onClick={() => window.open(DOCS_URL, '_blank', 'noopener,noreferrer')}
      >
        <TbIcon name="docs" />
      </button>
      <button className="tb-icon" {...tip('Keyboard shortcuts', 'end')} onClick={() => setShowHelp(true)}>
        <TbIcon name="help" />
      </button>
      {showExportImage && <ExportImageDialog onClose={() => setShowExportImage(false)} />}
      {showExportCsv && <ExportCsvDialog onClose={() => setShowExportCsv(false)} />}
      {presenting && <PresentationMode onClose={() => setPresenting(false)} />}
      {showHelp &&
        createPortal(
          <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">Keyboard shortcuts</div>
              <table className="shortcut-table">
                <tbody>
                  {SHORTCUTS.map(([keys, desc]) => (
                    <tr key={keys}>
                      <td>
                        <code>{keys}</code>
                      </td>
                      <td>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="tb-btn small" onClick={() => setShowHelp(false)}>
                Close
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
