// @ts-expect-error jsdom is an existing transitive dev dependency without bundled declarations.
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { REPORT_CSS, REPORT_HTML, REPORT_JS } from '../src/model/report/assets';
import type { StaticReportData } from '../src/model/report/types';

function shellFixture(): StaticReportData {
  return {
    schemaVersion: 1,
    productVersion: '1.5.0',
    model: {
      id: 'model',
      kind: 'model',
      name: 'Architecture Fieldbook',
      documentation: 'A navigable stakeholder model.',
      properties: [{ key: 'Owner', value: 'Enterprise Architecture' }],
      rootFolderIds: ['root'],
      counts: { folders: 2, elements: 2, relationships: 1, views: 1 },
    },
    folders: [
      {
        id: 'root', kind: 'folder', name: 'Business', documentation: '', properties: [],
        parentId: null, folderIds: ['nested'], itemIds: ['actor', 'service', 'relationship'],
      },
      {
        id: 'nested', kind: 'folder', name: 'Published Views', documentation: '', properties: [],
        parentId: 'root', folderIds: [], itemIds: ['view'],
      },
    ],
    elements: [
      {
        id: 'actor', kind: 'element', name: '<img src=x onerror="window.pwned=true">',
        documentation: 'Primary stakeholder', properties: [{ key: 'Owner', value: 'Architecture' }],
        typeLabel: 'Business Actor', specialization: 'Customer', folderId: 'root',
      },
      {
        id: 'service', kind: 'element', name: 'Claims Service', documentation: 'Customer support',
        properties: [], typeLabel: 'Business Service', folderId: 'root',
      },
    ],
    relationships: [
      {
        id: 'relationship', kind: 'relationship', name: 'Uses', documentation: 'Named route',
        properties: [], typeLabel: 'Serving', folderId: 'root', sourceId: 'actor', targetId: 'service',
      },
    ],
    views: [
      {
        id: 'view', kind: 'view', name: 'Customer Journey', documentation: 'Published overview',
        properties: [{ key: 'Audience', value: 'Leadership' }], folderId: 'nested',
        viewpoint: 'Layered', svgPath: 'views/view-0001.svg',
      },
    ],
    analysis: {
      actor: { relationshipIds: ['relationship'], viewIds: ['view'] },
      service: { relationshipIds: ['relationship'], viewIds: ['view'] },
      relationship: { relationshipIds: [], viewIds: [] },
    },
    initialViewId: 'view',
  };
}

function bootReport(data?: StaticReportData, hash = '') {
  const dom = new JSDOM(REPORT_HTML, {
    runScripts: 'outside-only',
    url: `https://report.example/${hash}`,
  });
  const reportWindow = dom.window as unknown as Window & {
    __ARCHI_STATIC_REPORT__?: StaticReportData;
  };
  reportWindow.__ARCHI_STATIC_REPORT__ = data;
  (reportWindow as unknown as { eval: (source: string) => unknown }).eval(REPORT_JS);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return dom;
}

describe('static report shell', () => {
  it('boots the initial view into an accessible three-region shell', () => {
    const dom = bootReport(shellFixture());
    const { document } = dom.window;

    expect(document.querySelector('[data-report-shell]')).not.toBeNull();
    expect(document.querySelector('[data-report-title]')?.textContent)
      .toBe('Architecture Fieldbook');
    expect(document.querySelector('[data-active-view]')?.getAttribute('src'))
      .toBe('views/view-0001.svg');
    expect(document.querySelector('[data-content-title]')?.textContent)
      .toBe('Customer Journey');
    expect(document.querySelector('[data-detail-name]')?.textContent)
      .toBe('Customer Journey');
    expect(document.querySelector('nav[aria-label="Model navigation"]')).not.toBeNull();
    expect(document.querySelector('main')).not.toBeNull();
    expect(document.querySelector('aside[aria-label="Object details"]')).not.toBeNull();
  });

  it('resolves object hash routes and updates when the hash changes', () => {
    const dom = bootReport(shellFixture(), '#object/actor');
    const { document } = dom.window;

    expect(document.querySelector('[data-detail-name]')?.textContent)
      .toBe('<img src=x onerror="window.pwned=true">');
    expect(document.querySelector('[data-active-view]')).toBeNull();

    dom.window.location.hash = '#view/view';
    dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
    expect(document.querySelector('[data-active-view]')?.getAttribute('src'))
      .toBe('views/view-0001.svg');
  });

  it('does not rebuild the selected route when its hashchange has already rendered', () => {
    const dom = bootReport(shellFixture());
    const { document } = dom.window;
    document.querySelector<HTMLButtonElement>('[data-tree-target="actor"]')!.click();
    const renderedSummary = document.querySelector('.report-summary-copy');

    dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));

    expect(document.querySelector('.report-summary-copy')).toBe(renderedSummary);
  });

  it('falls back to the model summary when the model has no views', () => {
    const data = shellFixture();
    data.views = [];
    delete data.initialViewId;

    const dom = bootReport(data);

    expect(dom.window.document.querySelector('[data-detail-name]')?.textContent)
      .toBe('Architecture Fieldbook');
    expect(dom.window.document.querySelector('[data-active-view]')).toBeNull();
  });

  it('recovers from an unknown target and reports that fallback', () => {
    const dom = bootReport(shellFixture(), '#object/missing');

    expect(dom.window.document.querySelector('[data-active-view]')).not.toBeNull();
    expect(dom.window.document.querySelector('[data-report-status]')?.textContent)
      .toContain('Target not found');
  });

  it('shows readable errors for missing data and unsupported schemas', () => {
    const missing = bootReport();
    expect(missing.window.document.querySelector('[data-report-error]')?.textContent)
      .toContain('Report data is unavailable');

    const unsupportedData = shellFixture();
    (unsupportedData as { schemaVersion: number }).schemaVersion = 2;
    const unsupported = bootReport(unsupportedData);
    expect(unsupported.window.document.querySelector('[data-report-error]')?.textContent)
      .toContain('not supported');
  });

  it('shows a readable corruption error for malformed schema-v1 data', () => {
    const missingCatalog = shellFixture() as unknown as { folders?: unknown };
    delete missingCatalog.folders;
    const badProperties = shellFixture() as StaticReportData;
    (badProperties.elements[0] as unknown as { properties: unknown }).properties = null;
    const badCounts = shellFixture() as StaticReportData;
    (badCounts.model as unknown as { counts: unknown }).counts = { views: 'one' };

    for (const malformed of [missingCatalog, badProperties, badCounts]) {
      const dom = bootReport(malformed as StaticReportData);
      expect(dom.window.document.querySelector('[data-report-error]')?.textContent)
        .toContain('Report data is corrupt');
    }
  });

  it('renders the nested model tree in source order and navigates from it', () => {
    const dom = bootReport(shellFixture());
    const { document } = dom.window;
    const root = document.querySelector('[data-tree-id="root"]')!;
    const nested = document.querySelector('[data-tree-id="nested"]')!;

    expect(root.compareDocumentPosition(nested) & dom.window.Node.DOCUMENT_POSITION_CONTAINED_BY)
      .not.toBe(0);
    expect([...nested.querySelectorAll<HTMLButtonElement>('[data-tree-target]')]
      .map((button) => button.textContent)).toContain('Customer Journey');

    const actor = document.querySelector<HTMLButtonElement>('[data-tree-target="actor"]')!;
    actor.click();
    expect(dom.window.location.hash).toBe('#object/actor');
    expect(document.querySelector('[data-detail-name]')?.textContent)
      .toBe('<img src=x onerror="window.pwned=true">');
  });

  it('searches approved fields literally and groups deterministic results', () => {
    const dom = bootReport(shellFixture());
    const { document } = dom.window;
    const search = document.querySelector<HTMLInputElement>('input[aria-label="Search report"]')!;

    search.value = 'leadership';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(document.querySelector('[data-search-results]')?.textContent).toContain('Views');
    expect(document.querySelector('[data-search-results]')?.textContent).toContain('Customer Journey');

    search.value = 'customer';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    const results = document.querySelector('[data-search-results]')!;
    expect(results.textContent).toContain('Elements');
    expect(results.textContent).toContain('<img src=x onerror="window.pwned=true">');
    expect(results.textContent).toContain('Claims Service');

    search.value = '[literal';
    expect(() => search.dispatchEvent(new dom.window.Event('input', { bubbles: true })))
      .not.toThrow();
    expect(document.querySelector('[data-search-results]')?.textContent).toContain('No matches');

    search.value = '';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(document.querySelector('[data-search-results]')).toBeNull();
    expect(document.querySelector('[data-tree-id="root"]')).not.toBeNull();
  });

  it('orders search results by locale-independent code points', () => {
    const data = shellFixture();
    data.elements.push(
      {
        id: 'zulu', kind: 'element', name: 'Zulu', documentation: 'ordering marker',
        properties: [], typeLabel: 'Business Actor', folderId: 'root',
      },
      {
        id: 'accented', kind: 'element', name: 'Álpha', documentation: 'ordering marker',
        properties: [], typeLabel: 'Business Actor', folderId: 'root',
      },
    );
    data.analysis.zulu = { relationshipIds: [], viewIds: [] };
    data.analysis.accented = { relationshipIds: [], viewIds: [] };
    const dom = bootReport(data);
    const { document } = dom.window;
    const search = document.querySelector<HTMLInputElement>('input[aria-label="Search report"]')!;

    search.value = 'ordering marker';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    expect([...document.querySelectorAll<HTMLButtonElement>('[data-search-results] button')]
      .map((button) => button.textContent)).toEqual(['Zulu', 'Álpha']);
  });

  it('links relationship endpoints and Phase 3 analysis targets', () => {
    const relationshipDom = bootReport(shellFixture(), '#object/relationship');
    const relationshipDocument = relationshipDom.window.document;
    expect(relationshipDocument.querySelector('[data-endpoint="source"]')?.textContent)
      .toContain('<img src=x onerror="window.pwned=true">');
    expect(relationshipDocument.querySelector('[data-endpoint="target"]')?.textContent)
      .toContain('Claims Service');
    (relationshipDocument.querySelector('[data-endpoint="target"]') as HTMLButtonElement).click();
    expect(relationshipDom.window.location.hash).toBe('#object/service');

    const actorDom = bootReport(shellFixture(), '#object/actor');
    const actorDocument = actorDom.window.document;
    expect(actorDocument.querySelector('[data-analysis-relationship="relationship"]')?.textContent)
      .toContain('Uses');
    expect(actorDocument.querySelector('[data-analysis-view="view"]')?.textContent)
      .toContain('Customer Journey');
    (actorDocument.querySelector('[data-analysis-view="view"]') as HTMLButtonElement).click();
    expect(actorDom.window.location.hash).toBe('#view/view');
  });

  it('renders model-controlled markup-shaped strings only as text', () => {
    const dom = bootReport(shellFixture(), '#object/actor');
    const { document } = dom.window;

    expect(document.querySelector('[data-detail-name]')?.textContent)
      .toBe('<img src=x onerror="window.pwned=true">');
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect((dom.window as unknown as { pwned?: boolean }).pwned).toBeUndefined();
  });

  it('provides clamped Zoom, Actual size, and Fit controls for views', () => {
    const dom = bootReport(shellFixture());
    const { document } = dom.window;
    const zoomIn = document.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')!;
    const zoomOut = document.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]')!;
    const actual = document.querySelector<HTMLButtonElement>('button[aria-label="Actual size"]')!;
    const fit = document.querySelector<HTMLButtonElement>('button[aria-label="Fit view"]')!;

    expect(actual.textContent).toBe('100%');
    expect(document.querySelector('[data-view-viewport]')?.classList).toContain('is-fit');
    for (let index = 0; index < 20; index += 1) zoomIn.click();
    expect(actual.textContent).toBe('400%');
    for (let index = 0; index < 40; index += 1) zoomOut.click();
    expect(actual.textContent).toBe('20%');
    actual.click();
    expect(actual.textContent).toBe('100%');
    fit.click();
    expect(document.querySelector('[data-view-viewport]')?.classList).toContain('is-fit');
  });

  it('returns to Fit for a newly selected view and keeps navigation usable after an SVG error', () => {
    const dom = bootReport(shellFixture());
    const { document } = dom.window;
    document.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')!.click();
    dom.window.location.hash = '#object/actor';
    dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
    dom.window.location.hash = '#view/view';
    dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));

    const image = document.querySelector<HTMLImageElement>('[data-active-view]')!;
    expect(document.querySelector('[data-view-viewport]')?.classList).toContain('is-fit');
    image.dispatchEvent(new dom.window.Event('error'));
    expect(document.querySelector('[data-view-error]')?.textContent)
      .toContain('could not be loaded');
    expect(document.querySelector('nav[aria-label="Model navigation"]')).not.toBeNull();
  });

  it('ships the approved fieldbook layout, locator rail, focus, and responsive contracts', () => {
    expect(REPORT_CSS).toContain('#172433');
    expect(REPORT_CSS).toContain('#1f6feb');
    expect(REPORT_CSS).toContain('grid-template-columns');
    expect(REPORT_CSS).toContain('.report-tree-children');
    expect(REPORT_CSS).toContain('[aria-current="page"]');
    expect(REPORT_CSS).toContain(':focus-visible');
    expect(REPORT_CSS).toContain('@media (max-width: 900px)');
    expect(REPORT_CSS).toContain('prefers-reduced-motion');
  });

  it('keeps the view controls above the rendered SVG for pointer interaction', () => {
    expect(REPORT_CSS).toMatch(/\.report-view-hud\s*{[^}]*position:\s*absolute;/s);
    expect(REPORT_CSS).toMatch(/\.report-view-hud\s*{[^}]*z-index:\s*[1-9]\d*;/s);
  });
});
