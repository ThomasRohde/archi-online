import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArchimate } from '../src/model/io/archimate-xml';
import { computeVisibleTreeItems, treeItemLabel } from '../src/ui/tree-filter';

const archisurance = readFileSync(join(__dirname, 'fixtures', 'Archisurance.archimate'), 'utf8');
const model = parseArchimate(archisurance);

function cssBlock(css: string, selector: string): string {
  const match = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 's')
    .exec(css);
  expect(match, `Expected CSS block for "${selector}"`).toBeTruthy();
  return match![1];
}

describe('computeVisibleTreeItems', () => {
  it('is inactive (null) with no text and no type filter', () => {
    expect(computeVisibleTreeItems(model, '', 'all')).toBeNull();
    expect(computeVisibleTreeItems(model, '   ', 'all')).toBeNull();
  });

  it('matches element names case-insensitively', () => {
    const claim = Object.values(model.elements).find((e) => e.name === 'Damage Claim')!;
    const visible = computeVisibleTreeItems(model, 'damage claim', 'all')!;
    expect(visible.has(claim.id)).toBe(true);
  });

  it('includes all ancestor folders of a match so it is reachable', () => {
    const claim = Object.values(model.elements).find((e) => e.name === 'Damage Claim')!;
    const visible = computeVisibleTreeItems(model, 'Damage Claim', 'all')!;
    let folderId: string | null = claim.folderId;
    while (folderId) {
      expect(visible.has(folderId)).toBe(true);
      folderId = model.folders[folderId]?.parentId ?? null;
    }
  });

  it('excludes non-matching items', () => {
    const visible = computeVisibleTreeItems(model, 'Damage Claim', 'all')!;
    const other = Object.values(model.elements).find(
      (e) => e.name && !e.name.toLowerCase().includes('damage claim'),
    )!;
    expect(visible.has(other.id)).toBe(false);
  });

  it('restricts to a category', () => {
    const visible = computeVisibleTreeItems(model, '', 'views')!;
    for (const view of Object.values(model.views)) expect(visible.has(view.id)).toBe(true);
    for (const el of Object.values(model.elements)) expect(visible.has(el.id)).toBe(false);
  });

  it('restricts to a concrete element type', () => {
    const visible = computeVisibleTreeItems(model, '', 'BusinessObject')!;
    const objects = Object.values(model.elements).filter((e) => e.type === 'BusinessObject');
    expect(objects.length).toBeGreaterThan(0);
    for (const el of objects) expect(visible.has(el.id)).toBe(true);
    const actor = Object.values(model.elements).find((e) => e.type === 'BusinessActor')!;
    expect(visible.has(actor.id)).toBe(false);
  });

  it('matches relationships by their displayed label (type + endpoints)', () => {
    const rel = Object.values(model.relationships).find((r) => r.name === '')!;
    const label = treeItemLabel(model, rel.id);
    const visible = computeVisibleTreeItems(model, label.slice(0, 12), 'all')!;
    expect(visible.has(rel.id)).toBe(true);
  });

  it('matches folders by name when searching text', () => {
    const business = Object.values(model.folders).find((f) => f.name === 'Business')!;
    const visible = computeVisibleTreeItems(model, 'business', 'all')!;
    expect(visible.has(business.id)).toBe(true);
  });

  it('returns an empty set (not null) when nothing matches', () => {
    const visible = computeVisibleTreeItems(model, 'zzz-no-such-thing-zzz', 'all')!;
    expect(visible).not.toBeNull();
    expect(visible.size).toBe(0);
  });
});

describe('model tree filter layout', () => {
  it('places the type dropdown below the search box with enough width for long labels', () => {
    const css = readFileSync('src/styles.css', 'utf8');

    expect(cssBlock(css, '.tree-filter')).toMatch(/display:\s*grid;/);
    expect(cssBlock(css, '.tree-filter-input')).toMatch(/grid-column:\s*1\s*\/\s*-1;/);
    expect(cssBlock(css, '.tree-filter-type')).toMatch(/width:\s*100%;/);
    expect(cssBlock(css, '.tree-filter-type')).toMatch(/max-width:\s*none;/);
  });
});
