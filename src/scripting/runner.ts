import { getActiveModelStore, runBatch } from '../model/store';
import { extensionRegistry } from '../extensions/registry';
import { createJArchiGlobals, JCollection } from './jarchi';

export interface ConsoleEntry {
  level: 'log' | 'error' | 'warn' | 'info';
  text: string;
  time: number;
}

class ExitSignal extends Error {}

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
    if (typeof (arg as { toString?: () => string }).toString === 'function' &&
        (arg as object).toString !== Object.prototype.toString) {
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

/** Run a user script with jArchi-style globals. One undo step per run. */
export function runScript(code: string, onConsole: (e: ConsoleEntry) => void): { error?: string } {
  const modelStore = getActiveModelStore();
  if (!modelStore.getState().model) {
    return { error: 'No model is open' };
  }
  const emit = (level: ConsoleEntry['level'], args: unknown[]) =>
    onConsole({ level, text: args.map(fmt).join(' '), time: Date.now() });

  const { $, model } = createJArchiGlobals(modelStore);
  const scriptConsole = {
    log: (...args: unknown[]) => emit('log', args),
    error: (...args: unknown[]) => emit('error', args),
    warn: (...args: unknown[]) => emit('warn', args),
    info: (...args: unknown[]) => emit('info', args),
    show: () => {},
    clear: () => onConsole({ level: 'info', text: '\u0000clear', time: Date.now() }),
  };
  const scriptWindow = {
    alert: (msg: unknown) => window.alert(fmt(msg)),
    confirm: (msg: unknown) => window.confirm(fmt(msg)),
    prompt: (msg: unknown, def?: string) => window.prompt(fmt(msg), def),
  };
  const exit = () => {
    throw new ExitSignal('exit');
  };

  try {
    const fn = new Function('$', 'model', 'console', 'window', 'exit', `"use strict";\n${code}`);
    runBatch('Script', () => {
      fn($, model, scriptConsole, scriptWindow, exit);
    }, modelStore);
    return {};
  } catch (e) {
    if (e instanceof ExitSignal) return {};
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    emit('error', [msg]);
    void extensionRegistry.emitEvent('script.error', { message: msg });
    return { error: msg };
  }
}
