export interface FrameThrottle<T> {
  push(value: T): void;
  cancel(): void;
}

export function createFrameThrottle<T>(
  publish: (value: T) => void,
  request: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancelFrame: (handle: number) => void = cancelAnimationFrame,
): FrameThrottle<T> {
  let latest: T | undefined;
  let handle: number | null = null;
  return {
    push(value) {
      latest = value;
      if (handle !== null) return;
      handle = request(() => {
        handle = null;
        if (latest !== undefined) publish(latest);
        latest = undefined;
      });
    },
    cancel() {
      if (handle !== null) cancelFrame(handle);
      handle = null;
      latest = undefined;
    },
  };
}
