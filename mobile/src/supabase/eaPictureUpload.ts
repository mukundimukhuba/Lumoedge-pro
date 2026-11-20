import { getSupabase, isSupabaseConfigured } from './client';

const BUCKET = 'ea-pictures';

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } | null {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const b64 = m[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = mime.includes('png') ? 'png' : 'jpg';
  return { blob: new Blob([bytes], { type: mime }), ext };
}

/**
 * Upload a data-URL picture to Supabase Storage and return a public URL.
 * Returns the original URI when Supabase is unset or upload fails.
 */
export async function persistPictureRemote(
  objectPath: string,
  pictureUri: string | null,
): Promise<string | null> {
  if (!pictureUri) return null;
  if (!pictureUri.startsWith('data:')) return pictureUri;
  if (!isSupabaseConfigured()) return pictureUri;

  const sb = getSupabase();
  if (!sb) return pictureUri;

  const parsed = dataUrlToBlob(pictureUri);
  if (!parsed) return pictureUri;

  const path = `${objectPath}.${parsed.ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, parsed.blob, {
    upsert: true,
    contentType: parsed.blob.type,
  });
  if (error) {
    console.warn('[edges] storage upload failed', error.message);
    // Fall back to storing the data URL in the row (still durable remotely).
    return pictureUri;
  }
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl || pictureUri;
}
