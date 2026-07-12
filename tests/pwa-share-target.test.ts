import { afterEach, describe, expect, it } from 'vitest';
import { takeSharedFile } from '../src/pwa/share-target-inbox';
import {
  SHARE_FILE_NAME_HEADER,
  SHARE_INBOX_CACHE,
  SHARE_INBOX_KEY,
} from '../src/pwa/share-target-protocol';

// jsdom has no CacheStorage; a Map-backed stub mirrors the subset the
// service worker and inbox use (open/match/put/delete).
class FakeCache {
  private entries = new Map<string, Response>();
  async match(key: string): Promise<Response | undefined> {
    return this.entries.get(key);
  }
  async put(key: string, response: Response): Promise<void> {
    this.entries.set(key, response);
  }
  async delete(key: string): Promise<boolean> {
    return this.entries.delete(key);
  }
}

function installFakeCaches(): Map<string, FakeCache> {
  const caches = new Map<string, FakeCache>();
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      async open(name: string) {
        let cache = caches.get(name);
        if (!cache) {
          cache = new FakeCache();
          caches.set(name, cache);
        }
        return cache;
      },
    },
  });
  return caches;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'caches');
});

describe('share target inbox', () => {
  it('returns null when Cache Storage is unavailable', async () => {
    expect(await takeSharedFile()).toBeNull();
  });

  it('returns null when nothing was shared', async () => {
    installFakeCaches();
    expect(await takeSharedFile()).toBeNull();
  });

  it('returns the stashed file once, then deletes it', async () => {
    const caches = installFakeCaches();
    const xml = '<model>shared</model>';
    // Stash exactly as src/sw.ts does, via the same protocol constants.
    const cache = new FakeCache();
    caches.set(SHARE_INBOX_CACHE, cache);
    await cache.put(
      SHARE_INBOX_KEY,
      new Response(xml, {
        headers: {
          'Content-Type': 'application/xml',
          [SHARE_FILE_NAME_HEADER]: encodeURIComponent('My Model.archimate'),
        },
      }),
    );

    const shared = await takeSharedFile();
    expect(shared?.name).toBe('My Model.archimate');
    expect(Array.from(shared?.bytes ?? [])).toEqual(Array.from(new TextEncoder().encode(xml)));
    expect(await takeSharedFile()).toBeNull();
  });

  it('falls back to a default name when the header is missing', async () => {
    const caches = installFakeCaches();
    const cache = new FakeCache();
    caches.set(SHARE_INBOX_CACHE, cache);
    await cache.put(SHARE_INBOX_KEY, new Response('<x/>'));
    expect((await takeSharedFile())?.name).toBe('shared.archimate');
  });
});
