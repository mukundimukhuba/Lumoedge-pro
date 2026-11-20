import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  FlatList,
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
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccessGateScreen } from './AccessGateScreen';
import { LicenseActivateScreen } from './LicenseActivateScreen';
import { useAppState, ACCENTS, SYMBOLS } from './AppState';

type Sheet =
  | 'none'
  | 'quotes'
  | 'settings'
  | 'calendar'
  | 'broker';

type BottomTab = 'home' | 'scanner' | 'broker';

const BASE = {
  black: '#000000',
  white: '#FFFFFF',
  green: '#00FF00',
  muted: '#9A9A9A',
  glass: 'rgba(8, 8, 8, 0.78)',
};

const EVENTS = [
  { day: 3, title: 'NFP week preview', time: 'all day' },
  { day: 7, title: 'ECB speakers', time: '09:00' },
  { day: 12, title: 'CPI release', time: '13:30' },
  { day: 18, title: 'FOMC minutes', time: '19:00' },
  { day: 24, title: 'Gold volatility watch', time: 'open' },
  { day: 28, title: 'Month-end flows', time: '16:00' },
];

const PHONE_W = 390;
const PHONE_H = 844;

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function EaControlRoot() {
  const { width, height } = useWindowDimensions();
  const { eaAccess, activeEa, accessReady } = useAppState();
  const isWebDesktop = Platform.OS === 'web' && width > 500;

  // 1) $35 access → 2) license key → 3) control UI (no demo skip)
  const phone = !accessReady ? (
    <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ color: '#9A9A9A' }}>Loading…</Text>
    </View>
  ) : !eaAccess ? (
    <AccessGateScreen />
  ) : !activeEa ? (
    <LicenseActivateScreen />
  ) : (
    <EaControlScreen />
  );

  if (!isWebDesktop) return phone;

  // Fit without CSS transform — scale() breaks web click hit-testing.
  const fit = Math.min((height - 48) / PHONE_H, (width - 48) / PHONE_W, 1);
  const frameW = Math.round(PHONE_W * fit);
  const frameH = Math.round(PHONE_H * fit);
  return (
    <View style={styles.webStage}>
      <View style={[styles.phoneChrome, { width: frameW, height: frameH }]}>
        <View style={styles.notch} />
        {phone}
        <View style={styles.homeIndicator} />
      </View>
    </View>
  );
}

export function EaControlScreen() {
  const router = useRouter();
  const { height: windowH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const {
    status,
    setStatus,
    selected,
    setSelected,
    accent,
    setAccent,
    activeEa,
    clearActiveEa,
  } = useAppState();
  const eaTitle = activeEa?.name?.trim() || 'edges ea control';
  const eaPicture =
    activeEa?.pictureUri &&
    (activeEa.pictureUri.startsWith('data:') ||
      activeEa.pictureUri.startsWith('blob:') ||
      activeEa.pictureUri.startsWith('http') ||
      activeEa.pictureUri.startsWith('file:') ||
      activeEa.pictureUri.startsWith('/'))
      ? { uri: activeEa.pictureUri }
      : require('../assets/mascot.jpg');
  const [sheet, setSheet] = useState<Sheet>('none');
  const [bottomTab, setBottomTab] = useState<BottomTab>('home');
  const [query, setQuery] = useState('');
  const [calMonth] = useState(() => new Date());
  const [pickedDay, setPickedDay] = useState<number | null>(12);
  const [brokerConnected, setBrokerConnected] = useState(false);
  /** Prefer on-layout height (phone chrome / real device) over window. */
  const [layoutH, setLayoutH] = useState(windowH);
  /**
   * Exact match to algo-nova-layout-reference proportions (Edges branding):
   * measured hero ≈52.9% of frame; 10–15px gaps; neon pills; fixed dock.
   */
  // Keep dock fully above home-indicator / browser safe area.
  const safeBottom = Math.max(
    insets.bottom,
    Platform.OS === 'web' ? 12 : 8,
  );
  const safeTop = Math.max(insets.top, Platform.OS === 'web' ? 8 : 0);
  const scale = Math.min(1.08, Math.max(0.85, layoutH / 844));
  /**
   * Measured reference: face hero + neck/body strip ≈ 52.9% total.
   * Face ~80% of that band; neck strip ~20% (lower-body crop of same pic).
   */
  const heroTotalH = Math.max(240, Math.min(Math.round(layoutH * 0.529), 460));
  const neckH = Math.max(48, Math.round(heroTotalH * 0.2));
  const faceH = heroTotalH - neckH;
  /** Shared image height so face shows top, neck shows bottom of same pic. */
  const bleedImgH = Math.round(faceH * 1.55);
  const dockPad = Math.max(6, 2 + safeBottom);
  const dockH = Math.round(50 * scale) + dockPad;
  /** Reference stack gaps ≈ 10–15px (use 12). */
  const gapTight = 12;
  const gapSm = 4;
  const titleSize = Math.max(16, Math.round(18 * scale));
  const controlPadV = Math.max(8, Math.round(10 * scale));
  /** Reference: smaller side rings, larger center stop. */
  const ringSm = Math.max(36, Math.round(40 * scale));
  const ringLg = Math.max(48, Math.round(54 * scale));
  const iconSm = Math.max(16, Math.round(18 * scale));
  const iconLg = Math.max(22, Math.round(24 * scale));
  const sidePad = Math.max(14, Math.round(16 * scale));
  /** Triple-tap the logo (hero image) → Mentors Portal — not Settings. */
  const logoTaps = useRef<{ count: number; at: number }>({
    count: 0,
    at: 0,
  });

  const isActive = status === 'running';
  const statusLabel =
    status === 'running' ? 'running' : status === 'stopped' ? 'stopped' : 'removed';
  const statusColor =
    status === 'running'
      ? BASE.green
      : status === 'stopped'
        ? accent
        : BASE.muted;

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [...SYMBOLS];
    return SYMBOLS.filter((s) => s.includes(q));
  }, [query]);

  const monthLabel = calMonth.toLocaleString('en', {
    month: 'long',
    year: 'numeric',
  });
  const daysInMonth = new Date(
    calMonth.getFullYear(),
    calMonth.getMonth() + 1,
    0,
  ).getDate();
  const startPad = new Date(
    calMonth.getFullYear(),
    calMonth.getMonth(),
    1,
  ).getDay();
  const dayEvents = EVENTS.filter((e) => e.day === pickedDay);

  const sheetTitle =
    sheet === 'quotes'
      ? 'quotes'
      : sheet === 'calendar'
        ? 'events calendar'
        : sheet === 'broker'
          ? 'connect your broker'
          : 'settings';

  const closeSheet = () => {
    setSheet('none');
    setBottomTab('home');
  };
  const backToSettings = () => setSheet('settings');

  const openChartScanner = () => {
    setSheet('none');
    setBottomTab('scanner');
    router.push('/chart-scanner');
  };

  const onBottomTab = (tab: BottomTab) => {
    setBottomTab(tab);
    if (tab === 'home') {
      setSheet('none');
      return;
    }
    if (tab === 'scanner') {
      openChartScanner();
      return;
    }
    setSheet('broker');
  };

  const onSettingsPress = () => setSheet('settings');

  /** Triple-tap logo within 900ms → Mentors Portal (mobile Safari–friendly) */
  const onLogoPress = () => {
    const now = Date.now();
    if (now - logoTaps.current.at > 900) {
      logoTaps.current = { count: 1, at: now };
    } else {
      logoTaps.current = {
        count: logoTaps.current.count + 1,
        at: now,
      };
    }
    if (logoTaps.current.count >= 3) {
      logoTaps.current = { count: 0, at: 0 };
      router.push('/portal');
    }
  };

  const toggleSymbol = (sym: string) => {
    setSelected(
      selected.includes(sym)
        ? selected.filter((s) => s !== sym)
        : [...selected, sym],
    );
  };

  const onToggleRun = () => {
    if (status === 'removed') {
      setStatus('running');
      return;
    }
    setStatus(status === 'running' ? 'stopped' : 'running');
  };

  const onRemove = () => {
    Alert.alert(
      'Remove bot',
      'Clear this licensed EA session? You will need the license key again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setStatus('removed');
            void clearActiveEa();
          },
        },
      ],
    );
  };

  /** Leave this EA session and open Activate for another license key. */
  const onAddAnotherEa = () => {
    const go = () => {
      setStatus('stopped');
      void clearActiveEa();
    };
    if (Platform.OS === 'web') {
      const ok =
        typeof window !== 'undefined' &&
        window.confirm(
          'Activate a different license key for another Expert Advisor?',
        );
      if (ok) go();
      return;
    }
    Alert.alert(
      'Add another EA',
      'Activate a different license key for another Expert Advisor?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: go },
      ],
    );
  };

  return (
    <View
      style={styles.root}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0) setLayoutH(h);
      }}
    >
      <StatusBar style="light" />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="settings"
        onPress={onSettingsPress}
        style={({ pressed }) => [
          styles.settingsBtn,
          { borderColor: accent, top: safeTop + 2 },
          Platform.OS === 'web'
            ? ({ boxShadow: `0 0 12px ${hexToRgba(accent, 0.55)}` } as object)
            : null,
          pressed && { opacity: 0.75 },
        ]}
        hitSlop={12}
      >
        <Ionicons name="settings-outline" size={iconSm} color={BASE.white} />
      </Pressable>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(6, Math.round(8 * scale)) },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <View
          style={[
            styles.heroWrap,
            { height: heroTotalH - 1 },
            // Web: dissolve the hard cut with a soft mask (reads as smoke into UI).
            Platform.OS === 'web'
              ? ({
                  WebkitMaskImage:
                    'linear-gradient(to bottom, #000 0%, #000 38%, rgba(0,0,0,0.85) 52%, rgba(0,0,0,0.45) 68%, rgba(0,0,0,0.12) 84%, transparent 100%)',
                  maskImage:
                    'linear-gradient(to bottom, #000 0%, #000 38%, rgba(0,0,0,0.85) 52%, rgba(0,0,0,0.45) 68%, rgba(0,0,0,0.12) 84%, transparent 100%)',
                } as object)
              : null,
          ]}
        >
          {/* Face band: full-bleed EA picture (pic bg fills — no black gutters). */}
          <View
            style={[styles.heroFace, { height: faceH, backgroundColor: accent }]}
            pointerEvents="box-none"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edges logo — triple tap for Mentors Portal"
              onPress={onLogoPress}
              hitSlop={20}
              style={({ pressed }) => [
                styles.logoHit,
                Platform.OS === 'web'
                  ? ({ cursor: 'pointer', touchAction: 'manipulation' } as object)
                  : null,
                pressed && { opacity: 0.92 },
              ]}
            >
              <Image
                source={eaPicture}
                style={[styles.heroBleedImg, { height: bleedImgH }]}
                resizeMode="cover"
              />
            </Pressable>
          </View>

          {/* Neck/lower-body strip: same pic, cropped to lower portion. */}
          <View
            style={[
              styles.heroNeck,
              {
                height: neckH,
                backgroundColor: accent,
                marginTop: -1,
              },
            ]}
            pointerEvents="none"
          >
            <Image
              source={eaPicture}
              style={[
                styles.heroBleedImg,
                {
                  height: bleedImgH,
                  marginTop: -(bleedImgH - neckH),
                },
              ]}
              resizeMode="cover"
            />
          </View>

          {/* Soft black cloud/smoke — starts above the chin cut so the hard edge dissolves. */}
          <LinearGradient
            colors={[
              'transparent',
              'rgba(0,0,0,0.18)',
              'rgba(0,0,0,0.4)',
              'rgba(0,0,0,0.68)',
              'rgba(0,0,0,0.88)',
              'rgba(0,0,0,0.97)',
              '#000000',
            ]}
            locations={[0, 0.16, 0.34, 0.52, 0.7, 0.86, 1]}
            style={[
              styles.heroSmoke,
              { height: Math.max(210, Math.round(heroTotalH * 0.72)) },
            ]}
            pointerEvents="none"
          />
        </View>

        {/* Title sits above the smoke/mask so it stays readable. */}
        <Text
          style={[
            styles.title,
            {
              fontSize: titleSize,
              marginTop: -Math.max(36, Math.round(neckH * 0.55)),
              marginBottom: Math.max(4, gapTight - 4),
            },
          ]}
          pointerEvents="none"
          numberOfLines={1}
        >
          {eaTitle}
        </Text>

        <View
          style={[
            styles.lower,
            {
              marginTop: 0,
              paddingTop: gapTight,
              paddingBottom: gapSm,
              paddingHorizontal: sidePad,
              gap: gapTight,
              backgroundColor: BASE.black,
            },
          ]}
        >
          <View style={[styles.lowerTop, { gap: gapSm }]}>
            <Glass
              accent={accent}
              style={styles.controlGlass}
              contentStyle={[
                styles.controlRow,
                {
                  paddingVertical: controlPadV,
                  paddingHorizontal: Math.max(8, Math.round(10 * scale)),
                },
              ]}
            >
              <Control
                accent={accent}
                label="quotes"
                size={ringSm}
                onPress={() => {
                  setQuery('');
                  setSheet('quotes');
                }}
                icon={
                  <MaterialCommunityIcons
                    name="chart-line"
                    size={iconSm}
                    color={accent}
                  />
                }
              />
              <Control
                accent={accent}
                label={isActive ? 'stop' : 'start'}
                onPress={onToggleRun}
                size={ringLg}
                lit={isActive}
                icon={
                  <Ionicons
                    name={isActive ? 'stop' : 'play'}
                    size={iconLg}
                    color={accent}
                  />
                }
              />
              <Control
                accent={accent}
                label="remove"
                size={ringSm}
                onPress={onRemove}
                icon={
                  <Ionicons
                    name="trash-outline"
                    size={iconSm}
                    color={accent}
                  />
                }
              />
            </Glass>

            <Text
              style={[
                styles.powered,
                { fontSize: Math.max(9, Math.round(10 * scale)), marginTop: gapSm },
              ]}
            >
              powered by{' '}
              <Text style={[styles.poweredBrand, { color: accent }]}>
                lumo edge pro
              </Text>
            </Text>
          </View>

          <View style={[styles.statusBlock, { gap: gapTight }]}>
            <Glass
              accent={accent}
              style={styles.statusGlass}
              contentStyle={[
                styles.statusRow,
                {
                  paddingVertical: Math.max(6, Math.round(8 * scale)),
                  gap: Math.max(8, Math.round(10 * scale)),
                },
              ]}
            >
              <Pressable
                onPress={onLogoPress}
                accessibilityRole="button"
                accessibilityLabel="Edges logo — triple tap for Mentors Portal"
                hitSlop={8}
              >
                <Image
                  source={eaPicture}
                  style={[
                    styles.statusThumb,
                    {
                      borderColor: accent,
                      width: Math.max(30, Math.round(34 * scale)),
                      height: Math.max(30, Math.round(34 * scale)),
                      borderRadius: Math.max(15, Math.round(17 * scale)),
                    },
                  ]}
                />
              </Pressable>
              <View style={styles.statusText}>
                <Text
                  style={[
                    styles.statusTitle,
                    { fontSize: Math.max(12, Math.round(14 * scale)) },
                  ]}
                  numberOfLines={1}
                >
                  {eaTitle}
                </Text>
                <Text
                  style={[
                    styles.statusState,
                    {
                      color: statusColor,
                      fontSize: Math.max(10, Math.round(11 * scale)),
                    },
                  ]}
                >
                  {statusLabel}
                </Text>
                <Text
                  style={[
                    styles.symbolHint,
                    {
                      fontSize: Math.max(9, Math.round(10 * scale)),
                      textAlign: 'left',
                      marginTop: 1,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {selected.length > 0
                    ? selected.join(' · ')
                    : 'no symbols selected'}
                </Text>
              </View>
            </Glass>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add another EA"
              onPress={onAddAnotherEa}
              style={({ pressed }) => [
                styles.addEaBtn,
                {
                  borderColor: accent,
                  paddingVertical: Math.max(11, Math.round(12 * scale)),
                  paddingHorizontal: Math.max(14, Math.round(16 * scale)),
                  gap: Math.max(8, Math.round(10 * scale)),
                  minHeight: Math.max(48, Math.round(52 * scale)),
                },
                Platform.OS === 'web'
                  ? ({
                      boxShadow: `0 0 12px ${hexToRgba(accent, 0.4)}`,
                    } as object)
                  : null,
                pressed && { opacity: 0.85 },
              ]}
            >
              <View
                style={[
                  styles.addEaIcon,
                  {
                    backgroundColor: hexToRgba(accent, 0.18),
                    width: Math.max(28, Math.round(30 * scale)),
                    height: Math.max(28, Math.round(30 * scale)),
                    borderRadius: Math.max(14, Math.round(15 * scale)),
                  },
                ]}
              >
                <Ionicons
                  name="add"
                  size={Math.max(18, Math.round(20 * scale))}
                  color={accent}
                />
              </View>
              <Text
                style={[
                  styles.addEaLabel,
                  {
                    color: accent,
                    fontSize: Math.max(13, Math.round(14 * scale)),
                  },
                ]}
              >
                Add another EA
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.bottomDock,
          {
            paddingBottom: dockPad,
            paddingTop: Math.max(2, Math.round(2 * scale)),
            minHeight: dockH,
          },
        ]}
      >
        <View
          style={[
            styles.bottomBar,
            { borderColor: hexToRgba(accent, 0.55) },
            Platform.OS === 'web'
              ? ({
                  boxShadow: `0 0 14px ${hexToRgba(accent, 0.25)}`,
                } as object)
              : null,
          ]}
        >
          <BottomNavItem
            accent={accent}
            active={bottomTab === 'home'}
            label="Home"
            icon="home-outline"
            scale={scale}
            onPress={() => onBottomTab('home')}
          />
          <BottomNavItem
            accent={accent}
            active={bottomTab === 'scanner'}
            label="Chart scanner"
            icon="scan-outline"
            scale={scale}
            onPress={() => onBottomTab('scanner')}
          />
          <BottomNavItem
            accent={accent}
            active={bottomTab === 'broker'}
            label="Connect your broker"
            icon="link-outline"
            scale={scale}
            onPress={() => onBottomTab('broker')}
          />
        </View>
      </View>

      <Modal
        visible={sheet !== 'none'}
        animationType="slide"
        transparent
        onRequestClose={closeSheet}
      >
        <View style={styles.modalBackdrop}>
          <Glass
            accent={accent}
            style={styles.sheet}
            contentStyle={styles.sheetBody}
          >

              <View style={styles.sheetHeader}>
                <View style={styles.sheetHeaderLeft}>
                  {sheet === 'calendar' || sheet === 'broker' ? (
                    <Pressable
                      accessibilityLabel="back"
                      onPress={() => {
                        if (sheet === 'broker') {
                          closeSheet();
                        } else {
                          backToSettings();
                        }
                      }}
                      hitSlop={10}
                      style={styles.backBtn}
                    >
                      <Ionicons
                        name="chevron-back"
                        size={22}
                        color={BASE.white}
                      />
                    </Pressable>
                  ) : null}
                  <Text style={styles.sheetTitle}>{sheetTitle}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="close"
                  onPress={closeSheet}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={22} color={BASE.white} />
                </Pressable>
              </View>

            {sheet === 'quotes' ? (
              <QuotesPanel
                accent={accent}
                query={query}
                setQuery={setQuery}
                filtered={filtered}
                selected={selected}
                toggleSymbol={toggleSymbol}
                onDone={closeSheet}
              />
            ) : null}

            {sheet === 'settings' ? (
              <ScrollView
                style={styles.settingsScroll}
                contentContainerStyle={styles.settingsBody}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.sectionLabel}>app colour</Text>
                <View style={styles.swatchRow}>
                  {ACCENTS.map((c) => {
                    const on = accent === c.value;
                    return (
                      <Pressable
                        key={c.id}
                        accessibilityLabel={c.label}
                        onPress={() => setAccent(c.value)}
                        style={[
                          styles.swatch,
                          {
                            backgroundColor: c.value,
                            borderColor: on ? BASE.white : 'transparent',
                          },
                        ]}
                      />
                    );
                  })}
                </View>
                <Text style={styles.settingsHint}>
                  accent updates borders, controls, and powered-by highlight
                </Text>

                <Text style={[styles.sectionLabel, { marginTop: 8 }]}>
                  tools
                </Text>
                <SettingsLink
                  accent={accent}
                  icon="scan-outline"
                  title="chart scanner"
                  subtitle="full-page radar · upload · camera"
                  onPress={openChartScanner}
                />
                <SettingsLink
                  accent={accent}
                  icon="calendar-outline"
                  title="events calendar"
                  subtitle="economic / session events"
                  onPress={() => setSheet('calendar')}
                />

                <Text style={styles.settingsLine}>
                  symbols: {selected.length ? selected.join(', ') : 'none'}
                </Text>
                <Text style={styles.settingsLine}>session: {statusLabel}</Text>

                <Pressable
                  style={[
                    styles.doneBtn,
                    {
                      borderColor: accent,
                      backgroundColor: hexToRgba(accent, 0.18),
                    },
                  ]}
                  onPress={closeSheet}
                >
                  <Text style={styles.doneText}>close</Text>
                </Pressable>
              </ScrollView>
            ) : null}

            {sheet === 'broker' ? (
              <View style={styles.toolBody}>
                <Text style={styles.settingsHint}>
                  Link a broker account so Edges can sync sessions (demo
                  connect — no live credentials stored).
                </Text>
                <View
                  style={[
                    styles.scanCard,
                    {
                      borderColor: accent,
                      backgroundColor: hexToRgba(accent, 0.12),
                      marginTop: 8,
                    },
                  ]}
                >
                  <Ionicons
                    name={brokerConnected ? 'checkmark-circle' : 'business-outline'}
                    size={22}
                    color={accent}
                  />
                  <Text style={styles.scanResult}>
                    {brokerConnected
                      ? 'Broker linked · demo MT5 · Edges session ready'
                      : 'No broker linked yet'}
                  </Text>
                </View>
                {['MetaTrader 5', 'MetaTrader 4', 'cTrader'].map((b) => (
                  <Pressable
                    key={b}
                    onPress={() => setBrokerConnected(true)}
                    style={[
                      styles.brokerRow,
                      { borderColor: hexToRgba(accent, 0.45) },
                    ]}
                  >
                    <Text style={styles.brokerName}>{b}</Text>
                    <Text style={[styles.brokerAction, { color: accent }]}>
                      {brokerConnected ? 'linked' : 'connect'}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  style={[
                    styles.doneBtn,
                    {
                      borderColor: accent,
                      backgroundColor: hexToRgba(accent, 0.18),
                      marginTop: 8,
                    },
                  ]}
                  onPress={closeSheet}
                >
                  <Text style={styles.doneText}>done</Text>
                </Pressable>
              </View>
            ) : null}

            {sheet === 'calendar' ? (
              <ScrollView contentContainerStyle={styles.toolBody}>
                <Text style={styles.monthLabel}>{monthLabel}</Text>
                <View style={styles.weekHeader}>
                  {['s', 'm', 't', 'w', 't', 'f', 's'].map((d, i) => (
                    <Text key={`${d}-${i}`} style={styles.weekDay}>
                      {d}
                    </Text>
                  ))}
                </View>
                <View style={styles.calGrid}>
                  {Array.from({ length: startPad }).map((_, i) => (
                    <View key={`pad-${i}`} style={styles.calCell} />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(
                    (day) => {
                      const has = EVENTS.some((e) => e.day === day);
                      const on = pickedDay === day;
                      return (
                        <Pressable
                          key={day}
                          onPress={() => setPickedDay(day)}
                          style={[
                            styles.calCell,
                            styles.calDay,
                            on && {
                              borderColor: accent,
                              backgroundColor: hexToRgba(accent, 0.25),
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.calDayText,
                              on && { color: BASE.white, fontWeight: '700' },
                            ]}
                          >
                            {day}
                          </Text>
                          {has ? (
                            <View
                              style={[
                                styles.calDot,
                                { backgroundColor: accent },
                              ]}
                            />
                          ) : null}
                        </Pressable>
                      );
                    },
                  )}
                </View>
                <Text style={styles.sectionLabel}>
                  {pickedDay ? `day ${pickedDay}` : 'pick a day'}
                </Text>
                {dayEvents.length ? (
                  dayEvents.map((e) => (
                    <View
                      key={`${e.day}-${e.title}`}
                      style={[styles.eventRow, { borderColor: accent }]}
                    >
                      <Text style={styles.eventTitle}>{e.title}</Text>
                      <Text style={styles.eventTime}>{e.time}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.settingsHint}>no events this day</Text>
                )}
              </ScrollView>
            ) : null}
          </Glass>
        </View>
      </Modal>
    </View>
  );
}

function QuotesPanel({
  accent,
  query,
  setQuery,
  filtered,
  selected,
  toggleSymbol,
  onDone,
}: {
  accent: string;
  query: string;
  setQuery: (v: string) => void;
  filtered: string[];
  selected: string[];
  toggleSymbol: (s: string) => void;
  onDone: () => void;
}) {
  return (
    <>
      <View style={[styles.searchBox, { borderColor: accent }]}>
        <Ionicons name="search" size={16} color={BASE.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="search symbols"
          placeholderTextColor={BASE.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          style={styles.searchInput}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item}
        style={styles.symbolList}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.empty}>no symbols match</Text>
        }
        renderItem={({ item }) => {
          const on = selected.includes(item);
          return (
            <Pressable
              onPress={() => toggleSymbol(item)}
              style={({ pressed }) => [
                styles.symbolRow,
                on && { backgroundColor: hexToRgba(accent, 0.12) },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={styles.symbolCode}>{item}</Text>
              <Ionicons
                name={on ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={on ? BASE.green : BASE.muted}
              />
            </Pressable>
          );
        }}
      />
      <Pressable
        style={[
          styles.doneBtn,
          {
            borderColor: accent,
            backgroundColor: hexToRgba(accent, 0.18),
          },
        ]}
        onPress={onDone}
      >
        <Text style={styles.doneText}>
          done · {selected.length} selected
        </Text>
      </Pressable>
    </>
  );
}

function BottomNavItem({
  accent,
  active,
  label,
  icon,
  onPress,
  scale = 1,
}: {
  accent: string;
  active: boolean;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  scale?: number;
}) {
  const iconSize = Math.max(15, Math.round(17 * scale));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.bottomItem,
        { minHeight: Math.max(34, Math.round(36 * scale)) },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Ionicons
        name={icon}
        size={iconSize}
        color={active ? accent : BASE.muted}
      />
      <Text
        style={[
          styles.bottomLabel,
          {
            color: active ? accent : BASE.muted,
            fontSize: Math.max(8, Math.round(9 * scale)),
            lineHeight: Math.max(10, Math.round(11 * scale)),
          },
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SettingsLink({
  accent,
  icon,
  title,
  subtitle,
  onPress,
}: {
  accent: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.linkRow,
        { borderColor: accent },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={[styles.linkIcon, { backgroundColor: hexToRgba(accent, 0.2) }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.linkTitle}>{title}</Text>
        <Text style={styles.linkSub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={BASE.muted} />
    </Pressable>
  );
}

function Glass({
  children,
  style,
  contentStyle,
  accent,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  accent: string;
}) {
  return (
    <View
      style={[
        styles.glassOuter,
        { borderColor: accent },
        Platform.OS === 'web'
          ? ({
              boxShadow: `0 0 14px ${hexToRgba(accent, 0.45)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
            } as object)
          : null,
        style,
      ]}
    >
      <BlurView
        intensity={Platform.OS === 'web' ? 22 : 48}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glassFill} />
      <View style={[styles.glassInner, contentStyle]}>{children}</View>
    </View>
  );
}

function Control({
  label,
  icon,
  onPress,
  size = 34,
  lit = false,
  accent,
}: {
  label: string;
  icon: ReactNode;
  onPress: () => void;
  size?: number;
  lit?: boolean;
  accent: string;
}) {
  const ring = size + 5;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.control, pressed && { opacity: 0.75 }]}
    >
      <View
        style={[
          styles.ring,
          {
            width: ring,
            height: ring,
            borderRadius: ring / 2,
            borderColor: accent,
            backgroundColor: hexToRgba(accent, lit ? 0.22 : 0.1),
          },
          Platform.OS === 'web'
            ? ({
                boxShadow: lit
                  ? `0 0 14px ${hexToRgba(accent, 0.85)}`
                  : `0 0 8px ${hexToRgba(accent, 0.55)}`,
              } as object)
            : null,
        ]}
      >
        <LinearGradient
          colors={[
            hexToRgba(accent, 0.45),
            'rgba(20,0,0,0.92)',
            'rgba(0,0,0,1)',
          ]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: hexToRgba(accent, 0.55),
            overflow: 'hidden',
          }}
        >
          <View style={styles.sheen} />
          {icon}
        </LinearGradient>
      </View>
      <Text style={[styles.controlLabel, { color: accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  webStage: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneChrome: {
    backgroundColor: BASE.black,
    borderRadius: 44,
    overflow: 'hidden',
    borderWidth: 10,
    borderColor: '#0a0a0a',
    ...Platform.select({
      web: { boxShadow: '0 24px 80px rgba(0,0,0,0.65)' } as object,
      default: {},
    }),
  },
  notch: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -60,
    width: 120,
    height: 28,
    borderRadius: 18,
    backgroundColor: BASE.black,
    zIndex: 20,
  },
  homeIndicator: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -60,
    width: 120,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
    zIndex: 20,
  },
  root: {
    flex: 1,
    backgroundColor: BASE.black,
    overflow: 'hidden',
    width: '100%',
    maxWidth: '100%',
  },
  scroll: { flex: 1, width: '100%', maxWidth: '100%' },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: '100%',
    paddingBottom: 8,
  },
  heroWrap: {
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  heroFace: {
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  heroNeck: {
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
  },
  /** Full-bleed cover — no black Image bg so uploaded pic colour fills the band. */
  heroBleedImg: {
    width: '100%',
    alignSelf: 'stretch',
  },
  logoHit: {
    ...StyleSheet.absoluteFill,
    zIndex: 25,
    elevation: 25,
    overflow: 'hidden',
  },
  /** Soft black cloud/smoke under hero → UI (no hard cut line). */
  heroSmoke: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 8,
  },
  title: {
    width: '100%',
    paddingHorizontal: 16,
    zIndex: 12,
    textAlign: 'center',
    color: BASE.white,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'lowercase',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 14,
  },
  settingsBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 30,
    elevation: 30,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5,
  },
  lower: {
    backgroundColor: BASE.black,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 12,
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
  },
  lowerTop: {
    width: '100%',
    maxWidth: '100%',
    alignItems: 'center',
    gap: 4,
  },
  bottomDock: {
    width: '100%',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingBottom: 4,
    paddingTop: 2,
    backgroundColor: BASE.black,
    borderTopWidth: 0,
  },
  bottomBar: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: 420,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: 'rgba(8, 8, 8, 0.96)',
  },
  bottomItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingVertical: 1,
    paddingHorizontal: 2,
    minHeight: 36,
  },
  bottomLabel: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 11,
  },
  brokerRow: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  brokerName: {
    color: BASE.white,
    fontSize: 15,
    fontWeight: '700',
  },
  brokerAction: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'lowercase',
  },
  glassOuter: {
    width: '100%',
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: BASE.glass,
  },
  glassFill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  glassInner: { zIndex: 1 },
  controlGlass: { borderRadius: 999, maxWidth: 420, alignSelf: 'stretch' },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  control: { alignItems: 'center', minWidth: 60 },
  ring: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 8,
    right: 8,
    height: '40%',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  controlLabel: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'lowercase',
  },
  powered: { marginTop: 2, color: BASE.muted, fontSize: 10 },
  poweredBrand: { fontWeight: '700' },
  symbolHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
    letterSpacing: 0.3,
    maxWidth: 340,
    textAlign: 'center',
  },
  statusBlock: {
    width: '100%',
    maxWidth: 420,
    gap: 12,
  },
  statusGlass: {
    marginTop: 0,
    marginBottom: 0,
    borderRadius: 999,
    maxWidth: 420,
    width: '100%',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statusThumb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  statusText: { flex: 1, minWidth: 0 },
  statusTitle: {
    color: BASE.white,
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  statusState: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  addEaBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 52,
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: 'rgba(8, 8, 8, 0.78)',
  },
  addEaIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addEaLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
    padding: 14,
  },
  sheet: { borderRadius: 28, maxHeight: '82%' },
  sheetBody: { padding: 16, gap: 12 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  backBtn: { marginRight: 2 },
  sheetTitle: {
    color: BASE.white,
    fontSize: 20,
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
  symbolList: { maxHeight: 300 },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  symbolCode: {
    color: BASE.white,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  empty: {
    color: BASE.muted,
    textAlign: 'center',
    paddingVertical: 24,
  },
  doneBtn: {
    marginTop: 4,
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
  settingsScroll: { maxHeight: 480 },
  settingsBody: { gap: 10, paddingBottom: 8 },
  settingsLine: { color: BASE.muted, fontSize: 13 },
  settingsHint: { color: BASE.muted, fontSize: 12, lineHeight: 16 },
  sectionLabel: {
    color: BASE.white,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'lowercase',
    letterSpacing: 0.4,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  linkIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkTitle: {
    color: BASE.white,
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  linkSub: { color: BASE.muted, fontSize: 12, marginTop: 2 },
  toolBody: { gap: 12, paddingBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { color: BASE.white, fontSize: 12, fontWeight: '600' },
  scanCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scanResult: { color: BASE.white, flex: 1, fontSize: 14, fontWeight: '600' },
  monthLabel: {
    color: BASE.white,
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  weekHeader: { flexDirection: 'row' },
  weekDay: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    color: BASE.muted,
    fontSize: 11,
    textTransform: 'lowercase',
  },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDay: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  calDayText: { color: BASE.muted, fontSize: 13 },
  calDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  eventRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  eventTitle: { color: BASE.white, fontWeight: '700', fontSize: 14 },
  eventTime: { color: BASE.muted, marginTop: 4, fontSize: 12 },
});
