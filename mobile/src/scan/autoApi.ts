/**
 * Auto Scan client → POST https://lumoedge.com/api/scan/auto
 *
 * Exact body (locked to curl contract):
 *   { "symbol": "XAUUSD", "id": "MT5_TOKEN_FROM_CONNECT" }
 */

import { LUMOEDGE_SCAN_ROOT } from './api';

export const AUTO_MARKETS = [
  'XAUUSD',
  'US30',
  'USTECH',
  'GBPUSD',
  'EURUSD',
  'USDJPY',
  'GBPJPY',
  'XAGUSD',
] as const;

export type AutoMarket = (typeof AUTO_MARKETS)[number];

/** TF priority used by engine UI / local strategy: M15 → H1 → M5 → M1 */
export const AUTO_TIMEFRAMES = ['M15', 'H1', 'M5', 'M1'] as const;

/** Locked request body — matches production curl. */
export type AutoScanRequest = {
  symbol: string;
  /** MT5 token from broker connect */
  id: string;
};

export type AutoScanSignal = {
  ok: boolean;
  trade?: boolean;
  skip?: boolean;
  reason?: string;
  error?: string;
  symbol?: string;
  timeframe?: string;
  direction?: 'buy' | 'sell' | string;
  accuracy?: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfits?: number[];
  sessionBias?: 'bull' | 'bear' | 'flat' | string;
  bounce?: boolean;
  summary?: string;
  candles?: unknown;
  demo?: boolean;
  raw?: unknown;
};

const TIMEOUT_MS = 60_000;

export async function postAutoScan(
  body: AutoScanRequest,
  signal?: AbortSignal,
): Promise<AutoScanSignal> {
  const symbol = String(body.symbol || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
  const id = String(body.id || '').trim();

  if (!symbol) {
    return { ok: false, error: 'Type the symbol from your broker.' };
  }
  if (!id) {
    return {
      ok: false,
      error: 'Connect MetaTrader first. Auto Scan reads the live market on your account.',
    };
  }

  // Exact curl body — nothing else.
  const payload: AutoScanRequest = { symbol, id };

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) return { ok: false, error: 'Scan cancelled.' };
    signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${LUMOEDGE_SCAN_ROOT}/api/scan/auto`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const rawText = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      return { ok: false, error: 'Auto Scan unavailable. Try again later.' };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: String(data.error || data.message || `Auto Scan ${res.status}`),
        raw: data,
      };
    }

    const dirRaw = String(data.direction || data.side || '').toLowerCase();
    const direction = dirRaw.includes('sell')
      ? 'sell'
      : dirRaw.includes('buy')
        ? 'buy'
        : undefined;

    return {
      ok: data.ok !== false,
      trade: Boolean(data.trade ?? data.open ?? direction),
      skip: Boolean(data.skip || data.noTrade),
      reason: data.reason ? String(data.reason) : undefined,
      error: data.error ? String(data.error) : undefined,
      symbol: String(data.symbol || symbol),
      timeframe: data.timeframe ? String(data.timeframe) : undefined,
      direction,
      accuracy: Number(data.accuracy ?? data.accuracy_percent ?? 0) || undefined,
      entryPrice: Number(data.entryPrice ?? data.entry_price) || undefined,
      stopLoss: Number(data.stopLoss ?? data.stop_loss) || undefined,
      takeProfits: Array.isArray(data.takeProfits)
        ? (data.takeProfits as number[])
        : Array.isArray(data.tps)
          ? (data.tps as number[])
          : undefined,
      sessionBias: data.sessionBias
        ? String(data.sessionBias)
        : data.session
          ? String(data.session)
          : undefined,
      bounce: data.bounce != null ? Boolean(data.bounce) : undefined,
      summary: data.summary ? String(data.summary) : undefined,
      demo: Boolean(data.demo),
      raw: data,
    };
  } catch (e) {
    const aborted =
      (e instanceof DOMException && e.name === 'AbortError') ||
      (e instanceof Error && e.name === 'AbortError');
    return {
      ok: false,
      error: aborted
        ? 'Auto Scan timed out.'
        : 'Auto Scan unreachable. Try again later.',
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
