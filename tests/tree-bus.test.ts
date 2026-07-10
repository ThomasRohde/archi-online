import { describe, expect, it } from 'vitest';
import { onRevealRequest, requestReveal } from '../src/ui/tree-bus';

describe('tree-bus', () => {
  it('delivers reveal requests to subscribers', () => {
    const seen: string[] = [];
    const unsubscribe = onRevealRequest((id) => seen.push(id));
    requestReveal('a');
    requestReveal('b');
    unsubscribe();
    requestReveal('c');
    expect(seen).toEqual(['a', 'b']);
  });

  it('queues the latest request while unsubscribed and delivers it once on subscribe', () => {
    requestReveal('stale');
    requestReveal('latest');
    const seen: string[] = [];
    const first = onRevealRequest((id) => seen.push(id));
    expect(seen).toEqual(['latest']);
    first();
    // Pending was consumed; a fresh subscriber gets nothing.
    const second = onRevealRequest((id) => seen.push(id));
    expect(seen).toEqual(['latest']);
    second();
  });
});
