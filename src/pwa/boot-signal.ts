// Resolves once the editor runtime has booted (autosave restored, stores
// hydrated). The launch-queue consumer awaits this so an OS-launched file is
// applied strictly after the autosave restore — deterministic, no timeouts.
let resolveReady: () => void;
let ready = createReady();

function createReady(): Promise<void> {
  return new Promise((resolve) => {
    resolveReady = resolve;
  });
}

export function editorRuntimeReady(): Promise<void> {
  return ready;
}

export function signalEditorRuntimeReady(): void {
  resolveReady();
}

export function resetBootSignalForTests(): void {
  ready = createReady();
}
