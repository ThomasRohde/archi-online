import { describe, expect, it } from 'vitest';
import { JARCHI_EXTENSION_DTS, JARCHI_SCRIPT_DTS } from '../src/scripting/jarchi-dts';

describe('jArchi Monaco declarations', () => {
  it('keeps script declarations aligned with script runtime globals', () => {
    expect(JARCHI_SCRIPT_DTS).not.toContain('declare const app');
    expect(JARCHI_SCRIPT_DTS).not.toContain('fitContent');
  });

  it('keeps extension-only app declarations separate from script declarations', () => {
    expect(JARCHI_EXTENSION_DTS).toContain('declare const app');
    expect(JARCHI_EXTENSION_DTS).toContain('layout:');
  });
});
