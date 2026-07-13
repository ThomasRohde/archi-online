import { beforeEach, describe, expect, it } from 'vitest';
import ts from 'typescript';
import { createEmptyModel } from '../src/model/ops';
import { replaceModel, undo } from '../src/model/store';
import { JARCHI_SCRIPT_DTS } from '../src/scripting/jarchi-dts';
import { runScript, type ConsoleEntry } from '../src/scripting/runner';
import { useStore } from '../src/ui/store-hooks';

function run(code: string): { error?: string; logs: string[] } {
  const logs: string[] = [];
  const result = runScript(code, (entry: ConsoleEntry) => logs.push(`${entry.level}:${entry.text}`));
  return { ...result, logs };
}

function compileLegendDeclarationContract(): readonly ts.Diagnostic[] {
  return ts.transpileModule(JARCHI_SCRIPT_DTS, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
    fileName: 'jarchi-script.ts',
    reportDiagnostics: true,
  }).diagnostics ?? [];
}

beforeEach(() => replaceModel(createEmptyModel('Legend script'), null));

describe('native legend scripting wrappers', () => {
  it('creates a legend, exposes typed options, clamps updates, and sizes optimally in one script undo', () => {
    const { error, logs } = run(`
      var view = model.createArchimateView("Legend View");
      var actor = model.createElement("business-actor", "Customer");
      view.add(actor, 300, 20, 120, 55);
      var legend = view.createLegend(20, 20, {
        rowsPerColumn: 2,
        widthOffset: 8,
        colorScheme: 2,
        sortMethod: 0
      });
      console.log(legend.type, legend.name, legend.legendOptions.rowsPerColumn);
      legend.legendOptions = Object.assign({}, legend.legendOptions, {
        rowsPerColumn: 999,
        widthOffset: -999
      });
      legend.setLegendOptimalSize();
      console.log(legend.legendOptions.rowsPerColumn, legend.legendOptions.widthOffset,
        legend.bounds.width > 0, legend.bounds.height > 0);
    `);

    expect(error).toBeUndefined();
    expect(logs).toEqual([
      'log:diagram-model-legend Legend 2',
      'log:100 -200 true true',
    ]);
    expect(useStore.getState().undoStack).toHaveLength(1);
    undo();
    expect(Object.keys(useStore.getState().model!.views)).toHaveLength(0);
    expect(Object.keys(useStore.getState().model!.nodes)).toHaveLength(0);
  });

  it('declares additive legend creation and option APIs in Monaco', () => {
    expect(JARCHI_SCRIPT_DTS).toContain('declare interface JLegendOptions');
    expect(JARCHI_SCRIPT_DTS).toContain(
      'createLegend(x: number, y: number, options?: Partial<JLegendOptions>): JVisual;',
    );
    expect(JARCHI_SCRIPT_DTS).toContain(
      'get legendOptions(): JLegendOptions | undefined;',
    );
    expect(JARCHI_SCRIPT_DTS).toContain('set legendOptions(value: JLegendOptions);');
    expect(compileLegendDeclarationContract()).toEqual([]);
    expect(JARCHI_SCRIPT_DTS).toContain('setLegendOptimalSize(): void;');
  });

  it('returns undefined when reading legend options from a non-legend visual', () => {
    const { error, logs } = run(`
      var view = model.createArchimateView("Legend View");
      var actor = model.createElement("business-actor", "Customer");
      var visual = view.add(actor, 20, 20, 120, 55);
      console.log(visual.legendOptions === undefined);
    `);

    expect(error).toBeUndefined();
    expect(logs).toEqual(['log:true']);
  });

  it('rejects undefined legend option assignment at runtime', () => {
    const { error, logs } = run(`
      var view = model.createArchimateView("Legend View");
      var legend = view.createLegend(20, 20);
      try {
        legend.legendOptions = undefined;
      } catch (error) {
        console.log(error.message);
      }
      console.log(legend.legendOptions.rowsPerColumn);
    `);

    expect(error).toBeUndefined();
    expect(logs).toEqual([
      'log:legendOptions are only available on native legends',
      'log:15',
    ]);
  });
});
