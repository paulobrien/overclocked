/**
 * Image → data-URL conversion for vision model calls.
 *
 * OpenAI-compatible vision APIs require either a public HTTPS URL the model can
 * fetch, or a base64 data URL. Our SVG assets are served as relative paths for
 * the lobby <img> preview, but a relative path is NOT valid as an image_url to
 * the model — it would be rejected. So before we send a vision request, we
 * fetch the asset and convert it to a base64 data URL.
 *
 * Results are memoized so a repeated scenario doesn't re-fetch. SVGs are passed
 * through as image/svg+xml data URLs (modern multimodal endpoints accept these);
 * raster assets (png/jpg) get base64-encoded.
 */

const cache = new Map<string, string>();

/** Convert a possibly-relative asset path into a model-consumable data URL. */
export async function toDataUrl(src: string): Promise<string> {
  // Already a data URL or absolute http(s) — leave it (absolute URLs let the
  // model fetch directly, which is fine for hosted/public assets).
  if (/^data:/i.test(src)) return src;
  if (/^https?:\/\//i.test(src)) return src;

  if (cache.has(src)) return cache.get(src)!;

  const url = resolveUrl(src);
  const res = await fetch(url);
  if (!res.ok) {
    // If the asset can't be fetched (e.g. missing), fall back to the raw path
    // so the request still shapes correctly — the model just won't "see" it.
    return src;
  }
  const blob = await res.blob();
  const dataUrl = await blobToDataUrl(blob);
  cache.set(src, dataUrl);
  return dataUrl;
}

/** Resolve a relative asset path against the document base. */
function resolveUrl(src: string): string {
  if (src.startsWith('/')) return src; // served from root (Vite / Pages)
  return `/${src.replace(/^\.\//, '')}`;
}

/** Read a Blob as a base64 data URL. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Pre-convert a batch of image paths (used by the engine to warm the cache
 * before the lane needs them, hiding fetch latency from the live pipeline).
 */
export async function warmImageCache(paths: string[]): Promise<void> {
  await Promise.all(paths.filter(Boolean).map((p) => toDataUrl(p).catch(() => {})));
}
