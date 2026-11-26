import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getSupabaseConfig,
  setRuntimeSupabaseConfig,
} from './config';

let cached: SupabaseClient | null | undefined;
let hydratePromise: Promise<boolean> | null = null;

export function resetSupabaseClient() {
  cached = undefined;
}

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

/**
 * On web, if build-time extra lacks the anon key, load it from `/api/public-config`
 * (anon keys are public by design). Call before mentor login / register cloud sync.
 */
export function hydrateSupabaseConfig(): Promise<boolean> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    if (getSupabaseConfig().configured) return true;
    if (typeof fetch === 'undefined') return false;
    try {
      const res = await fetch('/api/public-config', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return false;
      const body = (await res.json()) as {
        supabaseUrl?: string | null;
        supabaseAnonKey?: string | null;
      };
      setRuntimeSupabaseConfig({
        url: body.supabaseUrl,
        anonKey: body.supabaseAnonKey,
      });
      resetSupabaseClient();
      return getSupabaseConfig().configured;
    } catch {
      return false;
    }
  })();
  return hydratePromise;
}
