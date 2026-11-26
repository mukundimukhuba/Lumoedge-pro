/**
 * Inject Supabase URL/anon + production API root into Expo `extra` at build time.
 * Prefer SUPABASE_* Cloud/Vercel secrets; EXPO_PUBLIC_* also accepted.
 * Values are never hardcoded (except the public Vercel API origin for native).
 */
function normalizeSupabaseUrl(raw) {
  let url = String(raw || '')
    .trim()
    .replace(/\/+$/, '');
  if (!url) return '';
  url = url.replace(/\/rest\/v1$/i, '').replace(/\/rest$/i, '');
  return url.replace(/\/+$/, '');
}

const PRODUCTION_API_ROOT = 'https://lumoedgepro.vercel.app';

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

  const productionApiRoot = (
    process.env.EXPO_PUBLIC_API_ROOT ||
    process.env.PRODUCTION_API_ROOT ||
    PRODUCTION_API_ROOT
  )
    .trim()
    .replace(/\/+$/, '');

  return {
    ...config,
    name: config.name || 'Lumo Edge Pro',
    slug: config.slug || 'lumo-edge-pro',
    android: {
      ...(config.android || {}),
      package: (config.android && config.android.package) || 'com.lumoedgepro.app',
    },
    ios: {
      ...(config.ios || {}),
      bundleIdentifier:
        (config.ios && config.ios.bundleIdentifier) || 'com.lumoedgepro.app',
    },
    extra: {
      ...(config.extra || {}),
      publicWebPath: '/ea-control',
      productionApiRoot,
      supabaseUrl: supabaseUrl || undefined,
      supabaseAnonKey: supabaseAnonKey || undefined,
    },
  };
};
