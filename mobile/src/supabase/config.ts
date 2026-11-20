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

/**
 * Client config from build-time env / app.config extra.
 * Never hardcode keys. Falls back to local-only storage when unset.
 */
export function getSupabaseConfig(): {
  url: string | null;
  anonKey: string | null;
  configured: boolean;
} {
  const extra = readExtra();
  const url =
    (typeof process !== 'undefined' &&
      (process.env.EXPO_PUBLIC_SUPABASE_URL ||
        process.env.SUPABASE_URL)) ||
    extra.supabaseUrl ||
    null;
  const anonKey =
    (typeof process !== 'undefined' &&
      (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_ANON_KEY)) ||
    extra.supabaseAnonKey ||
    null;
  const cleanUrl = url?.trim() || null;
  const cleanKey = anonKey?.trim() || null;
  return {
    url: cleanUrl,
    anonKey: cleanKey,
    configured: Boolean(cleanUrl && cleanKey),
  };
}
