import AsyncStorage from '@react-native-async-storage/async-storage';

/** Persisted MT5 connect token used as `id` for /api/scan/auto */
const MT5_TOKEN_KEY = 'edges-mt5-token-v1';

export async function saveMt5Token(token: string | null | undefined): Promise<void> {
  const t = String(token || '').trim();
  if (!t) {
    await AsyncStorage.removeItem(MT5_TOKEN_KEY);
    return;
  }
  await AsyncStorage.setItem(MT5_TOKEN_KEY, t);
}

export async function loadMt5Token(): Promise<string | null> {
  try {
    const t = await AsyncStorage.getItem(MT5_TOKEN_KEY);
    const trimmed = String(t || '').trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

export async function clearMt5Token(): Promise<void> {
  await AsyncStorage.removeItem(MT5_TOKEN_KEY);
}
