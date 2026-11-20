import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AUTO_TIMEFRAMES,
  postAutoScan,
  type AutoScanSignal,
} from './scan/autoApi';
import { buildTpLadder, formatPrice } from './scan/strategy';
import {
  formatOrderSendComment,
  sendBrokerOrder,
} from './brokers/api';
import type { QuoteSetup } from './AppState';
import { normalizeQuoteSetup } from './AppState';

const BASE = {
  black: '#000000',
  white: '#FFFFFF',
  muted: '#8B8B8B',
  dim: '#5C5C5C',
  panel: 'rgba(12, 12, 12, 0.96)',
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

type Phase = 'scanning' | 'signal' | 'countdown' | 'execute' | 'done' | 'error';

type Props = {
  visible: boolean;
  accent: string;
  /** Optional MT5 token (API `id`) when broker/MT5 is linked */
  mt5Token?: string | null;
  /** Symbols from Home Quotes selection — scans ONLY these */
  symbols?: string[] | null;
  /** Per-symbol lot + trade count from Quotes prompt */
  quoteSetups?: QuoteSetup[] | null;
  /** Fallback when no per-symbol setup */
  lotSize?: number;
  trades?: number;
  /** Active EA / bot name for MT5 OrderSend comment */
  botName?: string | null;
  onClose: () => void;
  onExecuted?: (result: {
    symbol: string;
    direction: string;
    trades: number;
  }) => void;
};

export function AutoTradeEngineOverlay({
  visible,
  accent,
  mt5Token,
  symbols,
  quoteSetups,
  lotSize = 0.01,
  trades = 1,
  botName,
  onClose,
  onExecuted,
}: Props) {
  const [phase, setPhase] = useState<Phase>('scanning');
  const [marketIdx, setMarketIdx] = useState(0);
  const [tfIdx, setTfIdx] = useState(0);
  const [scanMarkets, setScanMarkets] = useState<string[]>([]);
  const [countdown, setCountdown] = useState(8);
  const [status, setStatus] = useState('Starting Auto Trade Engine…');
  const [signal, setSignal] = useState<AutoScanSignal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runId = useRef(0);

  useEffect(() => {
    if (!visible) {
      abortRef.current?.abort();
      return;
    }
    const id = ++runId.current;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setPhase('scanning');
    setMarketIdx(0);
    setTfIdx(0);
    setCountdown(8);
    setSignal(null);
    setError(null);
    setStatus('Scanning selected Quotes…');

    void (async () => {
      try {
        let chosen: AutoScanSignal | null = null;
        let chosenSymbol: string = '';
        let chosenTf: string = AUTO_TIMEFRAMES[0];

        // Walk Quotes-selected symbols only; server tries TFs M15→H1→M5→M1.
        // Body locked to curl: { symbol, id }
        const token = String(mt5Token || '').trim();
        const markets = (symbols || [])
          .map((s) => String(s || '').trim().toUpperCase())
          .filter(Boolean);
        setScanMarkets(markets);
        if (markets.length === 0) {
          setPhase('error');
          setError('Select symbols in Quotes on Home, then Start.');
          setStatus('No Quotes selected');
          return;
        }
        if (!token) {
          setPhase('error');
          setError(
            'Connect MetaTrader first. Auto Trade sends scans to your linked MT5.',
          );
          setStatus('MT5 not linked');
          return;
        }
        chosenSymbol = markets[0];

        for (let mi = 0; mi < markets.length; mi++) {
          if (ac.signal.aborted || id !== runId.current) return;
          setMarketIdx(mi);
          setTfIdx(0);
          const symbol = markets[mi];
          setStatus(
            token
              ? `Scanning ${symbol}…`
              : `Preview ${symbol} (connect broker for live)…`,
          );

          // Show TF pipeline progress in UI while waiting
          for (let ti = 0; ti < AUTO_TIMEFRAMES.length; ti++) {
            setTfIdx(ti);
            await sleep(120, ac.signal).catch(() => undefined);
            if (ac.signal.aborted || id !== runId.current) return;
          }

          const api = await postAutoScan({ symbol, id: token }, ac.signal);

          if (ac.signal.aborted || id !== runId.current) return;

          if (!api.ok) {
            if (/no trade|skip|flat|reverse/i.test(api.error || '')) {
              continue;
            }
            if (!chosen) setError(api.error || 'Auto Scan failed');
            continue;
          }

          if (api.skip || api.trade === false) continue;

          if (api.direction) {
            chosen = {
              ...api,
              symbol,
              timeframe: api.timeframe || AUTO_TIMEFRAMES[0],
            };
            chosenSymbol = symbol;
            chosenTf = api.timeframe || AUTO_TIMEFRAMES[0];
            break;
          }
        }

        if (ac.signal.aborted || id !== runId.current) return;

        if (!chosen?.direction) {
          setPhase('error');
          setError(
            'No tradeable setup across markets (flat / reverse / bounce rules).',
          );
          setStatus('No trade');
          return;
        }

        // Ensure TP ladder 1R/2R/3R when prices exist
        if (
          chosen.entryPrice &&
          chosen.stopLoss &&
          (!chosen.takeProfits || chosen.takeProfits.length === 0)
        ) {
          const side = chosen.direction === 'sell' ? 'sell' : 'buy';
          chosen.takeProfits = buildTpLadder(
            chosen.entryPrice,
            chosen.stopLoss,
            side,
            3,
          ).tps;
        }

        setSignal(chosen);
        setStatus(
          `${chosenSymbol} ${chosenTf} · ${(chosen.direction || '').toUpperCase()} signal`,
        );
        setPhase('signal');
        await sleep(900, ac.signal);
        if (ac.signal.aborted || id !== runId.current) return;

        // Countdown from 8s then execute
        setPhase('countdown');
        for (let s = 8; s >= 1; s--) {
          if (ac.signal.aborted || id !== runId.current) return;
          setCountdown(s);
          setStatus(`Opening trades in ${s}s…`);
          await sleep(1000, ac.signal);
        }
        if (ac.signal.aborted || id !== runId.current) return;

        setPhase('execute');
        setStatus('Sending order to MT5…');

        const setup =
          (quoteSetups || []).find((s) => s.symbol === chosenSymbol) ||
          normalizeQuoteSetup({
            symbol: chosenSymbol,
            lotSize,
            trades,
          });
        const sendLots = setup?.lotSize ?? lotSize;
        const sendTrades = setup?.trades ?? trades;
        const side = chosen.direction === 'sell' ? 'sell' : 'buy';
        const operation: 0 | 1 = side === 'sell' ? 1 : 0;
        const tps = Array.isArray(chosen.takeProfits)
          ? chosen.takeProfits.filter((n) => Number.isFinite(n) && n > 0)
          : [];
        const sl =
          chosen.stopLoss != null && Number(chosen.stopLoss) > 0
            ? Number(chosen.stopLoss)
            : undefined;

        let opened = 0;
        let lastFail = '';
        for (let n = 0; n < sendTrades; n++) {
          if (ac.signal.aborted || id !== runId.current) return;
          setStatus(
            `OrderSend ${n + 1}/${sendTrades} · ${chosenSymbol} · ${sendLots} lot`,
          );
          const tp =
            tps.length > 0
              ? Number(tps[Math.min(n, tps.length - 1)])
              : undefined;
          const send = await sendBrokerOrder({
            id: token,
            symbol: chosenSymbol,
            operation,
            volume: sendLots,
            stopLoss: sl,
            takeProfit: tp,
            comment: formatOrderSendComment(botName),
            slippage: 10000,
          });
          if (ac.signal.aborted || id !== runId.current) return;
          if (!send.ok) {
            lastFail =
              String(send.error || '').trim() ||
              'OrderSend failed — no reason from API';
            // Stop on first hard reject so the user sees the real problem
            break;
          }
          opened += 1;
          if (n < sendTrades - 1) {
            await sleep(250, ac.signal).catch(() => undefined);
          }
        }

        if (ac.signal.aborted || id !== runId.current) return;

        if (opened === 0) {
          setPhase('error');
          setError(lastFail || 'Broker rejected the order.');
          setStatus('Trade send failed');
          return;
        }

        setPhase('done');
        setStatus(
          opened < sendTrades
            ? `Opened ${opened}/${sendTrades} · ${chosenSymbol} — ${lastFail || 'remaining legs failed'}`
            : `Opened ${opened} trade(s) · ${chosenSymbol} · ${sendLots} lot`,
        );
        if (opened < sendTrades && lastFail) {
          setError(`Partial fill: ${lastFail}`);
        }
        onExecuted?.({
          symbol: chosenSymbol,
          direction: String(chosen.direction),
          trades: opened,
        });
      } catch (e) {
        if (ac.signal.aborted || id !== runId.current) return;
        setPhase('error');
        setError(e instanceof Error ? e.message : 'Engine error');
        setStatus('Engine stopped');
      }
    })();

    return () => {
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mt5Token, symbols, quoteSetups, lotSize, trades, botName]);

  const phaseLabel =
    phase === 'scanning'
      ? 'Scanning'
      : phase === 'signal'
        ? 'Signal'
        : phase === 'countdown'
          ? 'Countdown'
          : phase === 'execute'
            ? 'Execute'
            : phase === 'done'
              ? 'Done'
              : 'Error';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[styles.card, { borderColor: hexToRgba(accent, 0.55) }]}
          accessibilityLabel="Auto Trade Engine"
        >
          <View style={styles.head}>
            <View style={styles.headLeft}>
              <View
                style={[styles.liveDot, { backgroundColor: BASE.green }]}
              />
              <Text style={styles.title}>Auto Trade Engine</Text>
            </View>
            <Pressable
              accessibilityLabel="Close auto trade engine"
              onPress={onClose}
              hitSlop={10}
            >
              <Ionicons name="close" size={22} color={BASE.muted} />
            </Pressable>
          </View>

          <View style={styles.pipeline}>
            {(['signal', 'countdown', 'execute'] as const).map((p, i) => {
              const active =
                (p === 'signal' &&
                  (phase === 'signal' ||
                    phase === 'scanning' ||
                    phase === 'countdown' ||
                    phase === 'execute' ||
                    phase === 'done')) ||
                (p === 'countdown' &&
                  (phase === 'countdown' ||
                    phase === 'execute' ||
                    phase === 'done')) ||
                (p === 'execute' &&
                  (phase === 'execute' || phase === 'done'));
              const current =
                (p === 'signal' &&
                  (phase === 'scanning' || phase === 'signal')) ||
                (p === 'countdown' && phase === 'countdown') ||
                (p === 'execute' &&
                  (phase === 'execute' || phase === 'done'));
              return (
                <View key={p} style={styles.pipeStep}>
                  {i > 0 ? (
                    <View
                      style={[
                        styles.pipeLine,
                        {
                          backgroundColor: active
                            ? hexToRgba(accent, 0.7)
                            : hexToRgba(BASE.dim, 0.4),
                        },
                      ]}
                    />
                  ) : null}
                  <View
                    style={[
                      styles.pipeDot,
                      {
                        borderColor: current ? accent : hexToRgba(BASE.dim, 0.6),
                        backgroundColor: active
                          ? hexToRgba(accent, 0.25)
                          : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pipeLabel,
                        { color: current ? BASE.white : BASE.muted },
                      ]}
                    >
                      {p === 'signal'
                        ? 'Signal'
                        : p === 'countdown'
                          ? 'Countdown'
                          : 'Execute'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          <Text style={[styles.phase, { color: accent }]}>{phaseLabel}</Text>
          <Text style={styles.status}>{status}</Text>

          {phase === 'scanning' ? (
            <Text style={styles.meta}>
              {scanMarkets[marketIdx] || '—'} · {AUTO_TIMEFRAMES[tfIdx]} ·
              Quotes {marketIdx + 1}/{Math.max(scanMarkets.length, 1)} · session
              20 / bounce 8
            </Text>
          ) : null}

          {phase === 'countdown' ? (
            <Text style={[styles.countdown, { color: accent }]}>
              {countdown}
            </Text>
          ) : null}

          {signal ? (
            <View
              style={[
                styles.signalBox,
                { borderColor: hexToRgba(accent, 0.35) },
              ]}
            >
              <Text style={styles.signalSym}>
                {signal.symbol}
                {signal.timeframe ? ` · ${signal.timeframe}` : ''}
              </Text>
              <Text
                style={[
                  styles.signalDir,
                  {
                    color:
                      signal.direction === 'sell' ? BASE.red : BASE.green,
                  },
                ]}
              >
                {(signal.direction || '').toUpperCase()}
                {signal.accuracy ? ` · ${signal.accuracy}%` : ''}
              </Text>
              {signal.entryPrice != null && signal.stopLoss != null ? (
                <Text style={styles.signalLevels}>
                  Entry {formatPrice(signal.entryPrice)} · SL{' '}
                  {formatPrice(signal.stopLoss, signal.entryPrice)}
                  {signal.takeProfits?.length
                    ? ` · TP ${signal.takeProfits.map((t) => formatPrice(t, signal.entryPrice)).join(' / ')}`
                    : ''}
                </Text>
              ) : null}
              {signal.summary ? (
                <Text style={styles.signalSum}>{signal.summary}</Text>
              ) : null}
              {signal.demo ? (
                <Text style={styles.demoNote}>
                  Preview candles — connect MetaTrader for live Auto Scan
                </Text>
              ) : null}
            </View>
          ) : null}

          {error ? (
            <View
              style={[
                styles.errorBox,
                {
                  borderColor:
                    phase === 'error'
                      ? hexToRgba(BASE.red, 0.65)
                      : hexToRgba(accent, 0.35),
                },
              ]}
              accessibilityRole="alert"
              accessibilityLabel="Trade send problem"
            >
              <Text style={styles.errorTitle}>
                {phase === 'error' ? 'Trade send failed' : 'Notice'}
              </Text>
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeBtn,
              {
                borderColor: hexToRgba(accent, 0.5),
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={styles.closeText}>
              {phase === 'done' || phase === 'error' ? 'Close' : 'Cancel'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 18,
    borderWidth: 1.5,
    backgroundColor: BASE.panel,
    padding: 18,
    gap: 10,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  title: {
    color: BASE.white,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  pipeline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  pipeStep: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  pipeLine: { width: 10, height: 2, marginRight: 4 },
  pipeDot: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  pipeLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  phase: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  status: { color: BASE.white, fontSize: 15, fontWeight: '700' },
  meta: { color: BASE.muted, fontSize: 12 },
  countdown: {
    fontSize: 56,
    fontWeight: '900',
    textAlign: 'center',
    marginVertical: 6,
  },
  signalBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
    marginTop: 4,
  },
  signalSym: { color: BASE.white, fontSize: 15, fontWeight: '800' },
  signalDir: { fontSize: 18, fontWeight: '900' },
  signalLevels: { color: BASE.muted, fontSize: 12, marginTop: 2 },
  signalSum: { color: BASE.muted, fontSize: 12, marginTop: 4 },
  demoNote: { color: BASE.dim, fontSize: 11, marginTop: 4 },
  errorBox: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 82, 82, 0.08)',
    gap: 4,
  },
  errorTitle: {
    color: BASE.red,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  error: {
    color: BASE.white,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  closeBtn: {
    marginTop: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeText: { color: BASE.white, fontWeight: '800', fontSize: 14 },
});
