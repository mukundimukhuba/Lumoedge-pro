/**
 * Chart Scanner client → https://lumoedge.com/api/scan
 * Body: { image: data URL }. Never embeds API keys in the client.
 */

export const LUMOEDGE_SCAN_ROOT = 'https://lumoedge.com';

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
  /** Present when vision returns price scale */
  entryPrice?: number | null;
  stopLoss?: number | null;
  entry_price?: number | null;
  stop_loss?: number | null;
  trend_bias?: string;
  strategy?: string;
};

const SCAN_TIMEOUT_MS = 55_000;

export async function fetchScanStatus(): Promise<ScanStatus> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`${LUMOEDGE_SCAN_ROOT}/api/scan/status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Scan status ${res.status}`);
    }
    return (await res.json()) as ScanStatus;
  } finally {
    clearTimeout(timer);
  }
}

export async function postChartScan(
  imageDataUrl: string,
  signal?: AbortSignal,
): Promise<ScanApiResponse> {
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
    const res = await fetch(`${LUMOEDGE_SCAN_ROOT}/api/scan`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image,
        // Strategy hint for servers that accept it (ignored by older handlers)
        strategy: 'right-edge',
        candles: 8,
      }),
      signal: controller.signal,
    });
    const raw = await res.text();
    let data: ScanApiResponse;
    try {
      data = JSON.parse(raw) as ScanApiResponse;
    } catch {
      return {
        ok: false,
        accuracy: 0,
        error: 'Scanner unavailable. Please try again later.',
      };
    }
    if (!res.ok) {
      const err = String(data?.error || '').trim();
      return {
        ok: false,
        accuracy: Number(data?.accuracy) || 0,
        error:
          err ||
          `Scanner unavailable (${res.status}). Please try again later.`,
      };
    }
    return data;
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

export function normalizeScanResult(raw: ScanApiResponse) {
  const directionRaw = String(raw.direction || '').toLowerCase();
  const direction: 'buy' | 'sell' | null = directionRaw.includes('sell')
    ? 'sell'
    : directionRaw.includes('buy')
      ? 'buy'
      : null;
  const entry = Number(raw.entryPrice ?? raw.entry_price);
  const stop = Number(raw.stopLoss ?? raw.stop_loss);
  return {
    ok: Boolean(raw.ok),
    demo: Boolean(raw.demo),
    accuracy: Math.round(Number(raw.accuracy) || 0),
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
  };
}
