import { useStore } from '../model/store';
import { APP_VERSION } from '../version';
import { useCanvasStatus } from './canvas-status';
import { resolveTarget } from './properties/target';

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

export function StatusBar() {
  const model = useStore((s) => s.model);
  const selection = useStore((s) => s.selection);
  const fileName = useStore((s) => s.fileName);
  const dirty = useStore((s) => s.dirty);
  const hasActiveView = useStore((s) => s.activeViewId !== null);
  const { zoom, x, y } = useCanvasStatus();

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
  const showCanvas = hasActiveView && zoom !== null;

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
          <span>
            {x !== null && y !== null ? `x ${Math.round(x)} y ${Math.round(y)}` : '—'}
          </span>
          <span className="status-sep" />
          <span>{Math.round((zoom as number) * 100)}%</span>
        </>
      )}
      <span className="status-sep" />
      <span className="status-version">v{APP_VERSION}</span>
    </div>
  );
}
