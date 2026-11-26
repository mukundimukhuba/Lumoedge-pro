/**
 * Auto Scan client → POST https://lumoedge.com/api/scan/auto
 *
 * Exact body (locked to curl contract):
 *   { "symbol": "XAUUSD", "id": "MT5_TOKEN_FROM_CONNECT" }
 *
 * Client applies conservative quality gates after the response — prefer SKIP.
 */

import { LUMOEDGE_VISION_HOST, getScanApiRoot } from './api';
import {
  AUTO_TRADE_MIN_ACCURACY,
  SKIP_REASON,
  evaluateAutoTradeGate,
  type Side,
} from './strategy';

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
  gateReasons?: string[];
};

const TIMEOUT_MS = 60_000;

/**
 * Apply client-side conservative gate on an auto-scan response.
 * Prefer SKIP when confidence, prices, or demo status are unsafe.
 */
export function applyAutoScanClientGate(
  signal: AutoScanSignal,
  opts?: { lotSize?: number; trades?: number },
): AutoScanSignal {
  if (!signal.ok) return signal;

  if (signal.demo) {
    return {
      ...signal,
      trade: false,
      skip: true,
      reason: SKIP_REASON.DEMO_SIGNAL,
      gateReasons: [SKIP_REASON.DEMO_SIGNAL],
    };
  }

  if (signal.skip || signal.trade === false) {
    return {
      ...signal,
      trade: false,
      skip: true,
      reason: signal.reason || SKIP_REASON.API_UNCLEAR,
    };
  }

  const dirRaw = String(signal.direction || '').toLowerCase();
  const side: Side | null = dirRaw.includes('sell')
    ? 'sell'
    : dirRaw.includes('buy')
      ? 'buy'
      : null;

  const accuracy = Math.round(Number(signal.accuracy) || 0);
  const gate = evaluateAutoTradeGate({
    accuracy,
    side,
    symbol: String(signal.symbol || ''),
    demo: signal.demo,
    entryPrice: signal.entryPrice ?? null,
    stopLoss: signal.stopLoss ?? null,
    lotSize: opts?.lotSize ?? 0.01,
    trades: opts?.trades ?? 1,
    requireMt5: true,
    mt5Connected: true, // caller already required token to reach here
  });

  if (!gate.allowed) {
    return {
      ...signal,
      trade: false,
      skip: true,
      reason: gate.skipReason || SKIP_REASON.API_UNCLEAR,
      gateReasons: gate.reasons,
      accuracy,
    };
  }

  return {
    ...signal,
    trade: true,
    skip: false,
    accuracy,
    direction: side || signal.direction,
  };
}

export async function postAutoScan(
  body: AutoScanRequest,
  signal?: AbortSignal,
): Promise<AutoScanSignal> {
  // Preserve exact broker spelling — never toUpperCase (suffix case matters).
  const symbol = String(body.symbol || '')
    .trim()
    .replace(/\s+/g, '');
  const id = String(body.id || '').trim();

  if (!symbol) {
    return { ok: false, error: 'Type the symbol from your broker.' };
  }
  if (!id) {
    return {
      ok: false,
      error: 'Connect MetaTrader first. Auto Scan reads the live market on your account.',
      skip: true,
      reason: SKIP_REASON.MT5_REQUIRED,
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
    const roots = [getScanApiRoot(), LUMOEDGE_VISION_HOST].filter(
      (r, i, a) => r && a.indexOf(r) === i,
    );
    let data: Record<string, unknown> | null = null;
    let lastFail: AutoScanSignal | null = null;

    for (const root of roots) {
      try {
        const res = await fetch(`${root}/api/scan/auto`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const rawText = await res.text();
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          lastFail = {
            ok: false,
            error: 'Auto Scan unavailable. Try again later.',
          };
          continue;
        }
        if (!res.ok) {
          lastFail = {
            ok: false,
            error: String(
              parsed.error || parsed.message || `Auto Scan ${res.status}`,
            ),
            raw: parsed,
          };
          if (res.status === 404) continue;
          return lastFail;
        }
        data = parsed;
        break;
      } catch (e) {
        if (
          (e instanceof DOMException && e.name === 'AbortError') ||
          (e instanceof Error && e.name === 'AbortError')
        ) {
          throw e;
        }
        lastFail = {
          ok: false,
          error: 'Auto Scan unreachable. Try again later.',
        };
      }
    }

    if (!data) {
      return (
        lastFail || {
          ok: false,
          error: 'Auto Scan unavailable. Try again later.',
        }
      );
    }

    const dirRaw = String(data.direction || data.side || '').toLowerCase();
    const direction = dirRaw.includes('sell')
      ? 'sell'
      : dirRaw.includes('buy')
        ? 'buy'
        : undefined;

    const accuracy =
      Number(data.accuracy ?? data.accuracy_percent ?? 0) || undefined;

    const parsed: AutoScanSignal = {
      ok: data.ok !== false,
      trade: Boolean(data.trade ?? data.open ?? direction),
      skip: Boolean(data.skip || data.noTrade),
      reason: data.reason ? String(data.reason) : undefined,
      error: data.error ? String(data.error) : undefined,
      symbol: String(data.symbol || symbol),
      timeframe: data.timeframe ? String(data.timeframe) : undefined,
      direction,
      accuracy,
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

    // Low server accuracy without explicit skip → client forces skip.
    if (
      parsed.ok &&
      !parsed.skip &&
      parsed.trade !== false &&
      accuracy != null &&
      accuracy > 0 &&
      accuracy < AUTO_TRADE_MIN_ACCURACY
    ) {
      parsed.skip = true;
      parsed.trade = false;
      parsed.reason = `${SKIP_REASON.LOW_ACCURACY} (${accuracy}% < ${AUTO_TRADE_MIN_ACCURACY}%)`;
    }

    return applyAutoScanClientGate(parsed);
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
