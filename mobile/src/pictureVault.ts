/**
 * Durable local vault for EA / license pictures.
 * Web: IndexedDB (survives refresh; avoids localStorage quota drops).
 * Native: AsyncStorage keyed blobs.
 * Never delete pictures on quota failure — catalog metadata may strip data-URLs,
 * then hydrateEasFromVault / hydrateKeysFromVault put them back.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const DB_NAME = 'edges-ea-pictures-v1';
const STORE = 'pictures';
const AS_PREFIX = 'edges-ea-pic-v1:';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no indexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb open failed'));
  });
}

async function idbPut(key: string, value: string): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('idb put failed'));
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

async function idbGet(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    const value = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () =>
        resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => reject(req.error || new Error('idb get failed'));
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

async function asPut(key: string, value: string): Promise<boolean> {
  try {
    await AsyncStorage.setItem(AS_PREFIX + key, value);
    return true;
  } catch {
    return false;
  }
}

async function asGet(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(AS_PREFIX + key);
  } catch {
    return null;
  }
}

export function eaPictureVaultKey(eaId: string) {
  return `ea:${eaId}`;
}

export function licensePictureVaultKey(licenseId: string) {
  return `key:${licenseId}`;
}

/** Persist a picture blob under a stable vault key. */
export async function vaultPutPicture(
  vaultKey: string,
  pictureUri: string | null | undefined,
): Promise<boolean> {
  if (!pictureUri) return false;
  // Only vault data URLs (http/storage URLs stay in catalog text).
  if (!pictureUri.startsWith('data:')) return false;
  if (Platform.OS === 'web') {
    const ok = await idbPut(vaultKey, pictureUri);
    if (ok) return true;
  }
  return asPut(vaultKey, pictureUri);
}

export async function vaultGetPicture(
  vaultKey: string,
): Promise<string | null> {
  if (Platform.OS === 'web') {
    const fromIdb = await idbGet(vaultKey);
    if (fromIdb) return fromIdb;
  }
  return asGet(vaultKey);
}

export async function vaultPutEaPicture(
  eaId: string,
  pictureUri: string | null | undefined,
) {
  return vaultPutPicture(eaPictureVaultKey(eaId), pictureUri);
}

export async function vaultPutKeyPicture(
  licenseId: string,
  pictureUri: string | null | undefined,
) {
  return vaultPutPicture(licensePictureVaultKey(licenseId), pictureUri);
}

export async function hydrateEasFromVault<
  T extends { id: string; pictureUri: string | null },
>(eas: T[]): Promise<T[]> {
  return Promise.all(
    eas.map(async (e) => {
      if (e.pictureUri) return e;
      const pic = await vaultGetPicture(eaPictureVaultKey(e.id));
      return pic ? { ...e, pictureUri: pic } : e;
    }),
  );
}

export async function hydrateKeysFromVault<
  T extends { id: string; eaPictureUri: string | null },
>(keys: T[]): Promise<T[]> {
  return Promise.all(
    keys.map(async (k) => {
      if (k.eaPictureUri) return k;
      const pic = await vaultGetPicture(licensePictureVaultKey(k.id));
      return pic ? { ...k, eaPictureUri: pic } : k;
    }),
  );
}

/** Write every data-URL picture into the vault (best-effort). */
export async function vaultCatalogPictures<
  TEa extends { id: string; pictureUri: string | null },
  TKey extends { id: string; eaPictureUri: string | null },
>(eas: TEa[], keys: TKey[]) {
  await Promise.all([
    ...eas.map((e) => vaultPutEaPicture(e.id, e.pictureUri)),
    ...keys.map((k) => vaultPutKeyPicture(k.id, k.eaPictureUri)),
  ]);
}

/** List vault keys (ea:… / key:…) for catalog recovery after localStorage wipe. */
export async function listVaultPictureKeys(): Promise<string[]> {
  const keys: string[] = [];
  if (Platform.OS === 'web' && typeof indexedDB !== 'undefined') {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAllKeys();
        req.onsuccess = () => {
          for (const k of req.result || []) {
            if (typeof k === 'string') keys.push(k);
          }
          resolve();
        };
        req.onerror = () =>
          reject(req.error || new Error('idb getAllKeys failed'));
      });
      db.close();
    } catch {
      /* fall through to AsyncStorage scan */
    }
  }
  try {
    const all = await AsyncStorage.getAllKeys();
    for (const k of all) {
      if (k.startsWith(AS_PREFIX)) {
        keys.push(k.slice(AS_PREFIX.length));
      }
    }
  } catch {
    /* ignore */
  }
  return [...new Set(keys)];
}
