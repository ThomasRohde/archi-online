// Rasterize public/icons/icon.svg + icon-maskable.svg into the PWA icon set.
// Run once and commit the PNGs: `node tools/generate-icons.mjs`.
// Requires the `sharp` devDep.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const iconsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const tileSvg = await readFile(path.join(iconsDir, 'icon.svg'));
// Full-bleed art on an opaque background; platform masks crop it, and iOS
// composites it without alpha, so it doubles as the apple-touch source.
const maskableSvg = await readFile(path.join(iconsDir, 'icon-maskable.svg'));

async function rasterize(svg, size, file) {
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(path.join(iconsDir, file));
}

await rasterize(tileSvg, 192, 'icon-192.png');
await rasterize(tileSvg, 512, 'icon-512.png');
await rasterize(maskableSvg, 192, 'icon-maskable-192.png');
await rasterize(maskableSvg, 512, 'icon-maskable-512.png');
await rasterize(maskableSvg, 180, 'apple-touch-icon.png');

console.log('icons written to public/icons/');
