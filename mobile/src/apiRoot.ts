import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Production Vercel host for Lumo Edge Pro APIs + public-config.
 * Native Android/iOS have no same-origin, so all /api/* calls use this root.
 * Web keeps same-origin (or local brokers-dev) — see getApiRoot().
 */
export const PRODUCTION_API_ROOT = 'https://lumoedgepro.vercel.app';

type Extra = {
  productionApiRoot?: string;
};

function readExtraRoot(): string | null {
  const extra =
    (Constants.expoConfig?.extra as Extra | undefined) ||
    ((Constants as { manifest?: { extra?: Extra } }).manifest?.extra as
      | Extra
      | undefined) ||
    {};
  const raw = String(extra?.productionApiRoot || '').trim().replace(/\/+$/, '');
  return raw || null;
}

/**
 * Resolve the HTTP origin used for `/api/*` (licenses, mentors, brokers,
 * subscriptions, public-config).
 *
 * - Web on localhost Expo ports → brokers-dev (:8787)
 * - Web elsewhere → window.location.origin (Vercel / static host)
 * - Native → production Vercel (or build-time extra.productionApiRoot)
 */
export function getApiRoot(): string {
  const fromExtra = readExtraRoot();

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { hostname, port, origin } = window.location;
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]'
    ) {
      if (port === '8081' || port === '19006' || port === '8082') {
        return 'http://127.0.0.1:8787';
      }
    }
    return origin || fromExtra || PRODUCTION_API_ROOT;
  }

  return fromExtra || PRODUCTION_API_ROOT;
}

/** Absolute URL for a path that starts with `/api/...` (or any absolute path). */
export function apiUrl(path: string): string {
  const root = getApiRoot().replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${root}${p}`;
}
