/**
 * Read Supabase env names without logging values.
 * Accepts a legacy Cloud Agent alias `supabase` for the service role only.
 */
export function readSupabaseUrl() {
  return (
    process.env.SUPABASE_URL ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    ''
  ).trim();
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
  const url = Boolean(readSupabaseUrl());
  const anon = Boolean(readSupabaseAnonKey());
  const service = Boolean(readSupabaseServiceRoleKey());
  const serviceCanonical = Boolean(
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  );
  const serviceAlias = Boolean((process.env.supabase || '').trim());
  return {
    SUPABASE_URL: url ? 'SET' : 'MISSING',
    SUPABASE_ANON_KEY: anon ? 'SET' : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: serviceCanonical
      ? 'SET'
      : serviceAlias
        ? 'ALIAS(supabase)'
        : 'MISSING',
    readyForClient: url && anon,
    readyForApply: url && service,
  };
}
