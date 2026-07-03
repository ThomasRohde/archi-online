# ELK Layout Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an optional ELK-powered diagram layout extension backed by an app-bundled `elkjs` host helper.

**Architecture:** Add a focused host layout module under `src/extensions/layout/` that maps active/selected Archi Online visuals to ELK JSON, runs `elkjs`, and applies results through existing `JView.layout(...)`. Expose this through `app.layout.elk(...)`, then add an optional package extension in `extensions/elk-layout` for commands, context menus, a dockable panel, and browser-local preferences.

**Tech Stack:** Vite, React, TypeScript, Vitest, `elkjs`, existing Archi Online extension/package APIs.

---

### Task 1: Host ELK Layout Tests

**Files:**
- Create: `tests/extensions-elk-layout.test.ts`

- [ ] **Step 1: Add tests for host layout behavior**

Create `tests/extensions-elk-layout.test.ts` with tests that:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { createAppApi } from '../src/extensions/app-api';
import { openView, replaceModel, setSelection, useStore } from '../src/model/store';
import { addElement, addRelationship } from '../src/model/ops/concepts';
import { addElementNodeToView, addRelationshipToView, addView } from '../src/model/ops/view';
import { createEmptyModel } from '../src/model/ops/factory';

describe('ELK extension layout API', () => {
  beforeEach(() => {
    localStorage.clear();
    replaceModel(createEmptyModel('ELK Test'), null);
  });

  it('lays out the whole active view when fewer than two nodes are selected', async () => {
    const viewId = addView('Main');
    const a = addElement('BusinessActor', 'A');
    const b = addElement('BusinessRole', 'B');
    const n1 = addElementNodeToView(viewId, a, viewId, { x: 0, y: 0, width: 120, height: 55 }, false);
    const n2 = addElementNodeToView(viewId, b, viewId, { x: 0, y: 0, width: 120, height: 55 }, false);
    openView(viewId);
    setSelection('view', [n1]);

    const result = await createAppApi('local.elk').layout.elk({ direction: 'right' });

    const nodes = useStore.getState().model!.nodes;
    expect(result.scope).toBe('view');
    expect(result.nodeCount).toBe(2);
    expect(nodes[n1].bounds.x).not.toBe(nodes[n2].bounds.x);
  });

  it('uses selected root nodes and preserves unrelated nodes', async () => {
    const viewId = addView('Main');
    const a = addElement('BusinessActor', 'A');
    const b = addElement('BusinessRole', 'B');
    const c = addElement('BusinessObject', 'C');
    const n1 = addElementNodeToView(viewId, a, viewId, { x: 0, y: 0, width: 120, height: 55 }, false);
    const n2 = addElementNodeToView(viewId, b, viewId, { x: 0, y: 0, width: 120, height: 55 }, false);
    const n3 = addElementNodeToView(viewId, c, viewId, { x: 400, y: 300, width: 120, height: 55 }, false);
    openView(viewId);
    setSelection('view', [n1, n2]);

    const result = await createAppApi('local.elk').layout.elk({ direction: 'down' });

    const nodes = useStore.getState().model!.nodes;
    expect(result.scope).toBe('selection');
    expect(result.nodeCount).toBe(2);
    expect(nodes[n3].bounds).toEqual({ x: 400, y: 300, width: 120, height: 55 });
  });

  it('preserves connection bends when edge routing is preserve', async () => {
    const viewId = addView('Main');
    const a = addElement('BusinessActor', 'A');
    const b = addElement('BusinessRole', 'B');
    const rel = addRelationship('AssignmentRelationship', '', a, b)!;
    const n1 = addElementNodeToView(viewId, a, viewId, { x: 0, y: 0, width: 120, height: 55 }, false);
    const n2 = addElementNodeToView(viewId, b, viewId, { x: 0, y: 120, width: 120, height: 55 }, false);
    const conn = addRelationshipToView(viewId, rel, n1, n2)!;
    useStore.getState().model!.connections[conn].bendpoints = [{ startX: 10, startY: 20, endX: -10, endY: -20 }];
    openView(viewId);

    await createAppApi('local.elk').layout.elk({ scope: 'view', edgeRouting: 'preserve' });

    expect(useStore.getState().model!.connections[conn].bendpoints).toEqual([
      { startX: 10, startY: 20, endX: -10, endY: -20 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/extensions-elk-layout.test.ts`

Expected: FAIL because `createAppApi(...).layout` is not defined.

### Task 2: Host ELK Layout Helper

**Files:**
- Create: `src/extensions/layout/elk.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add `elkjs` dependency**

Run: `npm install elkjs@0.11.1`

- [ ] **Step 2: Implement focused helper**

Create `src/extensions/layout/elk.ts` with:

```ts
import ELK from 'elkjs/lib/elk.bundled.js';
import type { JConnection, JPoint, JView, JVisual } from '../../scripting/jarchi';

export interface ElkLayoutRequest {
  view: JView;
  selectedVisuals?: JVisual[];
  scope?: 'selection-or-view' | 'view' | 'selection';
  direction?: 'right' | 'down' | 'left' | 'up';
  nodeSpacing?: number;
  layerSpacing?: number;
  edgeRouting?: 'preserve' | 'orthogonal' | 'splines';
  recursive?: false;
}

export interface ElkLayoutResult {
  scope: 'selection' | 'view';
  nodeCount: number;
  connectionCount: number;
  routedConnectionCount: number;
  elapsedMs: number;
}
```

Then implement `runElkLayout(request)` using `view.nodes()`, `view.connections()`, `visual.absoluteBounds()`, and `view.layout(...)`.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run: `npm test -- tests/extensions-elk-layout.test.ts`

Expected: PASS.

### Task 3: Extension App API

**Files:**
- Modify: `src/extensions/app-api.ts`
- Modify: `src/scripting/jarchi-dts.ts`
- Test: `tests/extensions-elk-layout.test.ts`

- [ ] **Step 1: Expose `app.layout.elk(...)`**

Add a `layout` object to the app API that resolves the active view, reads selection visuals, and calls `runElkLayout(...)`.

- [ ] **Step 2: Add declarations**

Add `ElkLayoutRequest`, `ElkLayoutResult`, and `app.layout.elk(...)` to `src/scripting/jarchi-dts.ts`.

- [ ] **Step 3: Re-run focused tests**

Run: `npm test -- tests/extensions-elk-layout.test.ts tests/extensions.test.ts`

Expected: PASS.

### Task 4: ELK Extension Package

**Files:**
- Create: `extensions/elk-layout/manifest.json`
- Create: `extensions/elk-layout/main.js`
- Create: `extensions/elk-layout/README.md`
- Create: `extensions/elk-layout/data/defaults.json`
- Modify: `extensions/README.md`
- Modify: `tests/extension-examples.test.ts`

- [ ] **Step 1: Add package manifest**

Create an extension package with ID `local.elk-layout`, commands `local.elk-layout.apply` and `local.elk-layout.open`, an `extensions.menu` item, view and selection context menu items, and panel `local.elk-layout.panel`.

- [ ] **Step 2: Add panel and command implementation**

Implement panel controls for direction, node spacing, layer spacing, edge routing, apply, and reset defaults. Store preferences through `app.storage`.

- [ ] **Step 3: Register package in example tests/docs**

Add `elk-layout` to `examplePackages` in `tests/extension-examples.test.ts` and to the list in `extensions/README.md`.

- [ ] **Step 4: Run package tests**

Run: `npm test -- tests/extension-examples.test.ts tests/extension-packages.test.ts`

Expected: PASS.

### Task 5: Verification And Commit

**Files:**
- Test all changed files

- [ ] **Step 1: Run full verification**

Run:

```bash
npm test
npm run typecheck
npm run build
node extensions/build-archives.mjs
git diff --check
```

Expected: all commands pass.

- [ ] **Step 2: Commit implementation**

Run:

```bash
git add package.json package-lock.json src tests extensions docs/superpowers/plans/2026-07-03-elk-layout-extension.md
git commit -m "Add ELK layout extension"
```
