/**
 * Chart Scanner strategy (client-side gates + levels).
 *
 * • Right-edge only: bias from last 5–8 candles (rising → BUY, falling → SELL).
 *   Older left-side move is ignored (enforced by scan prompt / interpretation).
 * • Levels: BUY SL below / TPs above; SELL SL above / TPs below.
 * • TP ladder: 1R / 2R / 3R.
 * • Auto-trade gate: accuracy ≥ 74%, valid prices, real symbol (not demo).
 *   Max 3 trades, lot 0.01–1.
 */

export const AUTO_TRADE_MIN_ACCURACY = 74;
export const MAX_AUTO_TRADES = 3;
export const LOT_MIN = 0.01;
export const LOT_MAX = 1;

export type Side = 'buy' | 'sell';

export type TpLadder = {
  risk: number;
  tps: number[];
  labels: string[];
};

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
 * When the API returns direction but no prices, place advisory SL/TP
 * with correct BUY/SELL geometry (SL below for buy, above for sell).
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

/** SL placement must match side: buy → SL < entry, sell → SL > entry. */
export function pricesValidForSide(
  side: Side,
  entry: number | null | undefined,
  stopLoss: number | null | undefined,
): boolean {
  if (
    entry == null ||
    stopLoss == null ||
    !Number.isFinite(entry) ||
    !Number.isFinite(stopLoss) ||
    entry <= 0 ||
    stopLoss <= 0 ||
    entry === stopLoss
  ) {
    return false;
  }
  const pct = Math.abs(entry - stopLoss) / entry;
  if (pct >= 0.2) return false;
  if (side === 'buy') return stopLoss < entry;
  return stopLoss > entry;
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
};

export type AutoTradeGateResult = {
  allowed: boolean;
  reasons: string[];
};

export function evaluateAutoTradeGate(
  input: AutoTradeGateInput,
): AutoTradeGateResult {
  const reasons: string[] = [];
  if (!input.side) reasons.push('No BUY/SELL direction');
  if (input.accuracy < AUTO_TRADE_MIN_ACCURACY) {
    reasons.push(
      `Accuracy ${input.accuracy}% below ${AUTO_TRADE_MIN_ACCURACY}% gate`,
    );
  }
  if (!isRealSymbol(input.symbol, input.demo)) {
    reasons.push('Symbol is invalid for live trading');
  }
  if (
    !input.side ||
    !pricesValidForSide(input.side, input.entryPrice, input.stopLoss)
  ) {
    reasons.push('Invalid entry/SL prices for side');
  }
  if (input.lotSize < LOT_MIN || input.lotSize > LOT_MAX) {
    reasons.push(`Lot must be ${LOT_MIN}–${LOT_MAX}`);
  }
  if (input.trades < 1 || input.trades > MAX_AUTO_TRADES) {
    reasons.push(`Trades must be 1–${MAX_AUTO_TRADES}`);
  }
  return { allowed: reasons.length === 0, reasons };
}

export function strategyBlurb(side: Side): string {
  return side === 'buy'
    ? 'Right-edge (last 5–8 candles) rising → BUY. SL below · TP ladder 1R/2R/3R above.'
    : 'Right-edge (last 5–8 candles) falling → SELL. SL above · TP ladder 1R/2R/3R below.';
}
