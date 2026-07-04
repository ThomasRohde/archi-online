// Minimal Launch Queue API declarations (Chromium). Delivers file handles
// when the installed PWA is launched as an OS file handler.
interface LaunchParams {
  readonly files: ReadonlyArray<FileSystemHandle>;
  readonly targetURL?: string;
}

interface LaunchQueue {
  setConsumer(consumer: (launchParams: LaunchParams) => void): void;
}

interface Window {
  readonly launchQueue?: LaunchQueue;
}
