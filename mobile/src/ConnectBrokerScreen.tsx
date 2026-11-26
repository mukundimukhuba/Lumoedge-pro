import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppState } from './AppState';
import { EaBlurWallpaper } from './EaBlurWallpaper';
import { EdgesBottomDock } from './EdgesBottomDock';
import {
  connectBrokerApi,
  fetchBrokerAccount,
  fetchBrokerBridgeHealth,
  searchBrokersApi,
  type BrokerAccount,
  type BrokerBridgeHealth,
} from './brokers/api';
import {
  BROKERS,
  brokerLogoUri,
  canUseCustomBroker,
  filterBrokers,
  getBrokerRecord,
  getBrokerServers,
} from './brokers/data';
import {
  clearMt5Token,
  loadMt5AccountCache,
  loadMt5Link,
  saveMt5AccountCache,
  saveMt5Link,
} from './brokers/mt5Token';

export { BROKERS, filterBrokers, canUseCustomBroker };

const BASE = {
  black: '#000000',
  white: '#FFFFFF',
  muted: '#8B8B8B',
  dim: '#5C5C5C',
  panel: 'rgba(10, 10, 10, 0.94)',
  green: '#00C853',
  red: '#FF5252',
};

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function formatMoney(n: number, currency?: string): string {
  const cur = String(currency || '').trim();
  if (!cur) {
    return Number.isFinite(n) ? n.toFixed(2) : '—';
  }
  try {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${cur} ${n.toFixed(2)}`;
  }
}

function BrokerMark({
  name,
  size = 28,
}: {
  name: string;
  size?: number;
}) {
  const rec = getBrokerRecord(name);
  const uri = brokerLogoUri(name);
  const [failed, setFailed] = useState(false);
  const letter = (name.trim()[0] || '?').toUpperCase();
  const bg = rec?.color || '#333';

  if (uri && !failed) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.28,
          overflow: 'hidden',
          backgroundColor: '#111',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Image
          source={{ uri }}
          style={{ width: size * 0.72, height: size * 0.72 }}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: BASE.white,
          fontWeight: '800',
          fontSize: size * 0.42,
        }}
      >
        {letter}
      </Text>
    </View>
  );
}

function ConnectPulse({
  accent,
  active,
  broker,
}: {
  accent: string;
  active: boolean;
  broker?: string | null;
}) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.4)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (!active) {
      spin.stopAnimation();
      pulse.stopAnimation();
      scale.stopAnimation();
      spin.setValue(0);
      pulse.setValue(0.4);
      scale.setValue(0.92);
      return;
    }
    const rot = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const pul = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 560,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 560,
          useNativeDriver: true,
        }),
      ]),
    );
    const breath = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.06,
          duration: 560,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.94,
          duration: 560,
          useNativeDriver: true,
        }),
      ]),
    );
    rot.start();
    pul.start();
    breath.start();
    return () => {
      rot.stop();
      pul.stop();
      breath.stop();
    };
  }, [active, spin, pulse, scale]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Modal
      visible={active}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => undefined}
    >
      <View style={styles.pulseBackdrop} accessibilityLabel="Connecting">
        <View
          style={[
            styles.pulseCard,
            { borderColor: hexToRgba(accent, 0.55) },
          ]}
        >
          <View style={styles.pulseWrap}>
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  borderColor: hexToRgba(accent, 0.65),
                  opacity: pulse,
                  transform: [{ rotate }],
                },
              ]}
            />
            <Animated.View style={{ transform: [{ scale }] }}>
              {broker ? (
                <BrokerMark name={broker} size={56} />
              ) : (
                <Ionicons name="link" size={32} color={accent} />
              )}
            </Animated.View>
          </View>
          <Text style={[styles.pulseText, { color: accent }]}>
            Linking {broker || 'account'}…
          </Text>
          <Text style={styles.pulseSub}>Live MT5 session</Text>
        </View>
      </View>
    </Modal>
  );
}

function LiveAccountPanel({
  account,
  accent,
}: {
  account: BrokerAccount;
  accent: string;
}) {
  const currency = String(account.currency || '').trim() || undefined;
  const trades = account.trades || [];
  const hasTrades = trades.length > 0;
  const openPl = account.equity - account.balance;
  const deltaColor =
    openPl > 0 ? BASE.green : openPl < 0 ? BASE.red : BASE.muted;
  // Open P/L only when mapped open trades exist — never invent from equity−balance.
  const showOpenPl = hasTrades;

  return (
    <View style={styles.liveBlock} accessibilityLabel="Live account">
      <View style={styles.liveHeader}>
        <View style={styles.liveDot} />
        <Text style={styles.liveTitle}>
          Live MT5{currency ? ` · ${currency}` : ''}
        </Text>
        <Text style={styles.liveAgo}>
          {account.updatedAt
            ? new Date(account.updatedAt).toLocaleTimeString()
            : 'now'}
        </Text>
      </View>

      <View style={styles.metricsRow}>
        <View
          style={[
            styles.metricCard,
            { borderColor: hexToRgba(accent, 0.35) },
          ]}
        >
          <Text style={styles.metricLabel}>Balance</Text>
          <Text style={styles.metricValue}>
            {formatMoney(account.balance, currency)}
          </Text>
        </View>
        <View
          style={[
            styles.metricCard,
            { borderColor: hexToRgba(accent, 0.35) },
          ]}
        >
          <Text style={styles.metricLabel}>Equity</Text>
          <Text style={styles.metricValue}>
            {formatMoney(account.equity, currency)}
          </Text>
          {showOpenPl ? (
            <Text
              style={[styles.metricDelta, { color: deltaColor }]}
              accessibilityLabel="Open profit and loss"
            >
              Open P/L {openPl >= 0 ? '+' : ''}
              {formatMoney(openPl, currency)}
            </Text>
          ) : null}
        </View>
      </View>

      {hasTrades ? (
        <View style={styles.tradesBlock}>
          <Text style={styles.sectionLabel}>Open trades</Text>
          {trades.map((t) => {
            const pnlColor =
              t.pnl > 0 ? BASE.green : t.pnl < 0 ? BASE.red : BASE.muted;
            return (
              <View
                key={t.id}
                style={[
                  styles.tradeRow,
                  { borderColor: hexToRgba(accent, 0.25) },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.tradeSymbol}>{t.symbol}</Text>
                  <Text style={styles.tradeMeta}>
                    {t.side} · {t.lots} lot · @{t.openPrice}
                  </Text>
                </View>
                <Text style={[styles.tradePnl, { color: pnlColor }]}>
                  {t.pnl >= 0 ? '+' : ''}
                  {formatMoney(t.pnl, currency)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function ConnectBrokerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accent } = useAppState();
  const dockPad = Math.max(insets.bottom, 10);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [server, setServer] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [account, setAccount] = useState<BrokerAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [serverPickerOpen, setServerPickerOpen] = useState(false);
  const [apiSuggestions, setApiSuggestions] = useState<string[] | null>(null);
  const [apiSource, setApiSource] = useState<'local' | 'upstream' | 'offline'>(
    'local',
  );
  const [bridgeHealth, setBridgeHealth] = useState<BrokerBridgeHealth | null>(
    null,
  );
  const searchGen = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bridgePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Active MT5 token for in-flight fetches — cleared on disconnect */
  const activeTokenRef = useRef<string | null>(null);

  const servers = useMemo(
    () => (selected ? getBrokerServers(selected) : []),
    [selected],
  );

  const localSuggestions = useMemo(() => filterBrokers(query, 24), [query]);
  const suggestions = apiSuggestions ?? localSuggestions;
  const showCustom = useMemo(() => canUseCustomBroker(query), [query]);
  const showSuggest =
    !selected && (searchFocused || query.trim().length > 0);

  // Restore MT5 link + cached account instantly; refresh live data in background
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const link = await loadMt5Link();
        if (cancelled) return;
        if (!link?.token) {
          setRestoring(false);
          return;
        }
        const cached = await loadMt5AccountCache(link.token);
        if (cancelled) return;
        setSelected(link.broker);
        setQuery(link.broker);
        if (link.server) setServer(link.server);
        if (link.login) setLogin(link.login);
        activeTokenRef.current = link.token;
        setSessionId(link.token);
        setConnected(true);
        setError(null);
        if (cached) setAccount(cached);
        // End restore immediately — never block on network / hang forever
        setRestoring(false);
        // Quiet background hydrate; poll continues afterward
        try {
          const next = await fetchBrokerAccount(link.token, {
            timeoutMs: 10000,
          });
          if (cancelled || activeTokenRef.current !== link.token) return;
          setAccount(next);
          void saveMt5AccountCache(next, link.token);
        } catch {
          // Keep cached snapshot; live poll will retry quietly
        }
      } catch {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // API search with local fallback
  useEffect(() => {
    if (selected) return;
    const gen = ++searchGen.current;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await searchBrokersApi(query, 24);
          if (gen !== searchGen.current) return;
          setApiSuggestions(res.brokers);
          setApiSource(res.source === 'upstream' ? 'upstream' : 'local');
        } catch {
          if (gen !== searchGen.current) return;
          setApiSuggestions(null);
          setApiSource('offline');
        }
      })();
    }, 180);
    return () => clearTimeout(t);
  }, [query, selected]);

  // Live account poll
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!sessionId || !connected) return;

    let cancelled = false;
    const activeToken = sessionId;
    activeTokenRef.current = activeToken;
    const tick = () => {
      void (async () => {
        try {
          const next = await fetchBrokerAccount(activeToken, {
            timeoutMs: 10000,
          });
          // Drop late responses after disconnect / session change
          if (cancelled || activeTokenRef.current !== activeToken) return;
          setAccount(next);
          void saveMt5AccountCache(next, activeToken);
        } catch {
          // keep last snapshot (cached or prior live)
        }
      })();
    };
    tick();
    pollRef.current = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [sessionId, connected]);

  // Bridge health — durable status, never pretend the droplet is up
  useEffect(() => {
    if (bridgePollRef.current) {
      clearInterval(bridgePollRef.current);
      bridgePollRef.current = null;
    }
    if (connected || restoring) return;

    let cancelled = false;
    const tick = () => {
      void (async () => {
        const next = await fetchBrokerBridgeHealth();
        if (!cancelled) setBridgeHealth(next);
      })();
    };
    tick();
    bridgePollRef.current = setInterval(tick, 20000);
    return () => {
      cancelled = true;
      if (bridgePollRef.current) {
        clearInterval(bridgePollRef.current);
        bridgePollRef.current = null;
      }
    };
  }, [connected, restoring]);

  const pickBroker = (name: string) => {
    activeTokenRef.current = null;
    setSelected(name);
    setQuery(name);
    setSearchFocused(false);
    setConnected(false);
    setSessionId(null);
    setAccount(null);
    setError(null);
    const list = getBrokerServers(name);
    setServer(list[0] || '');
    setServerPickerOpen(false);
    setLogin('');
    setPassword('');
    void clearMt5Token();
  };

  const clearBroker = () => {
    activeTokenRef.current = null;
    setSelected(null);
    setQuery('');
    setConnected(false);
    setSessionId(null);
    setAccount(null);
    setError(null);
    setServer('');
    setLogin('');
    setPassword('');
    setServerPickerOpen(false);
    setSearchFocused(true);
    void clearMt5Token();
  };

  const onDisconnect = () => {
    activeTokenRef.current = null;
    setConnected(false);
    setSessionId(null);
    setAccount(null);
    setError(null);
    setPassword('');
    setLogin('');
    setServerPickerOpen(false);
    // Keep selected broker so user can reconnect quickly; show form again
    void clearMt5Token();
  };

  const onConnect = () => {
    if (!selected) {
      setError('Choose a broker from the suggestions.');
      return;
    }
    if (!server.trim() || !login.trim()) {
      setError('Enter Server and Login.');
      return;
    }
    if (!password.trim()) {
      setError('Trading password is required (not the investor password).');
      return;
    }
    setError(null);
    setConnecting(true);
    void (async () => {
      try {
        const health = await fetchBrokerBridgeHealth();
        setBridgeHealth(health);
        if (!health.ok) {
          setError(
            health.error ||
              'MT5 bridge is down. Connect cannot succeed until /health answers.',
          );
          setConnected(false);
          setSessionId(null);
          setAccount(null);
          return;
        }
        const res = await connectBrokerApi({
          broker: selected,
          server: server.trim(),
          login: login.trim(),
          password,
        });
        if (!res.ok) {
          // Keep password so the user can correct and retry without retyping.
          setError(res.error || 'Connect failed.');
          setConnected(false);
          setSessionId(null);
          setAccount(null);
          return;
        }
        const mt5Id = String(res.token || res.id || res.sessionId || '').trim();
        if (!mt5Id) {
          setError('No MT5 session token returned.');
          setConnected(false);
          setSessionId(null);
          setAccount(null);
          return;
        }
        setPassword('');
        activeTokenRef.current = mt5Id;
        setConnected(true);
        setSessionId(mt5Id);
        void saveMt5Link({
          token: mt5Id,
          broker: selected,
          server: server.trim(),
          login: login.trim(),
        });
        // Best-effort: record for Mentors Portal Settings broker counts
        void import('./portal/data/portalStats').then(({ recordBrokerConnection }) =>
          recordBrokerConnection({
            id: `bc_${mt5Id}`,
            broker: selected,
            server: server.trim(),
            login: login.trim(),
          }),
        );
        // Account fetched live via poll — never trust seeded connect payload
        setAccount(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? `Broker API unreachable: ${err.message}`
            : 'Broker API unreachable. Try again.',
        );
        setConnected(false);
        setSessionId(null);
        setAccount(null);
        void clearMt5Token();
      } finally {
        setConnecting(false);
      }
    })();
  };

  const goHome = () => {
    router.replace('/');
  };

  return (
    <View style={styles.root}>
      <EaBlurWallpaper darken={0.12} />

      <View style={{ paddingTop: Math.max(insets.top, 10), zIndex: 1 }}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="back"
            accessibilityRole="button"
            onPress={goHome}
            hitSlop={12}
            style={[
              styles.headerIconBtn,
              { borderColor: hexToRgba(accent, 0.4) },
            ]}
          >
            <Ionicons name="chevron-back" size={22} color={BASE.white} />
          </Pressable>
          <View style={styles.headerTitles}>
            <Text style={styles.eyebrow}>edges</Text>
            <Text style={styles.title}>Connect broker</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      <ScrollView
        style={[styles.scroll, { zIndex: 1, backgroundColor: 'transparent' }]}
        contentContainerStyle={[
          styles.scrollBody,
          { paddingBottom: 88 + dockPad },
        ]}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lead}>
          {connected
            ? 'Live MT5 session — balance, equity, and open trades from your linked account.'
            : `Search forex CFD brokers (SA + global), pick an MT server, then connect a real session${
                apiSource === 'upstream'
                  ? ' · live upstream'
                  : apiSource === 'offline'
                    ? ' · offline catalog'
                    : ' · local catalog'
              }.`}
        </Text>

        {!restoring && !connected && bridgeHealth ? (
          <Text
            style={[
              styles.bridgeHealth,
              {
                color: bridgeHealth.ok ? BASE.green : BASE.red,
              },
            ]}
            accessibilityLabel={
              bridgeHealth.ok
                ? 'MT5 bridge healthy'
                : 'MT5 bridge unhealthy'
            }
          >
            {bridgeHealth.ok
              ? `MT5 bridge ready${
                  typeof bridgeHealth.latencyMs === 'number'
                    ? ` · ${bridgeHealth.latencyMs}ms`
                    : ''
                }`
              : 'MT5 bridge down — fix droplet /health before Connect'}
          </Text>
        ) : null}

        {/* Restore never blocks on network — local cache paints Connected UI instantly */}
        {!restoring && connected && selected ? (
          <View style={styles.formBlock}>
            <View
              style={[
                styles.pickedRow,
                { borderColor: hexToRgba(BASE.green, 0.5) },
              ]}
            >
              <View style={styles.pickedLeft}>
                <BrokerMark name={selected} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickedName}>{selected}</Text>
                  <Text style={styles.suggestHint}>
                    {account?.login
                      ? `Login ${account.login} · `
                      : login
                        ? `Login ${login} · `
                        : ''}
                    Live MT5
                    {account?.currency ? ` · ${account.currency}` : ''}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.liveBadge,
                  { borderColor: hexToRgba(BASE.green, 0.55) },
                ]}
              >
                <View style={styles.liveDot} />
                <Text style={[styles.liveBadgeText, { color: BASE.green }]}>
                  Connected
                </Text>
              </View>
            </View>

            {account ? (
              <LiveAccountPanel account={account} accent={accent} />
            ) : (
              <View
                style={styles.livePending}
                accessibilityLabel="Updating live account in background"
              >
                <View style={styles.liveDot} />
                <Text style={styles.livePendingText}>
                  Updating balance in background…
                </Text>
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Disconnect broker"
              onPress={onDisconnect}
              style={({ pressed }) => [
                styles.disconnectBtn,
                {
                  borderColor: hexToRgba(BASE.red, 0.55),
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons name="unlink-outline" size={18} color={BASE.red} />
              <Text style={styles.disconnectText}>Disconnect</Text>
            </Pressable>
          </View>
        ) : null}

        {!restoring && !connected ? (
          <>
        <Text style={styles.sectionLabel}>Broker</Text>
        <View
          style={[
            styles.searchWrap,
            {
              borderColor: hexToRgba(
                accent,
                searchFocused || selected ? 0.7 : 0.4,
              ),
            },
          ]}
        >
          <Ionicons name="search" size={18} color={accent} />
          <TextInput
            value={query}
            onChangeText={(t) => {
              activeTokenRef.current = null;
              setQuery(t);
              setSelected(null);
              setConnected(false);
              setSessionId(null);
              setAccount(null);
              setError(null);
            }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => {
              setTimeout(() => setSearchFocused(false), 180);
            }}
            placeholder="Search Razor Markets, RCG, Exness…"
            placeholderTextColor={BASE.dim}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search brokers"
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityLabel="Clear broker search"
              onPress={clearBroker}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color={BASE.muted} />
            </Pressable>
          ) : null}
        </View>

        {showSuggest ? (
          <View
            style={[
              styles.suggestBox,
              { borderColor: hexToRgba(accent, 0.35) },
            ]}
          >
            <ScrollView
              style={styles.suggestScroll}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {suggestions.length === 0 && !showCustom ? (
                <Text style={styles.suggestEmpty}>
                  No brokers match — type a name to use custom
                </Text>
              ) : null}
              {suggestions.map((name, i) => {
                const rec = getBrokerRecord(name);
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${name}`}
                    onPress={() => pickBroker(name)}
                    style={({ pressed }) => [
                      styles.suggestRow,
                      i > 0
                        ? {
                            borderTopWidth: StyleSheet.hairlineWidth,
                            borderTopColor: hexToRgba(accent, 0.2),
                          }
                        : null,
                      {
                        backgroundColor: pressed
                          ? hexToRgba(accent, 0.12)
                          : 'transparent',
                      },
                    ]}
                  >
                    <BrokerMark name={name} size={30} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.suggestName}>{name}</Text>
                      {rec?.region === 'za' ? (
                        <Text style={styles.suggestHint}>South Africa</Text>
                      ) : null}
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={BASE.dim}
                    />
                  </Pressable>
                );
              })}
              {showCustom ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Use custom broker ${query.trim()}`}
                  onPress={() => pickBroker(query.trim())}
                  style={({ pressed }) => [
                    styles.suggestRow,
                    suggestions.length > 0
                      ? {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: hexToRgba(accent, 0.2),
                        }
                      : null,
                    {
                      backgroundColor: pressed
                        ? hexToRgba(accent, 0.12)
                        : hexToRgba(accent, 0.06),
                    },
                  ]}
                >
                  <Ionicons name="create-outline" size={16} color={accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestName}>
                      Use “{query.trim()}”
                    </Text>
                    <Text style={styles.suggestHint}>Custom broker name</Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={BASE.dim}
                  />
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        ) : null}

        {selected ? (
          <View style={styles.formBlock}>
            <View
              style={[
                styles.pickedRow,
                { borderColor: hexToRgba(accent, 0.45) },
              ]}
            >
              <View style={styles.pickedLeft}>
                <BrokerMark name={selected} size={32} />
                <Text style={styles.pickedName}>{selected}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change broker"
                onPress={clearBroker}
              >
                <Text style={[styles.changeLink, { color: accent }]}>
                  Change
                </Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>Credentials</Text>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Server</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose server"
                onPress={() =>
                  servers.length > 0
                    ? setServerPickerOpen((v) => !v)
                    : undefined
                }
                style={[
                  styles.fieldInputWrap,
                  { borderColor: hexToRgba(accent, 0.5) },
                ]}
              >
                <TextInput
                  value={server}
                  onChangeText={(t) => {
                    setServer(t);
                    setServerPickerOpen(false);
                  }}
                  placeholder={
                    servers[0] || 'e.g. ICMarkets-Live01'
                  }
                  placeholderTextColor={BASE.dim}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.fieldInput, { flex: 1 }]}
                  accessibilityLabel="Server"
                />
                {servers.length > 0 ? (
                  <Ionicons
                    name={
                      serverPickerOpen ? 'chevron-up' : 'chevron-down'
                    }
                    size={18}
                    color={BASE.muted}
                  />
                ) : null}
              </Pressable>
              {serverPickerOpen && servers.length > 0 ? (
                <View
                  style={[
                    styles.serverList,
                    { borderColor: hexToRgba(accent, 0.3) },
                  ]}
                >
                  {servers.map((s) => (
                    <Pressable
                      key={s}
                      accessibilityRole="button"
                      accessibilityLabel={`Server ${s}`}
                      onPress={() => {
                        setServer(s);
                        setServerPickerOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.serverRow,
                        {
                          backgroundColor:
                            s === server
                              ? hexToRgba(accent, 0.14)
                              : pressed
                                ? hexToRgba(accent, 0.08)
                                : 'transparent',
                        },
                      ]}
                    >
                      <Text style={styles.serverName}>{s}</Text>
                      {s === server ? (
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={accent}
                        />
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <Field
              accent={accent}
              label="Login"
              value={login}
              onChangeText={setLogin}
              placeholder="Account number"
              keyboardType="number-pad"
              accessibilityLabel="Login"
            />
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View
                style={[
                  styles.fieldInputWrap,
                  { borderColor: hexToRgba(accent, 0.5) },
                ]}
              >
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Trading password"
                  placeholderTextColor={BASE.dim}
                  secureTextEntry={!showPass}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.fieldInput, { flex: 1 }]}
                  accessibilityLabel="Password"
                />
                <Pressable
                  accessibilityLabel={
                    showPass ? 'Hide password' : 'Show password'
                  }
                  onPress={() => setShowPass((v) => !v)}
                  hitSlop={8}
                >
                  <Ionicons
                    name={showPass ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={BASE.muted}
                  />
                </Pressable>
              </View>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Connect broker"
              onPress={onConnect}
              disabled={connecting}
              style={({ pressed }) => [
                styles.connectBtn,
                {
                  borderColor: accent,
                  opacity: connecting ? 0.45 : pressed ? 0.7 : 1,
                },
              ]}
            >
              <LinearGradient
                colors={[
                  hexToRgba(accent, 0.55),
                  hexToRgba(accent, 0.18),
                  '#0A0000',
                ]}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={styles.connectGrad}
              >
                <Ionicons name="link-outline" size={18} color={BASE.white} />
                <Text style={styles.connectText}>Connect live MT5</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}
          </>
        ) : null}
      </ScrollView>

      <ConnectPulse
        accent={accent}
        active={connecting}
        broker={selected}
      />

      <EdgesBottomDock />
    </View>
  );
}

function Field({
  accent,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  accessibilityLabel,
}: {
  accent: string;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences';
  accessibilityLabel: string;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={[
          styles.fieldInputWrap,
          { borderColor: hexToRgba(accent, 0.5) },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={BASE.dim}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          style={styles.fieldInput}
          accessibilityLabel={accessibilityLabel}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BASE.black },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 10,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BASE.panel,
  },
  headerTitles: { flex: 1 },
  headerSpacer: { width: 38 },
  eyebrow: {
    color: BASE.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: BASE.white,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  scroll: { flex: 1 },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 6,
    gap: 12,
  },
  lead: {
    color: BASE.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  bridgeHealth: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sectionLabel: {
    color: BASE.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    backgroundColor: BASE.panel,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 12 : 10,
  },
  searchInput: {
    flex: 1,
    color: BASE.white,
    fontSize: 16,
    fontWeight: '600',
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', outlineWidth: 0 } as object)
      : null),
  },
  suggestBox: {
    borderWidth: 1.5,
    borderRadius: 14,
    backgroundColor: BASE.panel,
    overflow: 'hidden',
    marginTop: -4,
  },
  suggestScroll: {
    maxHeight: 280,
  },
  suggestEmpty: {
    color: BASE.muted,
    fontSize: 13,
    padding: 14,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  suggestName: {
    flex: 1,
    color: BASE.white,
    fontSize: 15,
    fontWeight: '600',
  },
  suggestHint: {
    color: BASE.muted,
    fontSize: 11,
    marginTop: 2,
  },
  formBlock: { gap: 12 },
  pickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: 14,
    backgroundColor: BASE.panel,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pickedLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  pickedName: {
    color: BASE.white,
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  changeLink: { fontSize: 13, fontWeight: '700' },
  fieldBlock: { gap: 6 },
  fieldLabel: { color: BASE.muted, fontSize: 12, fontWeight: '600' },
  fieldInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    backgroundColor: BASE.panel,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
  },
  fieldInput: {
    color: BASE.white,
    fontSize: 16,
    fontWeight: '600',
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', outlineWidth: 0 } as object)
      : null),
  },
  serverList: {
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: BASE.panel,
    overflow: 'hidden',
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  serverName: { color: BASE.white, fontSize: 14, fontWeight: '600' },
  errorText: {
    color: BASE.red,
    fontSize: 13,
    fontWeight: '600',
  },
  connectBtn: {
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
    marginTop: 4,
  },
  connectGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  connectText: {
    color: BASE.white,
    fontWeight: '800',
    fontSize: 15,
  },
  pulseBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pulseCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: BASE.panel,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 12,
  },
  pulseWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2.5,
    borderTopColor: 'transparent',
  },
  pulseText: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  pulseSub: {
    color: BASE.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: hexToRgba('#FF5252', 0.08),
    marginTop: 4,
  },
  livePending: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  livePendingText: {
    color: BASE.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  disconnectText: {
    color: BASE.red,
    fontWeight: '800',
    fontSize: 15,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: hexToRgba('#00C853', 0.1),
  },
  liveBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  liveBlock: { gap: 12, marginTop: 4 },
  liveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BASE.green,
  },
  liveTitle: {
    flex: 1,
    color: BASE.white,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  liveAgo: { color: BASE.dim, fontSize: 11, fontWeight: '600' },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    backgroundColor: BASE.panel,
    padding: 14,
    gap: 4,
  },
  metricLabel: {
    color: BASE.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: BASE.white,
    fontSize: 18,
    fontWeight: '800',
  },
  metricDelta: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  tradesBlock: { gap: 8 },
  tradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: BASE.panel,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  tradeSymbol: {
    color: BASE.white,
    fontSize: 15,
    fontWeight: '800',
  },
  tradeMeta: {
    color: BASE.muted,
    fontSize: 12,
    marginTop: 2,
  },
  tradePnl: {
    fontSize: 15,
    fontWeight: '800',
  },
});
