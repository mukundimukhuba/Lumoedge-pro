import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const FAB_SIZE = 64;
const POS_KEY = 'edges-bot-float-pos-v1';
const TAP_SLOP = 10;

type FabPos = { x: number; y: number };

async function loadFabPos(): Promise<FabPos | null> {
  try {
    const raw = await AsyncStorage.getItem(POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FabPos;
    if (
      parsed &&
      Number.isFinite(parsed.x) &&
      Number.isFinite(parsed.y)
    ) {
      return { x: Number(parsed.x), y: Number(parsed.y) };
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function saveFabPos(pos: FabPos): Promise<void> {
  try {
    await AsyncStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

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
 * Floating bot avatar — drag anywhere (position persisted).
 * Short tap still opens Auto trade history + open trades.
 */
export function BotTradeFloat({
  accent,
  botImage,
  botName,
  engineRunning = false,
  historyTick = 0,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<AutoTradeHistoryEntry[]>([]);
  const [trades, setTrades] = useState<BrokerTrade[]>([]);
  const [currency, setCurrency] = useState<string | undefined>();
  const [loadingOpen, setLoadingOpen] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [pos, setPos] = useState<FabPos | null>(null);
  const [dragging, setDragging] = useState(false);

  const safeTop = Math.max(insets.top, Platform.OS === 'web' ? 8 : 0);
  const safeBottom = Math.max(insets.bottom, Platform.OS === 'web' ? 12 : 8);
  const pad = 8;

  const clampPos = useCallback(
    (p: FabPos): FabPos => {
      const maxX = Math.max(pad, winW - FAB_SIZE - pad);
      const maxY = Math.max(safeTop + pad, winH - FAB_SIZE - safeBottom - pad);
      return {
        x: Math.min(maxX, Math.max(pad, p.x)),
        y: Math.min(maxY, Math.max(safeTop + pad, p.y)),
      };
    },
    [winW, winH, safeTop, safeBottom],
  );

  const defaultPos = useCallback((): FabPos => {
    return clampPos({
      x: winW - FAB_SIZE - 14,
      y: winH - FAB_SIZE - (safeBottom + 64 + 14),
    });
  }, [clampPos, winW, winH, safeBottom]);

  const posRef = useRef<FabPos>(defaultPos());
  const dragOrigin = useRef<FabPos>({ x: 0, y: 0 });
  const movedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadFabPos();
      if (cancelled) return;
      const next = clampPos(saved || defaultPos());
      posRef.current = next;
      setPos(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [clampPos, defaultPos]);

  // Re-clamp when window / insets change
  useEffect(() => {
    setPos((prev) => {
      const next = clampPos(prev || defaultPos());
      posRef.current = next;
      return next;
    });
  }, [clampPos, defaultPos]);

  const openPanel = useCallback(() => setOpen(true), []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
        onPanResponderGrant: () => {
          movedRef.current = false;
          dragOrigin.current = { ...posRef.current };
          setDragging(true);
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) > TAP_SLOP || Math.abs(g.dy) > TAP_SLOP) {
            movedRef.current = true;
          }
          const next = clampPos({
            x: dragOrigin.current.x + g.dx,
            y: dragOrigin.current.y + g.dy,
          });
          posRef.current = next;
          setPos(next);
        },
        onPanResponderRelease: () => {
          setDragging(false);
          const final = clampPos(posRef.current);
          posRef.current = final;
          setPos(final);
          void saveFabPos(final);
          if (!movedRef.current) openPanel();
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          const final = clampPos(posRef.current);
          posRef.current = final;
          setPos(final);
          void saveFabPos(final);
        },
      }),
    [clampPos, openPanel],
  );

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

  const fabPos = pos || defaultPos();

  return (
    <>
      {/* Full-screen overlay layer — always above ScrollView + dock */}
      <View
        pointerEvents="box-none"
        style={styles.overlayHost}
        // @ts-expect-error web stacking
        dataSet={{ botFloat: 'host' }}
      >
        <View
          accessibilityRole="button"
          accessibilityLabel="Bot trades — drag to move, tap to open"
          testID="bot-trade-float"
          // @ts-expect-error web-only marker for proofs
          dataSet={{ botFloat: 'fab' }}
          {...panResponder.panHandlers}
          style={[
            styles.fab,
            {
              left: fabPos.x,
              top: fabPos.y,
              borderColor: accent,
              shadowColor: accent,
              opacity: dragging ? 0.92 : 1,
              transform: [{ scale: dragging ? 1.06 : 1 }],
              ...(Platform.OS === 'web'
                ? ({
                    boxShadow: `0 0 0 2px ${hexToRgba(accent, 0.35)}, 0 8px 22px ${hexToRgba(accent, 0.55)}`,
                    cursor: dragging ? 'grabbing' : 'grab',
                    touchAction: 'none',
                    userSelect: 'none',
                  } as object)
                : null),
            },
          ]}
        >
          <View style={styles.fabImgWrap} pointerEvents="none">
            <Image
              source={botImage}
              style={[
                styles.fabImg,
                Platform.OS === 'web'
                  ? ({ objectFit: 'cover', objectPosition: 'center 22%' } as object)
                  : null,
              ]}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          </View>
          {engineRunning ? (
            <View
              style={[styles.fabLive, { backgroundColor: BASE.green }]}
              accessibilityLabel="Auto Trade running"
              pointerEvents="none"
            />
          ) : null}
        </View>
      </View>

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
                    style={[
                      styles.sheetAvatar,
                      Platform.OS === 'web'
                        ? ({ objectFit: 'cover' } as object)
                        : null,
                    ]}
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
  overlayHost: {
    ...StyleSheet.absoluteFill,
    zIndex: 9999,
    elevation: 9999,
    ...(Platform.OS === 'web'
      ? ({
          position: 'absolute' as const,
          inset: 0,
          pointerEvents: 'box-none',
        } as object)
      : null),
  },
  fab: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    borderWidth: 2.5,
    overflow: 'hidden',
    backgroundColor: '#1A0000',
    zIndex: 10000,
    elevation: 10000,
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  fabImgWrap: {
    flex: 1,
    backgroundColor: '#220000',
  },
  fabImg: {
    width: '100%',
    height: '100%',
  },
  fabLive: {
    position: 'absolute',
    right: 5,
    top: 5,
    width: 11,
    height: 11,
    borderRadius: 6,
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
