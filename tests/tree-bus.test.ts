import { describe, expect, it } from 'vitest';
import { onRevealRequest, requestReveal } from '../src/ui/tree-bus';

describe('tree-bus', () => {
  it('delivers reveal requests to subscribers', () => {
    const seen: Array<[string, string | null | undefined, boolean | undefined]> = [];
    const unsubscribe = onRevealRequest((id, sessionId, options) => {
      seen.push([id, sessionId, options?.focus]);
    });
    requestReveal('a', 'session', { select: false, focus: false });
    requestReveal('b');
    unsubscribe();
    requestReveal('c');
    expect(seen).toEqual([
      ['a', 'session', false],
      ['b', undefined, undefined],
    ]);
  });

  it('queues the latest request while unsubscribed and delivers it once on subscribe', () => {
    requestReveal('stale');
    requestReveal('latest', 'queued-session', { select: false, focus: false });
    const seen: Array<[string, string | null | undefined, boolean | undefined]> = [];
    const first = onRevealRequest((id, sessionId, options) => {
      seen.push([id, sessionId, options?.select]);
    });
    expect(seen).toEqual([['latest', 'queued-session', false]]);
    first();
    // Pending was consumed; a fresh subscriber gets nothing.
    const second = onRevealRequest((id, sessionId, options) => {
      seen.push([id, sessionId, options?.select]);
    });
    expect(seen).toEqual([['latest', 'queued-session', false]]);
    second();
  });
});
