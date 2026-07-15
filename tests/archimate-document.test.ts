import { strFromU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addImageToView,
  addElement,
  addElementNodeToView,
  addView,
  createEmptyModel,
  createProfile,
  importModelAsset,
  setNodeStyle,
} from '../src/model/ops';
import {
  parseArchimate,
  parseArchimateDocument,
  serializeArchimate,
  serializeArchimateDocument,
} from '../src/model/io/archimate-xml';
import { replaceModel, undo } from '../src/model/store';
import { useStore } from '../src/ui/store-hooks';

const decoder = new TextDecoder();

function model() {
  return useStore.getState().model!;
}

beforeEach(() => {
  replaceModel(createEmptyModel('Images'), null);
});

describe('native Archi document codec', () => {
  it('keeps TIFF source bytes and derives browser-renderable PNG bytes', { timeout: 30_000 }, async () => {
    const bytes = minimalTiff();
    const path = await importModelAsset(bytes, 'pixel.tiff', 'image/tiff');
    const asset = model().assets[path];

    expect(asset.mediaType).toBe('image/tiff');
    expect(Array.from(asset.bytes)).toEqual(Array.from(bytes));
    expect(asset.renderMediaType).toBe('image/png');
    expect(Array.from(asset.renderBytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it('returns plain XML bytes for asset-free models', async () => {
    const bytes = await serializeArchimateDocument(model());
    expect(decoder.decode(bytes)).toBe(serializeArchimate(model()));
    expect((await parseArchimateDocument(bytes)).assets).toEqual({});
  });

  it('writes and reads Desktop-shaped ZIP archives with model.xml and original assets', async () => {
    const path = 'images/_abcdefghijklmnopqrstuv.png';
    const sourceBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    model().assets[path] = {
      path,
      mediaType: 'image/png',
      bytes: sourceBytes,
      renderMediaType: 'image/png',
      renderBytes: sourceBytes,
      sha256: 'placeholder',
    };
    createProfile({ name: 'Iconic actor', conceptType: 'BusinessActor', imagePath: path });

    const document = await serializeArchimateDocument(model());
    const archive = unzipSync(document);
    expect(strFromU8(archive['model.xml'])).toContain(`imagePath="${path}"`);
    expect(archive[path]).toEqual(sourceBytes);

    const parsed = await parseArchimateDocument(document);
    expect(parsed.assets[path].bytes).toEqual(sourceBytes);
    expect(parsed.assets[path].sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects ZIP documents without model.xml', async () => {
    await expect(parseArchimateDocument(zipSync({ 'images/a.png': new Uint8Array([1]) })))
      .rejects.toThrow(/model\.xml/);
  });

  it('rejects archives that exceed the entry budget before extraction', async () => {
    const entries: Record<string, Uint8Array> = {
      'model.xml': new TextEncoder().encode(serializeArchimate(model())),
    };
    for (let index = 0; index < 512; index++) {
      entries[`images/${index}.png`] = new Uint8Array();
    }
    await expect(parseArchimateDocument(zipSync(entries))).rejects.toThrow(/more than 512 entries/);
  });

  it('rejects unsafe image dimensions before decoding or storing the asset', async () => {
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 20_000, false);
    view.setUint32(20, 1, false);

    await expect(importModelAsset(bytes, 'wide.png', 'image/png'))
      .rejects.toThrow(/dimensions exceed the limit/);
  });

  it('deduplicates imported assets by SHA-256 and uses Archi image paths', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const first = await importModelAsset(bytes, 'logo.PNG', 'image/png');
    const second = await importModelAsset(bytes, 'copy.png', 'image/png');

    expect(second).toBe(first);
    expect(first).toMatch(/^images\/_[-a-zA-Z0-9]{22}\.png$/);
    expect(Object.keys(model().assets)).toEqual([first]);
  });

  it('round-trips standalone image nodes without unsupported image-position attributes', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<archimate:model xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:archimate="http://www.archimatetool.com/archimate" name="Images" id="model" version="5.0.0">
  <folder name="Views" id="views" type="diagrams">
    <element xsi:type="archimate:ArchimateDiagramModel" name="Image view" id="view">
      <child xsi:type="archimate:DiagramModelImage" id="image" imagePath="images/_abcdefghijklmnopqrstuv.png">
        <bounds x="10" y="20" width="200" height="100"/>
      </child>
    </element>
  </folder>
</archimate:model>`;
    const parsed = parseArchimate(xml);
    expect(parsed.nodes.image).toMatchObject({
      nodeType: 'image',
      imagePath: 'images/_abcdefghijklmnopqrstuv.png',
    });
    const serialized = serializeArchimate(parsed);
    expect(serialized).toContain('xsi:type="archimate:DiagramModelImage"');
    expect(serialized).not.toMatch(/DiagramModelImage[^>]*imagePosition=/);

    const view = addView('New image view');
    const image = addImageToView(
      view,
      view,
      { x: 0, y: 0, width: 120, height: 80 },
      'images/_abcdefghijklmnopqrstuv.png',
    );
    expect(model().nodes[image].nodeType).toBe('image');
    expect(serializeArchimate(model())).not.toMatch(/DiagramModelImage[^>]*imagePosition=/);
  });

  it('removes an unreferenced asset in the same undoable image transaction', async () => {
    const path = await importModelAsset(new Uint8Array([1, 2, 3]), 'image.png', 'image/png');
    const view = addView('View');
    const element = addElement('BusinessActor', 'Actor');
    const node = addElementNodeToView(
      view,
      element,
      view,
      { x: 0, y: 0, width: 80, height: 80 },
    );
    setNodeStyle([node], { imagePath: path, imageSource: 1, imagePosition: 9 });
    setNodeStyle([node], { imagePath: undefined });

    expect(model().assets[path]).toBeUndefined();
    expect(model().nodes[node].imagePath).toBeUndefined();
    undo();
    expect(model().assets[path]).toBeDefined();
    expect(model().nodes[node].imagePath).toBe(path);
  });
});

function minimalTiff(): Uint8Array {
  const entries = [
    [256, 4, 1, 1],
    [257, 4, 1, 1],
    [258, 3, 1, 8],
    [259, 3, 1, 1],
    [262, 3, 1, 1],
    [273, 4, 1, 122],
    [277, 3, 1, 1],
    [278, 4, 1, 1],
    [279, 4, 1, 1],
  ];
  const bytes = new Uint8Array(123);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, entries.length, true);
  entries.forEach(([tag, type, count, value], index) => {
    const offset = 10 + index * 12;
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, count, true);
    if (type === 3) view.setUint16(offset + 8, value, true);
    else view.setUint32(offset + 8, value, true);
  });
  view.setUint32(118, 0, true);
  bytes[122] = 0x7f;
  return bytes;
}
