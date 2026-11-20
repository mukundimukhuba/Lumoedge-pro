/**
 * Inject Supabase URL/anon into Expo `extra` at build time from env.
 * Prefer SUPABASE_* Cloud/Vercel secrets; EXPO_PUBLIC_* also accepted.
 * Values are never hardcoded.
 */
function normalizeSupabaseUrl(raw) {
  let url = String(raw || '')
    .trim()
    .replace(/\/+$/, '');
  if (!url) return '';
  url = url.replace(/\/rest\/v1$/i, '').replace(/\/rest$/i, '');
  return url.replace(/\/+$/, '');
}

module.exports = ({ config }) => {
  const supabaseUrl = normalizeSupabaseUrl(
    process.env.SUPABASE_URL ||
      process.env.EXPO_PUBLIC_SUPABASE_URL ||
      '',
  );
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    '';

  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      publicWebPath: '/ea-control',
      supabaseUrl: supabaseUrl || undefined,
      supabaseAnonKey: supabaseAnonKey || undefined,
    },
  };
};
