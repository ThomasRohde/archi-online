// Lets the update-reload path skip the beforeunload dirty prompt exactly once.
// Unsaved work is covered by flushAutosaveNow() before the reload.
let bypassOnce = false;

export function bypassUnloadGuardOnce(): void {
  bypassOnce = true;
}

export function shouldBlockUnload(): boolean {
  if (bypassOnce) {
    bypassOnce = false;
    return false;
  }
  return true;
}
