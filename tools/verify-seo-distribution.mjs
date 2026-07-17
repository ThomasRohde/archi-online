import { access, readFile } from 'node:fs/promises';
import { URL, fileURLToPath } from 'node:url';
import sharp from 'sharp';

const canonicalOrigin = 'https://archi-online.klok-rohde.dk';
const slugOrigin = 'https://bitter-mill-c9qn.here.now';
const distUrl = new URL('../dist/', import.meta.url);

const requiredFiles = [
  'index.html',
  'archimate-modeler/index.html',
  'robots.txt',
  'sitemap.xml',
  'seo/archi-online-modeler.webp',
  'seo/archi-online-social.png',
];

for (const file of requiredFiles) {
  await access(new URL(file, distUrl));
}

const [editorHtml, productHtml, robots, sitemap] = await Promise.all([
  readText('index.html'),
  readText('archimate-modeler/index.html'),
  readText('robots.txt'),
  readText('sitemap.xml'),
]);

assertCanonical(editorHtml, `${canonicalOrigin}/`, 'editor');
assertCanonical(productHtml, `${canonicalOrigin}/archimate-modeler/`, 'product page');

for (const [label, html] of [['editor', editorHtml], ['product page', productHtml]]) {
  assert(html.includes(`${canonicalOrigin}/seo/archi-online-social.png`), `${label} social image`);
  assert(!canonicalLinks(html).some((url) => url.startsWith(slugOrigin)), `${label} slug canonical`);
}

assert(!productHtml.includes('/src/seo/'), 'product page source stylesheet reference');
assert(/href="\/assets\/[^"?]+\.css"/.test(productHtml), 'product page built stylesheet');

const expectedRobots =
  `User-agent: *\nAllow: /\n\nSitemap: ${canonicalOrigin}/sitemap.xml\n`;
assert(robots === expectedRobots, 'robots.txt content');

const sitemapUrls = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
assert(
  JSON.stringify(sitemapUrls) === JSON.stringify([
    `${canonicalOrigin}/`,
    `${canonicalOrigin}/archimate-modeler/`,
  ]),
  'sitemap canonical URLs',
);
assert(!sitemap.includes('<lastmod>'), 'sitemap synthetic lastmod');

const heroMetadata = await sharp(fileURLToPath(new URL('seo/archi-online-modeler.webp', distUrl)))
  .metadata();
const socialMetadata = await sharp(fileURLToPath(new URL('seo/archi-online-social.png', distUrl)))
  .metadata();
assertImage(heroMetadata, { format: 'webp', width: 1600, height: 1000 }, 'hero image');
assertImage(socialMetadata, { format: 'png', width: 1200, height: 630 }, 'social image');

console.log('SEO distribution verified: 2 canonical pages, discovery files, and social assets.');

async function readText(path) {
  return readFile(new URL(path, distUrl), 'utf8');
}

function canonicalLinks(html) {
  return Array.from(
    html.matchAll(/<link\s+rel="canonical"\s+href="([^"]+)"/g),
    (match) => match[1],
  );
}

function assertCanonical(html, expected, label) {
  const canonicals = canonicalLinks(html);
  assert(
    canonicals.length === 1 && canonicals[0] === expected,
    `${label} canonical URL`,
  );
}

function assertImage(actual, expected, label) {
  assert(actual.format === expected.format, `${label} format`);
  assert(actual.width === expected.width, `${label} width`);
  assert(actual.height === expected.height, `${label} height`);
}

function assert(condition, label) {
  if (!condition) throw new Error(`SEO distribution check failed: ${label}`);
}
