/**
 * image.ts tests — the vision-image → data-URL converter.
 *
 * toDataUrl must pass through data:/http(s): URLs unchanged and fetch+base64
 * relative asset paths, memoizing results. warmImageCache pre-converts a batch
 * without throwing on a bad path.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

// The module reads fetch + FileReader at call time, so stub globals before import.
function stubFetch(blob: Blob) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
function stubFileReader(dataUrl: string) {
  const fr = {
    readAsDataURL: vi.fn(function (this: any) {
      // async-resolve on next tick
      setTimeout(() => {
        this.result = dataUrl;
        this.onload?.();
      }, 0);
    }),
    onload: null as null | (() => void),
    result: null as string | null,
  };
  globalThis.FileReader = vi.fn(() => fr) as unknown as typeof FileReader;
  return fr;
}

describe('toDataUrl', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => vi.restoreAllMocks());

  it('passes a data: URL through unchanged', async () => {
    const { toDataUrl } = await import('./image');
    const dataUrl = 'data:image/svg+xml,<svg/>';
    expect(await toDataUrl(dataUrl)).toBe(dataUrl);
  });

  it('passes an https URL through unchanged (provider fetches it directly)', async () => {
    const { toDataUrl } = await import('./image');
    const url = 'https://example.com/x.png';
    expect(await toDataUrl(url)).toBe(url);
  });

  it('fetches a relative asset and converts it to a data URL', async () => {
    stubFetch(new Blob(['x'], { type: 'image/svg+xml' }));
    stubFileReader('data:image/svg+xml;base64,eA==');
    const { toDataUrl } = await import('./image');
    const out = await toDataUrl('/data/assets/labels/lp-1.svg');
    expect(out).toBe('data:image/svg+xml;base64,eA==');
  });

  it('falls back to the raw path when fetch fails (no throw)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, blob: async () => new Blob() }) as unknown as typeof fetch;
    const { toDataUrl } = await import('./image');
    const out = await toDataUrl('/missing/asset.svg');
    expect(out).toBe('/missing/asset.svg');
  });

  it('memoizes — a second call for the same path does not re-fetch', async () => {
    const fetchMock = stubFetch(new Blob(['x'], { type: 'image/svg+xml' }));
    stubFileReader('data:image/svg+xml;base64,eA==');
    const { toDataUrl } = await import('./image');
    await toDataUrl('/data/assets/labels/lp-1.svg');
    await toDataUrl('/data/assets/labels/lp-1.svg');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('warmImageCache', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it('converts a batch and swallows individual failures', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async (url: string) => {
      calls++;
      if (String(url).includes('bad')) throw new Error('boom');
      return { ok: true, blob: async () => new Blob(['x'], { type: 'image/svg+xml' }) };
    }) as unknown as typeof fetch;
    stubFileReader('data:image/svg+xml;base64,eA==');
    const { warmImageCache } = await import('./image');
    await warmImageCache(['/a.svg', '/bad.svg', 'https://x/y.png', '']);
    // data/https pass through (no fetch); /a fetched; /bad threw but was caught.
    expect(calls).toBeGreaterThanOrEqual(1);
  });
});
