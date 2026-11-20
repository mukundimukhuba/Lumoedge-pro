import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
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
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppState } from './AppState';

/** Tiny red PNG for demo / proof flows (`?demo=1`). */
const DEMO_CHART_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6aAAAAAElFTkSuQmCC';

const BASE = {
  black: '#000000',
  white: '#FFFFFF',
  muted: '#8B8B8B',
  dim: '#5C5C5C',
  panel: 'rgba(10, 10, 10, 0.92)',
};

const QUICK = ['XAUUSD', 'EURUSD', 'BTCUSD', 'NAS100'] as const;
const TIMEFRAMES = ['M5', 'M15', 'H1', 'H4', 'D1'] as const;

const SYMBOL_POOL = [
  'XAUUSD',
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'BTCUSD',
  'NAS100',
  'US30',
  'AUDUSD',
] as const;

type HistoryEntry = {
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

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function hashSeed(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Mock chart OCR — picks symbol + timeframe from image fingerprint. */
function detectFromChart(uri: string): { symbol: string; timeframe: string } {
  const seed = hashSeed(uri.slice(0, 240) + String(uri.length));
  return {
    symbol: SYMBOL_POOL[seed % SYMBOL_POOL.length],
    timeframe: TIMEFRAMES[(seed >>> 3) % TIMEFRAMES.length],
  };
}

function mockLevels(symbol: string, bias: string, seed: number) {
  const base =
    symbol.includes('XAU')
      ? 2650
      : symbol.includes('BTC')
        ? 68000
        : symbol.includes('NAS') || symbol.includes('US30')
          ? 18500
          : symbol.includes('JPY')
            ? 150
            : 1.08;
  const step =
    base > 1000 ? base * 0.0025 : base > 50 ? base * 0.004 : 0.0012;
  const jitter = ((seed % 17) + 3) * step * 0.15;
  const entry = base + jitter;
  const fmt = (n: number) =>
    base >= 100 ? n.toFixed(2) : base >= 10 ? n.toFixed(3) : n.toFixed(5);

  if (bias === 'Buy') {
    return {
      entry: fmt(entry),
      tp: fmt(entry + step * 2.4),
      sl: fmt(entry - step * 1.2),
    };
  }
  if (bias === 'Sell') {
    return {
      entry: fmt(entry),
      tp: fmt(entry - step * 2.4),
      sl: fmt(entry + step * 1.2),
    };
  }
  return {
    entry: fmt(entry),
    tp: fmt(entry + step),
    sl: fmt(entry - step),
  };
}

function buildTradeExplanation(
  symbol: string,
  timeframe: string,
  bias: string,
  confidence: number,
  hasChart: boolean,
  lotSize: number,
  trades: number,
): string {
  const sizeNote = `${lotSize} lot × ${trades} trade${trades === 1 ? '' : 's'}`;
  if (bias === 'Buy') {
    return hasChart
      ? `${symbol} ${timeframe}: structure holds above the last swing low. Prefer a pullback long (${sizeNote}); confidence ${confidence}% favors continuation.`
      : `${symbol} ${timeframe}: mock buy bias (${sizeNote}). Enter on pullback with risk below the swing. Confidence ${confidence}%.`;
  }
  if (bias === 'Sell') {
    return hasChart
      ? `${symbol} ${timeframe}: rejection into resistance with lower highs. Prefer sells on failed retests (${sizeNote}); confidence ${confidence}%.`
      : `${symbol} ${timeframe}: mock sell bias (${sizeNote}). Fade into resistance with tight invalidation. Confidence ${confidence}%.`;
  }
  return hasChart
    ? `${symbol} ${timeframe}: balanced two-way flow — wait for break and retest before ${sizeNote}. Confidence ${confidence}% on range hold.`
    : `${symbol} ${timeframe}: mock range bias. Stand aside until expansion. Planned ${sizeNote}. Confidence ${confidence}%.`;
}

function pickWebFile(accept: string, capture?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', capture);
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || null));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

function parsePositive(raw: string, fallback: number, max: number) {
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.round(n * 100) / 100);
}

function EdgesRadar({
  accent,
  scanning,
  size,
}: {
  accent: string;
  scanning: boolean;
  size: number;
}) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: scanning ? 1400 : 5200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [scanning, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const rings = [0.92, 0.7, 0.48, 0.28];

  return (
    <View
      style={[
        styles.radarOuter,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: hexToRgba(accent, 0.55),
        },
        Platform.OS === 'web'
          ? ({
              boxShadow: `0 0 36px ${hexToRgba(accent, 0.28)}, inset 0 0 40px ${hexToRgba(accent, 0.08)}`,
            } as object)
          : null,
      ]}
    >
      <LinearGradient
        colors={['rgba(0,0,0,0.2)', hexToRgba(accent, 0.08), 'rgba(0,0,0,0.85)']}
        style={StyleSheet.absoluteFill}
      />
      {rings.map((f) => (
        <View
          key={f}
          pointerEvents="none"
          style={[
            styles.radarRing,
            {
              width: size * f,
              height: size * f,
              borderRadius: (size * f) / 2,
              borderColor: hexToRgba(accent, 0.22 + (1 - f) * 0.4),
            },
          ]}
        />
      ))}
      <View
        pointerEvents="none"
        style={[styles.radarCrossH, { backgroundColor: hexToRgba(accent, 0.28) }]}
      />
      <View
        pointerEvents="none"
        style={[styles.radarCrossV, { backgroundColor: hexToRgba(accent, 0.28) }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.radarSweepPivot,
          {
            width: size * 0.46,
            transform: [{ rotate }],
          },
        ]}
      >
        <LinearGradient
          colors={[hexToRgba(accent, 0.05), hexToRgba(accent, 0.85)]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.radarSweepArm}
        />
      </Animated.View>
      <View
        style={[
          styles.radarCore,
          {
            borderColor: accent,
            backgroundColor: hexToRgba(accent, scanning ? 0.4 : 0.22),
          },
        ]}
      >
        <MaterialCommunityIcons
          name="radar"
          size={26}
          color={scanning ? BASE.white : accent}
        />
      </View>
    </View>
  );
}

type ScanOutcome = {
  bias: string;
  confidence: number;
  explanation: string;
  timeframe: string;
  tp: string;
  sl: string;
};

function LotTradesFields({
  accent,
  lotRaw,
  setLotRaw,
  tradesRaw,
  setTradesRaw,
  compact,
}: {
  accent: string;
  lotRaw: string;
  setLotRaw: (v: string) => void;
  tradesRaw: string;
  setTradesRaw: (v: string) => void;
  compact?: boolean;
}) {
  return (
    <View style={[styles.paramsRow, compact && { gap: 10 }]}>
      <View style={styles.paramField}>
        <Text style={styles.paramLabel}>Lot size</Text>
        <View
          style={[
            styles.paramInputWrap,
            { borderColor: hexToRgba(accent, 0.5) },
          ]}
        >
          <TextInput
            value={lotRaw}
            onChangeText={setLotRaw}
            keyboardType="decimal-pad"
            placeholder="0.10"
            placeholderTextColor={BASE.dim}
            style={styles.paramInput}
            accessibilityLabel="Lot size"
          />
        </View>
      </View>
      <View style={styles.paramField}>
        <Text style={styles.paramLabel}>Trades</Text>
        <View
          style={[
            styles.paramInputWrap,
            { borderColor: hexToRgba(accent, 0.5) },
          ]}
        >
          <TextInput
            value={tradesRaw}
            onChangeText={setTradesRaw}
            keyboardType="number-pad"
            placeholder="1"
            placeholderTextColor={BASE.dim}
            style={styles.paramInput}
            accessibilityLabel="How many trades"
          />
        </View>
      </View>
    </View>
  );
}

export function ChartScannerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ demo?: string }>();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const { accent } = useAppState();
  const picking = useRef(false);
  const demoStarted = useRef(false);

  const [symbol, setSymbol] = useState('XAUUSD');
  const [timeframe, setTimeframe] = useState<string>('H1');
  const [lotRaw, setLotRaw] = useState('0.10');
  const [tradesRaw, setTradesRaw] = useState('1');
  const [scansLeft, setScansLeft] = useState(12);
  const [chartUri, setChartUri] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [scanPromptOpen, setScanPromptOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [detail, setDetail] = useState<HistoryEntry | null>(null);

  const radarSize = Math.min(200, Math.round(winH * 0.24));
  const dockPad = Math.max(insets.bottom, 10);

  const applyChart = (uri: string | null) => {
    if (!uri) return;
    setChartUri(uri);
    setOutcome(null);
    setDetecting(true);
    setScanPromptOpen(false);
    setTimeout(() => {
      const detected = detectFromChart(uri);
      setSymbol(detected.symbol);
      setTimeframe(detected.timeframe);
      setDetecting(false);
      setScanPromptOpen(true);
    }, 700);
  };

  useEffect(() => {
    if (demoStarted.current) return;
    if (params.demo !== '1') return;
    demoStarted.current = true;
    const t = setTimeout(() => applyChart(DEMO_CHART_URI), 200);
    return () => clearTimeout(t);
  }, [params.demo]);

  const pickLibrary = async () => {
    if (picking.current) return;
    picking.current = true;
    try {
      if (Platform.OS === 'web') {
        applyChart(await pickWebFile('image/*'));
        return;
      }
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setOutcome({
          bias: '—',
          confidence: 0,
          timeframe,
          tp: '—',
          sl: '—',
          explanation: 'Photo library permission required.',
        });
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        base64: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      if (a.base64) {
        applyChart(`data:${a.mimeType || 'image/jpeg'};base64,${a.base64}`);
      } else {
        applyChart(a.uri);
      }
    } finally {
      picking.current = false;
    }
  };

  const pickCamera = async () => {
    if (picking.current) return;
    picking.current = true;
    try {
      if (Platform.OS === 'web') {
        applyChart(await pickWebFile('image/*', 'environment'));
        return;
      }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setOutcome({
          bias: '—',
          confidence: 0,
          timeframe,
          tp: '—',
          sl: '—',
          explanation: 'Camera permission required.',
        });
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.85,
        base64: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      if (a.base64) {
        applyChart(`data:${a.mimeType || 'image/jpeg'};base64,${a.base64}`);
      } else {
        applyChart(a.uri);
      }
    } finally {
      picking.current = false;
    }
  };

  const runScan = () => {
    if (scanning) return;
    setScanPromptOpen(false);
    const lotSize = parsePositive(lotRaw, 0.1, 50);
    const trades = Math.max(
      1,
      Math.min(20, Math.round(parsePositive(tradesRaw, 1, 20))),
    );
    setLotRaw(String(lotSize));
    setTradesRaw(String(trades));

    if (scansLeft <= 0) {
      setOutcome({
        bias: '—',
        confidence: 0,
        timeframe,
        tp: '—',
        sl: '—',
        explanation: 'No scans left today. Resets overnight.',
      });
      return;
    }

    setScanning(true);
    setOutcome(null);
    setScansLeft((n) => Math.max(0, n - 1));

    const bias = ['Buy', 'Sell', 'Range'][Math.floor(Math.random() * 3)];
    const confidence = 68 + Math.floor(Math.random() * 28);
    const tf = timeframe;
    const sym = symbol;
    const hasChart = Boolean(chartUri);
    const uriSnap = chartUri;
    const levels = mockLevels(sym, bias, Date.now());
    const explanation = buildTradeExplanation(
      sym,
      tf,
      bias,
      confidence,
      hasChart,
      lotSize,
      trades,
    );

    setTimeout(() => {
      setOutcome({
        bias,
        confidence,
        timeframe: tf,
        tp: levels.tp,
        sl: levels.sl,
        explanation,
      });
      setHistory((prev) => [
        {
          id: `scan_${Date.now()}`,
          symbol: sym,
          timeframe: tf,
          bias,
          confidence,
          message: explanation,
          lotSize,
          trades,
          tp: levels.tp,
          sl: levels.sl,
          chartUri: uriSnap,
          at: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 24));
      setScanning(false);
    }, 950);
  };

  const goHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const formatWhen = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#0A0000', '#050505', '#000000']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          styles.glowOrb,
          { backgroundColor: hexToRgba(accent, 0.14) },
          Platform.OS === 'web'
            ? ({ filter: 'blur(48px)' } as object)
            : null,
        ]}
      />

      <View style={{ paddingTop: Math.max(insets.top, 12) }}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="back"
            accessibilityRole="button"
            onPress={goHome}
            hitSlop={12}
            style={[styles.headerIconBtn, { borderColor: hexToRgba(accent, 0.4) }]}
          >
            <Ionicons name="chevron-back" size={22} color={BASE.white} />
          </Pressable>
          <View style={styles.headerTitles}>
            <Text style={styles.eyebrow}>edges</Text>
            <Text style={styles.title}>Chart Scanner</Text>
          </View>
          <View
            style={[
              styles.scansPill,
              {
                borderColor: hexToRgba(accent, 0.7),
                backgroundColor: hexToRgba(accent, 0.12),
              },
            ]}
          >
            <Ionicons name="flash" size={13} color={accent} />
            <Text style={[styles.scansPillText, { color: accent }]}>
              {scansLeft}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollBody,
          { paddingBottom: 88 + dockPad },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.radarBlock}>
          <EdgesRadar
            accent={accent}
            scanning={scanning || detecting}
            size={radarSize}
          />
          <Text style={styles.statusLabel}>
            {detecting
              ? 'Reading chart…'
              : scanning
                ? 'Scanning pulse…'
                : 'Ready'}
          </Text>
          <Text style={styles.statusSub}>
            {chartUri
              ? `${symbol} · ${timeframe}${detecting ? ' · detecting' : ''}`
              : 'Upload or capture a chart to auto-detect symbol & timeframe'}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Capture</Text>
        <View style={styles.captureRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Upload chart"
            onPress={pickLibrary}
            style={({ pressed }) => [
              styles.captureTile,
              {
                borderColor: hexToRgba(accent, 0.55),
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.captureIconWrap,
                { backgroundColor: hexToRgba(accent, 0.14) },
              ]}
            >
              <Ionicons name="cloud-upload-outline" size={22} color={accent} />
            </View>
            <Text style={styles.captureTitle}>Upload</Text>
            <Text style={styles.captureSub}>From gallery</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            onPress={pickCamera}
            style={({ pressed }) => [
              styles.captureTile,
              {
                borderColor: hexToRgba(accent, 0.55),
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.captureIconWrap,
                { backgroundColor: hexToRgba(accent, 0.14) },
              ]}
            >
              <Ionicons name="camera-outline" size={22} color={accent} />
            </View>
            <Text style={styles.captureTitle}>Camera</Text>
            <Text style={styles.captureSub}>Snap the screen</Text>
          </Pressable>
        </View>

        {chartUri ? (
          <View
            style={[
              styles.preview,
              { borderColor: hexToRgba(accent, 0.45) },
            ]}
          >
            <Image source={{ uri: chartUri }} style={styles.previewImg} />
            <Pressable
              accessibilityLabel="clear chart"
              onPress={() => {
                setChartUri(null);
                setScanPromptOpen(false);
                setDetecting(false);
              }}
              style={styles.clearBtn}
              hitSlop={8}
            >
              <Ionicons name="close" size={16} color={BASE.white} />
            </Pressable>
          </View>
        ) : null}

        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Instrument</Text>
        <View style={[styles.searchBox, { borderColor: hexToRgba(accent, 0.5) }]}>
          <Ionicons name="search" size={16} color={BASE.muted} />
          <TextInput
            value={symbol}
            onChangeText={(t) => setSymbol(t.toUpperCase())}
            placeholder="Symbol"
            placeholderTextColor={BASE.dim}
            autoCapitalize="characters"
            style={styles.searchInput}
          />
          <View
            style={[
              styles.tfBadge,
              {
                borderColor: hexToRgba(accent, 0.5),
                backgroundColor: hexToRgba(accent, 0.12),
              },
            ]}
          >
            <Text style={[styles.tfBadgeText, { color: accent }]}>
              {timeframe}
            </Text>
          </View>
        </View>
        <View style={styles.chipRow}>
          {QUICK.map((s) => {
            const on = symbol === s;
            return (
              <Pressable
                key={s}
                onPress={() => setSymbol(s)}
                style={[
                  styles.chip,
                  {
                    borderColor: on ? accent : hexToRgba(accent, 0.35),
                    backgroundColor: on
                      ? hexToRgba(accent, 0.2)
                      : 'transparent',
                  },
                ]}
              >
                <Text style={styles.chipText}>{s}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.chipRow}>
          {TIMEFRAMES.map((tf) => {
            const on = timeframe === tf;
            return (
              <Pressable
                key={tf}
                onPress={() => setTimeframe(tf)}
                style={[
                  styles.chip,
                  {
                    borderColor: on ? accent : hexToRgba(accent, 0.35),
                    backgroundColor: on
                      ? hexToRgba(accent, 0.2)
                      : 'transparent',
                  },
                ]}
              >
                <Text style={styles.chipText}>{tf}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 4 }]}>Size</Text>
        <LotTradesFields
          accent={accent}
          lotRaw={lotRaw}
          setLotRaw={setLotRaw}
          tradesRaw={tradesRaw}
          setTradesRaw={setTradesRaw}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="run scan"
          onPress={runScan}
          style={({ pressed }) => [
            styles.runBtn,
            {
              borderColor: accent,
              opacity: pressed || scanning ? 0.9 : 1,
            },
            Platform.OS === 'web'
              ? ({ boxShadow: `0 0 20px ${hexToRgba(accent, 0.4)}` } as object)
              : null,
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
            style={styles.runGrad}
          >
            <MaterialCommunityIcons
              name={scanning ? 'radar' : 'chart-timeline-variant'}
              size={20}
              color={BASE.white}
            />
            <Text style={styles.runText}>
              {scanning ? 'Scanning…' : 'Run scan'}
            </Text>
          </LinearGradient>
        </Pressable>

        {outcome ? (
          <View
            style={[
              styles.resultCard,
              {
                borderColor: hexToRgba(accent, 0.55),
                backgroundColor: hexToRgba(accent, 0.08),
              },
            ]}
          >
            <View style={styles.resultTop}>
              <View>
                <Text style={styles.resultEyebrow}>Signal</Text>
                <Text style={styles.resultSym}>
                  {symbol} · {outcome.timeframe}
                </Text>
              </View>
              <Text style={[styles.resultBias, { color: accent }]}>
                {outcome.bias}
              </Text>
            </View>
            <View style={styles.confRow}>
              <Text style={styles.resultMetaKey}>Confidence</Text>
              <Text style={styles.resultMetaVal}>
                {outcome.confidence > 0 ? `${outcome.confidence}%` : '—'}
              </Text>
            </View>
            {outcome.confidence > 0 ? (
              <View
                style={[
                  styles.confTrack,
                  { backgroundColor: hexToRgba(accent, 0.15) },
                ]}
              >
                <View
                  style={[
                    styles.confFill,
                    {
                      width: `${outcome.confidence}%`,
                      backgroundColor: accent,
                    },
                  ]}
                />
              </View>
            ) : null}
            <View style={styles.levelRow}>
              <View style={styles.levelCell}>
                <Text style={styles.levelKey}>TP</Text>
                <Text style={styles.levelVal}>{outcome.tp}</Text>
              </View>
              <View style={styles.levelCell}>
                <Text style={styles.levelKey}>SL</Text>
                <Text style={styles.levelVal}>{outcome.sl}</Text>
              </View>
            </View>
            <Text style={styles.resultNote}>{outcome.explanation}</Text>
          </View>
        ) : null}

        {history.length > 0 ? (
          <View style={styles.historyBlock}>
            <Text style={styles.sectionLabel}>History</Text>
            {history.map((row) => (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                accessibilityLabel={`History ${row.symbol} ${row.bias}`}
                onPress={() => setDetail(row)}
                style={({ pressed }) => [
                  styles.historyRow,
                  {
                    borderColor: hexToRgba(accent, 0.4),
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
              >
                {row.chartUri ? (
                  <Image
                    source={{ uri: row.chartUri }}
                    style={styles.historyThumb}
                  />
                ) : (
                  <View
                    style={[
                      styles.historyThumb,
                      styles.historyThumbEmpty,
                      { borderColor: hexToRgba(accent, 0.35) },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="chart-line"
                      size={16}
                      color={BASE.muted}
                    />
                  </View>
                )}
                <View style={styles.historyMain}>
                  <Text style={styles.historyTitle}>
                    {row.symbol} · {row.timeframe}
                  </Text>
                  <Text style={styles.historySub}>
                    {row.lotSize} lot · {row.trades} trade
                    {row.trades === 1 ? '' : 's'} · {formatWhen(row.at)}
                  </Text>
                </View>
                <View style={styles.historyRight}>
                  <Text style={[styles.historyBias, { color: accent }]}>
                    {row.bias}
                  </Text>
                  <Text style={styles.historyConf}>{row.confidence}%</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* Scan now prompt after detect */}
      <Modal
        visible={scanPromptOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setScanPromptOpen(false)}
      >
        <View style={styles.promptBackdrop}>
          <View
            style={[
              styles.promptCard,
              {
                borderColor: accent,
                marginBottom: Math.max(insets.bottom, 16),
              },
              Platform.OS === 'web'
                ? ({ boxShadow: `0 0 28px ${hexToRgba(accent, 0.35)}` } as object)
                : null,
            ]}
          >
            <Text style={styles.promptEyebrow}>Detected from chart</Text>
            <Text style={styles.promptTitle}>
              {symbol}
              <Text style={styles.promptTf}> · {timeframe}</Text>
            </Text>
            <Text style={styles.promptBody}>
              Set lot size and how many trades, then run the pulse for signal,
              confidence, TP / SL, and a short trade read.
            </Text>
            <LotTradesFields
              accent={accent}
              lotRaw={lotRaw}
              setLotRaw={setLotRaw}
              tradesRaw={tradesRaw}
              setTradesRaw={setTradesRaw}
              compact
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scan now"
              onPress={runScan}
              style={({ pressed }) => [
                styles.promptPrimary,
                {
                  borderColor: accent,
                  opacity: pressed ? 0.88 : 1,
                },
              ]}
            >
              <LinearGradient
                colors={[
                  hexToRgba(accent, 0.6),
                  hexToRgba(accent, 0.2),
                  '#0A0000',
                ]}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.promptPrimaryGrad}
              >
                <MaterialCommunityIcons name="radar" size={18} color={BASE.white} />
                <Text style={styles.promptPrimaryText}>Scan now</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Not now"
              onPress={() => setScanPromptOpen(false)}
              style={styles.promptSecondary}
            >
              <Text style={styles.promptSecondaryText}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* History detail */}
      <Modal
        visible={Boolean(detail)}
        transparent
        animationType="slide"
        onRequestClose={() => setDetail(null)}
      >
        <View style={styles.promptBackdrop}>
          {detail ? (
            <View
              style={[
                styles.detailCard,
                {
                  borderColor: accent,
                  marginBottom: Math.max(insets.bottom, 12),
                  maxHeight: winH * 0.82,
                },
              ]}
            >
              <View style={styles.detailHeader}>
                <View>
                  <Text style={styles.promptEyebrow}>Scan detail</Text>
                  <Text style={styles.detailTitle}>
                    {detail.symbol} · {detail.timeframe}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="close detail"
                  onPress={() => setDetail(null)}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={22} color={BASE.white} />
                </Pressable>
              </View>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
              >
                {detail.chartUri ? (
                  <Image
                    source={{ uri: detail.chartUri }}
                    style={styles.detailChart}
                  />
                ) : (
                  <View
                    style={[
                      styles.detailChartEmpty,
                      { borderColor: hexToRgba(accent, 0.35) },
                    ]}
                  >
                    <Text style={styles.captureSub}>No chart attached</Text>
                  </View>
                )}
                <View style={styles.resultTop}>
                  <Text style={[styles.resultBias, { color: accent }]}>
                    {detail.bias}
                  </Text>
                  <Text style={styles.resultMetaVal}>
                    {detail.confidence}% confidence
                  </Text>
                </View>
                <View style={styles.levelRow}>
                  <View style={styles.levelCell}>
                    <Text style={styles.levelKey}>TP</Text>
                    <Text style={styles.levelVal}>{detail.tp}</Text>
                  </View>
                  <View style={styles.levelCell}>
                    <Text style={styles.levelKey}>SL</Text>
                    <Text style={styles.levelVal}>{detail.sl}</Text>
                  </View>
                </View>
                <View style={styles.levelRow}>
                  <View style={styles.levelCell}>
                    <Text style={styles.levelKey}>Lot</Text>
                    <Text style={styles.levelVal}>{detail.lotSize}</Text>
                  </View>
                  <View style={styles.levelCell}>
                    <Text style={styles.levelKey}>Trades</Text>
                    <Text style={styles.levelVal}>{detail.trades}</Text>
                  </View>
                </View>
                <Text style={styles.resultNote}>{detail.message}</Text>
                <Text style={styles.historySub}>{formatWhen(detail.at)}</Text>
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>

      <View
        style={[
          styles.dock,
          {
            paddingBottom: dockPad,
            borderColor: hexToRgba(accent, 0.35),
          },
        ]}
      >
        {Platform.OS === 'web' ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.88)' },
            ]}
          />
        ) : (
          <BlurView
            intensity={40}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={styles.dockRow}>
          <DockItem
            label="Home"
            icon="home-outline"
            accent={accent}
            active={false}
            onPress={goHome}
          />
          <DockItem
            label="Chart scanner"
            icon="scan-outline"
            accent={accent}
            active
            onPress={() => undefined}
          />
          <DockItem
            label="Connect your broker"
            icon="link-outline"
            accent={accent}
            active={false}
            onPress={() => {
              router.replace('/');
            }}
          />
        </View>
      </View>
    </View>
  );
}

function DockItem({
  label,
  icon,
  accent,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.dockItem}
    >
      <Ionicons
        name={icon}
        size={22}
        color={active ? accent : BASE.muted}
      />
      <Text
        style={[
          styles.dockLabel,
          { color: active ? accent : BASE.muted },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BASE.black },
  glowOrb: {
    position: 'absolute',
    top: -40,
    alignSelf: 'center',
    left: '18%',
    width: '64%',
    height: 220,
    borderRadius: 999,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  headerTitles: { flex: 1 },
  eyebrow: {
    color: BASE.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: BASE.white,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  scansPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.5,
    minWidth: 48,
    justifyContent: 'center',
  },
  scansPillText: { fontSize: 13, fontWeight: '800' },
  scroll: { flex: 1 },
  scrollBody: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 14,
  },
  radarBlock: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  radarOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  radarRing: {
    position: 'absolute',
    borderWidth: 1,
  },
  radarCrossH: {
    position: 'absolute',
    width: '78%',
    height: StyleSheet.hairlineWidth,
  },
  radarCrossV: {
    position: 'absolute',
    height: '78%',
    width: StyleSheet.hairlineWidth,
  },
  radarSweepPivot: {
    position: 'absolute',
    height: 3,
    left: '50%',
    top: '50%',
    marginTop: -1.5,
  },
  radarSweepArm: {
    width: '100%',
    height: 2,
    borderRadius: 1,
  },
  radarCore: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabel: {
    color: BASE.white,
    fontSize: 15,
    fontWeight: '700',
  },
  statusSub: {
    color: BASE.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 300,
  },
  sectionLabel: {
    color: BASE.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  captureRow: { flexDirection: 'row', gap: 12 },
  captureTile: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: BASE.panel,
    alignItems: 'flex-start',
    gap: 8,
  },
  captureIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureTitle: {
    color: BASE.white,
    fontSize: 15,
    fontWeight: '700',
  },
  captureSub: {
    color: BASE.muted,
    fontSize: 12,
  },
  preview: {
    height: 132,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  previewImg: { width: '100%', height: '100%' },
  clearBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'web' ? 12 : 10,
    backgroundColor: BASE.panel,
  },
  searchInput: {
    flex: 1,
    color: BASE.white,
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 2,
    minHeight: 28,
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', outlineWidth: 0 } as object)
      : null),
  },
  tfBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tfBadgeText: { fontSize: 12, fontWeight: '800' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    color: BASE.white,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  paramsRow: { flexDirection: 'row', gap: 12 },
  paramField: { flex: 1, gap: 6 },
  paramLabel: {
    color: BASE.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  paramInputWrap: {
    borderWidth: 1.5,
    borderRadius: 12,
    backgroundColor: BASE.panel,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
  },
  paramInput: {
    color: BASE.white,
    fontSize: 16,
    fontWeight: '700',
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', outlineWidth: 0 } as object)
      : null),
  },
  runBtn: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    marginTop: 4,
  },
  runGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  runText: {
    color: BASE.white,
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  resultCard: {
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  resultTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  resultEyebrow: {
    color: BASE.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  resultSym: {
    color: BASE.white,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  resultBias: {
    fontSize: 26,
    fontWeight: '800',
  },
  confRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  confFill: {
    height: '100%',
    borderRadius: 3,
  },
  levelRow: { flexDirection: 'row', gap: 10 },
  levelCell: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  levelKey: {
    color: BASE.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  levelVal: {
    color: BASE.white,
    fontSize: 15,
    fontWeight: '700',
  },
  resultMetaKey: { color: BASE.muted, fontSize: 13 },
  resultMetaVal: {
    color: BASE.white,
    fontSize: 15,
    fontWeight: '700',
  },
  resultNote: {
    color: BASE.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  historyBlock: { gap: 10, marginTop: 4 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 10,
    backgroundColor: BASE.panel,
  },
  historyThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#111',
  },
  historyThumbEmpty: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyMain: { flex: 1, gap: 2 },
  historyTitle: {
    color: BASE.white,
    fontSize: 14,
    fontWeight: '700',
  },
  historySub: {
    color: BASE.muted,
    fontSize: 11,
  },
  historyRight: { alignItems: 'flex-end', gap: 2 },
  historyBias: { fontSize: 14, fontWeight: '800' },
  historyConf: { color: BASE.muted, fontSize: 12, fontWeight: '600' },
  promptBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  promptCard: {
    borderRadius: 22,
    borderWidth: 1.5,
    backgroundColor: '#0A0A0A',
    padding: 22,
    gap: 12,
  },
  detailCard: {
    borderRadius: 22,
    borderWidth: 1.5,
    backgroundColor: '#0A0A0A',
    padding: 20,
    gap: 12,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  detailTitle: {
    color: BASE.white,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
  },
  detailChart: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    backgroundColor: '#111',
  },
  detailChartEmpty: {
    height: 100,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptEyebrow: {
    color: BASE.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  promptTitle: {
    color: BASE.white,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  promptTf: {
    color: BASE.muted,
    fontSize: 20,
    fontWeight: '600',
  },
  promptBody: {
    color: BASE.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  promptPrimary: {
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  promptPrimaryGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  promptPrimaryText: {
    color: BASE.white,
    fontSize: 16,
    fontWeight: '800',
  },
  promptSecondary: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  promptSecondaryText: {
    color: BASE.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    overflow: 'hidden',
  },
  dockRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  dockItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  dockLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
});
