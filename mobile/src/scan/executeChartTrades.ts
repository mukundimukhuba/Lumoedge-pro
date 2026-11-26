/**
 * Chart Scanner → MT5 OrderSend path (same brokers proxy as Auto Trade Engine).
 * Preserve exact broker symbol casing. Execute gate = signal floor (not 85%).
 */
import {
  formatOrderSendComment,
  sendBrokerOrder,
} from '../brokers/api';
import {
  healKnownBrokerSuffix,
  preserveBrokerSymbol,
  rematchBrokerSpelling,
  symbolsMatch,
} from '../brokers/symbolMeta';
import {
  EXECUTE_MIN_ACCURACY,
  clampLot,
  clampTrades,
  evaluateAutoTradeGate,
  formatSkipReasons,
  type Side,
} from './strategy';

export type ExecuteChartTradesInput = {
  mt5Id: string;
  symbol: string;
  side: Side;
  accuracy: number;
  entryPrice: number | null | undefined;
  stopLoss: number | null | undefined;
  takeProfits?: number[];
  lotSize: number;
  trades: number;
  demo?: boolean;
  botName?: string | null;
  /** Quotes / SymbolList spellings for rematch (e.g. XAUUSD.cent). */
  brokerHints?: Array<string | { symbol: string }>;
};

export type ExecuteChartTradesResult = {
  ok: boolean;
  opened: number;
  requested: number;
  symbol: string;
  status: 'opened' | 'partial' | 'failed' | 'skipped';
  note?: string;
};

/** Resolve OrderSend symbol: rematch hints, then heal .CENT → .cent. */
export function resolveOrderSymbol(
  raw: string,
  hints?: Array<string | { symbol: string }>,
): string {
  const base = healKnownBrokerSuffix(raw);
  if (!base) return base;
  const cards = (hints || [])
    .map((h) =>
      typeof h === 'string'
        ? { symbol: healKnownBrokerSuffix(h) }
        : { ...h, symbol: healKnownBrokerSuffix(h.symbol) },
    )
    .filter((h) => h && preserveBrokerSymbol(h.symbol));
  if (cards.length) {
    return rematchBrokerSpelling(base, cards);
  }
  return base;
}

export async function executeChartTrades(
  input: ExecuteChartTradesInput,
): Promise<ExecuteChartTradesResult> {
  const symbol = resolveOrderSymbol(input.symbol, input.brokerHints);
  const lotSize = clampLot(input.lotSize);
  const trades = clampTrades(input.trades);
  const token = String(input.mt5Id || '').trim();

  const gate = evaluateAutoTradeGate({
    accuracy: Number(input.accuracy) || 0,
    side: input.side,
    symbol,
    demo: input.demo,
    entryPrice: input.entryPrice,
    stopLoss: input.stopLoss,
    lotSize,
    trades,
    requireMt5: true,
    mt5Connected: Boolean(token),
    minAccuracy: EXECUTE_MIN_ACCURACY,
  });

  if (!gate.allowed) {
    return {
      ok: false,
      opened: 0,
      requested: trades,
      symbol,
      status: 'skipped',
      note:
        formatSkipReasons(gate.reasons) ||
        `SKIP: below ${EXECUTE_MIN_ACCURACY}% signal floor`,
    };
  }

  if (!token) {
    return {
      ok: false,
      opened: 0,
      requested: trades,
      symbol,
      status: 'skipped',
      note: 'SKIP: MetaTrader not connected — live data required',
    };
  }

  const operation: 0 | 1 = input.side === 'sell' ? 1 : 0;
  const tps = Array.isArray(input.takeProfits)
    ? input.takeProfits.filter((n) => Number.isFinite(n) && n > 0)
    : [];
  const sl =
    input.stopLoss != null && Number(input.stopLoss) > 0
      ? Number(input.stopLoss)
      : undefined;

  let opened = 0;
  let lastFail = '';
  for (let n = 0; n < trades; n++) {
    const tp =
      tps.length > 0 ? Number(tps[Math.min(n, tps.length - 1)]) : undefined;
    const send = await sendBrokerOrder({
      id: token,
      symbol,
      operation,
      volume: lotSize,
      stopLoss: sl,
      takeProfit: tp,
      comment: formatOrderSendComment(input.botName),
      slippage: 10000,
    });
    if (!send.ok) {
      lastFail =
        String(send.error || '').trim() ||
        'OrderSend failed — no reason from API';
      break;
    }
    opened += 1;
  }

  if (opened === 0) {
    return {
      ok: false,
      opened: 0,
      requested: trades,
      symbol,
      status: 'failed',
      note: lastFail || 'Broker rejected the order.',
    };
  }

  const partial = opened < trades;
  return {
    ok: true,
    opened,
    requested: trades,
    symbol,
    status: partial ? 'partial' : 'opened',
    note: partial ? lastFail : undefined,
  };
}

/** Case-insensitive pick of a Quotes setup symbol spelling. */
export function hintSymbolsFromQuotes(
  selected: string[] | null | undefined,
  quoteSetups: Array<{ symbol: string }> | null | undefined,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of selected || []) {
    const sym = healKnownBrokerSuffix(s);
    if (!sym) continue;
    const key = sym.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sym);
  }
  for (const row of quoteSetups || []) {
    const sym = healKnownBrokerSuffix(row?.symbol);
    if (!sym) continue;
    const key = sym.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sym);
  }
  return out;
}

export function matchQuoteLotTrades(
  symbol: string,
  quoteSetups: Array<{ symbol: string; lotSize?: number; trades?: number }>,
  fallbackLot: number,
  fallbackTrades: number,
): { lotSize: number; trades: number; symbol: string } {
  const hit = (quoteSetups || []).find((s) => symbolsMatch(s.symbol, symbol));
  return {
    symbol: hit
      ? healKnownBrokerSuffix(hit.symbol)
      : healKnownBrokerSuffix(symbol),
    lotSize: clampLot(
      hit?.lotSize != null ? Number(hit.lotSize) : fallbackLot,
    ),
    trades: clampTrades(
      hit?.trades != null ? Number(hit.trades) : fallbackTrades,
    ),
  };
}
