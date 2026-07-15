export function isMonacoRuntimeAsset(url: URL, origin: string): boolean {
  if (url.origin !== origin) return false;
  const fileName = url.pathname.split('/').pop() ?? '';
  return /^MonacoEditor-[\w-]+\.(?:js|css)$/.test(fileName) ||
    /^(?:css|editor|html|json|ts)\.worker-[\w-]+\.js$/.test(fileName);
}
