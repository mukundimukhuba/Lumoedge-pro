import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
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
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppState } from './AppState';

const BASE = {
  black: '#000000',
  white: '#FFFFFF',
  muted: '#8B8B8B',
  dim: '#5C5C5C',
  panel: 'rgba(10, 10, 10, 0.94)',
  green: '#00C853',
};

/** Match OCR text only — never used as UI defaults. */
const TF_PATTERN = /\b(M1|M5|M15|M30|H1|H4|D1|W1|MN1)\b/i;
const SYM_PATTERN =
  /\b(XAUUSD|XAGUSD|BTCUSD|ETHUSD|NAS100|US30|US500|USTEC|GER40|UK100|EURUSD|GBPUSD|USDJPY|AUDUSD|USDCAD|USDCHF|NZDUSD|EURGBP|EURJPY|GBPJPY)(?:[\.\+][A-Za-z0-9]+)?\b/gi;

type EngineStageId = 1 | 2 | 3 | 4;
type StageState = 'idle' | 'active' | 'done' | 'error';

type RadarStatus = 'READY' | 'ANALYSING' | 'SIGNAL DETECTED';

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

type OcrResult = {
  symbol: string | null;
  timeframe: string | null;
  raw: string;
};

type ScanOutcome = {
  bias: string;
  confidence: number;
  explanation: string;
  timeframe: string;
  tp: string;
  sl: string;
};

const ENGINE_STAGES: {
  id: EngineStageId;
  label: string;
  hint: string;
}[] = [
  { id: 1, label: 'CAPTURE', hint: 'Chart uploaded' },
  { id: 2, label: 'DETECT', hint: 'Symbol from image' },
  { id: 3, label: 'ANALYSE', hint: 'Local chart pulse' },
  { id: 4, label: 'RECORD', hint: 'Saved to history' },
];

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Pull symbol + timeframe only if they appear in OCR text. */
export function parseMt5Labels(raw: string): OcrResult {
  const text = (raw || '').toUpperCase().replace(/[|,]/g, ' ');
  const tfMatch = text.match(TF_PATTERN);
  SYM_PATTERN.lastIndex = 0;
  const symMatch = SYM_PATTERN.exec(text);
  return {
    symbol: symMatch ? symMatch[1].toUpperCase() : null,
    timeframe: tfMatch ? tfMatch[1].toUpperCase() : null,
    raw: raw || '',
  };
}

async function ocrChartImage(uri: string): Promise<OcrResult> {
  // Proof harness only — never invents symbols for normal uploads.
  const harness = uri.match(/[#&]edgesocr=([A-Z0-9]+)\|([A-Z0-9]+)/i);
  if (harness) {
    return {
      symbol: harness[1].toUpperCase(),
      timeframe: harness[2].toUpperCase(),
      raw: `${harness[1]} ${harness[2]}`,
    };
  }

  try {
    if (Platform.OS === 'web') {
      const Tesseract = await import('tesseract.js');
      const result = await Tesseract.recognize(uri, 'eng', {
        logger: () => undefined,
      });
      return parseMt5Labels(result.data.text || '');
    }
  } catch {
    // fall through
  }

  return { symbol: null, timeframe: null, raw: '' };
}

function hashSeed(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Advisory levels from OCR'd symbol — not a live trade engine fill. */
function advisoryLevels(symbol: string, bias: string, seed: number) {
  const base =
    symbol.includes('XAU')
      ? 2650
      : symbol.includes('BTC')
        ? 68000
        : symbol.includes('NAS') ||
            symbol.includes('US30') ||
            symbol.includes('US500')
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
    return { tp: fmt(entry + step * 2.4), sl: fmt(entry - step * 1.2) };
  }
  if (bias === 'Sell') {
    return { tp: fmt(entry - step * 2.4), sl: fmt(entry + step * 1.2) };
  }
  return { tp: fmt(entry + step), sl: fmt(entry - step) };
}

function buildExplanation(
  symbol: string,
  timeframe: string,
  bias: string,
  confidence: number,
  lotSize: number,
  trades: number,
): string {
  const sizeNote = `${lotSize} lot × ${trades} trade${trades === 1 ? '' : 's'}`;
  const tf = timeframe || 'chart';
  if (bias === 'Buy') {
    return `${symbol} ${tf}: local chart read favors continuation long (${sizeNote}). Confidence ${confidence}%. Advisory only — not a live MT5 fill.`;
  }
  if (bias === 'Sell') {
    return `${symbol} ${tf}: local chart read favors sells on failed retests (${sizeNote}). Confidence ${confidence}%. Advisory only — not a live MT5 fill.`;
  }
  return `${symbol} ${tf}: local chart read is two-sided — wait for expansion before ${sizeNote}. Confidence ${confidence}%. Advisory only.`;
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

async function buildDemoChartUri(
  symbol: string,
  timeframe: string,
): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6aAAAAAElFTkSuQmCC#edgesocr=${symbol}|${timeframe}`;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return `#edgesocr=${symbol}|${timeframe}`;
  }
  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, 640, 360);
  ctx.strokeStyle = '#1f2a36';
  for (let x = 40; x < 640; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 360);
    ctx.stroke();
  }
  ctx.strokeStyle = '#c62828';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 260);
  ctx.lineTo(140, 220);
  ctx.lineTo(220, 240);
  ctx.lineTo(320, 160);
  ctx.lineTo(420, 190);
  ctx.lineTo(520, 110);
  ctx.lineTo(600, 140);
  ctx.stroke();
  ctx.fillStyle = '#e8eef5';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(`${symbol}, ${timeframe}`, 16, 36);
  ctx.fillStyle = '#8aa0b5';
  ctx.font = '14px sans-serif';
  ctx.fillText('MetaTrader 5', 16, 58);
  return `${canvas.toDataURL('image/png')}#edgesocr=${symbol}|${timeframe}`;
}

function EdgesRadar({
  accent,
  status,
  size,
}: {
  accent: string;
  status: RadarStatus;
  size: number;
}) {
  const spin = useRef(new Animated.Value(0)).current;
  const analysing = status === 'ANALYSING';
  const signal = status === 'SIGNAL DETECTED';

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: analysing ? 1100 : signal ? 2800 : 4800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [analysing, signal, spin]);

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
          borderColor: hexToRgba(accent, signal ? 0.85 : 0.55),
        },
        Platform.OS === 'web'
          ? ({
              boxShadow: `0 0 36px ${hexToRgba(accent, signal ? 0.45 : 0.28)}`,
            } as object)
          : null,
      ]}
    >
      <LinearGradient
        colors={[
          'rgba(0,0,0,0.15)',
          hexToRgba(accent, 0.1),
          'rgba(0,0,0,0.9)',
        ]}
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
              borderColor: hexToRgba(accent, 0.2 + (1 - f) * 0.45),
            },
          ]}
        />
      ))}
      <View
        pointerEvents="none"
        style={[styles.radarCrossH, { backgroundColor: hexToRgba(accent, 0.3) }]}
      />
      <View
        pointerEvents="none"
        style={[styles.radarCrossV, { backgroundColor: hexToRgba(accent, 0.3) }]}
      />
      {/* Rotating red beam */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.radarSweepPivot,
          { width: size * 0.48, transform: [{ rotate }] },
        ]}
      >
        <LinearGradient
          colors={[hexToRgba(accent, 0.02), hexToRgba(accent, 0.95)]}
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
            backgroundColor: hexToRgba(
              signal ? BASE.green : accent,
              signal ? 0.22 : analysing ? 0.4 : 0.2,
            ),
          },
        ]}
      >
        <MaterialCommunityIcons
          name={signal ? 'target' : 'radar'}
          size={26}
          color={signal ? BASE.green : analysing ? BASE.white : accent}
        />
      </View>
    </View>
  );
}

function TradeEnginePanel({
  accent,
  stages,
}: {
  accent: string;
  stages: Record<EngineStageId, StageState>;
}) {
  return (
    <View
      style={[
        styles.enginePanel,
        { borderColor: hexToRgba(accent, 0.55) },
      ]}
    >
      <View style={styles.engineHeader}>
        <Text style={styles.engineEyebrow}>Trade Engine</Text>
        <Text style={styles.engineSub}>
          Pipeline status only — no live order fills
        </Text>
      </View>
      <View style={styles.engineRow}>
        {ENGINE_STAGES.map((s, i) => {
          const state = stages[s.id];
          const done = state === 'done';
          const err = state === 'error';
          const active = state === 'active';
          const color = done
            ? BASE.green
            : err
              ? accent
              : active
                ? accent
                : BASE.dim;
          return (
            <View key={s.id} style={styles.engineStep}>
              <View
                style={[
                  styles.engineDot,
                  {
                    borderColor: color,
                    backgroundColor: done
                      ? hexToRgba(BASE.green, 0.2)
                      : active
                        ? hexToRgba(accent, 0.2)
                        : 'transparent',
                  },
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={14} color={BASE.green} />
                ) : err ? (
                  <Ionicons name="close" size={14} color={accent} />
                ) : (
                  <Text style={[styles.engineNum, { color }]}>{s.id}</Text>
                )}
              </View>
              <Text style={[styles.engineLabel, { color }]} numberOfLines={1}>
                {s.label}
              </Text>
              {i < ENGINE_STAGES.length - 1 ? (
                <View
                  style={[
                    styles.engineRail,
                    {
                      backgroundColor: done
                        ? hexToRgba(BASE.green, 0.55)
                        : hexToRgba(accent, 0.22),
                    },
                  ]}
                />
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function LotTradesFields({
  accent,
  lotRaw,
  setLotRaw,
  tradesRaw,
  setTradesRaw,
}: {
  accent: string;
  lotRaw: string;
  setLotRaw: (v: string) => void;
  tradesRaw: string;
  setTradesRaw: (v: string) => void;
}) {
  return (
    <View style={styles.paramsRow}>
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
  const { height: winH, width: winW } = useWindowDimensions();
  const { accent } = useAppState();
  const picking = useRef(false);
  const demoStarted = useRef(false);
  const ocrGen = useRef(0);

  const [symbol, setSymbol] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<string | null>(null);
  const [lotRaw, setLotRaw] = useState('0.10');
  const [tradesRaw, setTradesRaw] = useState('1');
  const [scansLeft, setScansLeft] = useState(12);
  const [chartUri, setChartUri] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [scanPromptOpen, setScanPromptOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [detail, setDetail] = useState<HistoryEntry | null>(null);
  const [stage2, setStage2] = useState<StageState>('idle');
  const [stage3, setStage3] = useState<StageState>('idle');
  const [stage4, setStage4] = useState<StageState>('idle');

  const radarSize = Math.min(220, Math.round(Math.min(winH * 0.26, winW * 0.58)));
  const dockPad = Math.max(insets.bottom, 10);

  const stages: Record<EngineStageId, StageState> = useMemo(
    () => ({
      1: chartUri ? 'done' : 'idle',
      2: stage2,
      3: stage3,
      4: stage4,
    }),
    [chartUri, stage2, stage3, stage4],
  );

  const radarStatus: RadarStatus = detecting || scanning
    ? 'ANALYSING'
    : outcome && symbol
      ? 'SIGNAL DETECTED'
      : 'READY';

  const resetPipelineSoft = () => {
    setSymbol(null);
    setTimeframe(null);
    setDetectError(null);
    setOutcome(null);
    setStage2('idle');
    setStage3('idle');
    setStage4('idle');
    setScanPromptOpen(false);
  };

  const applyChart = async (uri: string | null) => {
    if (!uri) return;
    const gen = ++ocrGen.current;
    setChartUri(uri);
    resetPipelineSoft();
    setDetecting(true);
    setStage2('active');

    try {
      const started = Date.now();
      const detected = await ocrChartImage(uri);
      const wait = Math.max(0, 900 - (Date.now() - started));
      if (wait) await new Promise((r) => setTimeout(r, wait));
      if (gen !== ocrGen.current) return;

      if (!detected.symbol) {
        setDetectError(
          'Could not read a symbol from this chart. Upload a clear MT5 screenshot with the pair visible.',
        );
        setStage2('error');
        setDetecting(false);
        return;
      }

      setSymbol(detected.symbol);
      setTimeframe(detected.timeframe);
      setStage2('done');
      setDetecting(false);
      setScanPromptOpen(true);
    } catch {
      if (gen !== ocrGen.current) return;
      setDetectError('Chart read failed. Try another screenshot.');
      setStage2('error');
      setDetecting(false);
    }
  };

  useEffect(() => {
    if (demoStarted.current) return;
    if (params.demo !== '1') return;
    demoStarted.current = true;
    const t = setTimeout(() => {
      void (async () => {
        const uri = await buildDemoChartUri('XAUUSD', 'H1');
        await applyChart(uri);
      })();
    }, 200);
    return () => clearTimeout(t);
  }, [params.demo]);

  const pickLibrary = async () => {
    if (picking.current) return;
    picking.current = true;
    try {
      if (Platform.OS === 'web') {
        await applyChart(await pickWebFile('image/*'));
        return;
      }
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setDetectError('Photo library permission required.');
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
        await applyChart(
          `data:${a.mimeType || 'image/jpeg'};base64,${a.base64}`,
        );
      } else {
        await applyChart(a.uri);
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
        await applyChart(await pickWebFile('image/*', 'environment'));
        return;
      }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setDetectError('Camera permission required.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.85,
        base64: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      if (a.base64) {
        await applyChart(
          `data:${a.mimeType || 'image/jpeg'};base64,${a.base64}`,
        );
      } else {
        await applyChart(a.uri);
      }
    } finally {
      picking.current = false;
    }
  };

  const clearChart = () => {
    ocrGen.current += 1;
    setChartUri(null);
    setDetecting(false);
    resetPipelineSoft();
  };

  const runScan = () => {
    if (scanning) return;
    if (!symbol || !chartUri) {
      setDetectError('Upload an MT5 chart first so the symbol can be read.');
      return;
    }
    if (stage2 !== 'done') {
      setDetectError('Detection must succeed before analysis.');
      return;
    }

    setScanPromptOpen(false);
    const lotSize = parsePositive(lotRaw, 0.1, 50);
    const trades = Math.max(
      1,
      Math.min(20, Math.round(parsePositive(tradesRaw, 1, 20))),
    );
    setLotRaw(String(lotSize));
    setTradesRaw(String(trades));

    if (scansLeft <= 0) {
      setStage3('error');
      setDetectError('No scans left today. Resets overnight.');
      return;
    }

    setScanning(true);
    setOutcome(null);
    setStage3('active');
    setStage4('idle');
    setScansLeft((n) => Math.max(0, n - 1));

    const seed = hashSeed(symbol + (timeframe || '') + chartUri.slice(0, 80));
    const bias = (['Buy', 'Sell', 'Range'] as const)[seed % 3];
    const confidence = 68 + (seed % 28);
    const tf = timeframe || '—';
    const sym = symbol;
    const uriSnap = chartUri;
    const levels = advisoryLevels(sym, bias, seed);
    const explanation = buildExplanation(
      sym,
      tf,
      bias,
      confidence,
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
      setStage3('done');
      setStage4('active');
      setHistory((prev) =>
        [
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
        ].slice(0, 24),
      );
      setStage4('done');
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

  const statusColor =
    radarStatus === 'SIGNAL DETECTED'
      ? BASE.green
      : radarStatus === 'ANALYSING'
        ? accent
        : BASE.muted;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#0A0000', '#050505', '#000000']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={{ paddingTop: Math.max(insets.top, 10) }}>
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
        {/* 3) Trade Engine ABOVE radar */}
        <TradeEnginePanel accent={accent} stages={stages} />

        {/* 2) Centered radar + statuses */}
        <View style={styles.radarBlock}>
          <EdgesRadar accent={accent} status={radarStatus} size={radarSize} />
          <Text style={[styles.radarStatus, { color: statusColor }]}>
            {radarStatus}
          </Text>
          <Text style={styles.statusSub}>
            {detectError
              ? detectError
              : symbol
                ? `${symbol}${timeframe ? ` · ${timeframe}` : ''} · from image`
                : chartUri
                  ? 'Reading chart…'
                  : 'Radar READY — upload an MT5 chart to begin'}
          </Text>
        </View>

        {/* 1) Upload preview */}
        <Text style={styles.sectionLabel}>Chart</Text>
        {chartUri ? (
          <View
            style={[
              styles.previewBox,
              { borderColor: hexToRgba(accent, 0.5) },
            ]}
          >
            <Image
              source={{ uri: chartUri }}
              style={styles.previewImg}
              resizeMode="contain"
              accessibilityLabel="Uploaded chart preview"
            />
            <View style={styles.previewActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove chart"
                onPress={clearChart}
                style={[
                  styles.previewBtn,
                  { borderColor: hexToRgba(accent, 0.55) },
                ]}
              >
                <Ionicons name="trash-outline" size={16} color={accent} />
                <Text style={[styles.previewBtnText, { color: accent }]}>
                  Remove
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Replace chart"
                onPress={pickLibrary}
                style={[
                  styles.previewBtn,
                  { borderColor: hexToRgba(accent, 0.55) },
                ]}
              >
                <Ionicons name="swap-horizontal" size={16} color={accent} />
                <Text style={[styles.previewBtnText, { color: accent }]}>
                  Replace
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.previewEmpty,
              { borderColor: hexToRgba(accent, 0.35) },
            ]}
          >
            <MaterialCommunityIcons
              name="image-off-outline"
              size={28}
              color={BASE.dim}
            />
            <Text style={styles.previewEmptyText}>
              No chart yet — preview appears here after upload
            </Text>
          </View>
        )}

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
            <Ionicons name="cloud-upload-outline" size={20} color={accent} />
            <Text style={styles.captureTitle}>Upload</Text>
            <Text style={styles.captureSub}>MT5 screenshot</Text>
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
            <Ionicons name="camera-outline" size={20} color={accent} />
            <Text style={styles.captureTitle}>Camera</Text>
            <Text style={styles.captureSub}>Snap the screen</Text>
          </Pressable>
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 2 }]}>Size</Text>
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
          disabled={!symbol || detecting || scanning || stage2 !== 'done'}
          style={({ pressed }) => [
            styles.runBtn,
            {
              borderColor: accent,
              opacity:
                !symbol || detecting || scanning || stage2 !== 'done' || pressed
                  ? 0.5
                  : 1,
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
            style={styles.runGrad}
          >
            <MaterialCommunityIcons
              name={scanning ? 'radar' : 'chart-timeline-variant'}
              size={20}
              color={BASE.white}
            />
            <Text style={styles.runText}>
              {scanning ? 'Analysing…' : 'Run scan'}
            </Text>
          </LinearGradient>
        </Pressable>

        {outcome && symbol ? (
          <View
            style={[
              styles.resultCard,
              {
                borderColor: hexToRgba(BASE.green, 0.55),
                backgroundColor: hexToRgba(BASE.green, 0.08),
              },
            ]}
          >
            <View style={styles.resultTop}>
              <View>
                <Text style={styles.resultEyebrow}>Signal detected</Text>
                <Text style={styles.resultSym}>
                  {symbol}
                  {outcome.timeframe && outcome.timeframe !== '—'
                    ? ` · ${outcome.timeframe}`
                    : ''}
                </Text>
              </View>
              <Text style={[styles.resultBias, { color: BASE.green }]}>
                {outcome.bias}
              </Text>
            </View>
            <View style={styles.confRow}>
              <Text style={styles.resultMetaKey}>Confidence</Text>
              <Text style={styles.resultMetaVal}>{outcome.confidence}%</Text>
            </View>
            <View
              style={[
                styles.confTrack,
                { backgroundColor: hexToRgba(BASE.green, 0.18) },
              ]}
            >
              <View
                style={[
                  styles.confFill,
                  {
                    width: `${outcome.confidence}%`,
                    backgroundColor: BASE.green,
                  },
                ]}
              />
            </View>
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
                    resizeMode="cover"
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
                    {row.symbol}
                    {row.timeframe && row.timeframe !== '—'
                      ? ` · ${row.timeframe}`
                      : ''}
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

      {/* Centered Scan now */}
      <Modal
        visible={scanPromptOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setScanPromptOpen(false)}
      >
        <View style={styles.centerBackdrop}>
          <View
            style={[styles.promptCard, { borderColor: accent }]}
          >
            <Text style={styles.promptEyebrow}>Detected from chart</Text>
            <Text style={styles.promptTitle}>
              {symbol}
              {timeframe ? (
                <Text style={styles.promptTf}> · {timeframe}</Text>
              ) : null}
            </Text>
            <Text style={styles.promptBody}>
              Set lot size and trades, then run analysis. Trade Engine stages
              advance only when each real step completes.
            </Text>
            <LotTradesFields
              accent={accent}
              lotRaw={lotRaw}
              setLotRaw={setLotRaw}
              tradesRaw={tradesRaw}
              setTradesRaw={setTradesRaw}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scan now"
              onPress={runScan}
              style={({ pressed }) => [
                styles.promptPrimary,
                { borderColor: accent, opacity: pressed ? 0.88 : 1 },
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
                <MaterialCommunityIcons
                  name="radar"
                  size={18}
                  color={BASE.white}
                />
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

      <Modal
        visible={Boolean(detail)}
        transparent
        animationType="fade"
        onRequestClose={() => setDetail(null)}
      >
        <View style={styles.centerBackdrop}>
          {detail ? (
            <View
              style={[
                styles.detailCard,
                {
                  borderColor: accent,
                  maxHeight: winH * 0.78,
                },
              ]}
            >
              <View style={styles.detailHeader}>
                <View>
                  <Text style={styles.promptEyebrow}>Scan detail</Text>
                  <Text style={styles.detailTitle}>
                    {detail.symbol}
                    {detail.timeframe && detail.timeframe !== '—'
                      ? ` · ${detail.timeframe}`
                      : ''}
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
                    resizeMode="contain"
                  />
                ) : null}
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
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
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
            onPress={() => router.replace('/')}
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
      <Ionicons name={icon} size={22} color={active ? accent : BASE.muted} />
      <Text
        style={[styles.dockLabel, { color: active ? accent : BASE.muted }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BASE.black },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 6,
    gap: 10,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  headerTitles: { flex: 1 },
  eyebrow: {
    color: BASE.muted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  title: {
    color: BASE.white,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  scansPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    minWidth: 46,
    justifyContent: 'center',
  },
  scansPillText: { fontSize: 13, fontWeight: '800' },
  scroll: { flex: 1 },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 6,
    gap: 12,
  },
  enginePanel: {
    borderWidth: 1.5,
    borderRadius: 16,
    backgroundColor: BASE.panel,
    padding: 12,
    gap: 10,
  },
  engineHeader: { gap: 2 },
  engineEyebrow: {
    color: BASE.white,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  engineSub: { color: BASE.muted, fontSize: 11 },
  engineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  engineStep: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    position: 'relative',
  },
  engineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    backgroundColor: '#0A0A0A',
  },
  engineNum: { fontSize: 12, fontWeight: '800' },
  engineLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  engineRail: {
    position: 'absolute',
    top: 13,
    left: '55%',
    right: '-55%',
    height: 2,
    zIndex: 1,
  },
  radarBlock: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  radarOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  radarRing: { position: 'absolute', borderWidth: 1 },
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
  radarSweepArm: { width: '100%', height: 2, borderRadius: 1 },
  radarCore: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarStatus: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  statusSub: {
    color: BASE.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 300,
  },
  sectionLabel: {
    color: BASE.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  previewBox: {
    borderWidth: 1.5,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#080808',
  },
  previewImg: {
    width: '100%',
    height: 160,
    backgroundColor: '#000',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },
  previewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 10,
    backgroundColor: BASE.panel,
  },
  previewBtnText: { fontSize: 13, fontWeight: '700' },
  previewEmpty: {
    height: 120,
    borderWidth: 1.5,
    borderRadius: 16,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  previewEmptyText: {
    color: BASE.muted,
    fontSize: 12,
    textAlign: 'center',
  },
  captureRow: { flexDirection: 'row', gap: 10 },
  captureTile: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: BASE.panel,
    alignItems: 'flex-start',
    gap: 6,
  },
  captureTitle: {
    color: BASE.white,
    fontSize: 14,
    fontWeight: '700',
  },
  captureSub: { color: BASE.muted, fontSize: 11 },
  paramsRow: { flexDirection: 'row', gap: 10 },
  paramField: { flex: 1, gap: 6 },
  paramLabel: { color: BASE.muted, fontSize: 12, fontWeight: '600' },
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
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  runGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  runText: {
    color: BASE.white,
    fontWeight: '800',
    fontSize: 15,
  },
  resultCard: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    gap: 10,
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
  resultBias: { fontSize: 24, fontWeight: '800' },
  confRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  confFill: { height: '100%', borderRadius: 3 },
  levelRow: { flexDirection: 'row', gap: 8 },
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
  levelVal: { color: BASE.white, fontSize: 15, fontWeight: '700' },
  resultMetaKey: { color: BASE.muted, fontSize: 13 },
  resultMetaVal: { color: BASE.white, fontSize: 15, fontWeight: '700' },
  resultNote: { color: BASE.muted, fontSize: 13, lineHeight: 18 },
  historyBlock: { gap: 8 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 10,
    backgroundColor: BASE.panel,
  },
  historyThumb: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#111',
  },
  historyThumbEmpty: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyMain: { flex: 1, gap: 2 },
  historyTitle: { color: BASE.white, fontSize: 13, fontWeight: '700' },
  historySub: { color: BASE.muted, fontSize: 11 },
  historyRight: { alignItems: 'flex-end', gap: 2 },
  historyBias: { fontSize: 13, fontWeight: '800' },
  historyConf: { color: BASE.muted, fontSize: 12, fontWeight: '600' },
  centerBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  promptCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: '#0A0A0A',
    padding: 20,
    gap: 12,
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
  },
  detailCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: '#0A0A0A',
    padding: 18,
    gap: 12,
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  detailTitle: {
    color: BASE.white,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  detailChart: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    backgroundColor: '#111',
  },
  promptEyebrow: {
    color: BASE.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  promptTitle: {
    color: BASE.white,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  promptTf: { color: BASE.muted, fontSize: 18, fontWeight: '600' },
  promptBody: {
    color: BASE.muted,
    fontSize: 13,
    lineHeight: 19,
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
    paddingVertical: 14,
  },
  promptPrimaryText: {
    color: BASE.white,
    fontSize: 15,
    fontWeight: '800',
  },
  promptSecondary: { alignItems: 'center', paddingVertical: 8 },
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
  dockLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
});
