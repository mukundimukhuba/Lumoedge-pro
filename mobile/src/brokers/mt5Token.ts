import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BrokerAccount, BrokerTrade } from './api';

/** Persisted MT5 connect token used as `id` for /api/scan/auto */
const MT5_TOKEN_KEY = 'edges-mt5-token-v1';
/** Full link metadata so Connect Broker survives reload/navigation */
const MT5_LINK_KEY = 'edges-mt5-link-v1';
/** Last-known live account snapshot (never stores password or session token) */
const MT5_ACCOUNT_CACHE_KEY = 'edges-mt5-account-v1';

export type Mt5Link = {
  token: string;
  broker: string;
  server?: string;
  login?: string;
  savedAt?: string;
};

export type Mt5AccountCache = BrokerAccount & {
  /** Soft bind to link token — never a password */
  forToken?: string;
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

function sanitizeTrade(raw: unknown): BrokerTrade | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const id = String(t.id || '').trim();
  const symbol = String(t.symbol || '').trim();
  if (!id || !symbol) return null;
  return {
    id,
    symbol,
    side: String(t.side || '').trim() || '—',
    lots: Number(t.lots) || 0,
    openPrice: Number(t.openPrice) || 0,
    pnl: Number(t.pnl) || 0,
  };
}

/**
 * Persist last-known account for instant Connect UI.
 * Never stores password. Does not store MT5 session token as id/sessionId.
 * `forToken` is a soft bind so restore ignores stale snapshots from another link.
 */
export async function saveMt5AccountCache(
  account: BrokerAccount | null | undefined,
  forToken?: string | null,
): Promise<void> {
  if (!account) {
    await AsyncStorage.removeItem(MT5_ACCOUNT_CACHE_KEY);
    return;
  }
  const balance = Number(account.balance);
  const equity = Number(account.equity);
  if (!Number.isFinite(balance) || !Number.isFinite(equity)) {
    return;
  }
  const trades = Array.isArray(account.trades)
    ? account.trades
        .map(sanitizeTrade)
        .filter((t): t is BrokerTrade => t != null)
    : [];
  const tokenBind = String(forToken || '').trim() || undefined;
  const payload: Mt5AccountCache = {
    // Intentionally omit id/sessionId — those duplicate the connect token
    broker: account.broker ? String(account.broker) : undefined,
    server: account.server ? String(account.server) : undefined,
    login: account.login ? String(account.login) : undefined,
    currency: String(account.currency || '').trim() || undefined,
    balance,
    equity,
    margin:
      typeof account.margin === 'number' && Number.isFinite(account.margin)
        ? account.margin
        : undefined,
    freeMargin:
      typeof account.freeMargin === 'number' &&
      Number.isFinite(account.freeMargin)
        ? account.freeMargin
        : undefined,
    leverage:
      typeof account.leverage === 'number' && Number.isFinite(account.leverage)
        ? account.leverage
        : undefined,
    trades,
    ordersOk: account.ordersOk === true,
    updatedAt: account.updatedAt || new Date().toISOString(),
    source: account.source || 'mt5-live',
    forToken: tokenBind,
  };
  await AsyncStorage.setItem(MT5_ACCOUNT_CACHE_KEY, JSON.stringify(payload));
}

export async function loadMt5AccountCache(
  forToken?: string | null,
): Promise<BrokerAccount | null> {
  try {
    const raw = await AsyncStorage.getItem(MT5_ACCOUNT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Mt5AccountCache;
    const balance = Number(parsed?.balance);
    const equity = Number(parsed?.equity);
    if (!Number.isFinite(balance) || !Number.isFinite(equity)) return null;
    const want = String(forToken || '').trim();
    const bound = String(parsed.forToken || '').trim();
    // If both sides have a bind, require a match (ignore stale other-session cache)
    if (want && bound && want !== bound) return null;
    const trades = Array.isArray(parsed.trades)
      ? parsed.trades
          .map(sanitizeTrade)
          .filter((t): t is BrokerTrade => t != null)
      : [];
    const { forToken: _omit, id: _id, sessionId: _sid, ...rest } = parsed;
    return {
      ...rest,
      balance,
      equity,
      currency: String(parsed.currency || '').trim() || undefined,
      trades,
      ordersOk: parsed.ordersOk === true,
      source: parsed.source || 'cache',
    };
  } catch {
    return null;
  }
}

export async function clearMt5Token(): Promise<void> {
  await AsyncStorage.multiRemove([
    MT5_TOKEN_KEY,
    MT5_LINK_KEY,
    MT5_ACCOUNT_CACHE_KEY,
  ]);
}
