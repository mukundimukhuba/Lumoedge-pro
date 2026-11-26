/**
 * Compress EA pictures for vault / remote upload without crushing hero sharpness.
 * Target: ~1280px longest edge JPEG (retina phone hero ≈ 390×3 CSS px).
 * Metadata localStorage still strips data-URLs; IndexedDB + Supabase hold the bytes.
 */

import { PixelRatio, type ImageSourcePropType } from 'react-native';

/** Longest edge for stored EA pictures — enough for 3× phone-width heroes. */
export const EA_PICTURE_MAX_EDGE = 1280;
const JPEG_QUALITY = 0.85;
/** Soft cap — re-encode harder if still over this (~260KB binary). */
const MAX_DATA_URL_CHARS = 350_000;
const FALLBACK_EDGES = [960, 720] as const;

function isDataUrl(uri: string | null | undefined): uri is string {
  return !!uri && uri.startsWith('data:');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL('image/jpeg', quality);
}

function drawScaled(
  img: HTMLImageElement,
  edge: number,
): HTMLCanvasElement | null {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;

  const scale = Math.min(1, edge / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Prefer high-quality downscale when the browser supports it.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(img, 0, 0, tw, th);
  return canvas;
}

/**
 * Resize + JPEG-encode a data URL (web). Non-data URIs and native paths pass through.
 * Never upscales — only shrinks oversized uploads.
 */
export async function compressEaPicture(
  uri: string | null,
): Promise<string | null> {
  if (!uri) return null;
  if (!uri.startsWith('data:')) return uri;

  if (typeof document === 'undefined') {
    // Native / no DOM: leave as-is; AsyncStorage + vault tolerate larger payloads.
    return uri;
  }

  try {
    const img = await loadImage(uri);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return uri;

    // Already within the hero budget and a compact JPEG — keep (no re-crush).
    if (
      Math.max(w, h) <= EA_PICTURE_MAX_EDGE &&
      uri.startsWith('data:image/jpeg') &&
      uri.length <= MAX_DATA_URL_CHARS
    ) {
      return uri;
    }

    const edges = [EA_PICTURE_MAX_EDGE, ...FALLBACK_EDGES];
    const qualities = [JPEG_QUALITY, 0.75, 0.62];

    for (const edge of edges) {
      const canvas = drawScaled(img, edge);
      if (!canvas) return uri;
      for (const q of qualities) {
        const out = canvasToJpeg(canvas, q);
        if (out && out.length <= MAX_DATA_URL_CHARS) return out;
      }
    }

    // Last resort: smallest edge + lowest quality we tried.
    const last = drawScaled(img, FALLBACK_EDGES[FALLBACK_EDGES.length - 1]);
    if (!last) return uri;
    return canvasToJpeg(last, 0.55) || uri;
  } catch {
    return uri;
  }
}

/**
 * Build an Image source sized for the device pixel ratio so RN/web
 * does not stretch a low logical size across a retina canvas.
 */
export function eaPictureImageSource(
  uri: string,
  layout: { width: number; height: number },
): ImageSourcePropType {
  const dpr = Math.max(1, PixelRatio.get());
  const width = Math.max(1, Math.round(layout.width * dpr));
  const height = Math.max(1, Math.round(layout.height * dpr));
  return { uri, width, height };
}

/**
 * Display URI for EA pictures.
 *
 * Always returns the original URI — hero and avatars must share one high-quality
 * source. Do not route through Supabase `/render/image/` (or any other
 * size-specific derivative): those produce a softer large hero while small
 * circles still look sharp.
 */
export function eaPictureDisplayUri(
  uri: string | null | undefined,
  _layout?: { width: number; height: number },
): string | null {
  return uri || null;
}

/** Compress every EA / key data-URL picture in a catalog. */
export async function compressCatalogPictures<
  TEa extends { pictureUri: string | null },
  TKey extends { eaPictureUri: string | null },
>(eas: TEa[], keys: TKey[]): Promise<{ eas: TEa[]; keys: TKey[] }> {
  const nextEas = await Promise.all(
    eas.map(async (e) => ({
      ...e,
      pictureUri: isDataUrl(e.pictureUri)
        ? await compressEaPicture(e.pictureUri)
        : e.pictureUri,
    })),
  );
  const nextKeys = await Promise.all(
    keys.map(async (k) => ({
      ...k,
      eaPictureUri: isDataUrl(k.eaPictureUri)
        ? await compressEaPicture(k.eaPictureUri)
        : k.eaPictureUri,
    })),
  );
  return { eas: nextEas, keys: nextKeys };
}
