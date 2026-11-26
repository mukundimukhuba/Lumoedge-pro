/**
 * Chart Scanner persistence: Auto Open Trades toggle, scan history,
 * daily quota — reset at 00:00 Africa/Johannesburg.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SCANNER_STORE_KEY = 'edges-chart-scanner-v1';
export const SCANNER_TZ = 'Africa/Johannesburg';
export const DEFAULT_SCANS_PER_DAY = 12;
export const MAX_SCAN_HISTORY = 24;

export type PersistedHistoryEntry = {
  id: string;
  symbol: string;
  timeframe: string;
  bias: string;
  confidence: number;
  message: string;
  lotSize: number;
  trades: number;
  tp: string;
  sl: string;
  chartUri: string | null;
  at: string;
};

export type ScannerPersistedState = {
  dayKey: string;
  autoOpenTrades: boolean;
  scansLeft: number;
  history: PersistedHistoryEntry[];
};

/** Calendar day YYYY-MM-DD in Africa/Johannesburg. */
export function johannesburgDayKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SCANNER_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * ms until next 00:00 Africa/Johannesburg (local wall clock in that zone).
 * Uses a short probe so DST / offset changes stay correct.
 */
export function msUntilJohannesburgMidnight(now: Date = new Date()): number {
  const today = johannesburgDayKey(now);
  let probe = now.getTime() + 60_000;
  const hardCap = now.getTime() + 48 * 60 * 60 * 1000;
  while (probe < hardCap) {
    if (johannesburgDayKey(new Date(probe)) !== today) {
      // Back up to the first ms of the new day within 1s resolution
      let lo = probe - 60_000;
      let hi = probe;
      while (hi - lo > 250) {
        const mid = Math.floor((lo + hi) / 2);
        if (johannesburgDayKey(new Date(mid)) === today) lo = mid;
        else hi = mid;
      }
      return Math.max(1000, hi - now.getTime());
    }
    probe += 60_000;
  }
  return 60 * 60 * 1000;
}

export function emptyScannerState(
  dayKey: string = johannesburgDayKey(),
): ScannerPersistedState {
  return {
    dayKey,
    autoOpenTrades: false,
    scansLeft: DEFAULT_SCANS_PER_DAY,
    history: [],
  };
}

/** If stored dayKey ≠ today (JHB), wipe history + restore scan quota. */
export function applyDailyReset(
  state: ScannerPersistedState,
  now: Date = new Date(),
): { state: ScannerPersistedState; didReset: boolean } {
  const today = johannesburgDayKey(now);
  if (state.dayKey === today) {
    return { state, didReset: false };
  }
  return {
    state: {
      ...state,
      dayKey: today,
      scansLeft: DEFAULT_SCANS_PER_DAY,
      history: [],
    },
    didReset: true,
  };
}

function sanitizeHistory(raw: unknown): PersistedHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: PersistedHistoryEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const symbol = String(r.symbol || '').trim();
    if (!symbol) continue;
    out.push({
      id: String(r.id || `scan_${Date.now()}`),
      symbol,
      timeframe: String(r.timeframe || '—'),
      bias: String(r.bias || '—'),
      confidence: Math.max(0, Math.round(Number(r.confidence) || 0)),
      message: String(r.message || ''),
      lotSize: Number(r.lotSize) || 0.01,
      trades: Math.max(1, Math.round(Number(r.trades) || 1)),
      tp: String(r.tp || '—'),
      sl: String(r.sl || '—'),
      chartUri: r.chartUri ? String(r.chartUri) : null,
      at: String(r.at || new Date().toISOString()),
    });
  }
  return out.slice(0, MAX_SCAN_HISTORY);
}

export async function loadScannerState(): Promise<ScannerPersistedState> {
  try {
    const raw = await AsyncStorage.getItem(SCANNER_STORE_KEY);
    if (!raw) return emptyScannerState();
    const parsed = JSON.parse(raw) as Partial<ScannerPersistedState>;
    const base: ScannerPersistedState = {
      dayKey: String(parsed.dayKey || ''),
      autoOpenTrades: Boolean(parsed.autoOpenTrades),
      scansLeft: Math.max(
        0,
        Math.min(
          DEFAULT_SCANS_PER_DAY,
          Math.round(Number(parsed.scansLeft) || DEFAULT_SCANS_PER_DAY),
        ),
      ),
      history: sanitizeHistory(parsed.history),
    };
    return applyDailyReset(base).state;
  } catch {
    return emptyScannerState();
  }
}

export async function saveScannerState(
  state: ScannerPersistedState,
): Promise<void> {
  try {
    const payload: ScannerPersistedState = {
      dayKey: state.dayKey || johannesburgDayKey(),
      autoOpenTrades: Boolean(state.autoOpenTrades),
      scansLeft: Math.max(0, Math.round(Number(state.scansLeft) || 0)),
      history: sanitizeHistory(state.history).slice(0, MAX_SCAN_HISTORY),
    };
    await AsyncStorage.setItem(SCANNER_STORE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}
