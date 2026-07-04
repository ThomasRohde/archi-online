export type PwaAction = 'new' | 'open' | 'share-received';

/**
 * Read and strip the `?action=` parameter set by manifest shortcuts and the
 * share-target redirect. Stripping via replaceState makes the action fire at
 * most once, surviving reloads and StrictMode double-effects.
 */
export function consumePwaAction(): PwaAction | null {
  const url = new URL(window.location.href);
  const action = url.searchParams.get('action');
  if (!action) return null;
  url.searchParams.delete('action');
  history.replaceState(null, '', url);
  return action === 'new' || action === 'open' || action === 'share-received'
    ? action
    : null;
}
