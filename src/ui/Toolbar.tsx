import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowUpDown,
  Blocks,
  BookOpen,
  CircleHelp,
  FilePlus2,
  FolderOpen,
  Images,
  ListChecks,
  LayoutTemplate,
  PanelTopOpen,
  PanelsTopLeft,
  Presentation,
  Redo2,
  ReplaceAll,
  Save,
  SaveAll,
  Share2,
  Tags,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { autoListedExtensionCommands } from '../extensions/command-visibility';
import { extensionRegistry } from '../extensions/registry';
import {
  C4_VIEW_TYPE_LABELS,
  C4_VIEW_TYPES,
  c4ViewType,
  validateC4View,
} from '../model/c4';
import { serializeArchimateDocument } from '../model/io/archimate-xml';
import {
  ELEMENTS_FILENAME,
  PROPERTIES_FILENAME,
  RELATIONS_FILENAME,
  type CsvImportFiles,
} from '../model/io/csv';
import {
  createC4TemplateView,
  importCsv,
  insertOrUpdateC4Legend,
} from '../model/ops';
import { openView, redo, setActiveTool, setSelection, undo } from '../model/store';
import { useStore } from './store-hooks';
import { getActiveModelSession } from '../model/workspace';
import {
  openModelFromDisk,
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
import { ExportExchangeDialog } from './ExportExchangeDialog';
import { ExportImageDialog } from './ExportImageDialog';
import { PresentationMode } from './PresentationMode';
import { layoutBus } from './layout-bus';
import { createNewModelSession } from './model-session-actions';
import { SpecializationsManager } from './SpecializationsManager';
import { ImageGallery } from './ImageGallery';
import {
  captureFindReplaceSession,
  type FindReplaceSessionCapture,
} from '../model/find-replace';
import { FindReplaceDialog } from './FindReplaceDialog';
import {
  capturePropertyManagerSession,
  type PropertyManagerSessionCapture,
} from '../model/property-manager';
import { PropertiesManagerDialog } from './PropertiesManagerDialog';
import { ModelMergeDialog } from './ModelMergeDialog';
import { TemplateGallery } from './TemplateGallery';
import { StaticReportExportDialog } from './StaticReportExportDialog';
import { ModalSurface } from './ModalSurface';
import { SHORTCUTS } from './shortcuts';

/** Published documentation site (GitHub Pages). */
const DOCS_URL = 'https://thomasrohde.github.io/archi-online/';

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

  const inline = await encodeModelToInlineShare(model, undefined, initialViewId);
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

  const documentBytes = await serializeArchimateDocument(model);
  const fileName = `${model.info.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'model'}.archimate`;
  const saved = await saveShareGistForModel({
    token,
    modelId: model.info.id,
    documentBytes,
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
      const report = importCsv(byRole);
      await showAlertDialog({
        title: 'CSV import complete',
        message: `Created ${report.created}, updated ${report.updated}, unchanged ${report.unchanged}, profiles ${report.profiles}, properties ${report.properties}, warnings ${report.warnings}, errors ${report.errors}.`,
      });
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
  if (!useStore.getState().model?.views[id]) return;
  setSelection('tree', [id]);
  openView(id);
}

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
  | 'profiles'
  | 'images'
  | 'replace'
  | 'properties'
  | 'templates'
  | 'ext'
  | 'views'
  | 'docs'
  | 'help';

const TB_ICONS: Record<IconName, LucideIcon> = {
  new: FilePlus2,
  open: FolderOpen,
  save: Save,
  saveas: SaveAll,
  share: Share2,
  undo: Undo2,
  redo: Redo2,
  export: ArrowUpDown,
  present: Presentation,
  c4: PanelsTopLeft,
  profiles: Tags,
  images: Images,
  replace: ReplaceAll,
  properties: ListChecks,
  templates: LayoutTemplate,
  ext: Blocks,
  views: PanelTopOpen,
  docs: BookOpen,
  help: CircleHelp,
};

function TbIcon({ name }: { name: IconName }) {
  const Icon = TB_ICONS[name];
  return <Icon size={18} strokeWidth={1.6} aria-hidden="true" />;
}

type ToolbarTip = {
  icon: IconName;
  label: string;
  description: string;
  shortcut?: string;
  accessibleName?: string;
};

const DEFAULT_TOOLBAR_TIP: ToolbarTip = {
  icon: 'help',
  label: 'Toolbar help',
  description: 'Hover or focus a command to see what it does.',
};

function toolbarMenuAnchor(button: HTMLButtonElement): { x: number; y: number } {
  const buttonRect = button.getBoundingClientRect();
  const toolbarRect = button.closest('.toolbar-shell')?.getBoundingClientRect();
  return { x: buttonRect.left, y: (toolbarRect?.bottom ?? buttonRect.bottom) + 4 };
}

export function Toolbar() {
  const [activeTip, setActiveTip] = useState<ToolbarTip | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showExportImage, setShowExportImage] = useState(false);
  const [showExportCsv, setShowExportCsv] = useState(false);
  const [showExportExchange, setShowExportExchange] = useState(false);
  const [showStaticReport, setShowStaticReport] = useState(false);
  const [showModelMerge, setShowModelMerge] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [showSpecializations, setShowSpecializations] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [findReplaceCapture, setFindReplaceCapture] =
    useState<FindReplaceSessionCapture | null>(null);
  const [propertiesManagerCapture, setPropertiesManagerCapture] =
    useState<PropertyManagerSessionCapture | null>(null);
  const clearTipTimer = () => {
    if (tipTimer.current !== null) {
      clearTimeout(tipTimer.current);
      tipTimer.current = null;
    }
  };
  const clearTip = () => {
    clearTipTimer();
    setActiveTip(null);
  };
  const tip = (value: ToolbarTip) => ({
    'aria-label': value.accessibleName
      ?? (value.shortcut ? `${value.label} (${value.shortcut})` : value.label),
    'aria-describedby': 'toolbar-context-description',
    onMouseEnter: () => {
      clearTipTimer();
      tipTimer.current = setTimeout(() => {
        setActiveTip(value);
        tipTimer.current = null;
      }, 150);
    },
    onMouseLeave: clearTip,
    onFocus: () => {
      clearTipTimer();
      setActiveTip(value);
    },
    onBlur: clearTip,
  });
  useEffect(() => () => {
    if (tipTimer.current !== null) clearTimeout(tipTimer.current);
  }, []);
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
      onClick: () => setShowExportExchange(true),
    },
    {
      label: 'Model to CSV…',
      onClick: () => setShowExportCsv(true),
    },
    {
      label: 'Static HTML Report (.zip)…',
      onClick: () => setShowStaticReport(true),
    },
    SEPARATOR,
    {
      label: 'Import CSV into model…',
      disabled: readOnly,
      onClick: () => importCsvFromDisk(),
    },
    {
      label: 'Import and Merge .archimate…',
      disabled: readOnly,
      onClick: () => setShowModelMerge(true),
    },
    {
      label: 'Model Templates (.architemplate)…',
      onClick: () => setShowTemplates(true),
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
  const shownTip = activeTip ?? DEFAULT_TOOLBAR_TIP;

  return (
    <div className="toolbar-shell">
      <div className="toolbar">
      <button
        className="tb-icon"
        {...tip({
          icon: 'new',
          label: 'New model',
          description: 'Create a blank ArchiMate model.',
          shortcut: 'Ctrl+Alt+N',
        })}
        onClick={() => void newModel()}
      >
        <TbIcon name="new" />
      </button>
      <button
        className="tb-icon"
        {...tip({
          icon: 'open',
          label: 'Open .archimate file',
          description: 'Open an existing model from this device.',
          shortcut: 'Ctrl+O',
        })}
        onClick={() => void openModel()}
      >
        <TbIcon name="open" />
      </button>
      <button
        className="tb-icon"
        {...tip({
          icon: 'templates',
          label: 'Model templates',
          description: 'Import, save, or create models from templates.',
          accessibleName: 'Import, save, and create models from templates',
        })}
        onClick={() => setShowTemplates(true)}
      >
        <TbIcon name="templates" />
      </button>
      <button
        className="tb-icon"
        {...tip({
          icon: 'save',
          label: 'Save model',
          description: 'Save changes to the current .archimate file.',
          shortcut: 'Ctrl+S',
        })}
        disabled={!hasModel}
        onClick={() => saveModel(false)}
      >
        <TbIcon name="save" />
      </button>
      <button
        className="tb-icon"
        {...tip({
          icon: 'saveas',
          label: 'Save model as…',
          description: 'Save a copy to a new .archimate file.',
        })}
        disabled={!hasModel}
        onClick={() => saveModel(true)}
      >
        <TbIcon name="saveas" />
      </button>
      <button
        className="tb-icon"
        {...tip({
          icon: 'share',
          label: 'Share model',
          description: 'Create a shareable link to the current model.',
        })}
        disabled={!hasModel || readOnly}
        onClick={() => void runShareModel()}
      >
        <TbIcon name="share" />
      </button>
      <div className="toolbar-sep" />
      <button
        className="tb-icon"
        {...tip({
          icon: 'undo',
          label: canUndo && undoLabel ? `Undo ${undoLabel}` : 'Undo',
          description: 'Reverse the most recent model change.',
          shortcut: 'Ctrl+Z',
        })}
        disabled={!canUndo}
        onClick={() => undo()}
      >
        <TbIcon name="undo" />
      </button>
      <button
        className="tb-icon"
        {...tip({
          icon: 'redo',
          label: canRedo && redoLabel ? `Redo ${redoLabel}` : 'Redo',
          description: 'Restore the most recently undone model change.',
          shortcut: 'Ctrl+Y',
        })}
        disabled={!canRedo}
        onClick={() => redo()}
      >
        <TbIcon name="redo" />
      </button>
      <div className="toolbar-sep" />
      <button
        className="tb-icon"
        {...tip({
          icon: 'export',
          label: 'Import and export',
          description: 'Exchange model data, images, CSV files, and reports.',
          accessibleName: 'Import or export images, Open Exchange, and CSV',
        })}
        disabled={!hasModel}
        onClick={(e) => {
          const anchor = toolbarMenuAnchor(e.currentTarget);
          showContextMenu(anchor.x, anchor.y, exportMenuItems);
        }}
      >
        <TbIcon name="export" />
      </button>
      <button
        className="tb-icon"
        {...tip({
          icon: 'present',
          label: 'Presentation mode',
          description: 'Walk through the current view in full screen.',
          accessibleName: 'Presentation mode — full-screen view walkthrough',
        })}
        disabled={!hasActiveView}
        onClick={() => setPresenting(true)}
      >
        <TbIcon name="present" />
      </button>
      <button
        className="tb-icon"
        {...tip({
          icon: 'c4',
          label: 'C4 tools',
          description: 'Create, update, and validate C4 views.',
          accessibleName: 'Create and validate C4 views',
        })}
        disabled={!hasModel}
        onClick={(e) => {
          const anchor = toolbarMenuAnchor(e.currentTarget);
          showContextMenu(anchor.x, anchor.y, c4MenuItems);
        }}
      >
        <TbIcon name="c4" />
      </button>
      <button
        className="tb-icon"
        {...tip({
          icon: 'profiles',
          label: 'Manage specializations',
          description: 'Manage custom names and images for ArchiMate concepts.',
        })}
        disabled={!hasModel || readOnly}
        onClick={() => setShowSpecializations(true)}
      >
        <TbIcon name="profiles" />
      </button>
      <button
        className="tb-icon"
        {...tip({
          icon: 'images',
          label: 'Model images',
          description: 'Import images or place one on the current view.',
          accessibleName: 'Import or place model images',
        })}
        disabled={!hasModel || readOnly}
        onClick={() => setShowImages(true)}
      >
        <TbIcon name="images" />
      </button>
      <button
        className="tb-icon"
        {...tip({
          icon: 'replace',
          label: 'Find and replace',
          description: 'Search model content and replace matching values.',
        })}
        disabled={!hasModel}
        onClick={() => setFindReplaceCapture(captureFindReplaceSession())}
      >
        <TbIcon name="replace" />
      </button>
      <button
        className="tb-icon"
        {...tip({
          icon: 'properties',
          label: 'Manage model properties',
          description: 'Inspect, rename, delete, or update model properties.',
        })}
        disabled={!hasModel}
        onClick={() => setPropertiesManagerCapture(capturePropertyManagerSession())}
      >
        <TbIcon name="properties" />
      </button>
      <div className="toolbar-spacer" />
      {extensionSnapshot.toolbarButtons.map((button) => (
        <button
          key={button.id}
          className="tb-icon tb-icon-text"
          {...tip({
            icon: 'ext',
            label: button.label,
            description: `Run the ${button.label} extension command.`,
          })}
          onClick={() => void extensionRegistry.runCommand(button.command)}
        >
          {button.label}
        </button>
      ))}
      <button
        className="tb-icon"
        {...tip({
          icon: 'ext',
          label: 'Run extension commands',
          description: 'Browse and run commands installed by extensions.',
        })}
        disabled={extensionMenuItems.length === 0}
        onClick={(e) => {
          const anchor = toolbarMenuAnchor(e.currentTarget);
          showContextMenu(anchor.x, anchor.y, extensionMenuItems);
        }}
      >
        <TbIcon name="ext" />
      </button>
      <button
        className="tb-icon"
        {...tip({
          icon: 'views',
          label: 'Panels',
          description: 'Show, reopen, or reset docked panels.',
          accessibleName: 'Show or reopen panels',
        })}
        onClick={(e) => {
          const bus = layoutBus();
          if (!bus) return;
          const items: MenuItem[] = bus.getPanels().map((p) => ({
            label: p.title,
            icon: p.open ? <span className="menu-check">✓</span> : undefined,
            onClick: () => bus.showPanel(p.id),
          }));
          items.push(SEPARATOR);
          items.push({ label: 'Reset Layout', onClick: () => bus.reset() });
          const anchor = toolbarMenuAnchor(e.currentTarget);
          showContextMenu(anchor.x, anchor.y, items);
        }}
      >
        <TbIcon name="views" />
      </button>
      <button
        className="tb-icon"
        {...tip({
          icon: 'docs',
          label: 'Documentation',
          description: 'Open the Archi Online user documentation.',
        })}
        onClick={() => window.open(DOCS_URL, '_blank', 'noopener,noreferrer')}
      >
        <TbIcon name="docs" />
      </button>
      <button
        className="tb-icon"
        {...tip({
          icon: 'help',
          label: 'Keyboard shortcuts',
          description: 'View all keyboard shortcuts.',
        })}
        onClick={() => setShowHelp(true)}
      >
        <TbIcon name="help" />
      </button>
      </div>
      <div id="toolbar-context-help" className="toolbar-context-help" role="status" aria-live="polite">
        <span className="toolbar-context-icon"><TbIcon name={shownTip.icon} /></span>
        <span className="toolbar-context-label">{shownTip.label}</span>
        <span id="toolbar-context-description" className="toolbar-context-description">
          {shownTip.description}
        </span>
        {shownTip.shortcut && (
          <kbd className="toolbar-context-shortcut">{shownTip.shortcut}</kbd>
        )}
      </div>
      {showExportImage && <ExportImageDialog onClose={() => setShowExportImage(false)} />}
      {showExportCsv && <ExportCsvDialog onClose={() => setShowExportCsv(false)} />}
      {showExportExchange && <ExportExchangeDialog onClose={() => setShowExportExchange(false)} />}
      {showStaticReport && (
        <StaticReportExportDialog onClose={() => setShowStaticReport(false)} />
      )}
      {showModelMerge && <ModelMergeDialog onClose={() => setShowModelMerge(false)} />}
      {showTemplates && <TemplateGallery onClose={() => setShowTemplates(false)} />}
      {presenting && <PresentationMode onClose={() => setPresenting(false)} />}
      {findReplaceCapture && (
        <FindReplaceDialog
          capture={findReplaceCapture}
          onClose={() => setFindReplaceCapture(null)}
        />
      )}
      {propertiesManagerCapture && (
        <PropertiesManagerDialog
          capture={propertiesManagerCapture}
          onClose={() => setPropertiesManagerCapture(null)}
        />
      )}
      <SpecializationsManager
        open={showSpecializations}
        onClose={() => setShowSpecializations(false)}
      />
      {showImages && (
        <ModalSurface
          title="Model Images"
          className="image-gallery-dialog"
          onClose={() => setShowImages(false)}
        >
            <p className="prop-hint">Choose an image, then click the active view to place it.</p>
            <ImageGallery
              selectedPath={undefined}
              onSelect={(path) => {
                setActiveTool({ kind: 'create-image', imagePath: path });
                setShowImages(false);
              }}
            />
            <button className="tb-btn" onClick={() => setShowImages(false)}>Cancel</button>
        </ModalSurface>
      )}
      {showHelp && (
        <ModalSurface title="Keyboard shortcuts" onClose={() => setShowHelp(false)}>
              <table className="shortcut-table">
                <tbody>
                  {SHORTCUTS.map(({ id, keys, description }) => (
                    <tr key={id}>
                      <td>
                        <code>{keys}</code>
                      </td>
                      <td>{description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="tb-btn small" onClick={() => setShowHelp(false)}>
                Close
              </button>
        </ModalSurface>
      )}
    </div>
  );
}
