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
  createEmptyModel,
  importCsv,
  insertOrUpdateC4Legend,
} from '../model/ops';
import { openView, redo, replaceModel, setSelection, undo, useStore } from '../model/store';
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

const SHORTCUTS: [string, string][] = [
  ['Ctrl+S / Ctrl+O', 'Save / open model'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
  ['Ctrl+C / Ctrl+V', 'Copy / paste diagram objects'],
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

export async function confirmDiscardChanges(): Promise<boolean> {
  if (!useStore.getState().dirty) return true;
  return showConfirmDialog({
    title: 'Discard unsaved changes?',
    message: 'The current model has changes that have not been saved.',
    confirmLabel: 'Discard',
    cancelLabel: 'Keep editing',
    intent: 'danger',
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function shareDecisionForInline(encodedLength: number): 'inline' | 'gist' {
  return encodedLength <= INLINE_SHARE_THRESHOLD ? 'inline' : 'gist';
}

export async function newModel(): Promise<void> {
  if (!(await confirmDiscardChanges())) return;
  replaceModel(createEmptyModel('New ArchiMate Model'), null, false);
}

export async function openModel(): Promise<void> {
  if (!(await confirmDiscardChanges())) return;
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
    await saveModelToDisk(saveAs);
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
  const dirty = useStore((s) => s.dirty);
  const fileName = useStore((s) => s.fileName);
  const hasModel = useStore((s) => s.model !== null);
  const modelName = useStore((s) => s.model?.info.name);
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
      <span className="app-title">Archi Online</span>
      <div className="toolbar-sep" />
      <button className="tb-btn" title="New model (Ctrl+Alt+N)" onClick={() => void newModel()}>
        New
      </button>
      <button className="tb-btn" title="Open .archimate file (Ctrl+O)" onClick={() => void openModel()}>
        Open…
      </button>
      <button
        className="tb-btn"
        title="Save model (Ctrl+S)"
        disabled={!hasModel}
        onClick={() => saveModel(false)}
      >
        Save
      </button>
      <button
        className="tb-btn"
        title="Save model as…"
        disabled={!hasModel}
        onClick={() => saveModel(true)}
      >
        Save As…
      </button>
      <button
        className="tb-btn"
        title="Share model"
        disabled={!hasModel || readOnly}
        onClick={() => void runShareModel()}
      >
        Share…
      </button>
      <button
        className="tb-btn"
        title="Import or export images, Open Exchange, and CSV"
        disabled={!hasModel}
        onClick={(e) => {
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          showContextMenu(rect.left, rect.bottom + 4, exportMenuItems);
        }}
      >
        Import/Export ▾
      </button>
      <button
        className="tb-btn"
        title="Presentation mode — full-screen view walkthrough"
        disabled={!hasActiveView}
        onClick={() => setPresenting(true)}
      >
        Present
      </button>
      <button
        className="tb-btn"
        title="Create and validate C4 views"
        disabled={!hasModel}
        onClick={(e) => {
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          showContextMenu(rect.left, rect.bottom + 4, c4MenuItems);
        }}
      >
        C4 ▾
      </button>
      <div className="toolbar-sep" />
      <button
        className="tb-btn"
        title={canUndo ? `Undo ${undoLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
        disabled={!canUndo}
        onClick={undo}
      >
        Undo
      </button>
      <button
        className="tb-btn"
        title={canRedo ? `Redo ${redoLabel} (Ctrl+Y)` : 'Redo (Ctrl+Y)'}
        disabled={!canRedo}
        onClick={redo}
      >
        Redo
      </button>
      <div className="toolbar-spacer" />
      <span className="file-status">
        {hasModel ? `${modelName} — ${fileName ?? 'unsaved'}${dirty ? ' •' : ''}` : ''}
      </span>
      {extensionSnapshot.toolbarButtons.map((button) => (
        <button
          key={button.id}
          className="tb-btn"
          title={button.label}
          onClick={() => void extensionRegistry.runCommand(button.command)}
        >
          {button.label}
        </button>
      ))}
      <button
        className="tb-btn"
        title="Run extension commands"
        disabled={extensionMenuItems.length === 0}
        onClick={(e) => {
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          showContextMenu(rect.left, rect.bottom + 4, extensionMenuItems);
        }}
      >
        Extensions ▾
      </button>
      <button
        className="tb-btn"
        title="Show or reopen panels"
        onClick={(e) => {
          const bus = layoutBus();
          if (!bus) return;
          const rect = (e.target as HTMLElement).getBoundingClientRect();
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
        Views ▾
      </button>
      <button className="tb-btn" title="Keyboard shortcuts" onClick={() => setShowHelp(true)}>
        ?
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
