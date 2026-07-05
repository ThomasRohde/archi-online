# Levelup Phase 3 Align And Match Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-selection canvas Align and Match Size commands from `LEVELUP.md` Phase 3.

**Architecture:** Keep all diagram geometry mutations in a new model op module, `src/model/ops/alignment.ts`, wrapped by `transact()` so undo/redo and read-only behavior stay consistent. The op computes in absolute view coordinates via `absoluteBounds()`, converts results back to each node's parent-relative bounds, and ignores selected descendants when their ancestor is also selected.

**Tech Stack:** Vite, React 18, TypeScript, Zustand store, Immer transactions, Vitest/jsdom.

---

## File Structure

- Create: `src/model/ops/alignment.ts`
  - Exports `AlignMode`, `MatchMode`, `alignNodes()`, `matchSize()`, and `alignableNodeIds()`.
  - Keeps helper functions local for union boxes, parent offsets, relative coordinate conversion, and bounds equality.
- Modify: `src/model/ops.ts`
  - Re-export `./ops/alignment`.
- Modify: `src/canvas/view-editor/contextMenu.ts`
  - Adds Align and Match Size context-menu commands for view multi-selections with at least two alignable node roots.
- Create: `tests/alignment.test.ts`
  - Covers exact geometry, nested nodes, ignored connections, and no-op undo behavior.

## Phase 3 Checklist From LEVELUP.md

- [ ] Create `src/model/ops/alignment.ts`.
- [ ] Re-export alignment ops from `src/model/ops.ts`.
- [ ] Filter ids to diagram nodes and drop any selected node whose ancestor is also selected.
- [ ] Align in absolute view coordinates against the selection union box.
- [ ] Match size to the largest selected width and/or height, preserving top-left corners.
- [ ] Convert absolute target bounds back to each node's parent-relative bounds before writing.
- [ ] Keep each command to one undo step and make single-root calls no-op without undo entries.
- [ ] Add Align and Match Size items to the view-object context menu.
- [ ] Keep read-only mode inert by relying on `EditableViewEditor` routing and `transact()`'s read-only guard.
- [ ] Add `tests/alignment.test.ts`.
- [ ] Run `npx vitest run tests/alignment.test.ts`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Browser-drive the app against the Archisurance fixture and save before/after screenshots.
- [ ] Commit with message `feat: align and match size` after the gate is green.

## Task 1: Alignment Ops

**Files:**
- Create: `src/model/ops/alignment.ts`
- Modify: `src/model/ops.ts`
- Test: `tests/alignment.test.ts`

- [ ] **Step 1: Write the failing op tests**

Create `tests/alignment.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addConnectionToView,
  addElement,
  addElementNodeToView,
  addGroupToView,
  addNoteToView,
  addRefNodeToView,
  addRelationship,
  addView,
  alignNodes,
  createEmptyModel,
  matchSize,
} from '../src/model/ops';
import { replaceModel, undo, useStore } from '../src/model/store';
import type { Bounds } from '../src/model/types';

function model() {
  return useStore.getState().model!;
}

function bounds(id: string): Bounds {
  return model().nodes[id].bounds;
}

function setupThreeNodes() {
  replaceModel(createEmptyModel('Alignment Test'), null);
  const viewId = addView('View');
  const a = addElement('BusinessActor', 'A');
  const b = addElement('BusinessRole', 'B');
  const c = addElement('BusinessProcess', 'C');
  const na = addElementNodeToView(viewId, a, viewId, { x: 10, y: 20, width: 100, height: 50 }, false);
  const nb = addElementNodeToView(viewId, b, viewId, { x: 40, y: 90, width: 60, height: 80 }, false);
  const nc = addElementNodeToView(viewId, c, viewId, { x: 200, y: 40, width: 80, height: 40 }, false);
  return { na, nb, nc };
}

beforeEach(() => {
  replaceModel(createEmptyModel('Alignment Test'), null);
});

describe('alignment ops', () => {
  it('aligns nodes to each edge and center of the absolute union box', () => {
    for (const [mode, expected] of [
      ['left', [{ x: 10 }, { x: 10 }, { x: 10 }]],
      ['center', [{ x: 95 }, { x: 115 }, { x: 105 }]],
      ['right', [{ x: 180 }, { x: 220 }, { x: 200 }]],
      ['top', [{ y: 20 }, { y: 20 }, { y: 20 }]],
      ['middle', [{ y: 70 }, { y: 55 }, { y: 75 }]],
      ['bottom', [{ y: 120 }, { y: 90 }, { y: 130 }]],
    ] as const) {
      const { na, nb, nc } = setupThreeNodes();
      const undoDepth = useStore.getState().undoStack.length;

      alignNodes([na, nb, nc], mode);

      expect(useStore.getState().undoStack).toHaveLength(undoDepth + 1);
      expect(useStore.getState().undoStack.at(-1)?.label).toBe('Align');
      expect(bounds(na)).toMatchObject(expected[0]);
      expect(bounds(nb)).toMatchObject(expected[1]);
      expect(bounds(nc)).toMatchObject(expected[2]);
      undo();
      expect(bounds(na)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
      expect(bounds(nb)).toEqual({ x: 40, y: 90, width: 60, height: 80 });
      expect(bounds(nc)).toEqual({ x: 200, y: 40, width: 80, height: 40 });
    }
  });

  it('matches width, height, and both to the largest selected dimensions', () => {
    for (const [mode, expected] of [
      ['width', [{ width: 100, height: 50 }, { width: 100, height: 80 }, { width: 100, height: 40 }]],
      ['height', [{ width: 100, height: 80 }, { width: 60, height: 80 }, { width: 80, height: 80 }]],
      ['both', [{ width: 100, height: 80 }, { width: 100, height: 80 }, { width: 100, height: 80 }]],
    ] as const) {
      const { na, nb, nc } = setupThreeNodes();
      const undoDepth = useStore.getState().undoStack.length;

      matchSize([na, nb, nc], mode);

      expect(useStore.getState().undoStack).toHaveLength(undoDepth + 1);
      expect(useStore.getState().undoStack.at(-1)?.label).toBe('Match Size');
      expect(bounds(na)).toMatchObject({ x: 10, y: 20, ...expected[0] });
      expect(bounds(nb)).toMatchObject({ x: 40, y: 90, ...expected[1] });
      expect(bounds(nc)).toMatchObject({ x: 200, y: 40, ...expected[2] });
      undo();
      expect(bounds(na)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
      expect(bounds(nb)).toEqual({ x: 40, y: 90, width: 60, height: 80 });
      expect(bounds(nc)).toEqual({ x: 200, y: 40, width: 80, height: 40 });
    }
  });

  it('skips a nested child when its parent is also selected', () => {
    const viewId = addView('View');
    const actor = addElement('BusinessActor', 'Actor');
    const role = addElement('BusinessRole', 'Role');
    const parent = addGroupToView(viewId, viewId, { x: 100, y: 100, width: 300, height: 200 });
    const child = addElementNodeToView(viewId, actor, parent, { x: 40, y: 30, width: 80, height: 40 }, false);
    const sibling = addElementNodeToView(viewId, role, viewId, { x: 10, y: 20, width: 120, height: 55 }, false);

    alignNodes([parent, child, sibling], 'left');

    expect(bounds(parent)).toEqual({ x: 10, y: 100, width: 300, height: 200 });
    expect(bounds(child)).toEqual({ x: 40, y: 30, width: 80, height: 40 });
    expect(bounds(sibling)).toEqual({ x: 10, y: 20, width: 120, height: 55 });
  });

  it('aligns a nested node through absolute coordinates when the parent is not selected', () => {
    const viewId = addView('View');
    const actor = addElement('BusinessActor', 'Actor');
    const role = addElement('BusinessRole', 'Role');
    const parent = addGroupToView(viewId, viewId, { x: 100, y: 50, width: 300, height: 200 });
    const child = addElementNodeToView(viewId, actor, parent, { x: 30, y: 20, width: 80, height: 40 }, false);
    const top = addElementNodeToView(viewId, role, viewId, { x: 10, y: 200, width: 40, height: 55 }, false);

    alignNodes([child, top], 'left');

    expect(bounds(child)).toEqual({ x: -90, y: 20, width: 80, height: 40 });
    expect(bounds(top)).toEqual({ x: 10, y: 200, width: 40, height: 55 });
  });

  it('accepts element, group, note, and ref nodes', () => {
    const viewId = addView('View');
    const refViewId = addView('Referenced View');
    const actor = addElement('BusinessActor', 'Actor');
    const elementNode = addElementNodeToView(viewId, actor, viewId, { x: 80, y: 10, width: 120, height: 55 }, false);
    const group = addGroupToView(viewId, viewId, { x: 40, y: 100, width: 160, height: 90 });
    const note = addNoteToView(viewId, viewId, { x: 10, y: 220, width: 140, height: 70 });
    const ref = addRefNodeToView(viewId, refViewId, viewId, { x: 200, y: 320, width: 120, height: 55 });

    alignNodes([elementNode, group, note, ref], 'left');

    expect(bounds(elementNode).x).toBe(10);
    expect(bounds(group).x).toBe(10);
    expect(bounds(note).x).toBe(10);
    expect(bounds(ref).x).toBe(10);
  });

  it('ignores connections and leaves single-node calls without an undo entry', () => {
    const viewId = addView('View');
    const process = addElement('BusinessProcess', 'Process');
    const object = addElement('BusinessObject', 'Object');
    const relationship = addRelationship('AccessRelationship', process, object, 'Reads')!;
    const processNode = addElementNodeToView(viewId, process, viewId, { x: 10, y: 10, width: 120, height: 55 }, false);
    const objectNode = addElementNodeToView(viewId, object, viewId, { x: 240, y: 10, width: 120, height: 55 }, false);
    const connection = addConnectionToView(viewId, relationship, processNode, objectNode);
    const undoDepth = useStore.getState().undoStack.length;

    alignNodes([processNode, connection], 'left');
    matchSize([connection, objectNode], 'both');

    expect(bounds(processNode)).toEqual({ x: 10, y: 10, width: 120, height: 55 });
    expect(bounds(objectNode)).toEqual({ x: 240, y: 10, width: 120, height: 55 });
    expect(useStore.getState().undoStack).toHaveLength(undoDepth);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npx vitest run tests/alignment.test.ts
```

Expected: fail at import time because `alignNodes` and `matchSize` are not exported yet.

- [ ] **Step 3: Implement `src/model/ops/alignment.ts`**

Create `src/model/ops/alignment.ts`:

```ts
import { transact, useStore } from '../store';
import { absoluteBounds, type Bounds, type ModelState } from '../types';

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type MatchMode = 'width' | 'height' | 'both';

interface BoundsUpdate {
  id: string;
  bounds: Bounds;
}

export function alignableNodeIds(state: ModelState, ids: string[]): string[] {
  const selected = new Set(ids.filter((id) => Boolean(state.nodes[id])));
  const seen = new Set<string>();
  const roots: string[] = [];

  for (const id of ids) {
    if (seen.has(id) || !state.nodes[id]) continue;
    seen.add(id);
    let parentId = state.nodes[id].parentId;
    let hasSelectedAncestor = false;
    while (parentId && state.nodes[parentId]) {
      if (selected.has(parentId)) {
        hasSelectedAncestor = true;
        break;
      }
      parentId = state.nodes[parentId].parentId;
    }
    if (!hasSelectedAncestor) roots.push(id);
  }

  return roots;
}

function unionBounds(bounds: Bounds[]): Bounds {
  const left = Math.min(...bounds.map((b) => b.x));
  const top = Math.min(...bounds.map((b) => b.y));
  const right = Math.max(...bounds.map((b) => b.x + b.width));
  const bottom = Math.max(...bounds.map((b) => b.y + b.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function parentOffset(state: ModelState, nodeId: string): Pick<Bounds, 'x' | 'y'> {
  const node = state.nodes[nodeId];
  if (!node || node.parentId === node.viewId || !state.nodes[node.parentId]) {
    return { x: 0, y: 0 };
  }
  const parentBounds = absoluteBounds(state, node.parentId);
  return { x: parentBounds.x, y: parentBounds.y };
}

function relativeBounds(state: ModelState, nodeId: string, bounds: Bounds): Bounds {
  const parent = parentOffset(state, nodeId);
  return {
    x: bounds.x - parent.x,
    y: bounds.y - parent.y,
    width: bounds.width,
    height: bounds.height,
  };
}

function sameBounds(a: Bounds, b: Bounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function applyBounds(label: string, updates: BoundsUpdate[]): void {
  transact(label, (draft) => {
    for (const update of updates) {
      const node = draft.nodes[update.id];
      if (node && !sameBounds(node.bounds, update.bounds)) {
        node.bounds = { ...update.bounds };
      }
    }
  });
}

export function alignNodes(ids: string[], mode: AlignMode): void {
  const model = useStore.getState().model;
  if (!model) return;
  const nodeIds = alignableNodeIds(model, ids);
  if (nodeIds.length < 2) return;

  const entries = nodeIds.map((id) => ({ id, abs: absoluteBounds(model, id) }));
  const box = unionBounds(entries.map((entry) => entry.abs));
  const centerX = box.x + box.width / 2;
  const middleY = box.y + box.height / 2;

  const updates = entries.map(({ id, abs }) => {
    const next = { ...abs };
    if (mode === 'left') next.x = box.x;
    if (mode === 'center') next.x = centerX - abs.width / 2;
    if (mode === 'right') next.x = box.x + box.width - abs.width;
    if (mode === 'top') next.y = box.y;
    if (mode === 'middle') next.y = middleY - abs.height / 2;
    if (mode === 'bottom') next.y = box.y + box.height - abs.height;
    return { id, bounds: relativeBounds(model, id, next) };
  });

  applyBounds('Align', updates);
}

export function matchSize(ids: string[], mode: MatchMode): void {
  const model = useStore.getState().model;
  if (!model) return;
  const nodeIds = alignableNodeIds(model, ids);
  if (nodeIds.length < 2) return;

  const entries = nodeIds.map((id) => ({ id, abs: absoluteBounds(model, id) }));
  const width = Math.max(...entries.map((entry) => entry.abs.width));
  const height = Math.max(...entries.map((entry) => entry.abs.height));
  const updates = entries.map(({ id, abs }) => ({
    id,
    bounds: relativeBounds(model, id, {
      ...abs,
      width: mode === 'height' ? abs.width : width,
      height: mode === 'width' ? abs.height : height,
    }),
  }));

  applyBounds('Match Size', updates);
}
```

- [ ] **Step 4: Re-export the op module**

Modify `src/model/ops.ts`:

```ts
export * from './ops/alignment';
export * from './ops/concepts';
export * from './ops/c4';
export * from './ops/csv-import';
export * from './ops/deletion';
export * from './ops/layout';
export * from './ops/movement';
export * from './ops/style';
export * from './ops/view';
```

- [ ] **Step 5: Run the focused op tests**

Run:

```powershell
npx vitest run tests/alignment.test.ts
```

Expected: pass.

## Task 2: Context Menu Wiring

**Files:**
- Modify: `src/canvas/view-editor/contextMenu.ts`

- [ ] **Step 1: Import the new commands**

Modify the existing import from `../../model/ops`:

```ts
import {
  addGroupToView,
  addNoteToView,
  alignableNodeIds,
  alignNodes,
  deleteItems,
  deleteViewObjects,
  matchSize,
  reorderNode,
  setConnectionBendpoints,
} from '../../model/ops';
```

- [ ] **Step 2: Add the Align submenu and Match Size items**

Inside `showViewObjectContextMenu`, after the existing Delete items and before extension menu items, add:

```ts
  const alignIds = alignableNodeIds(model, ids);
  if (alignIds.length >= 2) {
    items.push(SEPARATOR);
    items.push({
      label: 'Align',
      children: [
        { label: 'Align Left', onClick: () => alignNodes(alignIds, 'left') },
        { label: 'Align Center', onClick: () => alignNodes(alignIds, 'center') },
        { label: 'Align Right', onClick: () => alignNodes(alignIds, 'right') },
        { label: 'Align Top', onClick: () => alignNodes(alignIds, 'top') },
        { label: 'Align Middle', onClick: () => alignNodes(alignIds, 'middle') },
        { label: 'Align Bottom', onClick: () => alignNodes(alignIds, 'bottom') },
      ],
    });
    items.push(SEPARATOR);
    items.push({ label: 'Match Width', onClick: () => matchSize(alignIds, 'width') });
    items.push({ label: 'Match Height', onClick: () => matchSize(alignIds, 'height') });
    items.push({ label: 'Match Size', onClick: () => matchSize(alignIds, 'both') });
  }
```

Keep the commands in `showViewObjectContextMenu`; the app renders `ReadOnlyViewEditor` in read-only mode, so this mutation-oriented menu is not opened there. `transact()` is still the final guard if a command is somehow invoked while read-only.

- [ ] **Step 3: Run targeted tests after UI wiring**

Run:

```powershell
npx vitest run tests/alignment.test.ts tests/readonly.test.ts
```

Expected: pass.

## Task 3: Full Verification Gate

**Files:**
- No additional source files unless TypeScript or tests expose a required correction.

- [ ] **Step 1: Run all Vitest tests**

Run:

```powershell
npm test
```

Expected: all tests pass, including `tests/alignment.test.ts`.

- [ ] **Step 2: Run the production build**

Run:

```powershell
npm run build
```

Expected: `tsc -b` and Vite build complete without errors.

- [ ] **Step 3: Browser-drive the real app**

Run:

```powershell
npm run dev
```

Then open `http://localhost:5173` with playwright-cli and load the fixture through the existing dev hook:

```ts
const xml = await fs.promises.readFile('tests/fixtures/Archisurance.archimate', 'utf8');
await page.evaluate((source) => window.__archiLoadXml(source), xml);
```

Manual acceptance flow:

- Open a populated Archisurance view.
- Multi-select three element nodes with shift-click or a rubber-band selection.
- Take a before screenshot.
- Right-click the selection, choose `Align` -> `Align Top`.
- Confirm the three selected node tops now share the same y coordinate.
- Take an after screenshot.
- Press `Ctrl+Z`.
- Confirm all three nodes return to their original bounds in one undo step.

- [ ] **Step 4: Commit only Phase 3 changes**

Check status first:

```powershell
git status --short
```

Expected Phase 3 files:

```text
 M src/canvas/view-editor/contextMenu.ts
 M src/model/ops.ts
?? src/model/ops/alignment.ts
?? tests/alignment.test.ts
```

Do not stage unrelated untracked files such as `LEVELUP.md` unless the user explicitly asks for them.

Commit:

```powershell
git add src/model/ops/alignment.ts src/model/ops.ts src/canvas/view-editor/contextMenu.ts tests/alignment.test.ts
git commit -m "feat: align and match size"
```

## Implementation Notes

- `alignableNodeIds()` deliberately lives in `src/model/ops/alignment.ts` rather than importing `selectionRoots()` from `src/canvas/view-editor/bounds.ts`; `src/model/` must not depend on canvas code.
- `absoluteBounds()` is the source of truth for nested node geometry. Every write converts back to relative coordinates by subtracting the selected node parent's absolute offset.
- Connections are ignored by `alignableNodeIds()`, so mixed selections like `[nodeId, connectionId]` become no-op when only one root node remains.
- Match Size uses the largest selected width and height because this app has no primary selection concept.
- Assign bounds only when values differ so already-aligned selections do not create empty-looking undo entries.
- `LEVELUP.md` is currently untracked in this worktree; keep it out of the Phase 3 commit unless publication of the design doc is explicitly requested.

## Verification Summary To Report After Execution

- `npx vitest run tests/alignment.test.ts`
- `npm test`
- `npm run build`
- Browser acceptance: Archisurance multi-select, Align Top screenshot before/after, `Ctrl+Z` restores in one step.
