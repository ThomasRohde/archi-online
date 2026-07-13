import { JCollection } from '../scripting/jarchi';
import {
  assertExtensionInvocationSystemIdle,
  createExtensionJArchiGlobals,
  ExtensionInvocationBusyError,
} from '../scripting/jarchi/globals';
import { getActiveModelStore, runBatch } from '../model/store';
import type { ConsoleEntry } from '../scripting/runner';
import { createAppApi } from './app-api';
import { useExtensionStore } from './extension-store';
import { useExtensionPackageStore } from './package-store';
import { flattenInstalledPackage } from './package-validation';
import { extensionRegistry, type ExtensionRegistry } from './registry';
import type { LocalExtensionRecord } from './types';
import type { InstalledExtensionPackage } from './package-types';

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
    const target = globalThis.console?.[level] ?? globalThis.console?.log;
    target?.call(globalThis.console, `[ext:${extensionId}]`, entry.text);
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

function extensionWindow() {
  return {
    alert: (message: unknown) => window.alert(fmt(message)),
    confirm: (message: unknown) => window.confirm(fmt(message)),
    prompt: (message: unknown, def?: string) => window.prompt(fmt(message), def),
  };
}

export function runExtensionRecord(
  record: LocalExtensionRecord,
  registry: ExtensionRegistry = extensionRegistry,
  onConsole?: (entry: ConsoleEntry) => void,
  options?: { packageRecord?: InstalledExtensionPackage },
): { error?: string } {
  const loadStore = getActiveModelStore();
  const { $, model, invoke, resolveStore } = createExtensionJArchiGlobals();
  const app = createAppApi(record.id, registry, {
    sourceRecord: record,
    packageRecord: options?.packageRecord,
    resolveModelStore: resolveStore,
    invokeWithModelStore: invoke,
  });
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
    runBatch(
      `Extension load: ${record.name}`,
      () => invoke(
        loadStore,
        () => {
          registry.clearExtension(record.id);
          fn($, model, app, extensionConsole(record.id, registry, onConsole), extensionWindow(), exit);
        },
        { requireImmediate: true },
      ),
      loadStore,
    );
    return {};
  } catch (error) {
    if (error instanceof ExtensionExitSignal) return {};
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    if (!(error instanceof ExtensionInvocationBusyError)) registry.clearExtension(record.id);
    registry.recordError(record.id, error);
    return { error: message };
  }
}

export function runInstalledPackage(
  pkg: InstalledExtensionPackage,
  registry: ExtensionRegistry = extensionRegistry,
  onConsole?: (entry: ConsoleEntry) => void,
): { error?: string } {
  return runExtensionRecord(flattenInstalledPackage(pkg), registry, onConsole, {
    packageRecord: pkg,
  });
}

export function reloadEnabledExtensions(registry: ExtensionRegistry = extensionRegistry): void {
  try {
    assertExtensionInvocationSystemIdle();
  } catch (error) {
    if (!(error instanceof ExtensionInvocationBusyError)) throw error;
    registry.recordError('extensions.reload', error);
    return;
  }
  registry.clearAll();
  const sourceIds = new Set<string>();
  for (const record of useExtensionStore.getState().extensions) {
    if (record.enabled) {
      sourceIds.add(record.id);
      runExtensionRecord(record, registry);
    }
  }
  for (const pkg of useExtensionPackageStore.getState().packages) {
    if (pkg.enabled && !sourceIds.has(pkg.id)) runInstalledPackage(pkg, registry);
  }
}
