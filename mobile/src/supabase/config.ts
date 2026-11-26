import Constants from 'expo-constants';

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

function readExtra(): Extra {
  const extra =
    (Constants.expoConfig?.extra as Extra | undefined) ||
    ((Constants as { manifest?: { extra?: Extra } }).manifest?.extra as
      | Extra
      | undefined) ||
    {};
  return extra ?? {};
}

/** Project root URL; strips accidental /rest/v1 pasted into secrets. */
export function normalizeSupabaseUrl(
  raw: string | null | undefined,
): string | null {
  let url = (raw || '').trim().replace(/\/+$/, '');
  if (!url) return null;
  url = url.replace(/\/rest\/v1$/i, '').replace(/\/rest$/i, '');
  url = url.replace(/\/+$/, '');
  return url || null;
}

/** Runtime fill from `/api/public-config` when Vercel build omitted anon key. */
let runtimeUrl: string | null = null;
let runtimeAnonKey: string | null = null;

export function setRuntimeSupabaseConfig(opts: {
  url?: string | null;
  anonKey?: string | null;
}) {
  if (opts.url) runtimeUrl = normalizeSupabaseUrl(opts.url);
  if (opts.anonKey) runtimeAnonKey = opts.anonKey.trim() || null;
}

/**
 * Client config from build-time env / app.config extra (+ optional runtime).
 * Never hardcode keys. Falls back to local-only storage when unset.
 */
export function getSupabaseConfig(): {
  url: string | null;
  anonKey: string | null;
  configured: boolean;
} {
  const extra = readExtra();
  const url =
    runtimeUrl ||
    (typeof process !== 'undefined' &&
      (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)) ||
    extra.supabaseUrl ||
    null;
  const anonKey =
    runtimeAnonKey ||
    (typeof process !== 'undefined' &&
      (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_ANON_KEY)) ||
    extra.supabaseAnonKey ||
    null;
  const cleanUrl = normalizeSupabaseUrl(url);
  const cleanKey = anonKey?.trim() || null;
  return {
    url: cleanUrl,
    anonKey: cleanKey,
    configured: Boolean(cleanUrl && cleanKey),
  };
}
