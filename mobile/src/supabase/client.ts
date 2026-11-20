import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config';

let cached: SupabaseClient | null | undefined;

/** Shared anon client for portal + Activate. Null when secrets are not configured. */
export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const { url, anonKey, configured } = getSupabaseConfig();
  if (!configured || !url || !anonKey) {
    cached = null;
    return null;
  }
  cached = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}

export function isSupabaseConfigured() {
  return getSupabaseConfig().configured;
}
