import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { webManifest } from './src/pwa/webmanifest';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    VitePWA({
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
