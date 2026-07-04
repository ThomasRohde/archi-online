// Rasterize public/icons/icon.svg into the PWA icon set. Run once and commit
// the PNGs: `node tools/generate-icons.mjs`. Requires the `sharp` devDep.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const iconsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svg = await readFile(path.join(iconsDir, 'icon.svg'));
const BRAND = '#2a6cc4';

async function fullBleed(size, file) {
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(path.join(iconsDir, file));
}

// Maskable/apple icons: art scaled into the central safe zone on a solid
// brand background, so any platform mask (circle, squircle) keeps the "A".
async function onBrandBackground(size, artRatio, file) {
  const art = Math.round(size * artRatio);
  const artPng = await sharp(svg, { density: 300 }).resize(art, art).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: BRAND },
  })
    .composite([{ input: artPng, gravity: 'centre' }])
    .png()
    .toFile(path.join(iconsDir, file));
}

await fullBleed(192, 'icon-192.png');
await fullBleed(512, 'icon-512.png');
await onBrandBackground(192, 0.8, 'icon-maskable-192.png');
await onBrandBackground(512, 0.8, 'icon-maskable-512.png');
await onBrandBackground(180, 0.85, 'apple-touch-icon.png');

console.log('icons written to public/icons/');
