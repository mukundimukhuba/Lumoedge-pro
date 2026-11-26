import type { BrokerSymbol } from './api';

/**
 * Trim / strip spaces only — never change letter case.
 * Brokers (e.g. XAUUSD.cent) reject symbols when the suffix case is altered.
 */
export function preserveBrokerSymbol(symbol: string | null | undefined): string {
  return String(symbol || '')
    .trim()
    .replace(/\s+/g, '');
}

/** Case-insensitive compare for UI matching; does not mutate either string. */
export function symbolsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = preserveBrokerSymbol(a);
  const right = preserveBrokerSymbol(b);
  if (!left || !right) return false;
  return left.toUpperCase() === right.toUpperCase();
}

/**
 * Deduplicate a symbol list case-insensitively while keeping the first
 * exact spelling (broker SymbolList casing).
 */
export function dedupeBrokerSymbols(symbols: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of symbols) {
    const sym = preserveBrokerSymbol(raw);
    if (!sym) continue;
    const key = sym.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sym);
  }
  return out;
}

/** Offline / disconnected preview cards — not used as a live broker catalog. */
export const FALLBACK_SYMBOL_CARDS: BrokerSymbol[] = [
  { symbol: 'XAUUSD', category: 'METALS', description: 'Gold / USD' },
  { symbol: 'EURUSD', category: 'FOREX', description: 'Euro / USD' },
  { symbol: 'GBPUSD', category: 'FOREX', description: 'Pound / USD' },
  { symbol: 'USDJPY', category: 'FOREX', description: 'USD / Yen' },
  { symbol: 'USDCHF', category: 'FOREX', description: 'USD / Franc' },
  { symbol: 'AUDUSD', category: 'FOREX', description: 'Aussie / USD' },
  { symbol: 'USDCAD', category: 'FOREX', description: 'USD / Cad' },
  { symbol: 'NZDUSD', category: 'FOREX', description: 'Kiwi / USD' },
  { symbol: 'EURGBP', category: 'FOREX', description: 'Euro / Pound' },
  { symbol: 'EURJPY', category: 'FOREX', description: 'Euro / Yen' },
  { symbol: 'GBPJPY', category: 'FOREX', description: 'Pound / Yen' },
  { symbol: 'XAGUSD', category: 'METALS', description: 'Silver / USD' },
  { symbol: 'BTCUSD', category: 'CRYPTO', description: 'Bitcoin / USD' },
  { symbol: 'ETHUSD', category: 'CRYPTO', description: 'Ethereum / USD' },
  { symbol: 'NAS100', category: 'INDICES', description: 'Nasdaq 100' },
  { symbol: 'US30', category: 'INDICES', description: 'Dow Jones 30' },
  { symbol: 'SPX500', category: 'INDICES', description: 'S&P 500' },
  { symbol: 'UK100', category: 'INDICES', description: 'FTSE 100' },
  { symbol: 'GER40', category: 'INDICES', description: 'DAX 40' },
  { symbol: 'USOIL', category: 'ENERGIES', description: 'Crude Oil' },
];

export function filterFallbackSymbols(query: string): BrokerSymbol[] {
  const q = String(query || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
  if (!q) return [...FALLBACK_SYMBOL_CARDS];
  return FALLBACK_SYMBOL_CARDS.filter(
    (s) =>
      s.symbol.toUpperCase().includes(q) ||
      s.description.toUpperCase().includes(q) ||
      s.category.toUpperCase().includes(q),
  );
}

export function cardForSymbol(
  symbol: string,
  hint?: Partial<BrokerSymbol> | null,
): BrokerSymbol {
  const sym = preserveBrokerSymbol(symbol);
  const fromFallback = FALLBACK_SYMBOL_CARDS.find((s) =>
    symbolsMatch(s.symbol, sym),
  );
  return {
    symbol: sym,
    category: String(
      hint?.category || fromFallback?.category || 'OTHER',
    ).toUpperCase(),
    description:
      String(hint?.description || fromFallback?.description || sym).trim() ||
      sym,
    group: hint?.group,
  };
}

/**
 * Prefer exact SymbolList spelling when a case-insensitive match exists.
 * Heals previously uppercased Selected rows (e.g. XAUUSD.CENT → XAUUSD.cent).
 */
export function rematchBrokerSpelling(
  symbol: string,
  brokerSymbols: Array<{ symbol: string }>,
): string {
  const sym = preserveBrokerSymbol(symbol);
  if (!sym) return sym;
  const hit = brokerSymbols.find((s) => symbolsMatch(s.symbol, sym));
  return hit?.symbol || sym;
}
