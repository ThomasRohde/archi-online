import { Buffer } from 'node:buffer';
import { mkdir } from 'node:fs/promises';
import { URL, fileURLToPath } from 'node:url';
import sharp from 'sharp';

const outputDir = fileURLToPath(new URL('../public/seo/', import.meta.url));
const heroPath = fileURLToPath(new URL('../public/seo/archi-online-modeler.webp', import.meta.url));
const socialPath = fileURLToPath(new URL('../public/seo/archi-online-social.png', import.meta.url));
const iconPath = fileURLToPath(new URL('../public/icons/icon.svg', import.meta.url));
const screenshotSource = process.argv[2];

await mkdir(outputDir, { recursive: true });

if (screenshotSource) {
  await sharp(screenshotSource)
    .resize(1600, 1000, { fit: 'cover' })
    .webp({ quality: 86, effort: 6 })
    .toFile(heroPath);
}

const workspaceImage = await sharp(heroPath)
  .resize(650, 406, { fit: 'cover' })
  .png()
  .toBuffer();
const icon = await sharp(iconPath).resize(56, 56).png().toBuffer();

const background = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
        <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#b9d3fa" stroke-opacity="0.11" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="1200" height="630" fill="#10284d"/>
    <rect width="1200" height="630" fill="url(#grid)"/>
    <path d="M68 128 H422" stroke="#7196cd" stroke-width="1"/>
    <circle cx="68" cy="128" r="5" fill="#dc6b35"/>
    <text x="140" y="91" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="700">Archi Online</text>
    <text x="68" y="216" fill="#b9d3fa" font-family="Cascadia Code, Consolas, monospace" font-size="16" font-weight="700" letter-spacing="2">ARCHIMATE 3.2 / LOCAL FIRST</text>
    <text x="68" y="278" fill="#ffffff" font-family="Georgia, Times New Roman, serif" font-size="55" font-weight="600">Online</text>
    <text x="68" y="338" fill="#ffffff" font-family="Georgia, Times New Roman, serif" font-size="55" font-weight="600">ArchiMate</text>
    <text x="68" y="398" fill="#ffffff" font-family="Georgia, Times New Roman, serif" font-size="55" font-weight="600">modeling.</text>
    <text x="68" y="462" fill="#d8e5f7" font-family="Segoe UI, Arial, sans-serif" font-size="22">Model, validate, and script</text>
    <text x="68" y="494" fill="#d8e5f7" font-family="Segoe UI, Arial, sans-serif" font-size="22">directly in your browser.</text>
    <rect x="492" y="94" width="660" height="416" fill="#dc6b35"/>
    <rect x="480" y="82" width="660" height="416" fill="#ffffff" stroke="#ffffff" stroke-width="2"/>
    <text x="1076" y="554" fill="#b9d3fa" font-family="Cascadia Code, Consolas, monospace" font-size="14" text-anchor="end">archi-online.klok-rohde.dk</text>
  </svg>
`);

await sharp({
  create: {
    width: 1200,
    height: 630,
    channels: 4,
    background: '#10284d',
  },
})
  .composite([
    { input: background, top: 0, left: 0 },
    { input: icon, top: 54, left: 68 },
    { input: workspaceImage, top: 87, left: 485 },
  ])
  .png({ compressionLevel: 9, palette: true, quality: 95 })
  .toFile(socialPath);

if (screenshotSource) console.log(`Generated ${heroPath}`);
console.log(`Generated ${socialPath}`);
