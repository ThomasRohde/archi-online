/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import {
  SHARE_FILE_NAME_HEADER,
  SHARE_INBOX_CACHE,
  SHARE_INBOX_KEY,
} from './pwa/share-target-protocol';

declare const self: ServiceWorkerGlobalScope;

// Full precache of the build manifest (all hashed chunks, workers, examples).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
clientsClaim();

// registerType 'prompt': the waiting worker activates only when the user
// confirms the update toast (UpdatePrompt.tsx).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// SPA navigations (including /?mode=viewer share links) resolve to the
// precached shell. popout.html must be served as itself — dockview popout
// windows break if they receive the SPA shell. /share-target is handled below.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/popout\.html$/, /^\/share-target/],
  }),
);

// Web Share Target: stash the shared file in Cache Storage, then redirect
// into the app, which consumes the inbox via takeSharedFile().
// Cross-origin requests (GitHub API/gists) match no route and hit the network.
registerRoute(
  ({ url }) => url.pathname === '/share-target',
  async ({ request }) => {
    try {
      const formData = await request.formData();
      const file = formData.get('model');
      if (file instanceof File) {
        const cache = await caches.open(SHARE_INBOX_CACHE);
        await cache.put(
          SHARE_INBOX_KEY,
          new Response(file, {
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
              [SHARE_FILE_NAME_HEADER]: encodeURIComponent(file.name || 'shared.archimate'),
            },
          }),
        );
      }
    } catch {
      // Fall through: the app shows "no shared file was received".
    }
    return Response.redirect('/?action=share-received', 303);
  },
  'POST',
);
