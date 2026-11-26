import { Platform } from 'react-native';

export type BrokersSearchResponse = {
  brokers: string[];
  source: 'local' | 'upstream';
  upstreamConfigured: boolean;
  allowCustom: boolean;
  totalLocal?: number;
  error?: string;
};

export type BrokerTrade = {
  id: string;
  symbol: string;
  side: string;
  lots: number;
  openPrice: number;
  pnl: number;
};

export type BrokerAccount = {
  id?: string;
  sessionId?: string;
  broker?: string;
  server?: string;
  login?: string;
  currency?: string;
  balance: number;
  equity: number;
  margin?: number;
  freeMargin?: number;
  leverage?: number;
  trades: BrokerTrade[];
  /** true when OpenedOrders returned a parseable list (may be empty) */
  ordersOk?: boolean;
  updatedAt?: string;
  source?: string;
};

export type BrokerConnectResponse = {
  ok: boolean;
  broker?: string;
  server?: string;
  login?: string;
  linked?: boolean;
  source?: 'mt5-live' | 'upstream';
  message?: string;
  error?: string;
  upstream?: boolean;
  /** MT5 token for /api/scan/auto and account poll */
  token?: string;
  id?: string;
  sessionId?: string;
  account?: BrokerAccount | null;
};

/**
 * Resolve API root. Production (Vercel) uses same origin `/api/...`.
 * Local Expo web (:8081) talks to the brokers dev server on :8787.
 * Never embeds credentials in the client.
 */
export function getBrokersApiRoot(): string {
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
    return origin;
  }
  return '';
}

export async function searchBrokersApi(
  query: string,
  limit = 24,
): Promise<BrokersSearchResponse> {
  const root = getBrokersApiRoot();
  const url = new URL('/api/brokers', root || 'http://127.0.0.1');
  if (query.trim()) url.searchParams.set('q', query.trim());
  url.searchParams.set('limit', String(limit));
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const data = (await res.json()) as BrokersSearchResponse;
  if (!res.ok) {
    throw new Error(data.error || `Broker search failed (${res.status})`);
  }
  return data;
}

export type BrokerBridgeHealth = {
  ok: boolean;
  configured?: boolean;
  reachable?: boolean;
  latencyMs?: number;
  path?: string;
  detail?: string;
  error?: string;
  mode?: string;
};

/** Probe server-side MT5 bridge /health — never treats failure as success. */
export async function fetchBrokerBridgeHealth(): Promise<BrokerBridgeHealth> {
  const root = getBrokersApiRoot();
  const url = new URL('/api/brokers/health', root || 'http://127.0.0.1');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    let data: BrokerBridgeHealth = { ok: false };
    try {
      data = (await res.json()) as BrokerBridgeHealth;
    } catch {
      data = { ok: false, error: `Bridge health unreadable (${res.status})` };
    }
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        configured: data.configured,
        reachable: false,
        latencyMs: data.latencyMs,
        detail: data.detail,
        error:
          String(data.error || '').trim() ||
          `MT5 bridge unhealthy (${res.status})`,
        mode: data.mode,
      };
    }
    return data;
  } catch (err) {
    return {
      ok: false,
      reachable: false,
      error:
        err instanceof Error && err.name === 'AbortError'
          ? 'MT5 bridge health timed out'
          : err instanceof Error
            ? `MT5 bridge health unreachable: ${err.message}`
            : 'MT5 bridge health unreachable',
    };
  } finally {
    clearTimeout(t);
  }
}

export async function connectBrokerApi(input: {
  broker: string;
  server: string;
  login: string;
  password: string;
}): Promise<BrokerConnectResponse> {
  const root = getBrokersApiRoot();
  const url = new URL('/api/brokers/connect', root || 'http://127.0.0.1');
  const ctrl = new AbortController();
  // Match server maxDuration (60s) with a little client headroom.
  const t = setTimeout(() => ctrl.abort(), 65000);
  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        broker: input.broker,
        server: input.server,
        login: input.login,
        password: input.password,
      }),
      signal: ctrl.signal,
    });
    let data: BrokerConnectResponse = { ok: false };
    try {
      data = (await res.json()) as BrokerConnectResponse;
    } catch {
      data = { ok: false, error: `Connect failed (${res.status})` };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || `Connect failed (${res.status})`,
        upstream: data.upstream,
      };
    }
    return data;
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.name === 'AbortError'
          ? 'Connect timed out waiting for the MT5 bridge. Check bridge health and retry.'
          : err instanceof Error
            ? `Broker API unreachable: ${err.message}`
            : 'Broker API unreachable. Try again.',
    };
  } finally {
    clearTimeout(t);
  }
}

/** MT5 OrderSend comment max length */
export const MT5_COMMENT_MAX = 31;
const ORDER_COMMENT_SUFFIX = ' ~ Lumoedge/pro';

/**
 * OrderSend comment: `{bot name} ~ Lumoedge/pro`
 * e.g. `unlimitedbull ~ Lumoedge/pro` (fits MT5 31-char limit).
 */
export function formatOrderSendComment(botName?: string | null): string {
  const raw = String(botName || '')
    .trim()
    .replace(/\s+/g, ' ')
    // Drop any prior Lumoedge / Lumo Edge branding on the name
    .replace(/\s*~?\s*Lumo\s*edge(?:\/?\s*pro)?.*$/i, '')
    .trim();
  const name = (raw || 'Edges').slice(
    0,
    Math.max(1, MT5_COMMENT_MAX - ORDER_COMMENT_SUFFIX.length),
  );
  return `${name}${ORDER_COMMENT_SUFFIX}`.slice(0, MT5_COMMENT_MAX);
}

export type BrokerOrderRequest = {
  id: string;
  symbol: string;
  /** 0 = buy, 1 = sell */
  operation: 0 | 1;
  volume: number;
  stopLoss?: number;
  takeProfit?: number;
  comment?: string;
  slippage?: number;
};

export type BrokerOrderResponse = {
  ok: boolean;
  error?: string;
  symbol?: string;
  operation?: number;
  volume?: number;
  result?: unknown;
};

/**
 * Live MT5 OrderSend via brokers proxy.
 * On failure returns ok:false with the API/bridge reason in `error`.
 */
export async function sendBrokerOrder(
  input: BrokerOrderRequest,
): Promise<BrokerOrderResponse> {
  const root = getBrokersApiRoot();
  const url = new URL('/api/brokers/order', root || 'http://127.0.0.1');
  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: input.id,
        symbol: input.symbol,
        operation: input.operation,
        volume: input.volume,
        stopLoss: input.stopLoss,
        takeProfit: input.takeProfit,
        comment: input.comment,
        slippage: input.slippage,
      }),
    });
    let data: BrokerOrderResponse = { ok: false };
    try {
      data = (await res.json()) as BrokerOrderResponse;
    } catch {
      data = { ok: false, error: `OrderSend failed (${res.status})` };
    }
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error:
          String(data.error || '').trim() ||
          `OrderSend failed (${res.status})`,
      };
    }
    return data;
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `OrderSend unreachable: ${err.message}`
          : 'OrderSend unreachable',
    };
  }
}

/**
 * Live account poll — uses connect token as `id` (MT5 session).
 * Always times out so restore/poll never hang forever.
 */
export async function fetchBrokerAccount(
  mt5Id: string,
  opts?: { timeoutMs?: number },
): Promise<BrokerAccount> {
  const root = getBrokersApiRoot();
  const url = new URL('/api/brokers/account', root || 'http://127.0.0.1');
  url.searchParams.set('id', mt5Id);
  const ctrl = new AbortController();
  const timeoutMs = Math.max(1500, opts?.timeoutMs ?? 12000);
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    const data = (await res.json()) as BrokerAccount & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || `Account fetch failed (${res.status})`);
    }
    const currency = String(data.currency || '').trim() || undefined;
    return {
      ...data,
      currency,
      trades: Array.isArray(data.trades) ? data.trades : [],
      ordersOk: data.ordersOk === true,
      balance: Number(data.balance),
      equity: Number(data.equity),
      source: data.source || 'mt5-live',
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Account fetch timed out');
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}
