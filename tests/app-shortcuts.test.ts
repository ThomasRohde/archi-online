import { describe, expect, it } from 'vitest';

describe('application shortcut policy', () => {
  it('allows Open and Save while blocking read-only model mutations', async () => {
    const app = await import('../src/App');
    const policy = (
      app as unknown as {
        blocksReadOnlyShortcut?: (key: string) => boolean;
      }
    ).blocksReadOnlyShortcut;

    expect(policy).toBeTypeOf('function');
    if (!policy) return;
    expect(policy('o')).toBe(false);
    expect(policy('s')).toBe(false);
    expect(policy('z')).toBe(true);
    expect(policy('y')).toBe(true);
    expect(policy('d')).toBe(true);
  });
});
