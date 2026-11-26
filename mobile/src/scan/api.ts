/**
 * Chart Scanner client → /api/scan (same-origin / brokers-dev) with
 * fallback to https://lumoedge.com/api/scan.
 * Body: { image: data URL, strategy hints, optional MT5 id }.
 * Never embeds API keys in the client. Prefer SKIP over guessing.
 */

import { Platform } from 'react-native';
import {
  AUTO_TRADE_MIN_ACCURACY,
  SCAN_SIGNAL_MIN_ACCURACY,
  SKIP_REASON,
} from './strategy';

/** Vision upstream (production host). */
export const LUMOEDGE_VISION_HOST = 'https://lumoedge.com';

/**
 * Prefer same-origin /api/scan on Vercel / static host, brokers-dev on Expo web,
 * otherwise vision host. Matches brokers API root resolution.
 */
export function getScanApiRoot(): string {
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
  return LUMOEDGE_VISION_HOST;
}

/** @deprecated use getScanApiRoot() — kept for callers expecting a constant. */
export const LUMOEDGE_SCAN_ROOT = LUMOEDGE_VISION_HOST;

export type ScanStatus = {
  configured: boolean;
  auth?: boolean;
  model?: string;
  url?: string;
  source?: string;
  mt5Base?: boolean;
  hint?: string;
};

export type ScanApiResponse = {
  ok: boolean;
  demo?: boolean;
  accuracy: number;
  symbol?: string;
  timeframe?: string | null;
  direction?: string;
  summary?: string;
  error?: string;
  skip?: boolean;
  reason?: string;
  /** Present when vision returns price scale */
  entryPrice?: number | null;
  stopLoss?: number | null;
  entry_price?: number | null;
  stop_loss?: number | null;
  trend_bias?: string;
  strategy?: string;
};

export type ChartScanOptions = {
  /** MT5 connect token — when present, server may fuse live quotes. */
  mt5Id?: string | null;
  signal?: AbortSignal;
};

const SCAN_TIMEOUT_MS = 55_000;

/** Conservative strategy payload for vision / scan handlers that accept hints. */
export function buildChartScanPayload(
  image: string,
  mt5Id?: string | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    image,
    // Strategy hint for servers that accept it (ignored by older handlers)
    strategy: 'right-edge-conservative',
    candles: 8,
    preferSkip: true,
    noGuess: true,
    minAccuracy: AUTO_TRADE_MIN_ACCURACY,
    instructions:
      'Right-edge only (last 5–8 candles). If unclear, return skip/no direction — never invent prices or bias. Prefer SKIP over a weak trade. Use live MT5 quotes when id is present.',
  };
  const id = String(mt5Id || '').trim();
  if (id) {
    payload.id = id;
    payload.liveMt5 = true;
  }
  return payload;
}

export async function fetchScanStatus(): Promise<ScanStatus> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  const roots = [getScanApiRoot(), LUMOEDGE_VISION_HOST].filter(
    (r, i, a) => r && a.indexOf(r) === i,
  );
  try {
    let lastErr: Error | null = null;
    for (const root of roots) {
      try {
        const res = await fetch(`${root}/api/scan/status`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: ctrl.signal,
        });
        if (!res.ok) {
          lastErr = new Error(`Scan status ${res.status}`);
          continue;
        }
        return (await res.json()) as ScanStatus;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error('status failed');
      }
    }
    throw lastErr || new Error('Scan status unavailable');
  } finally {
    clearTimeout(timer);
  }
}

export async function postChartScan(
  imageDataUrl: string,
  signalOrOpts?: AbortSignal | ChartScanOptions,
): Promise<ScanApiResponse> {
  const opts: ChartScanOptions =
    signalOrOpts &&
    typeof signalOrOpts === 'object' &&
    'aborted' in signalOrOpts
      ? { signal: signalOrOpts as AbortSignal }
      : (signalOrOpts as ChartScanOptions) || {};
  const signal = opts.signal;

  const image = String(imageDataUrl || '').split('#')[0];
  if (!image.startsWith('data:image/')) {
    return { ok: false, accuracy: 0, error: 'image data URL required' };
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      return { ok: false, accuracy: 0, error: 'Scan cancelled.' };
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  try {
    const payload = JSON.stringify(
      buildChartScanPayload(image, opts.mt5Id),
    );
    const roots = [getScanApiRoot(), LUMOEDGE_VISION_HOST].filter(
      (r, i, a) => r && a.indexOf(r) === i,
    );
    let data: ScanApiResponse | null = null;
    let lastFail: ScanApiResponse | null = null;
    for (const root of roots) {
      try {
        const res = await fetch(`${root}/api/scan`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: payload,
          signal: controller.signal,
        });
        const raw = await res.text();
        let parsed: ScanApiResponse;
        try {
          parsed = JSON.parse(raw) as ScanApiResponse;
        } catch {
          lastFail = {
            ok: false,
            accuracy: 0,
            error: 'Scanner unavailable. Please try again later.',
          };
          continue;
        }
        if (!res.ok) {
          const err = String(parsed?.error || '').trim();
          lastFail = {
            ok: false,
            accuracy: Number(parsed?.accuracy) || 0,
            error:
              err ||
              `Scanner unavailable (${res.status}). Please try again later.`,
          };
          // 404 on local proxy → try vision host
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
          accuracy: 0,
          error: 'Scanner unavailable. Please try again later.',
        };
      }
    }
    if (data) return data;
    return (
      lastFail || {
        ok: false,
        accuracy: 0,
        error: 'Scanner unavailable. Please try again later.',
      }
    );
  } catch (e) {
    const aborted =
      (e instanceof DOMException && e.name === 'AbortError') ||
      (e instanceof Error && e.name === 'AbortError');
    return {
      ok: false,
      accuracy: 0,
      error: aborted
        ? 'Scan timed out — try a clearer chart screenshot.'
        : 'Scanner unavailable. Please try again later.',
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export type NormalizedScan = {
  ok: boolean;
  demo: boolean;
  accuracy: number;
  symbol: string;
  timeframe: string | null;
  direction: 'buy' | 'sell' | null;
  summary: string;
  entryPrice: number | null;
  stopLoss: number | null;
  error?: string;
  skip: boolean;
  skipReason: string | null;
};

export function normalizeScanResult(raw: ScanApiResponse): NormalizedScan {
  const directionRaw = String(raw.direction || '').toLowerCase();
  let direction: 'buy' | 'sell' | null = directionRaw.includes('sell')
    ? 'sell'
    : directionRaw.includes('buy')
      ? 'buy'
      : null;
  const entry = Number(raw.entryPrice ?? raw.entry_price);
  const stop = Number(raw.stopLoss ?? raw.stop_loss);
  const accuracy = Math.round(Number(raw.accuracy) || 0);
  const demo = Boolean(raw.demo);
  const apiSkip = Boolean(raw.skip);

  let skip = apiSkip;
  let skipReason: string | null = raw.reason
    ? String(raw.reason)
    : apiSkip
      ? SKIP_REASON.API_UNCLEAR
      : null;

  // Prefer skip: unclear / low conviction → no tradeable direction.
  if (direction && accuracy > 0 && accuracy < SCAN_SIGNAL_MIN_ACCURACY) {
    skip = true;
    skipReason = `${SKIP_REASON.LOW_ACCURACY} (${accuracy}% < ${SCAN_SIGNAL_MIN_ACCURACY}%)`;
    direction = null;
  }

  if (demo) {
    skip = true;
    skipReason = SKIP_REASON.DEMO_SIGNAL;
  }

  return {
    ok: Boolean(raw.ok),
    demo,
    accuracy,
    symbol: raw.symbol ? String(raw.symbol).replace(/\s+/g, '') : '',
    timeframe:
      raw.timeframe && !/null|unknown|n\/a|none/i.test(String(raw.timeframe))
        ? String(raw.timeframe).trim().toUpperCase()
        : null,
    direction,
    summary: raw.summary ? String(raw.summary) : '',
    entryPrice: Number.isFinite(entry) && entry > 0 ? entry : null,
    stopLoss: Number.isFinite(stop) && stop > 0 ? stop : null,
    error: raw.error ? String(raw.error) : undefined,
    skip,
    skipReason,
  };
}
