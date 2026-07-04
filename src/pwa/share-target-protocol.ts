// Shared between the service worker (src/sw.ts) and the app so the stash
// location cannot drift between producer and consumer.
export const SHARE_INBOX_CACHE = 'archi-online-share-inbox';
export const SHARE_INBOX_KEY = '/__share-target-file';
export const SHARE_FILE_NAME_HEADER = 'X-Archi-File-Name';
