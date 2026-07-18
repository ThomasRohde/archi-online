import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { newId } from '../model/id';
import { useStore } from './store-hooks';
import { defaultKeyValueStore } from '../persistence/keyval';
import { BUILT_IN_SCRIPTS } from '../scripting/example-scripts';
import { runScript, type ConsoleEntry } from '../scripting/runner';
import { showConfirmDialog, showPromptDialog } from './AppDialog';

const MonacoEditor = lazy(() => import('./MonacoEditor'));

interface Script {
  id: string;
  name: string;
  code: string;
}

const SCRIPTS_KEY = 'archi-online.scripts';

function humanReadableScriptName(name: string): string {
  return /^archi[ _-]+online[ _-]+architecture$/i.test(name)
    ? 'Archi Online architecture'
    : name;
}

async function loadScripts(): Promise<Script[]> {
  const storedScripts = await defaultKeyValueStore().get<Script[]>(SCRIPTS_KEY);
  if (storedScripts && storedScripts.length > 0) {
    const scripts = storedScripts.map((script) => ({
      ...script,
      name: humanReadableScriptName(script.name),
    }));
    const namesChanged = scripts.some(
      (script, index) => script.name !== storedScripts[index].name,
    );
    const existingNames = new Set(scripts.map((script) => script.name));
    const missingBuiltIns = BUILT_IN_SCRIPTS.filter((script) => !existingNames.has(script.name));
    if (!namesChanged && missingBuiltIns.length === 0) return scripts;
    const merged = [...scripts, ...missingBuiltIns];
    await defaultKeyValueStore().set(SCRIPTS_KEY, merged);
    return merged;
  }
  return BUILT_IN_SCRIPTS.map((script) => ({ ...script }));
}

export function ScriptPanel() {
  const hasModel = useStore((s) => s.model !== null);
  const [scripts, setScripts] = useState<Script[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const saveTimer = useRef<number>();
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadScripts().then((s) => {
      setScripts(s);
      setCurrentId(s[0].id);
    });
  }, []);

  useEffect(() => {
    consoleRef.current?.scrollTo(0, consoleRef.current.scrollHeight);
  }, [entries]);

  if (!scripts || !currentId) {
    return <div className="script-panel" />;
  }

  const current = scripts.find((s) => s.id === currentId) ?? scripts[0];

  const persist = (next: Script[]) => {
    setScripts(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(
      () => void defaultKeyValueStore().set(SCRIPTS_KEY, next),
      500,
    );
  };

  const updateCode = (code: string) => {
    persist(scripts.map((s) => (s.id === current.id ? { ...s, code } : s)));
  };

  const run = () => {
    const code = (scripts.find((s) => s.id === currentId) ?? current).code;
    setEntries((e) => [
      ...e,
      { level: 'info', text: `▶ ${current.name}`, time: Date.now() },
    ]);
    runScript(code, (entry) => setEntries((e) => [...e, entry]));
  };

  const addScript = () => {
    void (async () => {
      const name = await showPromptDialog({
        title: 'New script',
        message: 'Name the script to add to this browser profile.',
        defaultValue: `script ${scripts.length + 1}`,
        confirmLabel: 'Create',
      });
      const scriptName = name?.trim();
      if (!scriptName) return;
      const s: Script = { id: newId(), name: scriptName, code: '// ' + scriptName + '\n' };
      persist([...scripts, s]);
      setCurrentId(s.id);
    })();
  };

  const deleteScript = () => {
    void (async () => {
      if (scripts.length <= 1) return;
      const confirmed = await showConfirmDialog({
        title: 'Delete script?',
        message: `Delete "${current.name}" from this browser profile?`,
        confirmLabel: 'Delete',
        cancelLabel: 'Keep script',
        intent: 'danger',
      });
      if (!confirmed) return;
      const next = scripts.filter((s) => s.id !== current.id);
      persist(next);
      setCurrentId(next[0].id);
    })();
  };

  const exportScript = () => {
    const blob = new Blob([current.code], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = current.name.endsWith('.ajs') ? current.name : current.name + '.ajs';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importScript = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ajs,.js';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const s: Script = {
        id: newId(),
        name: humanReadableScriptName(file.name.replace(/\.(ajs|js)$/, '')),
        code: await file.text(),
      };
      persist([...scripts, s]);
      setCurrentId(s.id);
    };
    input.click();
  };

  return (
    <div className="script-panel">
      <div className="script-header">
        <select value={current.id} onChange={(e) => setCurrentId(e.target.value)}>
          {scripts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button className="tb-btn small" onClick={addScript} title="New script">
          +
        </button>
        <button className="tb-btn small" onClick={deleteScript} title="Delete script">
          ×
        </button>
        <button className="tb-btn small" onClick={importScript} title="Import .ajs file">
          Import
        </button>
        <button className="tb-btn small" onClick={exportScript} title="Export as .ajs">
          Export
        </button>
        <button
          className="tb-btn run-btn"
          onClick={run}
          disabled={!hasModel}
          title="Run script (Ctrl+Enter)"
        >
          ▶ Run
        </button>
        <span className="toolbar-spacer" />
        <button className="tb-btn small" onClick={() => setEntries([])} title="Clear console">
          Clear
        </button>
      </div>
      <div className="script-body">
        <div className="script-editor">
          <Suspense fallback={<div className="empty-hint">Loading editor…</div>}>
            <MonacoEditor value={current.code} onChange={updateCode} onRun={run} />
          </Suspense>
        </div>
        <div className="script-console" ref={consoleRef}>
          {entries.length === 0 && (
            <div className="empty-hint">
              Console output appears here. Try <code>console.log($("element").size())</code>
            </div>
          )}
          {entries.map((e, i) => (
            <div key={i} className={'console-entry ' + e.level}>
              {e.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
