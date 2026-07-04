import type { ManifestOptions } from 'vite-plugin-pwa';

/** Web app manifest, consumed by the VitePWA plugin and locked by unit tests. */
export const webManifest: Partial<ManifestOptions> = {
  name: 'Archi Online',
  short_name: 'Archi',
  description:
    'Web-based ArchiMate modeler, scriptable with a jArchi-compatible JavaScript API.',
  id: '/',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  theme_color: '#fafafa',
  background_color: '#f4f4f4',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  // Same MIME/extension pairing as PICKER_TYPES in src/persistence/files.ts.
  file_handlers: [{ action: '/', accept: { 'application/xml': ['.archimate'] } }],
  launch_handler: { client_mode: 'focus-existing' },
  shortcuts: [
    {
      name: 'New model',
      url: '/?action=new',
      icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
    },
    {
      name: 'Open model file',
      url: '/?action=open',
      icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
    },
  ],
  share_target: {
    action: '/share-target',
    method: 'POST',
    enctype: 'multipart/form-data',
    params: {
      files: [{ name: 'model', accept: ['application/xml', 'text/xml', '.archimate'] }],
    },
  },
};
