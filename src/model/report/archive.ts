import { strToU8, zipSync, type Zippable } from 'fflate';
import { REPORT_CSS, REPORT_HTML, REPORT_JS } from './assets';
import type { StaticReportData } from './types';

export function serializeStaticReportData(data: StaticReportData): string {
  const json = JSON.stringify(data, null, 2)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `window.__ARCHI_STATIC_REPORT__ = ${json};\n`;
}

function validateViewSvgs(
  data: StaticReportData,
  svgByViewId: ReadonlyMap<string, string>,
): void {
  const expectedIds = new Set(data.views.map(({ id }) => id));
  for (const view of data.views) {
    if (!svgByViewId.has(view.id)) {
      throw new Error(`Missing SVG for view "${view.name || view.id}" (${view.id})`);
    }
  }
  for (const viewId of svgByViewId.keys()) {
    if (!expectedIds.has(viewId)) {
      throw new Error(`Unexpected SVG assignment for view ${viewId}`);
    }
  }
}

function lexicalEntryOrder(
  left: readonly [string, string],
  right: readonly [string, string],
): number {
  return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
}

export function createStaticReportArchive(
  data: StaticReportData,
  svgByViewId: ReadonlyMap<string, string>,
): Uint8Array {
  validateViewSvgs(data, svgByViewId);
  // ZIP stores a timezone-free DOS timestamp, and fflate reads local Date fields.
  // Construct local midnight per export so every host encodes the same value.
  const zipMtime = new Date(1980, 0, 1, 0, 0, 0);
  const files: Array<[string, string]> = [
    ['index.html', REPORT_HTML],
    ['report-data.js', serializeStaticReportData(data)],
    ['report.css', REPORT_CSS],
    ['report.js', REPORT_JS],
    ...data.views.map((view) => [view.svgPath, svgByViewId.get(view.id)!] as [string, string]),
  ];
  const entries: Zippable = {};
  for (const [path, content] of files.sort(lexicalEntryOrder)) {
    entries[path] = [strToU8(content), { level: 6, mtime: zipMtime }];
  }
  return zipSync(entries, { level: 6 });
}
