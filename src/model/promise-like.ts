export interface CapturedThen {
  receiver: object;
  then: (this: unknown, ...args: unknown[]) => unknown;
}

/** Reads a possible thenable's accessor exactly once and retains its receiver. */
export function captureThen(value: unknown): CapturedThen | null {
  if (
    (typeof value !== 'object' || value === null)
    && typeof value !== 'function'
  ) {
    return null;
  }
  const then = Reflect.get(value, 'then') as unknown;
  if (typeof then !== 'function') return null;
  return { receiver: value, then: then as CapturedThen['then'] };
}

/** Performs native-style asynchronous thenable assimilation using the captured callable. */
export function promiseFromCapturedThen<T>(
  captured: CapturedThen,
): Promise<Awaited<T>> {
  return new Promise<Awaited<T>>((resolve, reject) => {
    queueMicrotask(() => {
      try {
        Reflect.apply(captured.then, captured.receiver, [resolve, reject]);
      } catch (error) {
        reject(error);
      }
    });
  });
}
