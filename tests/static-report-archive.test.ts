import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { addView, createEmptyModel, defaultFolderId } from '../src/model/ops';
import {
  createStaticReportArchive,
  serializeStaticReportData,
} from '../src/model/report/archive';
import { projectStaticReport } from '../src/model/report/project';
import { createModelStore } from '../src/model/store';

function archiveFixture() {
  const store = createModelStore({ model: createEmptyModel('Archive Report') });
  const model = store.getState().model!;
  const viewsFolder = defaultFolderId(model, 'diagrams');
  addView('First', viewsFolder, store);
  addView('Second', viewsFolder, store);
  const current = structuredClone(store.getState().model!);
  const report = projectStaticReport(current, '1.5.0');
  const svgs = new Map(report.views.map((view) => [
    view.id,
    `<svg xmlns="http://www.w3.org/2000/svg"><text>${view.name}</text></svg>`,
  ]));
  return { report, svgs };
}

function reportDataPayload(source: string): unknown {
  const prefix = 'window.__ARCHI_STATIC_REPORT__ = ';
  expect(source.startsWith(prefix)).toBe(true);
  expect(source.endsWith(';\n')).toBe(true);
  return JSON.parse(source.slice(prefix.length, -2));
}

describe('static report archive', () => {
  it('writes fixed shell assets and one assigned SVG per view', () => {
    const { report, svgs } = archiveFixture();
    const entries = unzipSync(createStaticReportArchive(report, svgs));

    expect(Object.keys(entries).sort()).toEqual([
      'index.html',
      'report-data.js',
      'report.css',
      'report.js',
      ...report.views.map(({ svgPath }) => svgPath),
    ].sort());
    expect(strFromU8(entries['index.html'])).toContain('script src="report-data.js" defer');
    expect(strFromU8(entries['index.html'])).toContain('script src="report.js" defer');
    expect(strFromU8(entries['report-data.js'])).toContain(
      'window.__ARCHI_STATIC_REPORT__ = ',
    );
    for (const view of report.views) {
      expect(strFromU8(entries[view.svgPath])).toContain(`<text>${view.name}</text>`);
    }
  });

  it('is byte-for-byte deterministic for identical inputs', () => {
    const { report, svgs } = archiveFixture();

    expect(createStaticReportArchive(report, svgs))
      .toEqual(createStaticReportArchive(report, svgs));
  });

  it('uses identical valid DOS timestamps across host time zones', () => {
    const { report, svgs } = archiveFixture();
    const configuredTimeZone = process.env.TZ;
    const originalTimeZone = configuredTimeZone
      ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const archives = ['UTC', 'Europe/Copenhagen', 'America/New_York'].map((timeZone) => {
        process.env.TZ = timeZone;
        return createStaticReportArchive(report, svgs);
      });

      expect(archives[1]).toEqual(archives[0]);
      expect(archives[2]).toEqual(archives[0]);
    } finally {
      process.env.TZ = originalTimeZone;
      if (configuredTimeZone === undefined) delete process.env.TZ;
    }
  });

  it('serializes adversarial Unicode and markup-shaped text as inert report data', () => {
    const report = projectStaticReport(createEmptyModel('Quote " </script> 😀\u2028\u2029'), 'test');
    report.model.documentation = '<img src=x onerror="window.pwned=true">';
    report.model.properties = [{ key: 'token', value: '\u2028secret\u2029' }];

    const source = serializeStaticReportData(report);

    expect(reportDataPayload(source)).toEqual(report);
    expect(source).not.toContain('innerHTML');
    expect(source).not.toContain('localStorage');
  });

  it('rejects missing and unexpected SVG assignments', () => {
    const { report, svgs } = archiveFixture();
    const missing = new Map(svgs);
    missing.delete(report.views[0].id);
    const extra = new Map(svgs);
    extra.set('browser-only-secret', '<svg/>');

    expect(() => createStaticReportArchive(report, missing)).toThrow(
      new RegExp(`missing SVG.*${report.views[0].name}`, 'i'),
    );
    expect(() => createStaticReportArchive(report, extra)).toThrow(/unexpected SVG.*browser-only-secret/i);
  });

  it('does not include browser-only storage or credential keys', () => {
    const { report, svgs } = archiveFixture();
    const entries = unzipSync(createStaticReportArchive(report, svgs));
    const text = Object.values(entries).map((entry) => strFromU8(entry)).join('\n');

    expect(text).not.toContain('archi-online.settings');
    expect(text).not.toContain('archi-online.autosave');
    expect(text).not.toContain('archi-online.share.gists');
    expect(text).not.toContain('browser-only-secret');
  });
});
