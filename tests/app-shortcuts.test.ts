import { describe, expect, it } from 'vitest';
import { blocksReadOnlyShortcut } from '../src/ui/shortcut-policy';

describe('application shortcut policy', () => {
  it('allows Open and Save while blocking read-only model mutations', () => {
    expect(blocksReadOnlyShortcut('o')).toBe(false);
    expect(blocksReadOnlyShortcut('s')).toBe(false);
    expect(blocksReadOnlyShortcut('z')).toBe(true);
    expect(blocksReadOnlyShortcut('y')).toBe(true);
    expect(blocksReadOnlyShortcut('d')).toBe(true);
  });
});
