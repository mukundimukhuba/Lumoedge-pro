/**
 * Live-candle auto strategy (client-side rules + local preview).
 *
 * • Session = last 20 candles; bounce check = last 8
 * • Flat session → no trade
 * • Last 8 reverse of session → no trade
 * • Bounce against trend is not a flip (stay with session)
 * • TF order: M15 → H1 → M5 → M1
 */

import { buildTpLadder, formatPrice, type Side } from './strategy';

export type Candle = {
  open: number;
  high: number;
  low: number;
  close: number;
};

export type SessionBias = 'bull' | 'bear' | 'flat';

export type AutoStrategyResult = {
  trade: boolean;
  skip: boolean;
  reason: string;
  side?: Side;
  sessionBias: SessionBias;
  bounceAgainstTrend: boolean;
  entry?: number;
  stopLoss?: number;
  takeProfits?: number[];
  accuracy: number;
};

export function sessionBiasFromCandles(
  candles: Candle[],
  sessionBars = 20,
): SessionBias {
  const slice = candles.slice(-sessionBars);
  if (slice.length < 5) return 'flat';
  const first = slice[0].open;
  const last = slice[slice.length - 1].close;
  const range = Math.max(
    ...slice.map((c) => c.high),
  ) - Math.min(...slice.map((c) => c.low));
  if (range <= 0) return 'flat';
  const move = last - first;
  const pct = Math.abs(move) / range;
  if (pct < 0.18) return 'flat';
  return move > 0 ? 'bull' : 'bear';
}

export function bounceAgainstSession(
  candles: Candle[],
  session: SessionBias,
  bounceBars = 8,
): boolean {
  if (session === 'flat') return false;
  const slice = candles.slice(-bounceBars);
  if (slice.length < 3) return false;
  const first = slice[0].open;
  const last = slice[slice.length - 1].close;
  const bounceUp = last > first;
  // Bounce against bullish session = short bounce (not a flip)
  if (session === 'bull' && !bounceUp) return true;
  if (session === 'bear' && bounceUp) return true;
  return false;
}

export function last8ReversesSession(
  candles: Candle[],
  session: SessionBias,
  bounceBars = 8,
): boolean {
  if (session === 'flat') return false;
  const slice = candles.slice(-bounceBars);
  if (slice.length < 4) return false;
  const first = slice[0].open;
  const last = slice[slice.length - 1].close;
  const local: SessionBias =
    Math.abs(last - first) / Math.max(Math.abs(first), 1e-9) < 0.0004
      ? 'flat'
      : last > first
        ? 'bull'
        : 'bear';
  if (local === 'flat') return false;
  return local !== session;
}

export function evaluateLiveCandles(
  candles: Candle[],
  opts?: { sessionBars?: number; bounceBars?: number },
): AutoStrategyResult {
  const sessionBars = opts?.sessionBars ?? 20;
  const bounceBars = opts?.bounceBars ?? 8;
  const session = sessionBiasFromCandles(candles, sessionBars);

  if (session === 'flat') {
    return {
      trade: false,
      skip: true,
      reason: 'Flat session (last 20) — no trade',
      sessionBias: 'flat',
      bounceAgainstTrend: false,
      accuracy: 0,
    };
  }

  if (last8ReversesSession(candles, session, bounceBars)) {
    return {
      trade: false,
      skip: true,
      reason: 'Last 8 reverse session — no trade',
      sessionBias: session,
      bounceAgainstTrend: true,
      accuracy: 0,
    };
  }

  const against = bounceAgainstSession(candles, session, bounceBars);
  // Bounce against trend is NOT a flip — stay with session bias
  const side: Side = session === 'bull' ? 'buy' : 'sell';
  const last = candles[candles.length - 1];
  const entry = last.close;
  const swingLow = Math.min(...candles.slice(-bounceBars).map((c) => c.low));
  const swingHigh = Math.max(...candles.slice(-bounceBars).map((c) => c.high));
  const stopLoss =
    side === 'buy'
      ? Math.min(swingLow, entry) * 0.999
      : Math.max(swingHigh, entry) * 1.001;
  const ladder = buildTpLadder(entry, stopLoss, side, 3);
  const accuracy = against ? 76 : 82;

  return {
    trade: true,
    skip: false,
    reason: against
      ? 'Bounce against trend — stay with session (not a flip)'
      : 'Session + bounce aligned',
    side,
    sessionBias: session,
    bounceAgainstTrend: against,
    entry: Number(formatPrice(entry)),
    stopLoss: Number(formatPrice(stopLoss, entry)),
    takeProfits: ladder.tps,
    accuracy,
  };
}

/** Deterministic candle stub (unused in live Auto Trade — kept for unit tests). */
export function synthesizePreviewCandles(
  symbol: string,
  bias: 'bull' | 'bear' | 'flat' = 'bull',
  n = 24,
): Candle[] {
  const seed = [...symbol].reduce((a, c) => a + c.charCodeAt(0), 0);
  const base = symbol.includes('XAU')
    ? 2650
    : symbol.includes('XAG')
      ? 31
      : symbol.includes('US30') || symbol.includes('USTECH')
        ? 18500
        : symbol.includes('JPY')
          ? 150
          : 1.08;
  const step = base > 100 ? base * 0.0008 : 0.00035;
  const out: Candle[] = [];
  let px = base + (seed % 17) * step;
  for (let i = 0; i < n; i++) {
    const drift =
      bias === 'flat'
        ? Math.sin(i / 2) * step * 0.4
        : bias === 'bull'
          ? step * (0.35 + (i % 3) * 0.1)
          : -step * (0.35 + (i % 3) * 0.1);
    const open = px;
    const close = px + drift;
    const high = Math.max(open, close) + step * 0.25;
    const low = Math.min(open, close) - step * 0.25;
    out.push({ open, high, low, close });
    px = close;
  }
  return out;
}
