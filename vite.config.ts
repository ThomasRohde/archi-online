import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { webManifest } from './src/pwa/webmanifest';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Default build serves at the root (here.now) with the full installable PWA.
// The GitHub Pages demo sets APP_BASE=/archi-online/app/ and disables the PWA:
// the service worker and web manifest hardcode root-absolute paths, so the
// subpath copy is a plain SPA (still fully functional — see docs/pages-publishing.md).
const base = process.env.APP_BASE ?? '/';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    VitePWA({
      disable: base !== '/',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false, // UpdatePrompt.tsx registers via virtual:pwa-register/react
      manifest: webManifest,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,ttf,webmanifest,archimate}'],
        // Monaco's ts.worker chunk is ~7 MB; default cap is 2 MB.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      // Never register the SW against the dev server.
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
