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
        globIgnores: [
          '**/MonacoEditor-*.{js,css}',
          '**/{css,editor,html,json,ts}.worker-*.js',
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      // Never register the SW against the dev server.
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
  },
  // Keep dependency pre-bundling aligned with the production target. The
  // browser-side XSD validator uses top-level await.
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
  // libxml2-wasm uses top-level await and itself targets modern browsers
  // (Chrome/Edge 89+, Safari 15+). Preserve that syntax in the application bundle.
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replaceAll('\\', '/');
          if (/\/node_modules\/(?:react|react-dom|scheduler)\//.test(moduleId)) {
            return 'react-vendor';
          }
          if (/\/node_modules\/(?:dockview|dockview-react)\//.test(moduleId)) {
            return 'dockview-vendor';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
