import { createEmptyModel } from '../model/ops';
import { redo, replaceModel, undo, useStore } from '../model/store';

export function Toolbar() {
  const canUndo = useStore((s) => s.undoStack.length > 0);
  const canRedo = useStore((s) => s.redoStack.length > 0);
  const undoLabel = useStore((s) => s.undoStack[s.undoStack.length - 1]?.label);
  const redoLabel = useStore((s) => s.redoStack[s.redoStack.length - 1]?.label);
  const dirty = useStore((s) => s.dirty);
  const fileName = useStore((s) => s.fileName);
  const hasModel = useStore((s) => s.model !== null);

  const onNew = () => {
    if (useStore.getState().dirty && !confirm('Discard unsaved changes?')) return;
    replaceModel(createEmptyModel('New ArchiMate Model'), null, false);
  };

  return (
    <div className="toolbar">
      <span className="app-title">Archi Online</span>
      <div className="toolbar-sep" />
      <button className="tb-btn" title="New model" onClick={onNew}>
        New
      </button>
      <button className="tb-btn" title="Open model (coming soon)" disabled>
        Open…
      </button>
      <button className="tb-btn" title="Save model (coming soon)" disabled={!hasModel}>
        Save
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
        {hasModel ? (fileName ?? 'unsaved') + (dirty ? ' •' : '') : ''}
      </span>
    </div>
  );
}
