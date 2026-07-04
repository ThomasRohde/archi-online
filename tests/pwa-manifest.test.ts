import { describe, expect, it } from 'vitest';
import { webManifest } from '../src/pwa/webmanifest';

describe('web app manifest', () => {
  it('is rooted at / for a root-hosted app', () => {
    expect(webManifest.id).toBe('/');
    expect(webManifest.start_url).toBe('/');
    expect(webManifest.scope).toBe('/');
    expect(webManifest.display).toBe('standalone');
  });

  it('registers as a handler for .archimate files', () => {
    const handler = webManifest.file_handlers?.[0];
    expect(handler?.action).toBe('/');
    expect(handler?.accept['application/xml']).toContain('.archimate');
  });

  it('declares a multipart POST share target with a model file param', () => {
    const target = webManifest.share_target;
    expect(target?.action).toBe('/share-target');
    expect(target?.method).toBe('POST');
    expect(target?.enctype).toBe('multipart/form-data');
    const files = target?.params.files;
    const fileParam = Array.isArray(files) ? files[0] : files;
    expect(fileParam?.name).toBe('model');
    expect(fileParam?.accept).toContain('.archimate');
  });

  it('ships standard and maskable icons in 192 and 512', () => {
    const bySize = (purpose: string | undefined, size: string) =>
      webManifest.icons?.find((i) => i.sizes === size && i.purpose === purpose);
    expect(bySize(undefined, '192x192')).toBeDefined();
    expect(bySize(undefined, '512x512')).toBeDefined();
    expect(bySize('maskable', '192x192')).toBeDefined();
    expect(bySize('maskable', '512x512')).toBeDefined();
  });

  it('offers new/open shortcuts routed through ?action=', () => {
    const urls = webManifest.shortcuts?.map((s) => s.url);
    expect(urls).toEqual(['/?action=new', '/?action=open']);
  });
});
