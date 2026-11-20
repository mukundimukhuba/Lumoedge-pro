import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppState } from './AppState';
import { normalizeLicenseKey } from './licenseStorage';
import { TripleTapLogo } from './TripleTapLogo';

const RED = '#FF0000';
const BG = '#000000';

/**
 * After Lumo Edge Pro $35 access — require a mentor-issued license key
 * before opening EA control. Activating syncs that EA's name / picture / symbols.
 *
 * Keys resolve from this device catalog OR cloud (/api/licenses/lookup) so
 * Generate on one browser → Activate on any device worldwide.
 */
export function LicenseActivateScreen() {
  const insets = useSafeAreaInsets();
  const { activateLicenseKey, refreshLicenseCatalog, licenseKeys } =
    useAppState();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Pull latest keys (local + cloud merge).
  useEffect(() => {
    void refreshLicenseCatalog();
  }, [refreshLicenseCatalog]);

  // RN-web Stack card defaults to #f2f2f2 — paint it black so no white top strip.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const paint = () => {
      document.querySelectorAll('div').forEach((el) => {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg === 'rgb(242, 242, 242)' || bg === 'rgb(255, 255, 255)') {
          (el as HTMLElement).style.setProperty(
            'background-color',
            '#000000',
            'important',
          );
        }
      });
    };
    paint();
    const id = window.setInterval(paint, 400);
    return () => window.clearInterval(id);
  }, []);

  const runActivate = async (raw: string) => {
    setError('');
    setBusy(true);
    try {
      const result = await activateLicenseKey(raw);
      if (!result.ok) setError(result.error);
    } finally {
      setBusy(false);
    }
  };

  const onActivate = () => {
    void runActivate(key);
  };

  const onPickIssued = (issued: string) => {
    const canonical = normalizeLicenseKey(issued);
    setKey(canonical);
    void runActivate(canonical);
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: BG }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: Math.max(insets.top, 24) + 24,
              paddingBottom: Math.max(insets.bottom, 24) + 16,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          overScrollMode="never"
        >
          <TripleTapLogo size={96} borderColor={RED} />
          <Text style={styles.heading}>
            Enter your license key to activate your Expert Advisor and unlock
            your trading experience.
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>LICENSE KEY</Text>
            <TextInput
              style={styles.input}
              value={key}
              onChangeText={(t) => setKey(normalizeLicenseKey(t))}
              placeholder="EDGES-XXXX-XXXX-XXXX-XXXX"
              placeholderTextColor="#6B7280"
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              editable={!busy}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              style={({ pressed }) => [
                styles.cta,
                pressed && { opacity: 0.85 },
                busy && { opacity: 0.6 },
              ]}
              onPress={onActivate}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Activate EA"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText}>Activate EA</Text>
              )}
            </Pressable>

            {licenseKeys.length > 0 ? (
              <View style={styles.issuedBox}>
                <Text style={styles.issuedLabel}>
                  KEYS ON THIS DEVICE — tap to activate
                </Text>
                {licenseKeys.map((k) => (
                  <Pressable
                    key={k.id}
                    style={({ pressed }) => [
                      styles.issuedRow,
                      pressed && { opacity: 0.85 },
                      busy && { opacity: 0.55 },
                    ]}
                    onPress={() => onPickIssued(k.key)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`Activate ${k.eaName} with ${k.key}`}
                  >
                    <Text style={styles.issuedEa}>{k.eaName}</Text>
                    <Text style={styles.issuedKey} selectable>
                      {normalizeLicenseKey(k.key)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Text style={styles.fine}>
              Your license key is provided by your mentor. Works on any device
              once synced to the cloud.
              {licenseKeys.length > 0
                ? ` ${licenseKeys.length} key(s) cached on this device.`
                : ''}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    ...Platform.select({
      web: { minHeight: '100%' as unknown as number },
      default: {},
    }),
  },
  scrollView: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BG,
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 30,
    textAlign: 'center',
    marginBottom: 36,
  },
  form: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    gap: 8,
  },
  label: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: '#12151C',
    borderWidth: 1,
    borderColor: '#2A2F3A',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.5,
  },
  error: { color: '#FF6B6B', fontSize: 13, marginTop: 4, lineHeight: 18 },
  cta: {
    marginTop: 14,
    backgroundColor: RED,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  ctaText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  issuedBox: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#2A2F3A',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: '#0B0D12',
  },
  issuedLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  issuedRow: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  issuedEa: { color: '#E5E7EB', fontWeight: '700', fontSize: 13 },
  issuedKey: {
    color: '#fff',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    letterSpacing: 0.4,
  },
  fine: {
    marginTop: 14,
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
