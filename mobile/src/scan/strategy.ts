/**
 * Chart Scanner strategy (client-side gates + levels).
 *
 * Conservative posture: prefer SKIP over a bad trade. No guessing.
 * • Right-edge only: bias from last 5–8 candles (rising → BUY, falling → SELL).
 * • Levels: BUY SL below / TPs above; SELL SL above / TPs below.
 * • TP ladder: 1R / 2R / 3R.
 * • Auto-trade gate: accuracy ≥ 85%, live prices (never invented), real symbol.
 *   Max 3 trades, lot 0.01–1.
 */

/** Minimum accuracy % required to open an auto trade. Prefer skip below this. */
export const AUTO_TRADE_MIN_ACCURACY = 85;

/** Signals below this are treated as unclear / no direction for display tradeability. */
export const SCAN_SIGNAL_MIN_ACCURACY = 70;

export const MAX_AUTO_TRADES = 3;
export const LOT_MIN = 0.01;
export const LOT_MAX = 1;

/** Max |entry−SL| / entry allowed (wide stops → skip). */
export const MAX_STOP_PCT = 0.08;

/** Min |entry−SL| / entry (tiny stops are noise / bad fills). */
export const MIN_STOP_PCT = 0.00015;

export type Side = 'buy' | 'sell';

export type TpLadder = {
  risk: number;
  tps: number[];
  labels: string[];
};

/** Stable SKIP reason codes shown in UI / engine status. */
export const SKIP_REASON = {
  NO_DIRECTION: 'SKIP: no clear BUY/SELL — prefer no trade',
  LOW_ACCURACY: 'SKIP: confidence below gate — prefer no trade',
  NO_PRICES: 'SKIP: no live entry/SL prices — will not invent levels',
  INVALID_PRICES: 'SKIP: entry/SL invalid for side',
  STOP_TOO_WIDE: 'SKIP: stop distance too wide',
  STOP_TOO_TIGHT: 'SKIP: stop distance too tight / noise',
  DEMO_SYMBOL: 'SKIP: demo or invalid symbol — live only',
  DEMO_SIGNAL: 'SKIP: demo / synthetic signal — live MT5 required',
  BAD_LOT: 'SKIP: lot outside allowed range',
  BAD_TRADES: 'SKIP: trade count outside allowed range',
  MT5_REQUIRED: 'SKIP: MetaTrader not connected — live data required',
  FLAT_SESSION: 'SKIP: flat session — no trade',
  REVERSE_SESSION: 'SKIP: last bars reverse session — no trade',
  BOUNCE_AGAINST: 'SKIP: bounce against session — prefer no trade',
  WEAK_MOVE: 'SKIP: session move too weak — prefer no trade',
  API_UNCLEAR: 'SKIP: scanner unclear / low conviction',
} as const;

export type SkipReasonCode = (typeof SKIP_REASON)[keyof typeof SKIP_REASON];

export function formatPrice(n: number, ref = n): string {
  const decimals = Math.min(
    6,
    Math.max(
      (String(ref).split('.')[1] || '').length,
      (String(n).split('.')[1] || '').length,
      n >= 100 ? 2 : n >= 10 ? 3 : 5,
    ),
  );
  return n.toFixed(decimals);
}

/** TP ladder at 1R / 2R / 3R from entry↔SL distance. */
export function buildTpLadder(
  entry: number,
  stopLoss: number,
  side: Side,
  count = 3,
): TpLadder {
  const risk = Math.abs(entry - stopLoss);
  if (!Number.isFinite(entry) || !Number.isFinite(stopLoss) || risk <= 0) {
    return { risk: 0, tps: [], labels: [] };
  }
  const n = Math.max(1, Math.min(3, Math.round(count) || 3));
  const multiples = [1, 2, 3].slice(0, n);
  const tps = multiples.map((m) => {
    const raw = side === 'sell' ? entry - risk * m : entry + risk * m;
    return Number(formatPrice(raw, entry));
  });
  return {
    risk,
    tps,
    labels: multiples.map((m) => `${m}R`),
  };
}

/**
 * @deprecated Do not use for trading. Invented levels blow accounts.
 * Kept only so existing unit/proof callers that assert geometry still compile;
 * Chart Scanner and Auto Trade must SKIP when prices are missing.
 */
export function advisoryLevelsForSide(
  symbol: string,
  side: Side,
  seed = 0,
): { entry: number; stopLoss: number; tps: number[] } {
  const base = symbol.includes('XAU')
    ? 2650
    : symbol.includes('BTC')
      ? 68000
      : symbol.includes('NAS') ||
          symbol.includes('US30') ||
          symbol.includes('US500')
        ? 18500
        : symbol.includes('JPY')
          ? 150
          : 1.08;
  const step =
    base > 1000 ? base * 0.0025 : base > 50 ? base * 0.004 : 0.0012;
  const jitter = ((seed % 17) + 3) * step * 0.12;
  const entry = base + jitter;
  const stopLoss = side === 'buy' ? entry - step * 1.2 : entry + step * 1.2;
  const ladder = buildTpLadder(entry, stopLoss, side, 3);
  return {
    entry: Number(formatPrice(entry)),
    stopLoss: Number(formatPrice(stopLoss, entry)),
    tps: ladder.tps,
  };
}

export type PriceValidity =
  | { ok: true }
  | { ok: false; reason: string };

/** SL placement must match side: buy → SL < entry, sell → SL > entry. */
export function pricesValidForSide(
  side: Side,
  entry: number | null | undefined,
  stopLoss: number | null | undefined,
): boolean {
  return explainPriceValidity(side, entry, stopLoss).ok;
}

export function explainPriceValidity(
  side: Side,
  entry: number | null | undefined,
  stopLoss: number | null | undefined,
): PriceValidity {
  if (
    entry == null ||
    stopLoss == null ||
    !Number.isFinite(entry) ||
    !Number.isFinite(stopLoss) ||
    entry <= 0 ||
    stopLoss <= 0 ||
    entry === stopLoss
  ) {
    return { ok: false, reason: SKIP_REASON.NO_PRICES };
  }
  const pct = Math.abs(entry - stopLoss) / entry;
  if (pct >= MAX_STOP_PCT) {
    return { ok: false, reason: SKIP_REASON.STOP_TOO_WIDE };
  }
  if (pct < MIN_STOP_PCT) {
    return { ok: false, reason: SKIP_REASON.STOP_TOO_TIGHT };
  }
  if (side === 'buy' && !(stopLoss < entry)) {
    return { ok: false, reason: SKIP_REASON.INVALID_PRICES };
  }
  if (side === 'sell' && !(stopLoss > entry)) {
    return { ok: false, reason: SKIP_REASON.INVALID_PRICES };
  }
  return { ok: true };
}

const DEMO_SYMBOL_RE =
  /\b(DEMO|TEST|SAMPLE|NULL|UNKNOWN|N\/A|NONE)\b/i;

export function isRealSymbol(symbol: string, demoFlag?: boolean): boolean {
  if (demoFlag) return false;
  const s = String(symbol || '').trim();
  if (s.length < 3) return false;
  if (DEMO_SYMBOL_RE.test(s)) return false;
  return true;
}

export function clampLot(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return LOT_MIN;
  return Math.min(LOT_MAX, Math.max(LOT_MIN, Math.round(raw * 100) / 100));
}

export function clampTrades(raw: number): number {
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(MAX_AUTO_TRADES, Math.max(1, Math.round(raw)));
}

export type AutoTradeGateInput = {
  accuracy: number;
  side: Side | null;
  symbol: string;
  demo?: boolean;
  entryPrice?: number | null;
  stopLoss?: number | null;
  lotSize: number;
  trades: number;
  /** When true, missing MT5 connection is a hard skip. */
  requireMt5?: boolean;
  mt5Connected?: boolean;
};

export type AutoTradeGateResult = {
  allowed: boolean;
  reasons: string[];
  /** First / primary skip line for engine status. */
  skipReason: string | null;
};

export function evaluateAutoTradeGate(
  input: AutoTradeGateInput,
): AutoTradeGateResult {
  const reasons: string[] = [];

  if (input.requireMt5 && !input.mt5Connected) {
    reasons.push(SKIP_REASON.MT5_REQUIRED);
  }
  if (!input.side) reasons.push(SKIP_REASON.NO_DIRECTION);
  if (input.accuracy < AUTO_TRADE_MIN_ACCURACY) {
    reasons.push(
      `${SKIP_REASON.LOW_ACCURACY} (${input.accuracy}% < ${AUTO_TRADE_MIN_ACCURACY}%)`,
    );
  }
  if (!isRealSymbol(input.symbol, input.demo)) {
    reasons.push(
      input.demo ? SKIP_REASON.DEMO_SIGNAL : SKIP_REASON.DEMO_SYMBOL,
    );
  }

  if (!input.side) {
    reasons.push(SKIP_REASON.NO_PRICES);
  } else {
    const priceCheck = explainPriceValidity(
      input.side,
      input.entryPrice,
      input.stopLoss,
    );
    if (!priceCheck.ok) reasons.push(priceCheck.reason);
  }

  if (input.lotSize < LOT_MIN || input.lotSize > LOT_MAX) {
    reasons.push(`${SKIP_REASON.BAD_LOT} (${LOT_MIN}–${LOT_MAX})`);
  }
  if (input.trades < 1 || input.trades > MAX_AUTO_TRADES) {
    reasons.push(`${SKIP_REASON.BAD_TRADES} (1–${MAX_AUTO_TRADES})`);
  }

  const unique = [...new Set(reasons)];
  return {
    allowed: unique.length === 0,
    reasons: unique,
    skipReason: unique.length ? unique[0] : null,
  };
}

/** Join skip reasons for UI (compact). */
export function formatSkipReasons(reasons: string[]): string {
  if (!reasons.length) return '';
  return reasons.join(' · ');
}

export function strategyBlurb(side: Side): string {
  return side === 'buy'
    ? 'Right-edge (last 5–8 candles) rising → BUY. SL below · TP ladder 1R/2R/3R above. Prefer SKIP if unclear.'
    : 'Right-edge (last 5–8 candles) falling → SELL. SL above · TP ladder 1R/2R/3R below. Prefer SKIP if unclear.';
}
