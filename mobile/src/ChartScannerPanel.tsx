import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const BASE = {
  black: '#000000',
  white: '#FFFFFF',
  muted: '#9A9A9A',
  green: '#00FF00',
};

const QUICK = ['XAUUSD', 'EURUSD', 'BTCUSD', 'NAS100'] as const;

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
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

/** Unique Edges neon radar — concentric red rings + sweep wedge (not Algo green). */
function EdgesRadar({ accent, scanning }: { accent: string; scanning: boolean }) {
  const size = 168;
  const rings = [0.95, 0.72, 0.48, 0.26];
  return (
    <View
      style={[
        styles.radarWrap,
        {
          width: size,
          height: size,
          borderColor: hexToRgba(accent, 0.65),
        },
        Platform.OS === 'web'
          ? ({ boxShadow: `0 0 22px ${hexToRgba(accent, 0.45)}` } as object)
          : null,
      ]}
    >
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
              borderColor: hexToRgba(accent, 0.35 + (1 - f) * 0.35),
            },
          ]}
        />
      ))}
      {/* Cross hairs */}
      <View
        pointerEvents="none"
        style={[styles.radarCrossH, { backgroundColor: hexToRgba(accent, 0.35) }]}
      />
      <View
        pointerEvents="none"
        style={[styles.radarCrossV, { backgroundColor: hexToRgba(accent, 0.35) }]}
      />
      {/* Sweep arm from core (static neon) */}
      <View
        pointerEvents="none"
        style={[
          styles.radarSweepPivot,
          { transform: [{ rotate: scanning ? '55deg' : '22deg' }] },
        ]}
      >
        <View
          style={[
            styles.radarSweepArm,
            {
              backgroundColor: accent,
              opacity: scanning ? 0.95 : 0.7,
            },
            Platform.OS === 'web'
              ? ({ boxShadow: `0 0 14px ${hexToRgba(accent, 0.85)}` } as object)
              : null,
          ]}
        />
      </View>
      <View
        style={[
          styles.radarCore,
          {
            backgroundColor: hexToRgba(accent, scanning ? 0.45 : 0.28),
            borderColor: accent,
          },
        ]}
      >
        <MaterialCommunityIcons
          name="radar"
          size={22}
          color={scanning ? BASE.white : accent}
        />
      </View>
    </View>
  );
}

export function ChartScannerPanel({
  accent,
  symbol,
  setSymbol,
  onClose,
}: {
  accent: string;
  symbol: string;
  setSymbol: (s: string) => void;
  onClose: () => void;
}) {
  const picking = useRef(false);
  const [scansLeft, setScansLeft] = useState(12);
  const [chartUri, setChartUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const applyChart = (uri: string | null) => {
    if (!uri) return;
    setChartUri(uri);
    setResult(null);
  };

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
        setResult('Photo library permission required.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
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
        setResult('Camera permission required.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.8,
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
    if (scansLeft <= 0) {
      setResult('No scans left — try again tomorrow.');
      return;
    }
    setScanning(true);
    setScansLeft((n) => Math.max(0, n - 1));
    const bias = ['buy', 'sell', 'range'][Math.floor(Math.random() * 3)];
    const conf = 62 + Math.floor(Math.random() * 33);
    const chartNote = chartUri ? ' · chart attached' : '';
    // Brief mock pulse then settle
    setTimeout(() => {
      setResult(
        `${symbol} · ${bias} bias · ${conf}% confidence${chartNote} (mock)`,
      );
      setScanning(false);
    }, 650);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.hint}>
        Edges pulse radar — upload a chart or snap the screen, then run a mock
        bias scan.
      </Text>

      <View style={styles.radarRow}>
        <EdgesRadar accent={accent} scanning={scanning} />
        <View style={styles.radarMeta}>
          <View
            style={[
              styles.scansBadge,
              {
                borderColor: accent,
                backgroundColor: hexToRgba(accent, 0.12),
              },
            ]}
          >
            <Ionicons name="flash" size={14} color={accent} />
            <Text style={[styles.scansText, { color: accent }]}>
              {scansLeft} scans left
            </Text>
          </View>
          <Text style={styles.metaLine}>
            {scanning ? 'scanning pulse…' : 'idle · ready'}
          </Text>
          <Text style={styles.metaSub}>
            {chartUri ? 'chart loaded' : 'no chart yet'}
          </Text>
        </View>
      </View>

      {chartUri ? (
        <View style={[styles.preview, { borderColor: hexToRgba(accent, 0.55) }]}>
          <Image source={{ uri: chartUri }} style={styles.previewImg} />
          <Pressable
            accessibilityLabel="clear chart"
            onPress={() => setChartUri(null)}
            style={styles.clearBtn}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={22} color={BASE.white} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.captureRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Upload chart"
          onPress={pickLibrary}
          style={({ pressed }) => [
            styles.captureBtn,
            { borderColor: accent },
            Platform.OS === 'web'
              ? ({ boxShadow: `0 0 12px ${hexToRgba(accent, 0.35)}` } as object)
              : null,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Ionicons name="cloud-upload-outline" size={18} color={accent} />
          <Text style={[styles.captureLabel, { color: accent }]}>
            upload chart
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          onPress={pickCamera}
          style={({ pressed }) => [
            styles.captureBtn,
            { borderColor: accent },
            Platform.OS === 'web'
              ? ({ boxShadow: `0 0 12px ${hexToRgba(accent, 0.35)}` } as object)
              : null,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Ionicons name="camera-outline" size={18} color={accent} />
          <Text style={[styles.captureLabel, { color: accent }]}>camera</Text>
        </Pressable>
      </View>

      <View style={[styles.searchBox, { borderColor: accent }]}>
        <Ionicons name="search" size={16} color={BASE.muted} />
        <TextInput
          value={symbol}
          onChangeText={(t) => setSymbol(t.toUpperCase())}
          placeholder="symbol"
          placeholderTextColor={BASE.muted}
          autoCapitalize="characters"
          style={styles.searchInput}
        />
      </View>

      <View style={styles.chipRow}>
        {QUICK.map((s) => (
          <Pressable
            key={s}
            onPress={() => setSymbol(s)}
            style={[
              styles.chip,
              {
                borderColor: accent,
                backgroundColor:
                  symbol === s ? hexToRgba(accent, 0.22) : 'transparent',
              },
            ]}
          >
            <Text style={styles.chipText}>{s}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="run scan"
        onPress={runScan}
        style={({ pressed }) => [
          styles.runBtn,
          { borderColor: accent },
          Platform.OS === 'web'
            ? ({ boxShadow: `0 0 16px ${hexToRgba(accent, 0.55)}` } as object)
            : null,
          pressed && { opacity: 0.85 },
        ]}
      >
        <LinearGradient
          colors={[hexToRgba(accent, 0.45), 'rgba(20,0,0,0.92)', BASE.black]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.runGrad}
        >
          <MaterialCommunityIcons
            name={scanning ? 'radar' : 'chart-timeline-variant'}
            size={18}
            color={BASE.white}
          />
          <Text style={styles.runText}>
            {scanning ? 'scanning…' : 'run scan'}
          </Text>
        </LinearGradient>
      </Pressable>

      {result ? (
        <View
          style={[
            styles.resultCard,
            {
              borderColor: accent,
              backgroundColor: hexToRgba(accent, 0.12),
            },
          ]}
        >
          <MaterialCommunityIcons
            name="chart-bell-curve-cumulative"
            size={22}
            color={accent}
          />
          <Text style={styles.resultText}>{result}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={onClose}
        style={[
          styles.doneBtn,
          {
            borderColor: hexToRgba(accent, 0.45),
            backgroundColor: 'rgba(0,0,0,0.35)',
          },
        ]}
      >
        <Text style={styles.doneText}>done</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 520 },
  body: { gap: 12, paddingBottom: 8 },
  hint: { color: BASE.muted, fontSize: 12, lineHeight: 16 },
  radarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 4,
  },
  radarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: 'rgba(0,0,0,0.65)',
    overflow: 'hidden',
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
    width: '46%',
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
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarMeta: { flex: 1, gap: 8 },
  scansBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  scansText: { fontSize: 13, fontWeight: '800' },
  metaLine: {
    color: BASE.white,
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  metaSub: { color: BASE.muted, fontSize: 12 },
  preview: {
    height: 120,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  previewImg: { width: '100%', height: '100%' },
  clearBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
  },
  captureRow: { flexDirection: 'row', gap: 10 },
  captureBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: 'rgba(8,8,8,0.85)',
  },
  captureLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  searchInput: {
    flex: 1,
    color: BASE.white,
    fontSize: 15,
    paddingVertical: 4,
    minHeight: 28,
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', outlineWidth: 0 } as object)
      : null),
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { color: BASE.white, fontSize: 12, fontWeight: '600' },
  runBtn: {
    borderRadius: 999,
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
    textTransform: 'lowercase',
  },
  resultCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resultText: {
    color: BASE.white,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  doneBtn: {
    borderRadius: 999,
    borderWidth: 1.5,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneText: {
    color: BASE.white,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
});
