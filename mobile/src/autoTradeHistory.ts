import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = 'edges-auto-trade-history-v1';
const MAX_ROWS = 40;

export type AutoTradeHistoryEntry = {
  id: string;
  at: string;
  symbol: string;
  direction: string;
  trades: number;
  lotSize?: number;
  botName?: string;
  status: 'opened' | 'partial' | 'failed';
  note?: string;
};

export async function loadAutoTradeHistory(): Promise<AutoTradeHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AutoTradeHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r && typeof r.symbol === 'string');
  } catch {
    return [];
  }
}

export async function pushAutoTradeHistory(
  entry: Omit<AutoTradeHistoryEntry, 'id' | 'at'> & {
    id?: string;
    at?: string;
  },
): Promise<AutoTradeHistoryEntry[]> {
  const row: AutoTradeHistoryEntry = {
    id:
      entry.id ||
      `ath_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    at: entry.at || new Date().toISOString(),
    symbol: String(entry.symbol || '')
      .trim()
      .toUpperCase(),
    direction: String(entry.direction || '').toLowerCase(),
    trades: Math.max(0, Math.round(Number(entry.trades) || 0)),
    lotSize:
      entry.lotSize != null && Number.isFinite(Number(entry.lotSize))
        ? Number(entry.lotSize)
        : undefined,
    botName: entry.botName ? String(entry.botName).trim() : undefined,
    status: entry.status,
    note: entry.note ? String(entry.note).trim() : undefined,
  };
  const prev = await loadAutoTradeHistory();
  const next = [row, ...prev].slice(0, MAX_ROWS);
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
