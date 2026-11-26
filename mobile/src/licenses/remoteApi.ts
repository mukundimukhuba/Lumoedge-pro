import { safeMessageFromApiBody, toSafeUserMessage } from '../portal/safeErrors';
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
      hint: undefined,
      tables: (data.tables as Record<string, string>) || undefined,
      storageFallback: Boolean(data.storageFallback),
      error: data.error
        ? safeMessageFromApiBody(data, 'portal')
        : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      error: toSafeUserMessage(err, 'portal'),
    };
  }
}

export type CaptchaPublicConfig = {
  provider: 'checkbox' | 'turnstile' | 'recaptcha' | string;
  siteKey: string | null;
};

/** Public captcha provider (checkbox fallback when no Turnstile/reCAPTCHA keys). */
export async function fetchCaptchaConfig(): Promise<{
  ok: boolean;
  captcha?: CaptchaPublicConfig;
  error?: string;
}> {
  try {
    const res = await fetch(`${apiBase()}/api/licenses/challenge`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const data = (await res.json()) as Record<string, unknown>;
    const captcha = data.captcha as CaptchaPublicConfig | undefined;
    return {
      ok: Boolean(data.ok),
      captcha: captcha || { provider: 'checkbox', siteKey: null },
      error: data.error ? safeMessageFromApiBody(data, 'portal') : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      captcha: { provider: 'checkbox', siteKey: null },
      error: toSafeUserMessage(err, 'portal'),
    };
  }
}

/**
 * After the mentor ticks “I’m not a robot”, mint a short-lived challenge token
 * (checkbox provider). Turnstile/reCAPTCHA use the widget response instead.
 */
export async function issueCheckboxChallenge(opts?: {
  actorEmail?: string | null;
}): Promise<{ ok: boolean; token?: string; error?: string; provider?: string }> {
  try {
    const res = await fetch(`${apiBase()}/api/licenses/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        checked: true,
        actorEmail: opts?.actorEmail || null,
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        error: safeMessageFromApiBody(data, 'portal'),
        provider: data.provider ? String(data.provider) : undefined,
      };
    }
    const token = typeof data.token === 'string' ? data.token : '';
    if (!token) {
      return {
        ok: false,
        error: 'Challenge token missing — complete the robot check widget',
        provider: data.provider ? String(data.provider) : undefined,
      };
    }
    return {
      ok: true,
      token,
      provider: data.provider ? String(data.provider) : 'checkbox',
    };
  } catch (err) {
    return { ok: false, error: toSafeUserMessage(err, 'portal') };
  }
}

/** Push one EA + key to server (tables or Storage). */
export async function putLicenseRemote(
  key: StoredLicenseKey & { regenerate?: boolean },
  ea?: StoredEa | null,
  opts?: {
    actorEmail?: string | null;
    generate?: boolean;
    challengeToken?: string | null;
  },
): Promise<RemoteSyncResult> {
  const actorEmail =
    opts?.actorEmail || key.issuedByEmail || ea?.ownerEmail || null;
  try {
    const res = await fetch(`${apiBase()}/api/licenses/put`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        actorEmail,
        generate: Boolean(opts?.generate),
        challengeToken: opts?.challengeToken || undefined,
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
          mentorId: key.mentorId ?? key.issuedByEmail ?? null,
          subscriptionId: key.subscriptionId ?? null,
          licenseDuration: key.licenseDuration ?? null,
          licenseStatus: key.licenseStatus ?? key.status ?? 'unused',
          expiresAt: key.expiresAt ?? null,
          regenerate: Boolean(key.regenerate),
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
              ownerEmail: ea.ownerEmail ?? key.issuedByEmail ?? null,
            }
          : undefined,
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        error: safeMessageFromApiBody(data, 'portal'),
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
      hint: undefined,
      tableError: undefined,
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
      error: toSafeUserMessage(err, 'portal'),
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
        error: safeMessageFromApiBody(
          { ...data, error: data.error || 'License key not found' },
          'portal',
        ),
        configured: data.configured !== false,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: safeMessageFromApiBody(data, 'portal'),
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
      error: toSafeUserMessage(err, 'portal'),
    };
  }
}

export type EaRemoteResult = {
  ok: boolean;
  via?: string;
  error?: string;
  configured?: boolean;
  ea?: StoredEa | null;
  cascaded?: number;
  pictureUri?: string | null;
};

/** Fetch managed EA branding by id (source of truth for Home). */
export async function fetchEaRemote(eaId: string): Promise<EaRemoteResult> {
  const id = String(eaId || '').trim();
  if (!id) return { ok: false, error: 'ea id required' };
  try {
    const res = await fetch(`${apiBase()}/api/eas/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (res.status === 404 || data.ok === false) {
      return {
        ok: false,
        error: safeMessageFromApiBody(
          { ...data, error: data.error || 'EA not found' },
          'portal',
        ),
        configured: data.configured !== false,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: safeMessageFromApiBody(data, 'portal'),
        configured: data.configured !== false,
      };
    }
    const ea = (data.ea as StoredEa | null | undefined) ?? null;
    return {
      ok: true,
      via: data.via ? String(data.via) : undefined,
      ea,
      configured: true,
      pictureUri: ea?.pictureUri ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      error: toSafeUserMessage(err, 'portal'),
    };
  }
}

/**
 * Upsert managed EA branding and cascade name/picture to all license keys
 * under that EA (server-side).
 */
export async function putEaBrandingRemote(
  ea: StoredEa,
  opts?: { actorEmail?: string | null },
): Promise<EaRemoteResult> {
  const actorEmail = opts?.actorEmail || ea.ownerEmail || null;
  try {
    const res = await fetch(`${apiBase()}/api/eas/put`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        cascade: true,
        actorEmail,
        ea: {
          id: ea.id,
          name: ea.name,
          pictureUri: ea.pictureUri,
          symbols: ea.symbols,
          createdAt: ea.createdAt,
          ownerEmail: ea.ownerEmail ?? actorEmail,
        },
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        error: safeMessageFromApiBody(data, 'portal'),
        configured: data.configured !== false,
      };
    }
    const outEa = (data.ea as StoredEa | null | undefined) ?? null;
    const pic =
      (typeof data.picture_uri === 'string' ? data.picture_uri : null) ||
      outEa?.pictureUri ||
      null;
    return {
      ok: true,
      via: data.via ? String(data.via) : undefined,
      ea: outEa
        ? { ...outEa, pictureUri: pic || outEa.pictureUri }
        : { ...ea, pictureUri: pic || ea.pictureUri },
      cascaded: typeof data.cascaded === 'number' ? data.cascaded : 0,
      pictureUri: pic,
      configured: true,
    };
  } catch (err) {
    return {
      ok: false,
      error: toSafeUserMessage(err, 'portal'),
    };
  }
}
