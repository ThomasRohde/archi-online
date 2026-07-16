import { useStore } from './store-hooks';
import { APP_VERSION } from '../version';
import { canvasStatusKey, useCanvasStatus } from './canvas-status';
import { resolveTarget } from './properties/target';
import { useWorkspaceStore } from './store-hooks';

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

export function StatusBar() {
  const model = useStore((s) => s.model);
  const selection = useStore((s) => s.selection);
  const fileName = useStore((s) => s.fileName);
  const dirty = useStore((s) => s.dirty);
  const activeViewId = useStore((s) => s.activeViewId);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);
  const canvasStatus = useCanvasStatus((state) =>
    activeSessionId && activeViewId
      ? state.entries[canvasStatusKey(activeSessionId, activeViewId)]
      : undefined,
  );
  const canvasZoom = canvasStatus?.zoom ?? null;
  const canvasX = canvasStatus?.x ?? null;
  const canvasY = canvasStatus?.y ?? null;

  if (!model) {
    return (
      <div className="status-bar">
        <span className="status-spacer" />
        <span className="status-version">v{APP_VERSION}</span>
      </div>
    );
  }

  const target = resolveTarget(model, selection.source, selection.ids);
  const selLabel =
    target === null
      ? null
      : target.count > 1
        ? `${target.count} items`
        : target.name || target.typeLabel;

  const elementCount = Object.keys(model.elements).length;
  const relationshipCount = Object.keys(model.relationships).length;
  const showCanvas = Boolean(
    activeViewId !== null && canvasStatus && canvasZoom !== null,
  );

  return (
    <div className="status-bar">
      <span className="status-sel">
        <span className="status-dot" />
        {selLabel ? (
          <>
            <span className="status-sel-name">{selLabel}</span>
            <span>selected</span>
          </>
        ) : (
          <span>Nothing selected</span>
        )}
      </span>
      <span className="status-sep" />
      <span>
        {plural(elementCount, 'element')} · {plural(relationshipCount, 'relationship')}
      </span>

      <span className="status-spacer" />

      <span className="status-file">{fileName ?? 'unsaved'}</span>
      {dirty && <span className="status-unsaved">● unsaved</span>}
      {showCanvas && (
        <>
          <span className="status-sep" />
          <span
            className={
              canvasStatus?.message
                ? `status-canvas-message status-canvas-message-${canvasStatus.tone}`
                : undefined
            }
          >
            {canvasStatus?.message ??
              (canvasX !== null && canvasY !== null
                ? `x ${Math.round(canvasX)} y ${Math.round(canvasY)}`
                : '—')}
          </span>
          <span className="status-sep" />
          <span>{Math.round((canvasZoom as number) * 100)}%</span>
        </>
      )}
      <span className="status-sep" />
      <span className="status-version">v{APP_VERSION}</span>
    </div>
  );
}
