// Injected by Vite's `define` from package.json (see vite.config.ts). The typeof
// guard keeps this safe under vitest, where `define` may not be applied.
declare const __APP_VERSION__: string;

export const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0-dev';
