import { createJArchiGlobals, JCollection } from '../scripting/jarchi';
import type { ConsoleEntry } from '../scripting/runner';
import { createAppApi } from './app-api';
import { useExtensionStore } from './extension-store';
import { extensionRegistry, type ExtensionRegistry } from './registry';
import type { LocalExtensionRecord } from './types';

class ExtensionExitSignal extends Error {}

function fmt(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  if (arg instanceof JCollection) {
    return `[${arg
      .toArray()
      .map((o) => String(o))
      .join(', ')}]`;
  }
  if (arg instanceof Error) return arg.message;
  if (typeof arg === 'object') {
    if (
      typeof (arg as { toString?: () => string }).toString === 'function' &&
      (arg as object).toString !== Object.prototype.toString
    ) {
      return String(arg);
    }
    try {
      return JSON.stringify(arg, null, 1);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

function extensionConsole(
  extensionId: string,
  registry: ExtensionRegistry,
  onConsole?: (entry: ConsoleEntry) => void,
) {
  const emit = (level: ConsoleEntry['level'], args: unknown[]) => {
    const entry = { level, text: args.map(fmt).join(' '), time: Date.now() };
    onConsole?.(entry);
    if (level === 'error') registry.recordError(extensionId, entry.text);
  };
  return {
    log: (...args: unknown[]) => emit('log', args),
    error: (...args: unknown[]) => emit('error', args),
    warn: (...args: unknown[]) => emit('warn', args),
    info: (...args: unknown[]) => emit('info', args),
    show: () => {},
    clear: () => onConsole?.({ level: 'info', text: '\u0000clear', time: Date.now() }),
  };
}

export function runExtensionRecord(
  record: LocalExtensionRecord,
  registry: ExtensionRegistry = extensionRegistry,
  onConsole?: (entry: ConsoleEntry) => void,
): { error?: string } {
  registry.clearExtension(record.id);
  const { $, model } = createJArchiGlobals();
  const app = createAppApi(record.id, registry);
  const exit = () => {
    throw new ExtensionExitSignal('exit');
  };
  try {
    const fn = new Function(
      '$',
      'model',
      'app',
      'console',
      'window',
      'exit',
      `"use strict";\n${record.source}`,
    );
    fn($, model, app, extensionConsole(record.id, registry, onConsole), {}, exit);
    return {};
  } catch (error) {
    if (error instanceof ExtensionExitSignal) return {};
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    registry.recordError(record.id, error);
    return { error: message };
  }
}

export function reloadEnabledExtensions(registry: ExtensionRegistry = extensionRegistry): void {
  registry.clearAll();
  for (const record of useExtensionStore.getState().extensions) {
    if (record.enabled) runExtensionRecord(record, registry);
  }
}
