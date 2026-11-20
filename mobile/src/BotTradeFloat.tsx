import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchBrokerAccount,
  type BrokerTrade,
} from './brokers/api';
import { loadMt5Token } from './brokers/mt5Token';
import {
  loadAutoTradeHistory,
  type AutoTradeHistoryEntry,
} from './autoTradeHistory';

const BASE = {
  black: '#000000',
  white: '#FFFFFF',
  muted: '#8B8B8B',
  dim: '#5C5C5C',
  panel: 'rgba(10, 0, 0, 0.96)',
  green: '#00C853',
  red: '#FF5252',
};

function hexToRgba(hex: string, a: number) {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function formatMoney(n: number, currency?: string) {
  const cur = String(currency || '').trim();
  const v = Number.isFinite(n) ? n.toFixed(2) : '—';
  return cur ? `${cur} ${v}` : v;
}

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

type Props = {
  accent: string;
  botImage: ImageSourcePropType;
  botName?: string | null;
  /** Auto Trade engine currently open on Home */
  engineRunning?: boolean;
  /** Bump to reload history after a send */
  historyTick?: number;
};

/**
 * Floating bot avatar (bottom-right). Tap opens Auto trade history +
 * currently open / running trades — red/black Edges panel.
 */
export function BotTradeFloat({
  accent,
  botImage,
  botName,
  engineRunning = false,
  historyTick = 0,
}: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<AutoTradeHistoryEntry[]>([]);
  const [trades, setTrades] = useState<BrokerTrade[]>([]);
  const [currency, setCurrency] = useState<string | undefined>();
  const [loadingOpen, setLoadingOpen] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const dockLift = Math.max(insets.bottom, Platform.OS === 'web' ? 12 : 8) + 72;

  const refreshHistory = useCallback(async () => {
    const rows = await loadAutoTradeHistory();
    setHistory(rows);
  }, []);

  const refreshOpenTrades = useCallback(async () => {
    setLoadingOpen(true);
    setOpenError(null);
    try {
      const token = await loadMt5Token();
      if (!token) {
        setTrades([]);
        setCurrency(undefined);
        setOpenError('Connect MetaTrader to see open trades.');
        return;
      }
      const account = await fetchBrokerAccount(token);
      setTrades(Array.isArray(account.trades) ? account.trades : []);
      setCurrency(account.currency);
    } catch (e) {
      setTrades([]);
      setOpenError(
        e instanceof Error ? e.message : 'Could not load open trades',
      );
    } finally {
      setLoadingOpen(false);
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory, historyTick]);

  useEffect(() => {
    if (!open) return;
    void refreshHistory();
    void refreshOpenTrades();
    const iv = setInterval(() => {
      void refreshOpenTrades();
    }, 5000);
    return () => clearInterval(iv);
  }, [open, refreshHistory, refreshOpenTrades]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open bot trades panel"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.fab,
          {
            bottom: dockLift,
            borderColor: hexToRgba(accent, 0.85),
            shadowColor: accent,
            opacity: pressed ? 0.88 : 1,
          },
        ]}
      >
        <Image source={botImage} style={styles.fabImg} resizeMode="cover" />
        {engineRunning ? (
          <View
            style={[styles.fabLive, { backgroundColor: BASE.green }]}
            accessibilityLabel="Auto Trade running"
          />
        ) : null}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityLabel="Close panel"
          />
          <View
            style={[
              styles.sheet,
              {
                borderColor: hexToRgba(accent, 0.55),
                paddingBottom: Math.max(insets.bottom, 14),
              },
            ]}
          >
            <View style={styles.sheetHead}>
              <View style={styles.sheetHeadLeft}>
                <View
                  style={[
                    styles.sheetAvatarWrap,
                    { borderColor: hexToRgba(accent, 0.7) },
                  ]}
                >
                  <Image
                    source={botImage}
                    style={styles.sheetAvatar}
                    resizeMode="cover"
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sheetTitle} numberOfLines={1}>
                    {botName?.trim() || 'Bot trades'}
                  </Text>
                  <Text style={styles.sheetSub}>
                    {engineRunning
                      ? 'Auto Trade running'
                      : 'History + open positions'}
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityLabel="Close"
                onPress={() => setOpen(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={22} color={BASE.white} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollBody}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.sectionLabel, { color: accent }]}>
                Currently open / running
              </Text>
              {engineRunning ? (
                <View
                  style={[
                    styles.runningBanner,
                    { borderColor: hexToRgba(BASE.green, 0.5) },
                  ]}
                >
                  <View
                    style={[styles.liveDot, { backgroundColor: BASE.green }]}
                  />
                  <Text style={styles.runningText}>
                    Auto Trade Engine is scanning / sending
                  </Text>
                </View>
              ) : null}
              {loadingOpen && trades.length === 0 ? (
                <Text style={styles.empty}>Loading open trades…</Text>
              ) : openError && trades.length === 0 ? (
                <Text style={styles.empty}>{openError}</Text>
              ) : trades.length === 0 ? (
                <Text style={styles.empty}>No open MT5 trades right now</Text>
              ) : (
                trades.map((t) => {
                  const pnlColor =
                    t.pnl > 0
                      ? BASE.green
                      : t.pnl < 0
                        ? BASE.red
                        : BASE.muted;
                  return (
                    <View
                      key={t.id}
                      style={[
                        styles.row,
                        { borderColor: hexToRgba(accent, 0.28) },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{t.symbol}</Text>
                        <Text style={styles.rowMeta}>
                          {t.side} · {t.lots} lot · @{t.openPrice}
                        </Text>
                      </View>
                      <Text style={[styles.rowPnl, { color: pnlColor }]}>
                        {t.pnl >= 0 ? '+' : ''}
                        {formatMoney(t.pnl, currency)}
                      </Text>
                    </View>
                  );
                })
              )}

              <Text
                style={[styles.sectionLabel, { color: accent, marginTop: 16 }]}
              >
                Auto trade history
              </Text>
              {history.length === 0 ? (
                <Text style={styles.empty}>
                  No Auto Trade sends yet — Start on Home to log history
                </Text>
              ) : (
                history.map((h) => {
                  const dirColor =
                    h.direction === 'sell' ? BASE.red : BASE.green;
                  return (
                    <View
                      key={h.id}
                      style={[
                        styles.row,
                        { borderColor: hexToRgba(accent, 0.28) },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>
                          {h.symbol}{' '}
                          <Text style={{ color: dirColor }}>
                            {(h.direction || '').toUpperCase()}
                          </Text>
                        </Text>
                        <Text style={styles.rowMeta}>
                          {h.trades} trade{h.trades === 1 ? '' : 's'}
                          {h.lotSize != null ? ` · ${h.lotSize} lot` : ''}
                          {h.botName ? ` · ${h.botName}` : ''}
                          {' · '}
                          {formatWhen(h.at)}
                        </Text>
                        {h.note ? (
                          <Text style={styles.rowNote}>{h.note}</Text>
                        ) : null}
                      </View>
                      <Text
                        style={[
                          styles.statusPill,
                          {
                            color:
                              h.status === 'opened'
                                ? BASE.green
                                : h.status === 'partial'
                                  ? accent
                                  : BASE.red,
                          },
                        ]}
                      >
                        {h.status}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: '#120000',
    zIndex: 40,
    elevation: 12,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  fabImg: {
    width: '100%',
    height: '100%',
  },
  fabLive: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: BASE.black,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    backgroundColor: BASE.panel,
    paddingTop: 14,
    paddingHorizontal: 14,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  sheetHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  sheetAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  sheetAvatar: { width: '100%', height: '100%' },
  sheetTitle: {
    color: BASE.white,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  sheetSub: {
    color: BASE.muted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  scroll: { flexGrow: 0 },
  scrollBody: { paddingBottom: 18, gap: 8 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  runningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,200,83,0.08)',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  runningText: {
    color: BASE.white,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  empty: {
    color: BASE.muted,
    fontSize: 13,
    lineHeight: 18,
    paddingVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  rowTitle: {
    color: BASE.white,
    fontSize: 14,
    fontWeight: '800',
  },
  rowMeta: {
    color: BASE.muted,
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  rowNote: {
    color: BASE.dim,
    fontSize: 11,
    marginTop: 3,
  },
  rowPnl: {
    fontSize: 14,
    fontWeight: '800',
  },
  statusPill: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
