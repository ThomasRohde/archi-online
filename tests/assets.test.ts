import { describe, expect, it } from 'vitest';
import { assetDataUrl } from '../src/model/assets';
import type { ModelAsset } from '../src/model/types';

describe('model asset rendering', () => {
  it('encodes an unchanged asset only once', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    let renderByteReads = 0;
    const asset: ModelAsset = {
      path: 'images/test.png',
      mediaType: 'image/png',
      bytes,
      renderMediaType: 'image/png',
      get renderBytes() {
        renderByteReads++;
        return bytes;
      },
      sha256: 'test',
    };

    assetDataUrl(asset);
    const readsAfterFirstCall = renderByteReads;
    assetDataUrl(asset);

    expect(renderByteReads).toBe(readsAfterFirstCall);
  });
});
