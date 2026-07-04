import { afterEach, describe, expect, it } from 'vitest';
import { consumePwaAction } from '../src/pwa/actions';

afterEach(() => {
  history.replaceState(null, '', '/');
});

describe('consumePwaAction', () => {
  it('returns null when no action parameter is present', () => {
    history.replaceState(null, '', '/?mode=viewer');
    expect(consumePwaAction()).toBeNull();
    expect(window.location.search).toBe('?mode=viewer');
  });

  it('parses a known action and strips it from the URL', () => {
    history.replaceState(null, '', '/?action=new');
    expect(consumePwaAction()).toBe('new');
    expect(window.location.search).toBe('');
  });

  it('fires at most once for the same URL', () => {
    history.replaceState(null, '', '/?action=share-received');
    expect(consumePwaAction()).toBe('share-received');
    expect(consumePwaAction()).toBeNull();
  });

  it('strips unknown actions but returns null', () => {
    history.replaceState(null, '', '/?action=bogus');
    expect(consumePwaAction()).toBeNull();
    expect(window.location.search).toBe('');
  });

  it('preserves unrelated query parameters', () => {
    history.replaceState(null, '', '/?foo=bar&action=open');
    expect(consumePwaAction()).toBe('open');
    expect(window.location.search).toBe('?foo=bar');
  });
});
