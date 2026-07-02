import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { get, set } from 'idb-keyval';
import { newId } from '../model/id';
import { useStore } from '../model/store';
import { runScript, type ConsoleEntry } from '../scripting/runner';

const MonacoEditor = lazy(() => import('./MonacoEditor'));

interface Script {
  id: string;
  name: string;
  code: string;
}

const SCRIPTS_KEY = 'archi-online.scripts';

const EXAMPLE_SCRIPT = `// jArchi-style scripting — Ctrl+Enter to run
console.log("Model:", model.name);
console.log("Elements:", $("element").size());
console.log("Relationships:", $("relationship").size());
console.log("Views:", $("view").size());

$("business-actor").each(function (actor) {
  console.log(" -", actor.name);
});
`;

async function loadScripts(): Promise<Script[]> {
  const scripts = await get<Script[]>(SCRIPTS_KEY);
  if (scripts && scripts.length > 0) return scripts;
  return [{ id: newId(), name: 'example', code: EXAMPLE_SCRIPT }];
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
    return (
      <div className="script-panel">
        <div className="panel-header">Scripting</div>
      </div>
    );
  }

  const current = scripts.find((s) => s.id === currentId) ?? scripts[0];

  const persist = (next: Script[]) => {
    setScripts(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void set(SCRIPTS_KEY, next), 500);
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
    const name = window.prompt('Script name', `script ${scripts.length + 1}`);
    if (!name) return;
    const s: Script = { id: newId(), name, code: '// ' + name + '\n' };
    persist([...scripts, s]);
    setCurrentId(s.id);
  };

  const deleteScript = () => {
    if (scripts.length <= 1 || !window.confirm(`Delete script "${current.name}"?`)) return;
    const next = scripts.filter((s) => s.id !== current.id);
    persist(next);
    setCurrentId(next[0].id);
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
        name: file.name.replace(/\.(ajs|js)$/, ''),
        code: await file.text(),
      };
      persist([...scripts, s]);
      setCurrentId(s.id);
    };
    input.click();
  };

  return (
    <div className="script-panel">
      <div className="panel-header script-header">
        <span>Scripting</span>
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
