import AsyncStorage from '@react-native-async-storage/async-storage';

/** Persisted MT5 connect token used as `id` for /api/scan/auto */
const MT5_TOKEN_KEY = 'edges-mt5-token-v1';
/** Full link metadata so Connect Broker survives reload/navigation */
const MT5_LINK_KEY = 'edges-mt5-link-v1';

export type Mt5Link = {
  token: string;
  broker: string;
  server?: string;
  login?: string;
  savedAt?: string;
};

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

export async function saveMt5Link(link: Mt5Link): Promise<void> {
  const token = String(link.token || '').trim();
  const broker = String(link.broker || '').trim();
  if (!token || !broker) {
    await clearMt5Token();
    return;
  }
  const payload: Mt5Link = {
    token,
    broker,
    server: String(link.server || '').trim() || undefined,
    login: String(link.login || '').trim() || undefined,
    savedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(MT5_LINK_KEY, JSON.stringify(payload));
  await AsyncStorage.setItem(MT5_TOKEN_KEY, token);
}

export async function loadMt5Link(): Promise<Mt5Link | null> {
  try {
    const raw = await AsyncStorage.getItem(MT5_LINK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Mt5Link;
      const token = String(parsed?.token || '').trim();
      const broker = String(parsed?.broker || '').trim();
      if (token && broker) {
        return {
          token,
          broker,
          server: String(parsed.server || '').trim() || undefined,
          login: String(parsed.login || '').trim() || undefined,
          savedAt: parsed.savedAt,
        };
      }
    }
    // Legacy: token-only — restore session without broker name
    const tokenOnly = await loadMt5Token();
    if (tokenOnly) {
      return { token: tokenOnly, broker: 'MT5' };
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearMt5Token(): Promise<void> {
  await AsyncStorage.multiRemove([MT5_TOKEN_KEY, MT5_LINK_KEY]);
}
