import { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { autoListedExtensionCommands } from '../extensions/command-visibility';
import { extensionRegistry } from '../extensions/registry';
import { createEmptyModel } from '../model/ops';
import { redo, replaceModel, undo, useStore } from '../model/store';
import { openModelFromDisk, saveModelToDisk } from '../persistence/files';
import { showAlertDialog, showConfirmDialog } from './AppDialog';
import { showContextMenu, SEPARATOR, type MenuItem } from './ContextMenu';
import { layoutBus } from './layout-bus';

const SHORTCUTS: [string, string][] = [
  ['Ctrl+S / Ctrl+O', 'Save / open model'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
  ['Ctrl+C / Ctrl+V', 'Copy / paste diagram objects'],
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
];

async function confirmDiscardChanges(): Promise<boolean> {
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

export function Toolbar() {
  const [showHelp, setShowHelp] = useState(false);
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
