// Lazy-loaded Monaco editor wrapper (imported via React.lazy in ScriptPanel).
import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { JARCHI_DTS } from '../scripting/jarchi-dts';

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

monaco.typescript.javascriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ES2020,
  allowNonTsExtensions: true,
  lib: ['es2020'],
});
monaco.typescript.javascriptDefaults.addExtraLib(JARCHI_DTS, 'ts:jarchi.d.ts');

export interface MonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
}

export default function MonacoEditor({ value, onChange, onRun }: MonacoEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  onChangeRef.current = onChange;
  onRunRef.current = onRun;

  useEffect(() => {
    const editor = monaco.editor.create(hostRef.current!, {
      value,
      language: 'javascript',
      minimap: { enabled: false },
      fontSize: 13,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: true,
    });
    editorRef.current = editor;
    editor.onDidChangeModelContent(() => onChangeRef.current(editor.getValue()));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRunRef.current());
    return () => editor.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // external value changes (script switch)
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== value) editor.setValue(value);
  }, [value]);

  return <div ref={hostRef} className="monaco-host" />;
}
