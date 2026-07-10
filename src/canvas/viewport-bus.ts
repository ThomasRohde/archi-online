export interface ViewportInfo {
  /** Visible area's top-left corner in view coordinates. */
  x: number;
  y: number;
  zoom: number;
  /** Visible area's size in view coordinates. */
  width: number;
  height: number;
}

type ViewportSubscriber = (info: ViewportInfo | null) => void;
type PanSubscriber = (centerX: number, centerY: number) => void;

const latestViewports = new Map<string, ViewportInfo | null>();
const viewportSubscribers = new Map<string, Set<ViewportSubscriber>>();
const panSubscribers = new Map<string, Set<PanSubscriber>>();
// Latest pan request per view with no live editor yet, replayed on subscribe
// so "open view, then pan to object" works for freshly opened views.
const pendingPans = new Map<string, { x: number; y: number }>();

export function publishViewport(viewId: string, info: ViewportInfo | null): void {
  latestViewports.set(viewId, info);
  for (const subscriber of viewportSubscribers.get(viewId) ?? []) subscriber(info);
}

export function subscribeViewport(viewId: string, cb: ViewportSubscriber): () => void {
  const subscribers = viewportSubscribers.get(viewId) ?? new Set<ViewportSubscriber>();
  subscribers.add(cb);
  viewportSubscribers.set(viewId, subscribers);
  cb(latestViewports.get(viewId) ?? null);
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0) viewportSubscribers.delete(viewId);
  };
}

export function requestPanTo(viewId: string, centerX: number, centerY: number): void {
  const subscribers = panSubscribers.get(viewId);
  if (!subscribers || subscribers.size === 0) {
    pendingPans.set(viewId, { x: centerX, y: centerY });
    return;
  }
  for (const subscriber of subscribers) subscriber(centerX, centerY);
}

export function onPanRequest(viewId: string, cb: PanSubscriber): () => void {
  const subscribers = panSubscribers.get(viewId) ?? new Set<PanSubscriber>();
  subscribers.add(cb);
  panSubscribers.set(viewId, subscribers);
  const pending = pendingPans.get(viewId);
  if (pending) {
    pendingPans.delete(viewId);
    cb(pending.x, pending.y);
  }
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0) panSubscribers.delete(viewId);
  };
}
