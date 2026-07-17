// Small bus so other panels (e.g. the Validator) can ask the model tree to
// reveal an item: expand its ancestor folders and scroll its row into view.
// Mirrors canvas/viewport-bus. The latest request is queued while the tree
// isn't mounted (Models panel closed) and delivered once it subscribes.

export interface RevealOptions {
  select?: boolean;
  focus?: boolean;
}

type RevealSubscriber = (
  conceptId: string,
  sessionId?: string | null,
  options?: RevealOptions,
) => void;

interface RevealRequest {
  conceptId: string;
  sessionId?: string | null;
  options?: RevealOptions;
}

const subscribers = new Set<RevealSubscriber>();
let pending: RevealRequest | null = null;

export function requestReveal(
  conceptId: string,
  sessionId?: string | null,
  options?: RevealOptions,
): void {
  if (subscribers.size === 0) {
    pending = { conceptId, sessionId, options };
    return;
  }
  for (const subscriber of subscribers) subscriber(conceptId, sessionId, options);
}

export function onRevealRequest(cb: RevealSubscriber): () => void {
  subscribers.add(cb);
  if (pending !== null) {
    const request = pending;
    pending = null;
    cb(request.conceptId, request.sessionId, request.options);
  }
  return () => {
    subscribers.delete(cb);
  };
}
