// Small bus so other panels (e.g. the Validator) can ask the model tree to
// reveal an item: expand its ancestor folders and scroll its row into view.
// Mirrors canvas/viewport-bus. The latest request is queued while the tree
// isn't mounted (Models panel closed) and delivered once it subscribes.

type RevealSubscriber = (conceptId: string) => void;

const subscribers = new Set<RevealSubscriber>();
let pending: string | null = null;

export function requestReveal(conceptId: string): void {
  if (subscribers.size === 0) {
    pending = conceptId;
    return;
  }
  for (const subscriber of subscribers) subscriber(conceptId);
}

export function onRevealRequest(cb: RevealSubscriber): () => void {
  subscribers.add(cb);
  if (pending !== null) {
    const id = pending;
    pending = null;
    cb(id);
  }
  return () => {
    subscribers.delete(cb);
  };
}
