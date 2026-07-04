import {
  SHARE_FILE_NAME_HEADER,
  SHARE_INBOX_CACHE,
  SHARE_INBOX_KEY,
} from './share-target-protocol';

/**
 * Take the file stashed by the service worker's share-target route.
 * Returns null when nothing was shared; the inbox entry is deleted on read.
 */
export async function takeSharedFile(): Promise<{ name: string; text: string } | null> {
  if (!('caches' in globalThis)) return null;
  const cache = await caches.open(SHARE_INBOX_CACHE);
  const response = await cache.match(SHARE_INBOX_KEY);
  if (!response) return null;
  const name = decodeURIComponent(
    response.headers.get(SHARE_FILE_NAME_HEADER) ?? 'shared.archimate',
  );
  const text = await response.text();
  await cache.delete(SHARE_INBOX_KEY);
  return { name, text };
}
