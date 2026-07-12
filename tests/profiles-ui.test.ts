import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addElement,
  addView,
  createEmptyModel,
  createProfile,
  importModelAsset,
} from '../src/model/ops';
import { openView, redo, replaceModel, setSelection, undo } from '../src/model/store';
import { resetWorkspaceForTests } from '../src/model/workspace';
import { Palette } from '../src/ui/Palette';
import { PropertiesPanel } from '../src/ui/PropertiesPanel';
import { SpecializationsManager } from '../src/ui/SpecializationsManager';
import { useStore } from '../src/ui/store-hooks';

async function render(element: React.ReactElement): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  return { host, root };
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

async function change(element: HTMLInputElement | HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    const prototype = element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  resetWorkspaceForTests();
  replaceModel(createEmptyModel('Profiles UI'), null);
});

describe('specialization UI', () => {
  it('offers exact-type specializations in concept properties', async () => {
    const actor = addElement('BusinessActor', 'Customer');
    const actorProfile = createProfile({ name: 'External party', conceptType: 'BusinessActor' });
    createProfile({ name: 'Buyer role', conceptType: 'BusinessRole' });
    setSelection('tree', [actor]);

    const { host, root } = await render(createElement(PropertiesPanel));
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Specialization"]')!;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      'None',
      'External party',
    ]);

    await change(select, actorProfile);
    expect(useStore.getState().model!.elements[actor].profileIds).toEqual([actorProfile]);
    await act(async () => root.unmount());
  });

  it('adds specialized palette tools that retain the selected profile', async () => {
    const profile = createProfile({ name: 'External party', conceptType: 'BusinessActor' });
    const view = addView('View');
    openView(view);
    const { host, root } = await render(createElement(Palette));

    const button = host.querySelector<HTMLButtonElement>(`button[data-profile-id="${profile}"]`)!;
    expect(button.title).toContain('External party');
    await click(button);
    expect(useStore.getState().activeTool).toEqual({
      kind: 'create-element',
      type: 'BusinessActor',
      profileId: profile,
    });
    await act(async () => root.unmount());
  });

  it('stages manager edits until Apply and commits them as one transaction', async () => {
    const profile = createProfile({ name: 'External party', conceptType: 'BusinessActor' });
    const undoBefore = useStore.getState().undoStack.length;
    const onClose = vi.fn();
    const { root } = await render(createElement(SpecializationsManager, { open: true, onClose }));
    const dialog = document.body.querySelector<HTMLElement>('[aria-label="Specializations Manager"]')!;
    const name = dialog.querySelector<HTMLInputElement>(`input[data-profile-id="${profile}"]`)!;

    await change(name, 'External customer');
    expect(useStore.getState().model!.profiles[profile].name).toBe('External party');
    await click(Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Apply')!);

    expect(useStore.getState().model!.profiles[profile].name).toBe('External customer');
    expect(useStore.getState().undoStack).toHaveLength(undoBefore + 1);
    expect(useStore.getState().undoStack.at(-1)?.label).toBe('Manage Specializations');
    expect(onClose).toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('stages profile image selection and removal in undoable manager transactions', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const path = await importModelAsset(bytes, 'profile.png', 'image/png');
    const profile = createProfile({ name: 'External party', conceptType: 'BusinessActor' });
    const onClose = vi.fn();
    const first = await render(createElement(SpecializationsManager, { open: true, onClose }));
    let dialog = document.body.querySelector<HTMLElement>('[aria-label="Specializations Manager"]')!;

    await click(dialog.querySelector(`[aria-label="Choose image for External party"]`)!);
    await click(dialog.querySelector(`[data-image-path="${path}"]`)!);
    expect(useStore.getState().model!.profiles[profile].imagePath).toBeUndefined();
    await click(Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Apply')!);

    expect(useStore.getState().model!.profiles[profile].imagePath).toBe(path);
    await act(async () => undo());
    expect(useStore.getState().model!.profiles[profile].imagePath).toBeUndefined();
    await act(async () => redo());
    expect(useStore.getState().model!.profiles[profile].imagePath).toBe(path);
    await act(async () => first.root.unmount());

    const second = await render(createElement(SpecializationsManager, { open: true, onClose }));
    dialog = document.body.querySelector<HTMLElement>('[aria-label="Specializations Manager"]')!;
    await click(dialog.querySelector(`[aria-label="Remove image from External party"]`)!);
    expect(useStore.getState().model!.profiles[profile].imagePath).toBe(path);
    await click(Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Apply')!);

    expect(useStore.getState().model!.profiles[profile].imagePath).toBeUndefined();
    expect(useStore.getState().model!.assets[path]).toBeUndefined();
    await act(async () => second.root.unmount());
  });
});
