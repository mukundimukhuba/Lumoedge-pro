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
  sessionId?: string;
  broker?: string;
  server?: string;
  login?: string;
  currency?: string;
  balance: number;
  equity: number;
  trades: BrokerTrade[];
  updatedAt?: string;
  source?: string;
};

export type BrokerConnectResponse = {
  ok: boolean;
  broker?: string;
  server?: string;
  login?: string;
  linked?: boolean;
  source?: 'local-demo' | 'upstream';
  message?: string;
  error?: string;
  upstream?: boolean;
  /** MT5 token for /api/scan/auto body.id */
  token?: string;
  id?: string;
  sessionId?: string;
  account?: BrokerAccount | null;
};

/**
 * Resolve API root. Production (Vercel) uses same origin `/api/...`.
 * Local Expo web (:8081) talks to the brokers dev server on :8787.
 * Never embeds BROKER_API_URL or credentials in the client.
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

export async function connectBrokerApi(input: {
  broker: string;
  server: string;
  login: string;
  password: string;
}): Promise<BrokerConnectResponse> {
  const root = getBrokersApiRoot();
  const url = new URL('/api/brokers/connect', root || 'http://127.0.0.1');
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
  });
  const data = (await res.json()) as BrokerConnectResponse;
  if (!res.ok) {
    return {
      ok: false,
      error: data.error || `Connect failed (${res.status})`,
      upstream: data.upstream,
    };
  }
  return data;
}

export async function fetchBrokerAccount(
  sessionId: string,
): Promise<BrokerAccount> {
  const root = getBrokersApiRoot();
  const url = new URL('/api/brokers/account', root || 'http://127.0.0.1');
  url.searchParams.set('sessionId', sessionId);
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const data = (await res.json()) as BrokerAccount & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Account fetch failed (${res.status})`);
  }
  return {
    ...data,
    trades: Array.isArray(data.trades) ? data.trades : [],
    balance: Number(data.balance) || 0,
    equity: Number(data.equity) || 0,
  };
}
