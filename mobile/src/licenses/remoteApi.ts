import type { StoredEa, StoredLicenseKey } from '../licenseStorage';

function normalizeLicenseKey(raw: string) {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export type RemoteSyncResult = {
  ok: boolean;
  via?: 'table' | 'storage' | string;
  error?: string;
  hint?: string;
  tableError?: string;
  configured?: boolean;
  key_normalized?: string;
  /** Public http URL after server uploaded a data: logo (if any). */
  eaPictureUri?: string | null;
  keyPictureUri?: string | null;
};

export type RemoteLookupResult = {
  ok: boolean;
  via?: string;
  error?: string;
  configured?: boolean;
  key?: StoredLicenseKey;
  ea?: StoredEa | null;
};

function apiBase() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

export async function fetchLicenseStatus(): Promise<{
  ok: boolean;
  urlConfigured?: boolean;
  serviceRoleConfigured?: boolean;
  anonConfigured?: boolean;
  missingEnvNames?: string[];
  hint?: string;
  tables?: Record<string, string>;
  storageFallback?: boolean;
  error?: string;
}> {
  try {
    const res = await fetch(`${apiBase()}/api/licenses/status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const data = (await res.json()) as Record<string, unknown>;
    return {
      ok: Boolean(data.ok),
      urlConfigured: Boolean(data.urlConfigured),
      serviceRoleConfigured: Boolean(data.serviceRoleConfigured),
      anonConfigured: Boolean(data.anonConfigured),
      missingEnvNames: Array.isArray(data.missingEnvNames)
        ? (data.missingEnvNames as string[])
        : undefined,
      hint: data.hint ? String(data.hint) : undefined,
      tables: (data.tables as Record<string, string>) || undefined,
      storageFallback: Boolean(data.storageFallback),
      error: data.error ? String(data.error) : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'status unreachable',
    };
  }
}

/** Push one EA + key to server (tables or Storage). */
export async function putLicenseRemote(
  key: StoredLicenseKey,
  ea?: StoredEa | null,
): Promise<RemoteSyncResult> {
  try {
    const res = await fetch(`${apiBase()}/api/licenses/put`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        key: {
          id: key.id,
          eaId: key.eaId,
          eaName: key.eaName,
          key: key.key,
          createdAt: key.createdAt,
          eaPictureUri: key.eaPictureUri,
          eaSymbols: key.eaSymbols,
          assigneeName: key.assigneeName ?? null,
          assigneeEmail: key.assigneeEmail ?? null,
          issuedByEmail: key.issuedByEmail ?? null,
          status: key.status || 'unused',
          activatedAt: key.activatedAt ?? null,
        },
        ea: ea
          ? {
              id: ea.id,
              name: ea.name,
              pictureUri: ea.pictureUri,
              symbols: ea.symbols,
              createdAt: ea.createdAt,
            }
          : undefined,
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        error: String(data.error || `HTTP ${res.status}`),
        tableError: data.tableError ? String(data.tableError) : undefined,
        hint: data.hint ? String(data.hint) : undefined,
        configured: data.configured !== false,
      };
    }
    const eaPic =
      typeof data.ea_picture_uri === 'string' ? data.ea_picture_uri : null;
    const keyPic =
      typeof data.key_picture_uri === 'string' ? data.key_picture_uri : null;
    return {
      ok: true,
      via: data.via ? String(data.via) : undefined,
      hint: data.hint ? String(data.hint) : undefined,
      tableError: data.tableError ? String(data.tableError) : undefined,
      configured: true,
      key_normalized: data.key_normalized
        ? String(data.key_normalized)
        : normalizeLicenseKey(key.key),
      eaPictureUri: eaPic,
      keyPictureUri: keyPic,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'put unreachable',
    };
  }
}

export async function lookupLicenseRemote(
  rawKey: string,
): Promise<RemoteLookupResult> {
  try {
    const res = await fetch(`${apiBase()}/api/licenses/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ key: normalizeLicenseKey(rawKey) }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (res.status === 404 || data.ok === false) {
      return {
        ok: false,
        error: String(data.error || 'License key not found'),
        configured: data.configured !== false,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: String(data.error || `HTTP ${res.status}`),
        configured: data.configured !== false,
      };
    }
    const key = data.key as StoredLicenseKey | undefined;
    const ea = (data.ea as StoredEa | null | undefined) ?? null;
    if (!key) {
      return { ok: false, error: 'Empty lookup response' };
    }
    return {
      ok: true,
      via: data.via ? String(data.via) : undefined,
      key,
      ea,
      configured: true,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'lookup unreachable',
    };
  }
}
