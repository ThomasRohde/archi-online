import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addView, createEmptyModel, defaultFolderId } from '../src/model/ops';
import { createModelStore, replaceModel } from '../src/model/store';
import type { ModelState } from '../src/model/types';
import { ContextMenuHost } from '../src/ui/ContextMenu';
import {
  exportStaticReport,
  StaticReportExportDialog,
  staticReportFileName,
} from '../src/ui/StaticReportExportDialog';
import { useStore } from '../src/ui/store-hooks';
import { Toolbar } from '../src/ui/Toolbar';

function fixture(): ModelState {
  const store = createModelStore({ model: createEmptyModel('A/B:*? Model') });
  const viewsFolder = defaultFolderId(store.getState().model!, 'diagrams');
  addView('First view', viewsFolder, store);
  addView('Second view', viewsFolder, store);
  return store.getState().model!;
}

async function render(element: React.ReactElement): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  return { host, root };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  replaceModel(fixture(), null);
});

afterEach(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  document.body.replaceChildren();
});

describe('static report export coordinator', () => {
  it('renders every projected view and saves one ZIP blob', async () => {
    const model = fixture();
    const rendered: string[] = [];
    const saved: Array<{ name: string; type: string }> = [];

    const result = await exportStaticReport(model, 'stakeholder-report.zip', {
      renderView: (_model, viewId, options) => {
        rendered.push(viewId);
        expect(options?.renderSettings?.legendLabels).toEqual({});
        expect(options?.renderSettings?.legendUserColors).toEqual({});
        return { svg: `<svg id="${viewId}"/>`, width: 1, height: 1 };
      },
      save: async (blob, name) => {
        saved.push({ name, type: blob.type });
        return true;
      },
    });

    expect(result).toBe(true);
    expect(rendered).toEqual(Object.keys(model.views));
    expect(saved).toEqual([{ name: 'stakeholder-report.zip', type: 'application/zip' }]);
  });

  it('returns cancellation and names a failed view without saving a partial report', async () => {
    const model = fixture();
    const save = vi.fn(async () => false);
    expect(await exportStaticReport(model, 'cancelled.zip', {
      renderView: (_model, viewId) => ({ svg: `<svg id="${viewId}"/>`, width: 1, height: 1 }),
      save,
    })).toBe(false);
    expect(save).toHaveBeenCalledOnce();

    const failedSave = vi.fn(async () => true);
    const failedView = Object.values(model.views)[1];
    await expect(exportStaticReport(model, 'failed.zip', {
      renderView: (_model, viewId) => {
        if (viewId === failedView.id) throw new Error('getBBox failed');
        return { svg: '<svg/>', width: 1, height: 1 };
      },
      save: failedSave,
    })).rejects.toThrow(`Could not render view "${failedView.name}": getBBox failed`);
    expect(failedSave).not.toHaveBeenCalled();
  });

  it('creates a Windows-safe report filename', () => {
    expect(staticReportFileName('A/B:*? Model')).toBe('A_B___ Model-html-report.zip');
    expect(staticReportFileName('   ')).toBe('model-html-report.zip');
  });
});

describe('static report export dialog and toolbar', () => {
  it('shows report scope and prevents duplicate export while busy', async () => {
    const pending = deferred<boolean>();
    const exportReport = vi.fn(() => pending.promise);
    const onClose = vi.fn();
    const { root } = await render(createElement(StaticReportExportDialog, {
      onClose,
      exportReport,
    }));
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const input = dialog.querySelector<HTMLInputElement>('input[name="reportFileName"]')!;
    const exportButton = [...dialog.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Export report')!;

    expect(dialog.getAttribute('aria-label')).toBe('Export static HTML report');
    expect(dialog.textContent).toContain('2 views');
    expect(dialog.textContent).toContain('browser settings, extensions, scripts, autosave');
    expect(input.value).toBe('A_B___ Model-html-report.zip');

    await act(async () => {
      exportButton.click();
      exportButton.click();
    });
    expect(exportReport).toHaveBeenCalledOnce();
    expect(exportButton.disabled).toBe(true);

    await act(async () => pending.resolve(false));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('adds the report command to the Import/Export menu and opens the dialog', async () => {
    const { host, root } = await render(createElement(
      Fragment,
      null,
      createElement(ContextMenuHost),
      createElement(Toolbar),
    ));
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Import or export images, Open Exchange, and CSV"]',
    )!;
    await act(async () => trigger.click());
    const command = [...document.querySelectorAll<HTMLElement>('.ctx-item')]
      .find((item) => item.textContent?.includes('Static HTML Report (.zip)…'))!;

    expect(command).not.toBeUndefined();
    await act(async () => command.click());
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label'))
      .toBe('Export static HTML report');

    await act(async () => root.unmount());
  });

  it('keeps the Import/Export toolbar unavailable without a model', async () => {
    useStore.setState({ model: null });
    const { host, root } = await render(createElement(Toolbar));

    expect(host.querySelector<HTMLButtonElement>(
      'button[aria-label="Import or export images, Open Exchange, and CSV"]',
    )?.disabled).toBe(true);

    await act(async () => root.unmount());
  });
});
