import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Toolbar } from './Toolbar';
import { ModelTree } from './ModelTree';
import { EditorArea } from './EditorArea';
import { PropertiesPanel } from './PropertiesPanel';
import { ScriptPanel } from './ScriptPanel';

export function AppShell() {
  return (
    <div className="app-shell">
      <Toolbar />
      <PanelGroup direction="horizontal" className="app-main" autoSaveId="archi-h">
        <Panel defaultSize={18} minSize={10} className="panel">
          <div className="panel-header">Models</div>
          <ModelTree />
        </Panel>
        <PanelResizeHandle className="resize-handle-h" />
        <Panel defaultSize={62} minSize={30}>
          <PanelGroup direction="vertical" autoSaveId="archi-v">
            <Panel defaultSize={75} minSize={20}>
              <EditorArea />
            </Panel>
            <PanelResizeHandle className="resize-handle-v" />
            <Panel defaultSize={25} minSize={8} collapsible className="panel">
              <ScriptPanel />
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle className="resize-handle-h" />
        <Panel defaultSize={20} minSize={12} className="panel">
          <div className="panel-header">Properties</div>
          <PropertiesPanel />
        </Panel>
      </PanelGroup>
    </div>
  );
}
