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
import { AutoTradeEngineOverlay } from './AutoTradeEngineOverlay';
import { EdgesBottomDock } from './EdgesBottomDock';
import {
  fetchScanStatus,
  normalizeScanResult,
  postChartScan,
} from './scan/api';
import {
  AUTO_TRADE_MIN_ACCURACY,
  advisoryLevelsForSide,
  buildTpLadder,
  clampLot,
  clampTrades,
  evaluateAutoTradeGate,
  formatPrice,
  strategyBlurb,
  type Side,
} from './scan/strategy';

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

type EngineStageId = 1 | 2 | 3 | 4 | 5 | 6;
type StageState = 'idle' | 'active' | 'done' | 'error' | 'blocked';

type RadarStatus =
  | 'INITIALISING'
  | 'ANALYSING'
  | 'DETECTING'
  | 'SIGNAL DETECTED';

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
  entry?: string;
  tps?: string[];
  autoTradeAllowed?: boolean;
  autoTradeReasons?: string[];
  demo?: boolean;
  source?: 'api' | 'local';
};

const ENGINE_STAGES: {
  id: EngineStageId;
  label: string;
  activeLabel: string;
  hint: string;
}[] = [
  { id: 1, label: 'Capture', activeLabel: 'Capturing', hint: 'Chart in radar' },
  { id: 2, label: 'Reading', activeLabel: 'Reading', hint: 'OCR from image' },
  {
    id: 3,
    label: 'Analyzing',
    activeLabel: 'Analyzing',
    hint: 'Local chart pulse',
  },
  { id: 4, label: 'Match', activeLabel: 'Matching', hint: 'Bias + levels' },
  {
    id: 5,
    label: 'Execute',
    activeLabel: 'Executing',
    hint: 'Needs live engine',
  },
  {
    id: 6,
    label: 'Confirm',
    activeLabel: 'Confirming',
    hint: 'Needs live engine',
  },
];

type EnginePhase =
  | 'idle'
  | 'reading'
  | 'analyzing'
  | 'matching'
  | 'signal'
  | 'blocked'
  | 'error';

function deriveEnginePhase(
  stages: Record<EngineStageId, StageState>,
): { phase: EnginePhase; title: string; detail: string } {
  if (stages[2] === 'error' || stages[3] === 'error' || stages[4] === 'error') {
    return {
      phase: 'error',
      title: 'Pipeline error',
      detail: 'Fix the chart or try again',
    };
  }
  if (stages[2] === 'active') {
    return {
      phase: 'reading',
      title: 'Reading',
      detail: 'Extracting symbol from chart',
    };
  }
  if (stages[3] === 'active') {
    return {
      phase: 'analyzing',
      title: 'Analyzing',
      detail: 'Running sequential chart analysis',
    };
  }
  if (stages[4] === 'active') {
    return {
      phase: 'matching',
      title: 'Matching',
      detail: 'Locking bias and advisory levels',
    };
  }
  if (stages[4] === 'done') {
    return {
      phase: stages[5] === 'blocked' ? 'blocked' : 'signal',
      title: 'Signal ready',
      detail:
        stages[5] === 'blocked'
          ? 'Execute / Confirm wait for a live engine'
          : 'Pipeline complete',
    };
  }
  if (stages[1] === 'done' && stages[2] === 'done') {
    return {
      phase: 'idle',
      title: 'Ready to detect',
      detail: 'Symbol locked — open Scan now to analyze',
    };
  }
  if (stages[1] === 'done') {
    return {
      phase: 'idle',
      title: 'Chart captured',
      detail: 'Waiting for symbol read',
    };
  }
  return {
    phase: 'idle',
    title: 'Idle',
    detail: 'Upload an MT5 chart to start',
  };
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

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

function buildExplanation(
  symbol: string,
  timeframe: string,
  bias: string,
  confidence: number,
  lotSize: number,
  trades: number,
  summary?: string,
): string {
  const sizeNote = `${lotSize} lot × ${trades} trade${trades === 1 ? '' : 's'}`;
  const tf = timeframe || 'chart';
  const side = bias.toLowerCase() === 'sell' ? 'sell' : 'buy';
  const base =
    summary ||
    `${symbol} ${tf}: right-edge favors ${bias} (${sizeNote}, ${confidence}%).`;
  return `${base} ${strategyBlurb(side as Side)}`;
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
  if (!ctx) return `#edgesocr=${symbol}|${timeframe}`;
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

/** Live trade engine hook — only mark EXECUTE/CONFIRM when a real backend exists. */
function useLiveTradeEngineAvailable() {
  // No MT5/order API is wired in this app yet — never fake fills.
  return false;
}

function EdgesRadar({
  accent,
  status,
  size,
  chartUri,
}: {
  accent: string;
  status: RadarStatus;
  size: number;
  chartUri: string | null;
}) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const lock = useRef(new Animated.Value(0.4)).current;
  const busy =
    status === 'ANALYSING' ||
    status === 'DETECTING' ||
    status === 'SIGNAL DETECTED';
  const locked = status === 'SIGNAL DETECTED';

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: status === 'DETECTING' ? 900 : status === 'ANALYSING' ? 1400 : 4200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [status, spin]);

  useEffect(() => {
    if (!busy) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [busy, pulse]);

  useEffect(() => {
    if (!locked) {
      lock.setValue(0.35);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(lock, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(lock, {
          toValue: 0.4,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [locked, lock]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1.05],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0],
  });

  const inner = size * 0.62;
  const rings = [0.94, 0.74, 0.54];

  return (
    <View
      style={[
        styles.radarOuter,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: hexToRgba(accent, locked ? 0.9 : 0.55),
        },
        Platform.OS === 'web'
          ? ({
              boxShadow: `0 0 40px ${hexToRgba(accent, locked ? 0.5 : 0.28)}`,
            } as object)
          : null,
      ]}
    >
      {/* Chart INSIDE radar — circular crop */}
      {chartUri ? (
        <Image
          source={{ uri: chartUri }}
          style={[
            styles.radarChart,
            {
              width: inner,
              height: inner,
              borderRadius: inner / 2,
            },
          ]}
          resizeMode="cover"
          accessibilityLabel="Chart inside radar"
        />
      ) : (
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.2)',
            hexToRgba(accent, 0.1),
            'rgba(0,0,0,0.92)',
          ]}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Dark veil so rings/beam stay readable over chart */}
      {chartUri ? (
        <View
          pointerEvents="none"
          style={[
            styles.radarVeil,
            {
              width: inner,
              height: inner,
              borderRadius: inner / 2,
              backgroundColor: 'rgba(0,0,0,0.35)',
            },
          ]}
        />
      ) : null}

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

      {/* Pulse rings */}
      {busy ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseRing,
            {
              width: size * 0.7,
              height: size * 0.7,
              borderRadius: (size * 0.7) / 2,
              borderColor: accent,
              opacity: pulseOpacity,
              transform: [{ scale: pulseScale }],
            },
          ]}
        />
      ) : null}

      <View
        pointerEvents="none"
        style={[styles.radarCrossH, { backgroundColor: hexToRgba(accent, 0.35) }]}
      />
      <View
        pointerEvents="none"
        style={[styles.radarCrossV, { backgroundColor: hexToRgba(accent, 0.35) }]}
      />

      {/* Rotating sweep + laser tip */}
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
        <View
          style={[
            styles.laserTip,
            {
              backgroundColor: accent,
              shadowColor: accent,
            },
            Platform.OS === 'web'
              ? ({ boxShadow: `0 0 12px ${accent}` } as object)
              : null,
          ]}
        />
      </Animated.View>

      {/* Target lock brackets */}
      {locked ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.lockFrame,
            {
              width: inner * 0.72,
              height: inner * 0.72,
              opacity: lock,
              borderColor: BASE.green,
            },
          ]}
        >
          <View style={[styles.lockCorner, styles.lockTL, { borderColor: BASE.green }]} />
          <View style={[styles.lockCorner, styles.lockTR, { borderColor: BASE.green }]} />
          <View style={[styles.lockCorner, styles.lockBL, { borderColor: BASE.green }]} />
          <View style={[styles.lockCorner, styles.lockBR, { borderColor: BASE.green }]} />
        </Animated.View>
      ) : null}

      <View
        style={[
          styles.radarCore,
          {
            borderColor: locked ? BASE.green : accent,
            backgroundColor: hexToRgba(
              locked ? BASE.green : accent,
              locked ? 0.25 : busy ? 0.4 : 0.18,
            ),
          },
        ]}
      >
        <MaterialCommunityIcons
          name={locked ? 'crosshairs-gps' : 'radar'}
          size={22}
          color={locked ? BASE.green : busy ? BASE.white : accent}
        />
      </View>
    </View>
  );
}

function EnginePhasePulse({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[
        styles.engineLiveDot,
        { backgroundColor: color, opacity: pulse },
      ]}
    />
  );
}

function TradeEnginePanel({
  accent,
  stages,
}: {
  accent: string;
  stages: Record<EngineStageId, StageState>;
  liveEngine: boolean;
}) {
  const { phase, title, detail } = deriveEnginePhase(stages);
  const focus =
    ENGINE_STAGES.find((s) => stages[s.id] === 'active') ||
    ENGINE_STAGES.find((s) => stages[s.id] === 'error') ||
    [...ENGINE_STAGES].reverse().find((s) => stages[s.id] === 'done') ||
    ENGINE_STAGES.find((s) => stages[s.id] !== 'blocked') ||
    ENGINE_STAGES[0];
  const focusState = stages[focus.id];
  const isLive =
    phase === 'reading' || phase === 'analyzing' || phase === 'matching';
  const phaseColor =
    phase === 'error'
      ? accent
      : phase === 'signal'
        ? BASE.green
        : isLive
          ? accent
          : BASE.muted;

  return (
    <View
      style={styles.engineCompact}
      accessibilityLabel={`Trade Engine ${title}`}
    >
      <View style={styles.engineCompactHead}>
        <Text style={styles.engineEyebrow}>Trade Engine</Text>
        <Text style={[styles.engineStepIdx, { color: phaseColor }]}>
          {focus.id}/{ENGINE_STAGES.length}
        </Text>
      </View>

      <View style={styles.engineFocusRow}>
        <View
          style={[
            styles.engineFocusNode,
            {
              borderColor: phaseColor,
              backgroundColor: hexToRgba(phaseColor, 0.16),
            },
          ]}
        >
          {focusState === 'done' ? (
            <Ionicons name="checkmark" size={14} color={BASE.green} />
          ) : focusState === 'error' ? (
            <Ionicons name="close" size={14} color={accent} />
          ) : focusState === 'blocked' ? (
            <Ionicons name="lock-closed" size={12} color={BASE.dim} />
          ) : isLive ? (
            <EnginePhasePulse color={accent} />
          ) : (
            <View
              style={[styles.engineLiveDot, { backgroundColor: phaseColor }]}
            />
          )}
        </View>
        <View style={styles.engineFocusCopy}>
          <Text style={[styles.engineFocusTitle, { color: BASE.white }]}>
            {focusState === 'active' ? focus.activeLabel : title}
          </Text>
          <Text style={styles.engineFocusDetail} numberOfLines={2}>
            {focusState === 'active' && focus.id === 3
              ? 'Scanning chart — analyzing structure…'
              : focusState === 'active' && focus.id === 2
                ? 'Reading symbol & timeframe from the image…'
                : detail}
          </Text>
        </View>
      </View>

      <View style={styles.engineDots}>
        {ENGINE_STAGES.map((s) => {
          const state = stages[s.id];
          const on = s.id === focus.id;
          const done = state === 'done';
          const blocked = state === 'blocked';
          const color = done
            ? BASE.green
            : state === 'active' || on
              ? accent
              : blocked
                ? BASE.dim
                : hexToRgba(BASE.muted, 0.55);
          return (
            <View
              key={s.id}
              style={[
                styles.engineDot,
                {
                  backgroundColor: color,
                  opacity: on || done || state === 'active' ? 1 : 0.45,
                  transform: [{ scale: on ? 1.25 : 1 }],
                },
              ]}
            />
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
  const liveEngine = useLiveTradeEngineAvailable();
  const picking = useRef(false);
  const demoStarted = useRef(false);
  const ocrGen = useRef(0);
  const scanTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [symbol, setSymbol] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<string | null>(null);
  const [lotRaw, setLotRaw] = useState('0.01');
  const [tradesRaw, setTradesRaw] = useState('1');
  const [scansLeft, setScansLeft] = useState(12);
  const [chartUri, setChartUri] = useState<string | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [scanPromptOpen, setScanPromptOpen] = useState(false);
  const [autoEngineOpen, setAutoEngineOpen] = useState(false);
  const [scanApiLive, setScanApiLive] = useState<boolean | null>(null);
  const scanAbort = useRef<AbortController | null>(null);
  const [radarStatus, setRadarStatus] =
    useState<RadarStatus>('INITIALISING');
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [detail, setDetail] = useState<HistoryEntry | null>(null);

  const [stage2, setStage2] = useState<StageState>('idle');
  const [stage3, setStage3] = useState<StageState>('idle');
  const [stage4, setStage4] = useState<StageState>('idle');
  // EXECUTE/CONFIRM stay blocked until a real live trade engine is wired.
  const [stage5, setStage5] = useState<StageState>('blocked');
  const [stage6, setStage6] = useState<StageState>('blocked');

  const radarSize = Math.min(
    240,
    Math.round(Math.min(winH * 0.28, winW * 0.62)),
  );
  const dockPad = Math.max(insets.bottom, 10);

  const stages: Record<EngineStageId, StageState> = useMemo(
    () => ({
      1: chartUri ? 'done' : 'idle',
      2: stage2,
      3: stage3,
      4: stage4,
      5: stage5,
      6: stage6,
    }),
    [chartUri, stage2, stage3, stage4, stage5, stage6],
  );

  useEffect(() => {
    if (!chartUri && radarStatus === 'INITIALISING') {
      const t = setTimeout(() => {
        // Stay INITIALISING until user uploads — soft idle after a beat is still INITIALISING
      }, 400);
      return () => clearTimeout(t);
    }
  }, [chartUri, radarStatus]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const st = await fetchScanStatus();
        if (!cancelled) setScanApiLive(Boolean(st.configured));
      } catch {
        if (!cancelled) setScanApiLive(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearScanTimers = () => {
    scanTimers.current.forEach(clearTimeout);
    scanTimers.current = [];
  };

  const resetSoft = () => {
    clearScanTimers();
    setSymbol(null);
    setTimeframe(null);
    setDetectError(null);
    setOutcome(null);
    setStage2('idle');
    setStage3('idle');
    setStage4('idle');
    setStage5(liveEngine ? 'idle' : 'blocked');
    setStage6(liveEngine ? 'idle' : 'blocked');
    setScanPromptOpen(false);
  };

  const applyChart = async (uri: string | null) => {
    if (!uri) return;
    const gen = ++ocrGen.current;
    setChartUri(uri);
    resetSoft();
    setRadarStatus('ANALYSING');
    setStage2('active');

    try {
      const started = Date.now();
      // Brief analysing beat, then detecting
      await new Promise((r) => setTimeout(r, 500));
      if (gen !== ocrGen.current) return;
      setRadarStatus('DETECTING');

      const detected = await ocrChartImage(uri);
      const wait = Math.max(0, 700 - (Date.now() - started));
      if (wait) await new Promise((r) => setTimeout(r, wait));
      if (gen !== ocrGen.current) return;

      if (!detected.symbol) {
        setDetectError(
          'Could not read a symbol from this chart. Upload a clear MT5 screenshot with the pair visible.',
        );
        setStage2('error');
        setRadarStatus('INITIALISING');
        return;
      }

      setSymbol(detected.symbol);
      setTimeframe(detected.timeframe);
      setStage2('done');
      setRadarStatus('ANALYSING');
      setScanPromptOpen(true);
    } catch {
      if (gen !== ocrGen.current) return;
      setDetectError('Chart read failed. Try another screenshot.');
      setStage2('error');
      setRadarStatus('INITIALISING');
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
    clearScanTimers();
    setChartUri(null);
    resetSoft();
    setRadarStatus('INITIALISING');
  };

  const runScan = () => {
    if (stage3 === 'active' || stage4 === 'active') return;
    if (!chartUri || stage2 !== 'done') {
      setDetectError('Upload an MT5 chart first so the symbol can be read.');
      return;
    }
    setScanPromptOpen(false);
    const lotSize = clampLot(parsePositive(lotRaw, 0.01, 1));
    const trades = clampTrades(parsePositive(tradesRaw, 1, 3));
    setLotRaw(String(lotSize));
    setTradesRaw(String(trades));

    if (scansLeft <= 0) {
      setStage3('error');
      setDetectError('No scans left today. Resets overnight.');
      return;
    }

    clearScanTimers();
    scanAbort.current?.abort();
    const ac = new AbortController();
    scanAbort.current = ac;

    setOutcome(null);
    setDetectError(null);
    setStage3('active');
    setStage4('idle');
    setRadarStatus('ANALYSING');
    setScansLeft((n) => Math.max(0, n - 1));

    const uriSnap = chartUri;
    const ocrSym = symbol;
    const ocrTf = timeframe || '—';

    const t1 = setTimeout(() => {
      setStage3('done');
      setStage4('active');
      setRadarStatus('DETECTING');
    }, 2200);

    void (async () => {
      const started = Date.now();
      const apiRes = await postChartScan(uriSnap, ac.signal);
      const wait = Math.max(0, 4800 - (Date.now() - started));
      if (wait) await new Promise((r) => setTimeout(r, wait));
      if (ac.signal.aborted) return;

      if (!apiRes.ok) {
        setStage3('error');
        setStage4('error');
        setRadarStatus('INITIALISING');
        setDetectError(apiRes.error || 'Scan failed.');
        return;
      }

      const norm = normalizeScanResult(apiRes);
      if (!norm.direction || !norm.symbol) {
        setStage3('error');
        setStage4('error');
        setRadarStatus('INITIALISING');
        setDetectError(
          norm.error ||
            'Could not determine BUY/SELL from this chart. Try another screenshot.',
        );
        return;
      }

      const side = norm.direction;
      const bias = side === 'sell' ? 'Sell' : 'Buy';
      const confidence = norm.accuracy || 0;
      const sym = norm.symbol || ocrSym || '—';
      const tf = norm.timeframe || ocrTf;
      setSymbol(sym);
      if (norm.timeframe) setTimeframe(norm.timeframe);

      let entry = norm.entryPrice;
      let stop = norm.stopLoss;
      let tps: number[] = [];
      if (entry != null && stop != null) {
        tps = buildTpLadder(entry, stop, side, 3).tps;
      } else {
        const adv = advisoryLevelsForSide(
          sym,
          side,
          hashSeed(sym + tf + uriSnap.slice(0, 40)),
        );
        entry = adv.entry;
        stop = adv.stopLoss;
        tps = adv.tps;
      }

      const gate = evaluateAutoTradeGate({
        accuracy: confidence,
        side,
        symbol: sym,
        demo: norm.demo,
        entryPrice: entry,
        stopLoss: stop,
        lotSize,
        trades,
      });

      const explanation = buildExplanation(
        sym,
        tf || '—',
        bias,
        confidence,
        lotSize,
        trades,
        norm.summary,
      );

      const tpStr = tps.map((t) => formatPrice(t, entry!)).join(' / ');
      const slStr = formatPrice(stop!, entry!);
      const entryStr = formatPrice(entry!);

      setOutcome({
        bias,
        confidence,
        timeframe: tf || '—',
        tp: tpStr,
        sl: slStr,
        entry: entryStr,
        tps: tps.map((t) => formatPrice(t, entry!)),
        explanation,
        autoTradeAllowed: gate.allowed,
        autoTradeReasons: gate.reasons,
        demo: norm.demo,
        source: 'api',
      });
      setStage4('done');
      setRadarStatus('SIGNAL DETECTED');
      setHistory((prev) =>
        [
          {
            id: `scan_${Date.now()}`,
            symbol: sym,
            timeframe: tf || '—',
            bias,
            confidence,
            message: explanation,
            lotSize,
            trades,
            tp: tpStr,
            sl: slStr,
            chartUri: uriSnap,
            at: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 24),
      );

      if (gate.allowed) {
        setStage5('done');
        setStage6('idle');
      } else {
        setStage5('blocked');
        setStage6('blocked');
      }
    })();

    scanTimers.current = [t1];
  };

  const goHome = () => {
    router.replace('/');
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
      : radarStatus === 'INITIALISING'
        ? BASE.muted
        : accent;

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
        <View style={styles.radarBlock}>
          <EdgesRadar
            accent={accent}
            status={radarStatus}
            size={radarSize}
            chartUri={chartUri}
          />
          <Text style={[styles.radarStatus, { color: statusColor }]}>
            {radarStatus}
          </Text>
          <Text style={styles.statusSub}>
            {detectError
              ? detectError
              : symbol
                ? `${symbol}${timeframe ? ` · ${timeframe}` : ''} · from image`
                : chartUri
                  ? 'Chart loaded in radar — detecting…'
                  : 'Upload an MT5 chart — it appears inside the radar'}
          </Text>
          {chartUri ? (
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
                <Ionicons name="trash-outline" size={15} color={accent} />
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
                <Ionicons name="swap-horizontal" size={15} color={accent} />
                <Text style={[styles.previewBtnText, { color: accent }]}>
                  Replace
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

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
            {outcome.entry ? (
              <View style={styles.levelRow}>
                <View style={styles.levelCell}>
                  <Text style={styles.levelKey}>Entry</Text>
                  <Text style={styles.levelVal}>{outcome.entry}</Text>
                </View>
                <View style={styles.levelCell}>
                  <Text style={styles.levelKey}>SL</Text>
                  <Text style={styles.levelVal}>{outcome.sl}</Text>
                </View>
              </View>
            ) : (
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
            )}
            {outcome.tps && outcome.tps.length > 0 ? (
              <View style={styles.tpLadderRow}>
                {outcome.tps.map((tp, i) => (
                  <View key={`tp-${i}`} style={styles.tpChip}>
                    <Text style={styles.tpChipKey}>{i + 1}R</Text>
                    <Text style={styles.tpChipVal}>{tp}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <Text style={styles.resultNote}>{outcome.explanation}</Text>
            <Text
              style={[
                styles.gateNote,
                {
                  color: outcome.autoTradeAllowed
                    ? BASE.green
                    : BASE.muted,
                },
              ]}
            >
              {outcome.autoTradeAllowed
                ? `Auto-trade gate passed (≥${AUTO_TRADE_MIN_ACCURACY}%, valid prices, real symbol)`
                : `Auto-trade blocked: ${(outcome.autoTradeReasons || ['gate']).join(' · ')}`}
            </Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start Auto Trade Engine"
          onPress={() => setAutoEngineOpen(true)}
          style={({ pressed }) => [
            styles.autoStartBtn,
            {
              borderColor: accent,
              opacity: pressed ? 0.85 : 1,
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
            style={styles.autoStartGrad}
          >
            <Ionicons name="flash-outline" size={18} color={BASE.white} />
            <Text style={styles.autoStartText}>Start Auto Trade</Text>
          </LinearGradient>
        </Pressable>
        <Text style={styles.autoHint}>
          Auto Trade Engine · XAUUSD–XAGUSD · M15→H1→M5→M1 · 8s countdown
          {scanApiLive === true
            ? ' · scan API live'
            : scanApiLive === false
              ? ' · scan API offline'
              : ''}
        </Text>

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

        {/* Trade Engine only when ready for detecting / mid-pipeline — at end */}
        {stage2 === 'done' ||
        stage3 === 'active' ||
        stage3 === 'done' ||
        stage4 === 'active' ||
        stage4 === 'done' ||
        stage3 === 'error' ? (
          <TradeEnginePanel
            accent={accent}
            stages={stages}
            liveEngine={liveEngine}
          />
        ) : null}
      </ScrollView>

      <Modal
        visible={scanPromptOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setScanPromptOpen(false)}
      >
        <View style={styles.centerBackdrop}>
          <View style={[styles.promptCard, { borderColor: accent }]}>
            <Text style={styles.promptEyebrow}>Detected from chart</Text>
            <Text style={styles.promptTitle}>
              {symbol}
              {timeframe ? (
                <Text style={styles.promptTf}> · {timeframe}</Text>
              ) : null}
            </Text>
            <Text style={styles.promptBody}>
              Chart is locked in the radar. Set lot size and trades, then tap
              Scan now for a ~5s analyzing pass. Execute/Confirm stay blocked
              without a live trade engine.
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
                { borderColor: accent, maxHeight: winH * 0.78 },
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

      <AutoTradeEngineOverlay
        visible={autoEngineOpen}
        accent={accent}
        lotSize={clampLot(parsePositive(lotRaw, 0.01, 1))}
        trades={clampTrades(parsePositive(tradesRaw, 1, 3))}
        onClose={() => setAutoEngineOpen(false)}
      />

      <EdgesBottomDock />
    </View>
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
  engineCompact: {
    gap: 10,
    paddingTop: 4,
    paddingBottom: 2,
  },
  engineCompactHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  engineEyebrow: {
    color: BASE.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  engineStepIdx: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  engineFocusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  engineFocusNode: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  engineFocusCopy: { flex: 1, gap: 2 },
  engineFocusTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  engineFocusDetail: {
    color: BASE.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  engineLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  engineDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 2,
  },
  engineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
  radarChart: {
    position: 'absolute',
  },
  radarVeil: {
    position: 'absolute',
  },
  radarRing: { position: 'absolute', borderWidth: 1 },
  pulseRing: {
    position: 'absolute',
    borderWidth: 1.5,
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
  radarSweepArm: { width: '100%', height: 2, borderRadius: 1 },
  laserTip: {
    position: 'absolute',
    right: -3,
    top: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  lockFrame: {
    position: 'absolute',
  },
  lockCorner: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderWidth: 2,
  },
  lockTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  lockTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  lockBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  lockBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  radarCore: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarStatus: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  statusSub: {
    color: BASE.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 300,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    maxWidth: 320,
  },
  previewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 9,
    backgroundColor: BASE.panel,
  },
  previewBtnText: { fontSize: 12, fontWeight: '700' },
  sectionLabel: {
    color: BASE.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
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
  gateNote: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  tpLadderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tpChip: {
    borderWidth: 1,
    borderColor: 'rgba(0,200,83,0.35)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,200,83,0.08)',
    gap: 2,
  },
  tpChipKey: {
    color: BASE.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  tpChipVal: { color: BASE.white, fontSize: 13, fontWeight: '800' },
  autoStartBtn: {
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  autoStartGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  autoStartText: {
    color: BASE.white,
    fontWeight: '800',
    fontSize: 15,
  },
  autoHint: {
    color: BASE.dim,
    fontSize: 11,
    lineHeight: 15,
    marginTop: -4,
  },
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
});
