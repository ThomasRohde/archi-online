export function Toolbar() {
  return (
    <div className="toolbar">
      <span className="app-title">Archi Online</span>
      <div className="toolbar-sep" />
      <button className="tb-btn" title="New model">New</button>
      <button className="tb-btn" title="Open model">Open…</button>
      <button className="tb-btn" title="Save model">Save</button>
      <div className="toolbar-sep" />
      <button className="tb-btn" title="Undo (Ctrl+Z)">Undo</button>
      <button className="tb-btn" title="Redo (Ctrl+Y)">Redo</button>
    </div>
  );
}
