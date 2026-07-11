import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  copyViewPngToClipboard,
  renderViewPng,
  renderViewSvg,
  supportsImageClipboard,
} from '../canvas/export/view-image';
import { useStore } from './store-hooks';
import { saveBlobToDisk, sanitizeFileName } from '../persistence/files';
import { showAlertDialog } from './AppDialog';

type Format = 'png' | 'svg';
type Background = 'white' | 'transparent';

const SCALES = [1, 2, 4] as const;

export function ExportImageDialog({ onClose }: { onClose: () => void }) {
  const model = useStore((s) => s.model);
  const activeViewId = useStore((s) => s.activeViewId);
  const [format, setFormat] = useState<Format>('png');
  const [scale, setScale] = useState<number>(1);
  const [background, setBackground] = useState<Background>('white');
  const [busy, setBusy] = useState(false);

  const view = model && activeViewId ? model.views[activeViewId] : undefined;
  if (!model || !activeViewId || !view) return null;

  const baseName = sanitizeFileName(view.name || 'view');

  const fail = async (title: string, error: unknown) => {
    await showAlertDialog({
      title,
      message: error instanceof Error ? error.message : String(error),
      intent: 'error',
    });
  };

  const doExport = async () => {
    setBusy(true);
    try {
      if (format === 'svg') {
        const { svg } = renderViewSvg(model, activeViewId, { background });
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        await saveBlobToDisk(blob, `${baseName}.svg`, {
          description: 'SVG image',
          accept: { 'image/svg+xml': ['.svg'] },
        });
      } else {
        const blob = await renderViewPng(model, activeViewId, { scale, background });
        await saveBlobToDisk(blob, `${baseName}.png`, {
          description: 'PNG image',
          accept: { 'image/png': ['.png'] },
        });
      }
      onClose();
    } catch (error) {
      await fail('Could not export image', error);
    } finally {
      setBusy(false);
    }
  };

  const doCopy = async () => {
    setBusy(true);
    try {
      await copyViewPngToClipboard(model, activeViewId, { scale, background });
      onClose();
    } catch (error) {
      await fail('Could not copy image', error);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Export "{view.name || 'View'}" as image</div>
        <div className="export-row">
          <span className="export-label">Format</span>
          <label>
            <input
              type="radio"
              name="export-format"
              checked={format === 'png'}
              onChange={() => setFormat('png')}
            />
            PNG
          </label>
          <label>
            <input
              type="radio"
              name="export-format"
              checked={format === 'svg'}
              onChange={() => setFormat('svg')}
            />
            SVG
          </label>
        </div>
        <div className="export-row">
          <span className="export-label">Scale</span>
          {SCALES.map((s) => (
            <label key={s}>
              <input
                type="radio"
                name="export-scale"
                disabled={format === 'svg'}
                checked={scale === s}
                onChange={() => setScale(s)}
              />
              {s}×
            </label>
          ))}
        </div>
        <div className="export-row">
          <span className="export-label">Background</span>
          <label>
            <input
              type="radio"
              name="export-bg"
              checked={background === 'white'}
              onChange={() => setBackground('white')}
            />
            White
          </label>
          <label>
            <input
              type="radio"
              name="export-bg"
              checked={background === 'transparent'}
              onChange={() => setBackground('transparent')}
            />
            Transparent
          </label>
        </div>
        <div className="export-actions">
          <button
            className="tb-btn small"
            disabled={busy || !supportsImageClipboard()}
            title={
              supportsImageClipboard()
                ? 'Copy a PNG to the clipboard'
                : 'Image clipboard is not supported in this browser'
            }
            onClick={() => void doCopy()}
          >
            Copy to clipboard
          </button>
          <span className="export-actions-spacer" />
          <button className="tb-btn small" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="tb-btn small primary" disabled={busy} onClick={() => void doExport()}>
            Export…
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
