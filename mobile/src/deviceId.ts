import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'edges-device-id-v1';

let cached: string | null = null;

function randomId() {
  const hex = () =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
  return `dev_${Date.now().toString(36)}_${hex()}${hex().slice(0, 4)}`;
}

function webGet(): string | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

function webSet(value: string): void {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DEVICE_ID_KEY, value);
  } catch {
    /* ignore */
  }
}

/** Stable per-install device id for license exclusivity binding. */
export async function getOrCreateDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const fromWeb = webGet();
    if (fromWeb && fromWeb.length >= 8) {
      cached = fromWeb;
      return fromWeb;
    }
    const fromStore = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (fromStore && fromStore.length >= 8) {
      cached = fromStore;
      webSet(fromStore);
      return fromStore;
    }
  } catch {
    /* create new */
  }
  const next = randomId();
  cached = next;
  webSet(next);
  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, next);
  } catch {
    /* memory still holds it for this session */
  }
  return next;
}
