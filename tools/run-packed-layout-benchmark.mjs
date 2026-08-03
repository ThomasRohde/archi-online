import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  await server.ssrLoadModule('/tools/packed-layout-benchmark.ts');
} finally {
  await server.close();
}
