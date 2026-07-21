import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

const rootDir = join(import.meta.dirname, '..');
const canonicalOrigin = 'https://archi-online.com';
const slugOrigin = 'https://bitter-mill-c9qn.here.now';

function readProjectFile(path: string): string {
  return readFileSync(join(rootDir, path), 'utf8');
}

function parseHtml(path: string): Document {
  return new DOMParser().parseFromString(readProjectFile(path), 'text/html');
}

function metaContent(document: Document, selector: string): string | null {
  return document.querySelector<HTMLMetaElement>(selector)?.content ?? null;
}

function canonicalHref(document: Document): string[] {
  return Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]'))
    .map((link) => link.href);
}

function jsonLdGraphs(document: Document): Record<string, unknown>[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'))
    .flatMap((script) => {
      const value = JSON.parse(script.textContent ?? '') as Record<string, unknown>;
      const graph = value['@graph'];
      return Array.isArray(graph) ? graph as Record<string, unknown>[] : [value];
    });
}

function graphWithType(
  graphs: Record<string, unknown>[],
  type: string,
): Record<string, unknown> | undefined {
  return graphs.find((graph) => {
    const graphType = graph['@type'];
    return graphType === type || (Array.isArray(graphType) && graphType.includes(type));
  });
}

function expectSocialMetadata(
  document: Document,
  expected: { title: string; description: string; url: string },
): void {
  expect(document.title).toBe(expected.title);
  expect(metaContent(document, 'meta[name="description"]')).toBe(expected.description);
  expect(metaContent(document, 'meta[name="application-name"]')).toBe('Archi Online');
  expect(metaContent(document, 'meta[property="og:type"]')).toBe('website');
  expect(metaContent(document, 'meta[property="og:site_name"]')).toBe('Archi Online');
  expect(metaContent(document, 'meta[property="og:title"]')).toBe(expected.title);
  expect(metaContent(document, 'meta[property="og:description"]')).toBe(expected.description);
  expect(metaContent(document, 'meta[property="og:url"]')).toBe(expected.url);
  expect(metaContent(document, 'meta[property="og:image"]')).toBe(
    `${canonicalOrigin}/seo/archi-online-social.png`,
  );
  expect(metaContent(document, 'meta[property="og:image:width"]')).toBe('1200');
  expect(metaContent(document, 'meta[property="og:image:height"]')).toBe('630');
  expect(metaContent(document, 'meta[property="og:image:alt"]')).toContain('Archi Online');
  expect(metaContent(document, 'meta[name="twitter:card"]')).toBe('summary_large_image');
  expect(metaContent(document, 'meta[name="twitter:title"]')).toBe(expected.title);
  expect(metaContent(document, 'meta[name="twitter:description"]')).toBe(expected.description);
  expect(metaContent(document, 'meta[name="twitter:image"]')).toBe(
    `${canonicalOrigin}/seo/archi-online-social.png`,
  );
  expect(metaContent(document, 'meta[name="twitter:image:alt"]')).toContain('Archi Online');
}

describe('SEO metadata', () => {
  it('builds the product page as a dedicated Vite HTML entry', () => {
    const viteConfig = readProjectFile('vite.config.ts');

    expect(viteConfig).toContain("archimateModeler: fileURLToPath(new URL('./archimate-modeler/index.html', import.meta.url))");
    expect(existsSync(join(rootDir, 'src/seo/archimate-modeler.css'))).toBe(true);
  });

  it('runs SEO distribution verification as part of the production build', () => {
    const packageJson = JSON.parse(readProjectFile('package.json')) as {
      scripts: Record<string, string>;
    };

    expect(existsSync(join(rootDir, 'tools/verify-seo-distribution.mjs'))).toBe(true);
    expect(packageJson.scripts.build).toContain('node tools/verify-seo-distribution.mjs');
  });

  it('declares the custom domain as the canonical editor URL', () => {
    const document = parseHtml('index.html');
    const title = 'Archi Online | Browser-based ArchiMate Modeler';
    const description =
      'Model, validate, and script ArchiMate 3.2 in your browser with local-first storage and desktop-compatible .archimate files.';

    expect(canonicalHref(document)).toEqual([`${canonicalOrigin}/`]);
    expectSocialMetadata(document, { title, description, url: `${canonicalOrigin}/` });
    expect(readProjectFile('index.html')).not.toContain(slugOrigin);

    const website = graphWithType(jsonLdGraphs(document), 'WebSite');
    expect(website).toMatchObject({
      '@type': 'WebSite',
      name: 'Archi Online',
      url: `${canonicalOrigin}/`,
    });
  });

  it('ships a crawlable product page with unique metadata and one clear heading', () => {
    const document = parseHtml('archimate-modeler/index.html');
    const title = 'Online ArchiMate Modeler | Archi Online';
    const description =
      'Create, edit, validate, and script ArchiMate 3.2 models in your browser. Work locally with desktop-compatible .archimate files.';

    expect(canonicalHref(document)).toEqual([`${canonicalOrigin}/archimate-modeler/`]);
    expectSocialMetadata(document, {
      title,
      description,
      url: `${canonicalOrigin}/archimate-modeler/`,
    });
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('h1')?.textContent?.trim()).toBe(
      'Professional ArchiMate modeling, directly in your browser',
    );
    expect(readProjectFile('archimate-modeler/index.html')).not.toContain(slugOrigin);
  });

  it('uses visible product claims for WebApplication and FAQ structured data', () => {
    const document = parseHtml('archimate-modeler/index.html');
    const visibleText = document.body.textContent?.replace(/\s+/g, ' ') ?? '';
    const graphs = jsonLdGraphs(document);
    const application = graphWithType(graphs, 'WebApplication');
    const faq = graphWithType(graphs, 'FAQPage');

    expect(application).toMatchObject({
      '@type': 'WebApplication',
      name: 'Archi Online',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Any',
      url: `${canonicalOrigin}/`,
      isAccessibleForFree: true,
    });
    expect(faq).toBeDefined();

    const questions = faq?.mainEntity as Array<Record<string, unknown>>;
    expect(questions).toHaveLength(5);
    for (const question of questions) {
      const name = question.name as string;
      const acceptedAnswer = question.acceptedAnswer as Record<string, unknown>;
      expect(visibleText).toContain(name);
      expect(visibleText).toContain(acceptedAnswer.text as string);
    }
  });

  it('links to the editor and docs and declares accessible product images', async () => {
    const document = parseHtml('archimate-modeler/index.html');
    const editorLink = document.querySelector<HTMLAnchorElement>('.hero-actions a[href="/"]');
    const docsLink = document.querySelector<HTMLAnchorElement>(
      '.hero-actions a[href="https://thomasrohde.github.io/archi-online/"]',
    );
    const screenshot = document.querySelector<HTMLImageElement>(
      'img[src="/seo/archi-online-modeler.webp"]',
    );

    expect(editorLink?.textContent?.trim()).toBe('Open Archi Online');
    expect(docsLink?.textContent?.trim()).toBe('Read the documentation');
    expect(screenshot?.alt.length).toBeGreaterThan(30);
    expect(screenshot?.getAttribute('width')).toBe('1600');
    expect(screenshot?.getAttribute('height')).toBe('1000');

    for (const asset of [
      'src/seo/archimate-modeler.css',
      'public/seo/archi-online-modeler.webp',
      'public/seo/archi-online-social.png',
    ]) {
      expect(existsSync(join(rootDir, asset)), `${asset} should exist`).toBe(true);
    }

    await expect(sharp(join(rootDir, 'public/seo/archi-online-modeler.webp')).metadata())
      .resolves.toMatchObject({ format: 'webp', width: 1600, height: 1000 });
    await expect(sharp(join(rootDir, 'public/seo/archi-online-social.png')).metadata())
      .resolves.toMatchObject({ format: 'png', width: 1200, height: 630 });
  });

  it('publishes only custom-domain canonical URLs for crawler discovery', () => {
    const robots = readProjectFile('public/robots.txt');
    const sitemap = readProjectFile('public/sitemap.xml');
    const sitemapDocument = new DOMParser().parseFromString(sitemap, 'application/xml');
    const urls = Array.from(sitemapDocument.querySelectorAll('loc'))
      .map((node) => node.textContent);

    expect(robots).toBe(
      `User-agent: *\nAllow: /\n\nSitemap: ${canonicalOrigin}/sitemap.xml\n`,
    );
    expect(urls).toEqual([
      `${canonicalOrigin}/`,
      `${canonicalOrigin}/archimate-modeler/`,
    ]);
    expect(sitemapDocument.querySelector('lastmod')).toBeNull();
    expect(`${robots}\n${sitemap}`).not.toContain(slugOrigin);
  });

  it('does not reintroduce the retired production hostname in active metadata', () => {
    const legacyOrigin = 'archi-online.klok-rohde.dk';

    for (const path of [
      'index.html',
      'archimate-modeler/index.html',
      'public/robots.txt',
      'public/sitemap.xml',
    ]) {
      expect(readProjectFile(path)).not.toContain(legacyOrigin);
    }
  });
});
