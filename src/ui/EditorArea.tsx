import { ViewEditor } from '../canvas/ViewEditor';
import { closeView, useStore } from '../model/store';
import { Palette } from './Palette';

export function EditorArea() {
  const model = useStore((s) => s.model);
  const openViewIds = useStore((s) => s.openViewIds);
  const activeViewId = useStore((s) => s.activeViewId);

  if (!model) {
    return (
      <div className="editor-area">
        <div className="editor-empty">Create or open a model to get started.</div>
      </div>
    );
  }
  if (openViewIds.length === 0) {
    return (
      <div className="editor-area">
        <div className="editor-empty">Double-click a view in the model tree to open it.</div>
      </div>
    );
  }

  return (
    <div className="editor-area">
      <div className="editor-tabs">
        {openViewIds.map((id) => {
          const view = model.views[id];
          if (!view) return null;
          return (
            <div
              key={id}
              className={'editor-tab' + (id === activeViewId ? ' active' : '')}
              onClick={() => useStore.setState({ activeViewId: id })}
              onAuxClick={(e) => {
                if (e.button === 1) closeView(id);
              }}
              title={view.name}
            >
              <span className="tab-label">{view.name}</span>
              <span
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeView(id);
                }}
              >
                ×
              </span>
            </div>
          );
        })}
      </div>
      <div className="editor-body">
        <Palette />
        {activeViewId && <ViewEditor key={activeViewId} viewId={activeViewId} />}
      </div>
    </div>
  );
}
