import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createArchiTemplate } from '../src/model/io/architemplate';
import { createEmptyModel } from '../src/model/ops';
import {
  addModelSession,
  resetWorkspaceForTests,
  workspaceStore,
} from '../src/model/workspace';
import {
  createTemplateRecord,
  useTemplateCatalog,
} from '../src/persistence/template-store';
import { TemplateGallery } from '../src/ui/TemplateGallery';

async function render(element: React.ReactElement): Promise<{ root: Root }> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  return { root };
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

async function change(element: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  resetWorkspaceForTests();
  addModelSession({ model: createEmptyModel('Open model'), fileName: null });
  useTemplateCatalog.setState({ records: [], hydrated: true });
});

describe('template gallery', () => {
  it('searches the catalog and creates a fresh workspace model from a template', async () => {
    const source = createEmptyModel('Business starter model');
    const originalModelId = source.info.id;
    const archive = await createArchiTemplate(source, {
      manifest: { name: 'Business Starter', description: 'Customer journey' },
      metadata: {
        version: 1,
        id: 'id-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        categories: ['Business'],
      },
      timestamp: 100,
    });
    const secondArchive = await createArchiTemplate(createEmptyModel('Technology model'), {
      manifest: { name: 'Technology Starter', description: 'Platform landscape' },
      metadata: {
        version: 1,
        id: 'id-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        categories: ['Technology'],
      },
      timestamp: 100,
    });
    useTemplateCatalog.setState({
      records: [await createTemplateRecord(archive), await createTemplateRecord(secondArchive)],
      hydrated: true,
    });
    const onClose = vi.fn();
    const { root } = await render(createElement(TemplateGallery, { onClose }));
    const dialog = document.body.querySelector<HTMLElement>('[aria-label="Model Templates"]')!;
    expect(dialog.textContent).toContain('Business Starter');
    expect(dialog.textContent).toContain('Technology Starter');

    await change(dialog.querySelector<HTMLInputElement>('input[aria-label="Search templates"]')!, 'business');
    expect(dialog.textContent).toContain('Business Starter');
    expect(dialog.textContent).not.toContain('Technology Starter');
    await click(dialog.querySelector('button[aria-label="Business Starter"]')!);

    const before = workspaceStore.getState().order.length;
    await click(Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent === 'Create model',
    )!);
    expect(workspaceStore.getState().order).toHaveLength(before + 1);
    const active = workspaceStore.getState().sessions[workspaceStore.getState().activeSessionId!]!;
    expect(active.store.getState().model!.info.name).toBe('Business starter model');
    expect(active.store.getState().model!.info.id).not.toBe(originalModelId);
    expect(active.store.getState().dirty).toBe(true);
    expect(onClose).toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('turns an empty catalog into a guided starting state', async () => {
    const { root } = await render(createElement(TemplateGallery, { onClose: vi.fn() }));
    const dialog = document.body.querySelector<HTMLElement>('[aria-label="Model Templates"]')!;

    expect(dialog.textContent).toContain('Build your template library');
    expect(dialog.textContent).toContain('Import template');
    expect(dialog.textContent).toContain('Save current model');
    expect(dialog.querySelector('input[aria-label="Search templates"]')).toBeNull();
    expect(dialog.querySelector('footer')).toBeNull();

    await act(async () => root.unmount());
  });

  it('overrides the generic modal width cap and includes narrow-screen layouts', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    const dialogRule = css.match(/\.template-gallery-dialog\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(dialogRule).toContain('max-width: none;');
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).toContain('@media (max-width: 520px)');
  });
});
