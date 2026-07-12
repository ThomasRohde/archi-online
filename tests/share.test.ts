import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'fflate';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseArchimate, serializeArchimate } from '../src/model/io/archimate-xml';
import { MAX_INLINE_DOCUMENT_BYTES } from '../src/model/io/document-limits';
import { addView, createElementOnView, createEmptyModel } from '../src/model/ops';
import { openView, replaceModel } from '../src/model/store';
import { isViewerLocation, viewerRouteKey } from '../src/App';
import { memoryKeyValueStore } from '../src/persistence/keyval';
import {
  INLINE_SHARE_THRESHOLD,
  decodeInlineSharePayload,
  encodeModelToInlineShare,
  getRememberedGistId,
  loadSharedModelFromLocation,
  parseShareFragment,
  rememberGistId,
} from '../src/persistence/share';
import { AppDialogHost } from '../src/ui/AppDialog';
import { shareDecisionForInline, shareModel } from '../src/ui/Toolbar';

const archisuranceXml = readFileSync(
  join(__dirname, 'fixtures', 'Archisurance.archimate'),
  'utf8',
);

function response(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/plain' },
    ...init,
  });
}

async function render(element: React.ReactElement): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return { host, root };
}

beforeEach(() => {
  vi.restoreAllMocks();
  replaceModel(null, null);
  document.body.innerHTML = '';
});

describe('share link encoding', () => {
  it('round-trips image-bearing archive bytes through an inline share', async () => {
    const model = createEmptyModel('Shared images');
    const path = 'images/_abcdefghijklmnopqrstuv.png';
    const bytes = new Uint8Array([1, 2, 3]);
    model.assets[path] = {
      path,
      mediaType: 'image/png',
      bytes,
      renderMediaType: 'image/png',
      renderBytes: bytes,
      sha256: 'hash',
    };
    model.profiles.profile = {
      id: 'profile',
      name: 'Image profile',
      conceptType: 'BusinessActor',
      specialization: true,
      imagePath: path,
    };

    const share = await encodeModelToInlineShare(model, 'https://example.test/archi/');
    const decoded = await decodeInlineSharePayload(share.payload);
    expect(Array.from(decoded.model.assets[path].bytes)).toEqual([1, 2, 3]);
  });

  it('round-trips a model through an inline fragment payload', async () => {
    const model = parseArchimate(archisuranceXml);
    const share = await encodeModelToInlineShare(model, 'https://example.test/archi/');
    const decoded = await decodeInlineSharePayload(share.payload);

    expect(decoded.model).toEqual(parseArchimate(serializeArchimate(model)));
    expect(share.href).toBe(`https://example.test/archi/?mode=viewer#m=${share.payload}`);
    expect(share.encodedLength).toBe(share.payload.length);
  });

  it('reports whether an inline payload exceeds the threshold', async () => {
    const model = parseArchimate(archisuranceXml);
    const share = await encodeModelToInlineShare(model, 'https://example.test/archi/');

    expect(INLINE_SHARE_THRESHOLD).toBe(8 * 1024);
    expect(typeof share.exceedsThreshold).toBe('boolean');
    expect(share.exceedsThreshold).toBe(share.encodedLength > INLINE_SHARE_THRESHOLD);
  });

  it('parses supported viewer fragments', () => {
    expect(parseShareFragment('#m=abc')).toEqual({ kind: 'inline', payload: 'abc' });
    expect(parseShareFragment('#gist=12345')).toEqual({ kind: 'gist', gistId: '12345' });
    expect(parseShareFragment('#raw=https%3A%2F%2Fexample.test%2Fmodel.archimate')).toEqual({
      kind: 'raw',
      url: 'https://example.test/model.archimate',
    });
  });

  it('rejects malformed inline payloads with a share-specific error', async () => {
    await expect(decodeInlineSharePayload('not-valid-base64url!')).rejects.toThrow(
      /Could not decode shared model/,
    );
  });

  it('rejects an inline decompression bomb before parsing it', async () => {
    const compressed = deflateSync(new Uint8Array(MAX_INLINE_DOCUMENT_BYTES + 1));
    let binary = '';
    for (const byte of compressed) binary += String.fromCharCode(byte);
    const payload = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

    await expect(decodeInlineSharePayload(payload)).rejects.toThrow(/Could not decode shared model/);
  });

  it('loads a shared model from an inline location', async () => {
    const model = parseArchimate(archisuranceXml);
    const share = await encodeModelToInlineShare(model, 'https://example.test/archi/');

    const loaded = await loadSharedModelFromLocation({ hash: `#m=${share.payload}` });

    expect(loaded.sourceLabel).toBe('shared link');
    expect(loaded.fileName).toBe('Archisurance.archimate');
    expect(loaded.model.info.name).toBe('Archisurance');
  });

  it('loads a shared model from a raw location without authentication', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(archisuranceXml));

    const loaded = await loadSharedModelFromLocation(
      {
        hash: '#raw=https%3A%2F%2Fraw.githubusercontent.com%2Fowner%2Frepo%2Fmain%2Fmodel.archimate',
      },
      fetchImpl,
    );

    expect(loaded.fileName).toBe('model.archimate');
    expect(loaded.model.info.name).toBe('Archisurance');
  });

  it('remembers a gist id per model id', async () => {
    const store = memoryKeyValueStore();

    await rememberGistId('model-1', 'gist-1', store);
    await rememberGistId('model-2', 'gist-2', store);

    expect(await getRememberedGistId('model-1', store)).toBe('gist-1');
    expect(await getRememberedGistId('model-2', store)).toBe('gist-2');
  });

  it('detects explicit and fragment-triggered viewer URLs', () => {
    expect(isViewerLocation(new URL('https://example.test/?mode=viewer'))).toBe(true);
    expect(isViewerLocation(new URL('https://example.test/#m=abc'))).toBe(true);
    expect(isViewerLocation(new URL('https://example.test/#gist=abc'))).toBe(true);
    expect(
      isViewerLocation(
        new URL('https://example.test/#raw=https%3A%2F%2Fexample.test%2Fm.archimate'),
      ),
    ).toBe(true);
    expect(isViewerLocation(new URL('https://example.test/'))).toBe(false);
  });

  it('tracks viewer route changes by query and fragment', () => {
    expect(viewerRouteKey(new URL('https://example.test/?mode=viewer#m=abc'))).not.toBe(
      viewerRouteKey(new URL('https://example.test/?mode=viewer#m=def')),
    );
    expect(viewerRouteKey(new URL('https://example.test/?mode=viewer#gist=abc'))).not.toBe(
      viewerRouteKey(new URL('https://example.test/?mode=viewer#raw=https%3A%2F%2Fexample.test%2Fm.archimate')),
    );
  });

  it('chooses inline links under the threshold and gist links over it', () => {
    expect(shareDecisionForInline(100)).toBe('inline');
    expect(shareDecisionForInline(INLINE_SHARE_THRESHOLD)).toBe('inline');
    expect(shareDecisionForInline(INLINE_SHARE_THRESHOLD + 1)).toBe('gist');
  });

  it('copies a share link that opens the active view without displaying the URL', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const { host, root } = await render(createElement(AppDialogHost));
    replaceModel(createEmptyModel('Shared Active View'), null);
    addView('Empty View');
    const activeViewId = addView('Populated View');
    openView(activeViewId);
    createElementOnView('BusinessActor', activeViewId, activeViewId, {
      x: 40,
      y: 50,
      width: 120,
      height: 55,
    });

    let sharePromise!: Promise<void>;
    await act(async () => {
      sharePromise = shareModel();
    });
    const copiedUrl = writeText.mock.calls[0]?.[0] ?? '';
    const dialogText = document.body.textContent ?? '';
    const okButton = document.querySelector<HTMLButtonElement>('.app-dialog-btn.primary');
    expect(okButton).not.toBeNull();
    await act(async () => {
      okButton!.click();
      await sharePromise;
      root.unmount();
    });
    host.remove();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('?mode=viewer#'));
    expect(parseShareFragment(new URL(copiedUrl).hash)).toMatchObject({
      kind: 'inline',
      initialViewId: activeViewId,
    });
    await expect(loadSharedModelFromLocation({ hash: new URL(copiedUrl).hash })).resolves.toMatchObject({
      initialViewId: activeViewId,
    });
    expect(dialogText).toContain('The share URL has been copied to the clipboard.');
    expect(dialogText).not.toContain(copiedUrl);
  });
});
