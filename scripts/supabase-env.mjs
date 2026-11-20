/**
 * Read Supabase env names without logging values.
 * Accepts a legacy Cloud Agent alias `supabase` for the service role only.
 */

/** Strip accidental /rest/v1 (or /rest) path so client + scripts hit project root. */
export function normalizeSupabaseUrl(raw) {
  let url = (raw || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  // Common paste mistake: project URL + /rest/v1/
  url = url.replace(/\/rest\/v1$/i, '').replace(/\/rest$/i, '');
  return url.replace(/\/+$/, '');
}

export function readSupabaseUrl() {
  return normalizeSupabaseUrl(
    process.env.SUPABASE_URL ||
      process.env.EXPO_PUBLIC_SUPABASE_URL ||
      '',
  );
}

export function readSupabaseAnonKey() {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();
}

export function readSupabaseServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    // Legacy misnamed Cloud Agent secret observed in some VMs
    process.env.supabase ||
    ''
  ).trim();
}

export function secretStatus() {
  const rawUrl = (
    process.env.SUPABASE_URL ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    ''
  ).trim();
  const url = Boolean(readSupabaseUrl());
  const anon = Boolean(readSupabaseAnonKey());
  const service = Boolean(readSupabaseServiceRoleKey());
  const serviceCanonical = Boolean(
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  );
  const serviceAlias = Boolean((process.env.supabase || '').trim());
  const strippedRestPath = /\/rest(\/v1)?\/?$/i.test(rawUrl.replace(/\/+$/, ''));
  return {
    SUPABASE_URL: url ? 'SET' : 'MISSING',
    SUPABASE_ANON_KEY: anon ? 'SET' : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: serviceCanonical
      ? 'SET'
      : serviceAlias
        ? 'ALIAS(supabase)'
        : 'MISSING',
    urlHadRestPath: strippedRestPath,
    readyForClient: url && anon,
    readyForApply: url && service,
  };
}
