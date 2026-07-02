import { useEffect } from 'react';
import { redo, undo, useStore } from './model/store';
import { restoreAutosave, startAutosave } from './persistence/autosave';
import { AppShell } from './ui/AppShell';
import { openModel, saveModel } from './ui/Toolbar';

let booted = false;

export function App() {
  useEffect(() => {
    if (!booted) {
      booted = true;
      void restoreAutosave().finally(startAutosave);
    }
    const onKey = (e: KeyboardEvent) => {
      const inText =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);
      if (!e.ctrlKey && !e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        saveModel(false);
      } else if (key === 'o') {
        e.preventDefault();
        openModel();
      } else if (!inText && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (!inText && key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useStore.getState().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  return <AppShell />;
}
