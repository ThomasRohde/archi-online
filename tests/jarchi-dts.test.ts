import { describe, expect, it } from 'vitest';
import { JARCHI_EXTENSION_DTS, JARCHI_SCRIPT_DTS } from '../src/scripting/jarchi-dts';

describe('jArchi Monaco declarations', () => {
  it('keeps script declarations aligned with script runtime globals', () => {
    expect(JARCHI_SCRIPT_DTS).not.toContain('declare const app');
    expect(JARCHI_SCRIPT_DTS).not.toContain('fitContent');
    expect(JARCHI_SCRIPT_DTS).toContain('type JConnectable = JVisual | JConnection;');
    expect(JARCHI_SCRIPT_DTS).toContain('readonly source: JConnectable;');
    expect(JARCHI_SCRIPT_DTS).toContain(
      'add(relationship: JConcept, source: JConnectable, target: JConnectable): JConnection;',
    );
    expect(JARCHI_SCRIPT_DTS).toContain("routerType: 'manual' | 'manhattan';");
    expect(JARCHI_SCRIPT_DTS).toContain(
      "reconnect(end: 'source' | 'target', endpoint: JConnectable): void;",
    );
    expect(JARCHI_SCRIPT_DTS).toContain('routedPoints(): JPoint[];');
    expect(JARCHI_SCRIPT_DTS).toContain('setType(type: string): JConcept;');
    expect(JARCHI_SCRIPT_DTS).toContain('invert(): JConcept;');
  });

  it('declares the packed capability-map APIs', () => {
    expect(JARCHI_SCRIPT_DTS).toContain('createPackedView(options: JPackedViewOptions): JView;');
    expect(JARCHI_SCRIPT_DTS).toContain('layoutPacked(options?: JPackedLayoutOptions)');
    expect(JARCHI_SCRIPT_DTS).toContain('syncPacked(options?: JPackedSyncOptions)');
    expect(JARCHI_SCRIPT_DTS).toContain('applyHeatmap(options: JHeatmapOptions)');
    expect(JARCHI_SCRIPT_DTS).toContain('fontSize: number;');
    expect(JARCHI_SCRIPT_DTS).toContain("fontStyle: 'normal' | 'bold' | 'italic' | 'bolditalic';");
    expect(JARCHI_SCRIPT_DTS).toContain('textAlignment: number;');
    expect(JARCHI_SCRIPT_DTS).toContain('figureType: number;');
    expect(JARCHI_SCRIPT_DTS).toContain('iconVisible: number;');
  });

  it('keeps extension-only app declarations separate from script declarations', () => {
    expect(JARCHI_EXTENSION_DTS).toContain('declare const app');
    expect(JARCHI_EXTENSION_DTS).toContain('layout:');
  });
});
