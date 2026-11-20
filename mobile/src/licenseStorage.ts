import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { compressCatalogPictures, compressEaPicture } from './eaPicture';
import {
  hydrateEasFromVault,
  hydrateKeysFromVault,
  listVaultPictureKeys,
  vaultCatalogPictures,
  vaultGetPicture,
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

/**
 * Canonical form for compare / Supabase `key_normalized`.
 * Folds OCR lookalikes: O→0, I/L→1 so mentor screenshots and typed keys match.
 */
export function normalizeLicenseKey(raw: string) {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** True when two keys match after OCR-safe normalize (hyphens/spacing ignored equally). */
export function licenseKeysMatch(a: string, b: string) {
  return normalizeLicenseKey(a) === normalizeLicenseKey(b);
}

const CATALOG_SYNC_CHANNEL = 'edges-license-catalog-v1';

/** Notify same-origin listeners (Activate / other tabs) that the catalog changed. */
export function broadcastCatalogUpdated() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event('edges-catalog-updated'));
  } catch {
    /* ignore */
  }
  try {
    const bc = new BroadcastChannel(CATALOG_SYNC_CHANNEL);
    bc.postMessage({ type: 'catalog-updated', at: Date.now() });
    bc.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
}

export function subscribeCatalogUpdated(onUpdate: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onCustom = () => onUpdate();
  const onStorage = (ev: StorageEvent) => {
    if (
      ev.key === LICENSE_KEYS_STORAGE_KEY ||
      ev.key === EAS_STORAGE_KEY ||
      ev.key === null
    ) {
      onUpdate();
    }
  };
  window.addEventListener('edges-catalog-updated', onCustom);
  window.addEventListener('storage', onStorage);
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CATALOG_SYNC_CHANNEL);
    bc.onmessage = () => onUpdate();
  } catch {
    bc = null;
  }
  return () => {
    window.removeEventListener('edges-catalog-updated', onCustom);
    window.removeEventListener('storage', onStorage);
    try {
      bc?.close();
    } catch {
      /* ignore */
    }
  };
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

type RemoteFetch =
  | { ok: true; eas: StoredEa[]; keys: StoredLicenseKey[] }
  | { ok: false; eas: []; keys: []; error?: string };

async function fetchRemoteCatalog(): Promise<RemoteFetch> {
  const sb = getSupabase();
  if (!sb) {
    return { ok: false, eas: [], keys: [], error: 'supabase not configured' };
  }
  try {
    const [easRes, keysRes] = await Promise.all([
      sb.from('managed_eas').select('*'),
      sb.from('license_keys').select('*'),
    ]);
    if (easRes.error || keysRes.error) {
      const msg = easRes.error?.message || keysRes.error?.message || 'fetch failed';
      console.warn('[edges] supabase catalog fetch failed', msg);
      return { ok: false, eas: [], keys: [], error: msg };
    }
    return {
      ok: true,
      eas: (easRes.data || []).map((r) => rowToEa(r as Record<string, unknown>)),
      keys: (keysRes.data || []).map((r) =>
        rowToKey(r as Record<string, unknown>),
      ),
    };
  } catch (err) {
    console.warn('[edges] supabase catalog fetch error', err);
    return {
      ok: false,
      eas: [],
      keys: [],
      error: err instanceof Error ? err.message : 'fetch error',
    };
  }
}

/**
 * If localStorage was wiped but IndexedDB still has EA pictures,
 * rebuild stub robots so Manage EAs is not empty.
 */
async function recoverEasFromVault(existing: StoredEa[]): Promise<StoredEa[]> {
  if (existing.length) return existing;
  try {
    const vaultKeys = await listVaultPictureKeys();
    const stubs: StoredEa[] = [];
    for (const vk of vaultKeys) {
      if (!vk.startsWith('ea:')) continue;
      const id = vk.slice(3);
      if (!id || existing.some((e) => e.id === id)) continue;
      const pic = await vaultGetPicture(vk);
      stubs.push({
        id,
        name: id.startsWith('ea_') ? id.replace(/^ea_/, '').slice(0, 24) || 'EA' : 'EA',
        pictureUri: pic,
        symbols: [],
        createdAt: new Date().toISOString(),
      });
    }
    return stubs;
  } catch {
    return existing;
  }
}

async function readDiskCatalog(): Promise<{
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
  return { eas: diskEas, keys: diskKeys };
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
  const disk = await readDiskCatalog();
  let diskEas = disk.eas;
  let diskKeys = disk.keys;

  // Remote (cross-device) merges in when Supabase secrets are configured.
  // Failed fetches must NOT be treated as an empty catalog.
  const remote = await fetchRemoteCatalog();
  const remoteEas = remote.ok ? remote.eas : [];
  const remoteKeys = remote.ok ? remote.keys : [];

  // Memory + disk + remote; prefer pictures when merging.
  let eas = mergeEaPreferPicture(memoryEas, diskEas);
  eas = mergeEaPreferPicture(eas, remoteEas);
  let keys = mergeKeysByKeyString(memoryKeys, diskKeys);
  keys = mergeKeysByKeyString(keys, remoteKeys);

  // Rehydrate any pictures stripped from localStorage by quota — IndexedDB vault.
  eas = await hydrateEasFromVault(eas);
  keys = await hydrateKeysFromVault(keys);

  // Last resort: rebuild stub EAs from vault after a localStorage wipe.
  if (!eas.length) {
    eas = await recoverEasFromVault(eas);
  }

  memoryEas = eas;
  memoryKeys = keys;
  return { eas, keys };
}

/**
 * Accidental empty persist after a failed/empty load was wiping Manage EAs.
 * Callers that intentionally clear must pass `{ allowEmpty: true }`.
 * Default: refuse writing [] over a non-empty disk or healthy remote catalog.
 */
async function shouldRefuseEmptyWipe(
  eas: StoredEa[],
  keys: StoredLicenseKey[],
  allowEmpty: boolean,
): Promise<boolean> {
  if (allowEmpty) return false;
  if (eas.length || keys.length) return false;
  const disk = await readDiskCatalog();
  if (disk.eas.length || disk.keys.length) return true;
  const remote = await fetchRemoteCatalog();
  if (remote.ok && (remote.eas.length || remote.keys.length)) return true;
  return false;
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
  opts?: { allowEmpty?: boolean; broadcast?: boolean },
) {
  if (await shouldRefuseEmptyWipe(eas, keys, Boolean(opts?.allowEmpty))) {
    console.warn(
      '[edges] refused empty catalog save — would wipe existing EAs/keys',
    );
    return { eas: memoryEas, keys: memoryKeys };
  }

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

  // Skip broadcast on quiet persists (refresh/hydrate) to avoid sync loops.
  if (opts?.broadcast !== false) {
    broadcastCatalogUpdated();
  }

  // Return in-memory catalog WITH pictures (never return stripped copies).
  return prepared;
}

async function attachRemoteEa(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  key: StoredLicenseKey,
  eas: StoredEa[],
) {
  try {
    const eaRes = await sb
      .from('managed_eas')
      .select('*')
      .eq('id', key.eaId)
      .maybeSingle();
    if (!eaRes.error && eaRes.data) {
      const remoteEa = rowToEa(eaRes.data as Record<string, unknown>);
      memoryEas = mergeEaPreferPicture([remoteEa], eas);
    }
  } catch {
    /* local eas still returned below */
  }
}

async function lookupKeyOnSupabase(
  normalized: string,
): Promise<StoredLicenseKey | null> {
  const sb = getSupabase();
  if (!sb) return null;

  // 1) security-definer RPC (folds O/I/L when migration 002 is applied)
  try {
    const { data, error } = await sb.rpc('lookup_license_key', {
      p_key: normalized,
    });
    if (!error && Array.isArray(data) && data.length) {
      return rowToKey(data[0] as Record<string, unknown>);
    }
  } catch (err) {
    console.warn('[edges] lookup_license_key rpc failed', err);
  }

  // 2) Direct table read by key_normalized (anon RLS allows select)
  try {
    const { data, error } = await sb
      .from('license_keys')
      .select('*')
      .eq('key_normalized', normalized)
      .limit(1);
    if (!error && Array.isArray(data) && data.length) {
      return rowToKey(data[0] as Record<string, unknown>);
    }
  } catch (err) {
    console.warn('[edges] license_keys select failed', err);
  }

  // 3) Legacy rows stored before OCR fold — scan a page and match client-side
  try {
    const { data, error } = await sb
      .from('license_keys')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (!error && Array.isArray(data)) {
      const hit = data.find(
        (row) =>
          normalizeLicenseKey(String((row as { key?: string }).key || '')) ===
            normalized ||
          normalizeLicenseKey(
            String((row as { key_normalized?: string }).key_normalized || ''),
          ) === normalized,
      );
      if (hit) return rowToKey(hit as Record<string, unknown>);
    }
  } catch (err) {
    console.warn('[edges] license_keys scan failed', err);
  }

  return null;
}

export async function findIssuedLicense(
  rawKey: string,
): Promise<{
  key: StoredLicenseKey;
  eas: StoredEa[];
  keys: StoredLicenseKey[];
} | null> {
  const normalized = normalizeLicenseKey(rawKey);
  if (!normalized.startsWith('EDGES-') || normalized.length < 20) {
    return null;
  }

  const { eas, keys } = await loadLicenseCatalog();
  let key =
    keys.find((k) => licenseKeysMatch(k.key, normalized)) ||
    memoryKeys.find((k) => licenseKeysMatch(k.key, normalized));

  // Cross-device / wiped localStorage: Supabase RPC + table + OCR scan.
  if (!key) {
    const remoteKey = await lookupKeyOnSupabase(normalized);
    if (remoteKey) {
      key = remoteKey;
      memoryKeys = mergeKeysByKeyString([key], keys);
      const sb = getSupabase();
      if (sb) await attachRemoteEa(sb, key, eas);
      // Persist so same-device Activate works offline next time.
      try {
        await saveLicenseCatalog(
          memoryEas.length ? memoryEas : eas,
          memoryKeys,
          { broadcast: false },
        );
      } catch {
        /* memory still holds the key for this session */
      }
    }
  }

  if (!key) return null;
  return {
    key,
    eas: memoryEas.length ? memoryEas : eas,
    keys: memoryKeys.length ? memoryKeys : keys,
  };
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
