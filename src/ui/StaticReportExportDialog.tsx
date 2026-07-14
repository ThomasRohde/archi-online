import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { renderViewSvg } from '../canvas/export/view-image';
import { createStaticReportArchive } from '../model/report/archive';
import { projectStaticReport } from '../model/report/project';
import type { StaticReportView } from '../model/report/types';
import type { ModelState } from '../model/types';
import { sanitizeFileName, saveBlobToDisk } from '../persistence/files';
import { DEFAULT_SETTINGS } from '../settings/app-settings';
import { APP_VERSION } from '../version';
import { showAlertDialog } from './AppDialog';
import { useStore } from './store-hooks';

const ZIP_SAVE_TYPE = {
  description: 'Static HTML report',
  accept: { 'application/zip': ['.zip' as const] },
};

const STATIC_REPORT_RENDER_SETTINGS = {
  ...DEFAULT_SETTINGS,
  legendLabels: {},
  legendUserColors: {},
};

export interface StaticReportExportDependencies {
  renderView?: typeof renderViewSvg;
  save?: typeof saveBlobToDisk;
}

export interface StaticReportExportDialogProps {
  onClose: () => void;
  exportReport?: typeof exportStaticReport;
}

export function staticReportFileName(modelName: string): string {
  return `${sanitizeFileName(modelName)}-html-report.zip`;
}

function normalizeReportFileName(value: string, modelName: string): string {
  const withoutExtension = value.trim().replace(/\.zip$/i, '');
  if (!withoutExtension) return staticReportFileName(modelName);
  return `${sanitizeFileName(withoutExtension)}.zip`;
}

export function renderStaticReportViews(
  model: ModelState,
  views: readonly StaticReportView[],
  render: typeof renderViewSvg = renderViewSvg,
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const view of views) {
    try {
      result.set(view.id, render(model, view.id, {
        background: 'white',
        renderSettings: STATIC_REPORT_RENDER_SETTINGS,
      }).svg);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not render view "${view.name || view.id}": ${message}`, {
        cause: error,
      });
    }
  }
  return result;
}

export async function exportStaticReport(
  model: ModelState,
  fileName: string,
  dependencies: StaticReportExportDependencies = {},
): Promise<boolean> {
  const report = projectStaticReport(model, APP_VERSION);
  const svgs = renderStaticReportViews(model, report.views, dependencies.renderView);
  const archive = createStaticReportArchive(report, svgs);
  const blob = new Blob([archive.slice().buffer as ArrayBuffer], { type: 'application/zip' });
  return (dependencies.save ?? saveBlobToDisk)(blob, fileName, ZIP_SAVE_TYPE);
}

export function StaticReportExportDialog({
  onClose,
  exportReport = exportStaticReport,
}: StaticReportExportDialogProps) {
  const model = useStore((state) => state.model);
  const [fileName, setFileName] = useState(() => staticReportFileName(model?.info.name ?? 'model'));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  if (!model) return null;

  const viewCount = Object.keys(model.views).length;

  const runExport = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const normalized = normalizeReportFileName(fileName, model.info.name);
      setFileName(normalized);
      const saved = await exportReport(model, normalized);
      if (saved) onClose();
    } catch (error) {
      await showAlertDialog({
        title: 'Could not export static report',
        message: error instanceof Error ? error.message : String(error),
        intent: 'error',
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal static-report-export-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Export static HTML report"
      >
        <div className="dialog-kicker">Stakeholder delivery</div>
        <h2>Export static HTML report</h2>
        <p className="static-report-export-lead">
          Create an offline report with model navigation, search, object details, analysis,
          and {viewCount} {viewCount === 1 ? 'view' : 'views'}.
        </p>
        <label className="static-report-file-name">
          <span>Report file</span>
          <input
            name="reportFileName"
            value={fileName}
            disabled={busy}
            onChange={(event) => setFileName(event.target.value)}
          />
        </label>
        <p className="static-report-privacy">
          The report contains the complete model content. It does not include browser settings,
          extensions, scripts, autosave, file handles, sharing credentials, or tokens.
        </p>
        <div className="export-actions">
          <span className="export-actions-spacer" />
          <button className="tb-btn small" disabled={busy} onClick={onClose}>Cancel</button>
          <button
            className="tb-btn small primary"
            disabled={busy}
            onClick={() => void runExport()}
          >
            {busy ? 'Building report…' : 'Export report'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
