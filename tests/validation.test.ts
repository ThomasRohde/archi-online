import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addConnectionToView,
  addElement,
  addElementNodeToView,
  addRelationship,
  addView,
  createEmptyModel,
  setViewpoint,
} from '../src/model/ops';
import { parseArchimate } from '../src/model/io/archimate-xml';
import { replaceModel } from '../src/model/store';
import { useStore } from '../src/ui/store-hooks';
import type { ModelState } from '../src/model/types';
import {
  DEFAULT_VALIDATION_CONFIG,
  validateModel,
  type ValidationIssue,
} from '../src/model/validation';
import { ValidatorPanel } from '../src/ui/ValidatorPanel';
import { useValidatorSettings } from '../src/settings/validator-settings';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const archisurance = readFileSync(join(__dirname, 'fixtures', 'Archisurance.archimate'), 'utf8');

function model(): ModelState {
  return useStore.getState().model!;
}

function rulesOf(issues: ValidationIssue[], rule: string): ValidationIssue[] {
  return issues.filter((issue) => issue.rule === rule);
}

beforeEach(() => {
  replaceModel(createEmptyModel('Validation Test'), null);
  useValidatorSettings.setState({ config: structuredClone(DEFAULT_VALIDATION_CONFIG) });
});

describe('invalid-relationship checker', () => {
  it('flags a relationship the matrix disallows and clears for a valid type', () => {
    const a = addElement('BusinessActor', 'A');
    const b = addElement('BusinessActor', 'B');
    // Realization BusinessActor→BusinessActor is not allowed ('cfgostv'); inject
    // one directly since addRelationship refuses invalid combinations.
    const clone: ModelState = JSON.parse(JSON.stringify(model()));
    const relId = 'rel-illegal';
    clone.relationships[relId] = {
      id: relId,
      kind: 'relationship',
      type: 'RealizationRelationship',
      name: '',
      documentation: '',
      properties: [],
      profileIds: [],
      folderId: '',
      sourceId: a,
      targetId: b,
    };

    const issues = rulesOf(validateModel(clone), 'invalid-relationship');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].location.modelTree.idPath.at(-1)).toBe(relId);
    expect(issues[0].message).toBe("Realization is not allowed between 'A' and 'B'");

    clone.relationships[relId].type = 'TriggeringRelationship';
    expect(rulesOf(validateModel(clone), 'invalid-relationship')).toHaveLength(0);
  });
});

describe('junction checker', () => {
  it('flags a junction whose relationships have different types', () => {
    const j = addElement('Junction', 'J');
    const a = addElement('BusinessActor', 'A');
    const b = addElement('BusinessActor', 'B');
    expect(addRelationship('TriggeringRelationship', j, a)).not.toBeNull();
    expect(addRelationship('FlowRelationship', j, b)).not.toBeNull();

    const issues = rulesOf(validateModel(model()), 'junction');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].location.modelTree.idPath.at(-1)).toBe(j);
  });

  it('does not flag a junction whose relationships share a type', () => {
    const j = addElement('Junction', 'J');
    const a = addElement('BusinessActor', 'A');
    const b = addElement('BusinessActor', 'B');
    addRelationship('TriggeringRelationship', j, a);
    addRelationship('TriggeringRelationship', j, b);
    expect(rulesOf(validateModel(model()), 'junction')).toHaveLength(0);
  });
});

describe('duplicate-name checker', () => {
  it('flags both elements sharing a name and type', () => {
    const a = addElement('BusinessActor', 'Same');
    const b = addElement('BusinessActor', 'Same');
    const issues = rulesOf(validateModel(model()), 'duplicate-name');
    expect(issues).toHaveLength(2);
    expect(issues.every((issue) => issue.severity === 'warning')).toBe(true);
    expect(new Set(issues.map((issue) => issue.location.modelTree.idPath.at(-1)))).toEqual(new Set([a, b]));
    expect(issues[0].message).toBe("The name 'Same' is used more than once for the type 'Business Actor'.");
  });

  it('ignores different types and Junction pairs', () => {
    addElement('BusinessActor', 'X');
    addElement('BusinessRole', 'X'); // different type
    addElement('Junction', 'J');
    addElement('Junction', 'J'); // both junctions are ignored
    expect(rulesOf(validateModel(model()), 'duplicate-name')).toHaveLength(0);
  });
});

describe('unused-element checker', () => {
  it('flags an element absent from every view and clears once placed', () => {
    const a = addElement('BusinessActor', 'Lonely');
    const issues = rulesOf(validateModel(model()), 'unused-element');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].location.modelTree.idPath.at(-1)).toBe(a);

    const view = addView('V');
    addElementNodeToView(view, a, view, { x: 0, y: 0, width: 120, height: 55 }, false);
    expect(rulesOf(validateModel(model()), 'unused-element')).toHaveLength(0);
  });
});

describe('unused-relationship checker', () => {
  it('flags a relationship absent from every view and clears once connected', () => {
    const a = addElement('BusinessActor', 'A');
    const b = addElement('BusinessActor', 'B');
    const rel = addRelationship('TriggeringRelationship', a, b)!;
    const issues = rulesOf(validateModel(model()), 'unused-relationship');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].location.modelTree.idPath.at(-1)).toBe(rel);

    const view = addView('V');
    const na = addElementNodeToView(view, a, view, { x: 0, y: 0, width: 120, height: 55 }, false);
    const nb = addElementNodeToView(view, b, view, { x: 200, y: 0, width: 120, height: 55 }, false);
    addConnectionToView(view, rel, na, nb);
    expect(rulesOf(validateModel(model()), 'unused-relationship')).toHaveLength(0);
  });
});

describe('empty-view checker', () => {
  it('flags an empty view and clears once it gains content', () => {
    const view = addView('Empty');
    const issues = rulesOf(validateModel(model()), 'empty-view');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('advice');
    expect(issues[0].location.view?.viewId).toBe(view);

    const a = addElement('BusinessActor', 'A');
    addElementNodeToView(view, a, view, { x: 0, y: 0, width: 120, height: 55 }, false);
    expect(rulesOf(validateModel(model()), 'empty-view')).toHaveLength(0);
  });
});

describe('viewpoint checker', () => {
  it('flags an element outside the view viewpoint and clears when unrestricted', () => {
    const view = addView('V');
    setViewpoint(view, 'strategy'); // allows only strategy elements + Outcome
    const a = addElement('BusinessActor', 'A');
    const node = addElementNodeToView(view, a, view, { x: 0, y: 0, width: 120, height: 55 }, false);

    const issues = rulesOf(validateModel(model()), 'viewpoint');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].location.view?.viewId).toBe(view);
    expect(issues[0].location.view?.objectId).toBe(node);

    setViewpoint(view, ''); // none → allow all
    expect(rulesOf(validateModel(model()), 'viewpoint')).toHaveLength(0);
  });
});

describe('nested-elements checker', () => {
  it('flags visual nesting with no relationship and clears with a composition', () => {
    const view = addView('V');
    const parentEl = addElement('BusinessActor', 'Parent');
    const childEl = addElement('BusinessActor', 'Child');
    const parentNode = addElementNodeToView(
      view,
      parentEl,
      view,
      { x: 0, y: 0, width: 200, height: 200 },
      false,
    );
    const childNode = addElementNodeToView(
      view,
      childEl,
      parentNode,
      { x: 10, y: 10, width: 80, height: 40 },
      false,
    );

    const issues = rulesOf(validateModel(model()), 'nested-elements');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('advice');
    expect(issues[0].location.view?.viewId).toBe(view);
    expect(issues[0].location.view?.objectId).toBe(childNode);

    // A composition parent→child (a nesting-type relationship) resolves it.
    const rel = addRelationship('CompositionRelationship', parentEl, childEl)!;
    addConnectionToView(view, rel, parentNode, childNode);
    expect(rulesOf(validateModel(model()), 'nested-elements')).toHaveLength(0);
  });
});

describe('validateModel on Archisurance', () => {
  it('reports no errors for the valid sample model', () => {
    const issues = validateModel(parseArchimate(archisurance));
    expect(issues.every((issue) => issue.severity !== 'error')).toBe(true);
  });
});

async function renderPanel(): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(ValidatorPanel));
  });
  return { host, root };
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const match = Array.from(host.querySelectorAll('button')).find(
    (candidate) => candidate.textContent === label,
  );
  expect(match, `Expected button "${label}"`).toBeDefined();
  return match as HTMLButtonElement;
}

describe('ValidatorPanel', () => {
  it('validates on demand and navigates to the clicked issue', async () => {
    const a = addElement('BusinessActor', 'Lonely');
    const { host, root } = await renderPanel();

    // Nothing runs until Validate is pressed.
    expect(host.querySelector('.validator-row')).toBeNull();

    await click(button(host, 'Validate'));

    expect(host.textContent).toContain("'Lonely' is not used in a View");
    const rowEl = host.querySelector<HTMLElement>('.validator-row');
    expect(rowEl).not.toBeNull();

    await click(rowEl!);
    expect(useStore.getState().selection).toEqual({ source: 'tree', ids: [a] });

    await act(async () => {
      root.unmount();
    });
  });

  it('configures Hammer rules without presenting integrity checks as Hammer rules', async () => {
    addElement('BusinessActor', 'Lonely');
    const { host, root } = await renderPanel();

    await click(button(host, 'Configure'));
    const dialog = document.body.querySelector<HTMLElement>('.validator-config-dialog')!;
    expect(dialog.textContent).toContain(
      'Hammer rules are configurable checks that flag common modelling problems. ' +
      'Model-integrity checks always run separately.',
    );
    expect(dialog.textContent).not.toContain('Archi 5.9 Desktop');
    expect(dialog.textContent).not.toContain('Missing references');
    const unusedLabel = Array.from(dialog.querySelectorAll('label')).find(
      (label) => label.textContent?.includes('Unused elements'),
    )!;
    await click(unusedLabel.querySelector('input')!);
    await click(button(dialog, 'Done'));
    await click(button(host, 'Validate'));

    expect(host.textContent).not.toContain("'Lonely' is not used in a View");
    await act(async () => { root.unmount(); });
  });
});
