import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { compressCatalogPictures, compressEaPicture } from './eaPicture';
import {
  hydrateEasFromVault,
  hydrateKeysFromVault,
  vaultCatalogPictures,
} from './pictureVault';
import { getSupabase, isSupabaseConfigured } from './supabase/client';
import { persistPictureRemote } from './supabase/eaPictureUpload';

/** Shared storage keys — portal License Keys + app Activate MUST use these. */
export const EAS_STORAGE_KEY = 'edges-managed-eas-v1';
export const LICENSE_KEYS_STORAGE_KEY = 'edges-license-keys-v1';

export type StoredEa = {
  id: string;
  name: string;
  pictureUri: string | null;
  symbols: string[];
  createdAt: string;
};

export type StoredLicenseKey = {
  id: string;
  eaId: string;
  eaName: string;
  key: string;
  createdAt: string;
  eaPictureUri: string | null;
  eaSymbols: string[];
};

/**
 * In-memory catalog for the SPA session.
 * Survives route changes; backs Activate when localStorage quota drops picture writes.
 */
let memoryEas: StoredEa[] = [];
let memoryKeys: StoredLicenseKey[] = [];

export function normalizeLicenseKey(raw: string) {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

function webLocalGet(key: string): string | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function webLocalSet(key: string, value: string): boolean {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Prefer one copy of each picture on the key snapshot (Activate binding),
 * and keep a matching copy on the EA when space allows.
 * Deduplicate identical data-URLs so EA + key don't double the payload needlessly
 * in memory — both still store the uri string (shared content).
 */
function prepareForDisk(eas: StoredEa[], keys: StoredLicenseKey[]) {
  // Ensure every key that maps to an EA inherits that EA's picture if missing.
  const eaById = new Map(eas.map((e) => [e.id, e]));
  const keysWithPics = keys.map((k) => {
    if (k.eaPictureUri) return k;
    const live = eaById.get(k.eaId);
    return live?.pictureUri
      ? { ...k, eaPictureUri: live.pictureUri }
      : k;
  });
  return { eas, keys: keysWithPics };
}

function mergeById<T extends { id: string }>(primary: T[], secondary: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of secondary) map.set(row.id, row);
  for (const row of primary) map.set(row.id, row);
  return Array.from(map.values());
}

function mergeKeysByKeyString(
  primary: StoredLicenseKey[],
  secondary: StoredLicenseKey[],
): StoredLicenseKey[] {
  const map = new Map<string, StoredLicenseKey>();
  for (const row of secondary) map.set(normalizeLicenseKey(row.key), row);
  for (const row of primary) map.set(normalizeLicenseKey(row.key), row);
  const seen = new Set<string>();
  const out: StoredLicenseKey[] = [];
  for (const row of [...primary, ...secondary]) {
    const k = normalizeLicenseKey(row.key);
    if (seen.has(k)) continue;
    seen.add(k);
    // Prefer the row that still has a picture when merging duplicates.
    const picked = map.get(k)!;
    const alt = primary.find((r) => normalizeLicenseKey(r.key) === k);
    const sec = secondary.find((r) => normalizeLicenseKey(r.key) === k);
    if (!picked.eaPictureUri) {
      const withPic = [alt, sec].find((r) => r?.eaPictureUri);
      if (withPic) {
        out.push(withPic);
        continue;
      }
    }
    out.push(picked);
  }
  return out;
}

function mergeEaPreferPicture(primary: StoredEa[], secondary: StoredEa[]) {
  const merged = mergeById(primary, secondary);
  return merged.map((e) => {
    if (e.pictureUri) return e;
    const other =
      secondary.find((x) => x.id === e.id) ||
      primary.find((x) => x.id === e.id);
    return other?.pictureUri ? { ...e, pictureUri: other.pictureUri } : e;
  });
}

export function getMemoryCatalog() {
  return { eas: memoryEas, keys: memoryKeys };
}

export function setMemoryCatalog(eas: StoredEa[], keys: StoredLicenseKey[]) {
  memoryEas = eas;
  memoryKeys = keys;
}

function rowToEa(row: Record<string, unknown>): StoredEa {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    pictureUri: (row.picture_uri as string | null) ?? null,
    symbols: Array.isArray(row.symbols) ? (row.symbols as string[]) : [],
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function rowToKey(row: Record<string, unknown>): StoredLicenseKey {
  return {
    id: String(row.id),
    eaId: String(row.ea_id),
    eaName: String(row.ea_name ?? ''),
    key: String(row.key),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    eaPictureUri: (row.ea_picture_uri as string | null) ?? null,
    eaSymbols: Array.isArray(row.ea_symbols)
      ? (row.ea_symbols as string[])
      : [],
  };
}

async function fetchRemoteCatalog(): Promise<{
  eas: StoredEa[];
  keys: StoredLicenseKey[];
} | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const [easRes, keysRes] = await Promise.all([
      sb.from('managed_eas').select('*'),
      sb.from('license_keys').select('*'),
    ]);
    if (easRes.error || keysRes.error) {
      console.warn(
        '[edges] supabase catalog fetch failed',
        easRes.error?.message || keysRes.error?.message,
      );
      return null;
    }
    return {
      eas: (easRes.data || []).map((r) => rowToEa(r as Record<string, unknown>)),
      keys: (keysRes.data || []).map((r) =>
        rowToKey(r as Record<string, unknown>),
      ),
    };
  } catch (err) {
    console.warn('[edges] supabase catalog fetch error', err);
    return null;
  }
}

async function pushRemoteCatalog(eas: StoredEa[], keys: StoredLicenseKey[]) {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    // Prefer Storage URLs for data-URL pictures so rows stay small + durable.
    const easRemote = await Promise.all(
      eas.map(async (e) => ({
        ...e,
        pictureUri: await persistPictureRemote(`eas/${e.id}`, e.pictureUri),
      })),
    );
    const keysRemote = await Promise.all(
      keys.map(async (k) => ({
        ...k,
        eaPictureUri: await persistPictureRemote(
          `keys/${k.id}`,
          k.eaPictureUri,
        ),
      })),
    );

    const eaRows = easRemote.map((e) => ({
      id: e.id,
      name: e.name,
      picture_uri: e.pictureUri,
      symbols: e.symbols ?? [],
      created_at: e.createdAt,
      updated_at: new Date().toISOString(),
    }));
    const keyRows = keysRemote.map((k) => ({
      id: k.id,
      ea_id: k.eaId,
      ea_name: k.eaName,
      key: k.key,
      key_normalized: normalizeLicenseKey(k.key),
      created_at: k.createdAt,
      ea_picture_uri: k.eaPictureUri,
      ea_symbols: k.eaSymbols ?? [],
    }));

    if (eaRows.length) {
      const { error } = await sb.from('managed_eas').upsert(eaRows, {
        onConflict: 'id',
      });
      if (error) {
        console.warn('[edges] supabase eas upsert failed', error.message);
        return false;
      }
    }
    if (keyRows.length) {
      const { error } = await sb.from('license_keys').upsert(keyRows, {
        onConflict: 'id',
      });
      if (error) {
        console.warn('[edges] supabase keys upsert failed', error.message);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.warn('[edges] supabase catalog push error', err);
    return false;
  }
}

export async function loadLicenseCatalog(): Promise<{
  eas: StoredEa[];
  keys: StoredLicenseKey[];
}> {
  let diskEas: StoredEa[] = [];
  let diskKeys: StoredLicenseKey[] = [];

  const easRaw =
    webLocalGet(EAS_STORAGE_KEY) ?? (await AsyncStorage.getItem(EAS_STORAGE_KEY));
  const keysRaw =
    webLocalGet(LICENSE_KEYS_STORAGE_KEY) ??
    (await AsyncStorage.getItem(LICENSE_KEYS_STORAGE_KEY));

  try {
    if (easRaw) {
      const parsed = JSON.parse(easRaw) as StoredEa[];
      if (Array.isArray(parsed)) diskEas = parsed;
    }
  } catch {
    /* ignore */
  }
  try {
    if (keysRaw) {
      const parsed = JSON.parse(keysRaw) as StoredLicenseKey[];
      if (Array.isArray(parsed)) diskKeys = parsed;
    }
  } catch {
    /* ignore */
  }

  // Remote (cross-device) merges in when Supabase secrets are configured.
  const remote = await fetchRemoteCatalog();
  const remoteEas = remote?.eas ?? [];
  const remoteKeys = remote?.keys ?? [];

  // Memory + disk + remote; prefer pictures when merging.
  let eas = mergeEaPreferPicture(memoryEas, diskEas);
  eas = mergeEaPreferPicture(eas, remoteEas);
  let keys = mergeKeysByKeyString(memoryKeys, diskKeys);
  keys = mergeKeysByKeyString(keys, remoteKeys);

  // Rehydrate any pictures stripped from localStorage by quota — IndexedDB vault.
  eas = await hydrateEasFromVault(eas);
  keys = await hydrateKeysFromVault(keys);

  memoryEas = eas;
  memoryKeys = keys;
  return { eas, keys };
}

function stripDataUrlPicsFromEas(eas: StoredEa[]): StoredEa[] {
  return eas.map((e) => ({
    ...e,
    pictureUri:
      e.pictureUri && e.pictureUri.startsWith('data:') ? null : e.pictureUri,
  }));
}

function stripDataUrlPicsFromKeys(keys: StoredLicenseKey[]): StoredLicenseKey[] {
  return keys.map((k) => ({
    ...k,
    eaPictureUri:
      k.eaPictureUri && k.eaPictureUri.startsWith('data:')
        ? null
        : k.eaPictureUri,
  }));
}

export async function saveLicenseCatalog(
  eas: StoredEa[],
  keys: StoredLicenseKey[],
) {
  // Compress data-URL pictures before any disk write.
  const compressed = await compressCatalogPictures(eas, keys);
  const prepared = prepareForDisk(compressed.eas, compressed.keys);

  // ALWAYS vault pictures first so quota-stripped catalog JSON cannot lose them.
  await vaultCatalogPictures(prepared.eas, prepared.keys);

  memoryEas = prepared.eas;
  memoryKeys = prepared.keys;

  const easJson = JSON.stringify(prepared.eas);
  const keysJson = JSON.stringify(prepared.keys);

  // Keys first (Activate needs key + picture snapshot), then EAs.
  let keysOk = webLocalSet(LICENSE_KEYS_STORAGE_KEY, keysJson);
  let easOk = webLocalSet(EAS_STORAGE_KEY, easJson);

  if (!easOk) {
    // Metadata only in localStorage — pictures remain in IndexedDB vault.
    easOk = webLocalSet(
      EAS_STORAGE_KEY,
      JSON.stringify(stripDataUrlPicsFromEas(prepared.eas)),
    );
  }

  if (!keysOk) {
    keysOk = webLocalSet(
      LICENSE_KEYS_STORAGE_KEY,
      JSON.stringify(stripDataUrlPicsFromKeys(prepared.keys)),
    );
  }

  try {
    await AsyncStorage.setItem(LICENSE_KEYS_STORAGE_KEY, keysJson);
    try {
      await AsyncStorage.setItem(EAS_STORAGE_KEY, easJson);
    } catch {
      await AsyncStorage.setItem(
        EAS_STORAGE_KEY,
        JSON.stringify(stripDataUrlPicsFromEas(prepared.eas)),
      );
    }
  } catch {
    try {
      await AsyncStorage.setItem(
        LICENSE_KEYS_STORAGE_KEY,
        JSON.stringify(stripDataUrlPicsFromKeys(prepared.keys)),
      );
      await AsyncStorage.setItem(
        EAS_STORAGE_KEY,
        JSON.stringify(stripDataUrlPicsFromEas(prepared.eas)),
      );
    } catch {
      console.warn(
        '[edges] catalog JSON write failed; pictures kept in vault + memory',
        { keysOk, easOk, keysBytes: keysJson.length, easBytes: easJson.length },
      );
    }
  }

  if (isSupabaseConfigured()) {
    await pushRemoteCatalog(prepared.eas, prepared.keys);
  }

  // Return in-memory catalog WITH pictures (never return stripped copies).
  return prepared;
}

export async function findIssuedLicense(
  rawKey: string,
): Promise<{
  key: StoredLicenseKey;
  eas: StoredEa[];
  keys: StoredLicenseKey[];
} | null> {
  const normalized = normalizeLicenseKey(rawKey);
  const { eas, keys } = await loadLicenseCatalog();
  const matches = keys.filter((k) => normalizeLicenseKey(k.key) === normalized);
  const key = matches[0];
  if (!key) return null;
  return { key, eas, keys };
}

/**
 * Build the activated session strictly from the license → EA mapping.
 * Key snapshot is authoritative for picture/name/symbols; live EA fills gaps
 * only when same eaId.
 */
export function sessionFromLicenseKey(
  issued: StoredLicenseKey,
  eas: StoredEa[],
): {
  licenseKey: string;
  eaId: string;
  name: string;
  pictureUri: string | null;
  symbols: string[];
  activatedAt: string;
} {
  const live = eas.find((e) => e.id === issued.eaId);
  const name =
    (issued.eaName || '').trim() ||
    (live && live.id === issued.eaId ? live.name.trim() : '') ||
    'EA';
  // Prefer picture stored on the key (mentor upload snapshot).
  const pictureUri =
    issued.eaPictureUri ||
    (live && live.id === issued.eaId ? live.pictureUri : null);
  const symbols =
    issued.eaSymbols?.length
      ? [...issued.eaSymbols]
      : live && live.id === issued.eaId && live.symbols?.length
        ? [...live.symbols]
        : [];

  return {
    licenseKey: issued.key,
    eaId: issued.eaId,
    name,
    pictureUri,
    symbols,
    activatedAt: new Date().toISOString(),
  };
}

/** Compress a single picture for Manage EAs / generate. */
export { compressEaPicture };
