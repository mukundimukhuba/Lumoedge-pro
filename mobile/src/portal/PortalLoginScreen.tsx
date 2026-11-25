import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  registerMentor,
  validateSignup,
  verifyDemoMentor,
} from '../auth/mentorAuth';
import { useAppState } from '../AppState';
import { postAuthPortalPath } from './portalAccess';
import {
  SAFE_AUTH_INVALID,
  SAFE_REGISTER_FAILED,
  SAFE_RESET_MOCK,
  toSafeUserMessage,
} from './safeErrors';

const BLUE = '#3B82F6';
const CYBER = '#5EC8FF';
const BG = '#03050A';

type Tab = 'login' | 'register';

export function PortalLoginScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const compact = height < 780;
  const { setMentor } = useAppState();
  const [tab, setTab] = useState<Tab>('login');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showSuPw, setShowSuPw] = useState(false);
  const [showSuConfirm, setShowSuConfirm] = useState(false);

  // Never prefill Super Admin or any personal email — empty on open.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [suEmail, setSuEmail] = useState('');
  const [suMentor, setSuMentor] = useState('');
  const [suName, setSuName] = useState('');
  const [suContact, setSuContact] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suConfirm, setSuConfirm] = useState('');

  const loginReady = Boolean(email.trim() && password);
  const registerReady = Boolean(
    suEmail.trim() &&
      suMentor.trim() &&
      suName.trim() &&
      suContact.trim() &&
      suPassword &&
      suConfirm,
  );

  const confirmMismatch = useMemo(() => {
    if (!suConfirm) return false;
    return suPassword !== suConfirm;
  }, [suPassword, suConfirm]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setError('');
    setFieldErrors({});
  };

  const onLogin = async () => {
    setError('');
    setFieldErrors({});
    const fe: Record<string, string> = {};
    if (!email.trim()) fe.email = 'Please enter your email.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      fe.email = 'Please enter a valid email.';
    }
    if (!password) fe.password = 'Please enter your password.';
    if (Object.keys(fe).length) {
      setFieldErrors(fe);
      return;
    }
    setBusy(true);
    try {
      const ok = await verifyDemoMentor(email, password);
      if (!ok) {
        setError(SAFE_AUTH_INVALID);
        return;
      }
      setMentor(ok);
      setPassword('');
      router.replace(postAuthPortalPath(ok));
    } catch (err) {
      setError(toSafeUserMessage(err, 'login'));
    } finally {
      setBusy(false);
    }
  };

  const onRegister = async () => {
    setError('');
    setFieldErrors({});
    const invalid = validateSignup({
      email: suEmail,
      mentorName: suMentor,
      name: suName,
      contact: suContact,
      password: suPassword,
      confirm: suConfirm,
    });
    if (invalid) {
      const safe = toSafeUserMessage(invalid, 'register');
      if (/password/i.test(invalid) && /match/i.test(invalid)) {
        setFieldErrors({ confirm: 'Passwords do not match.' });
      } else if (/email/i.test(invalid)) {
        setFieldErrors({ email: safe });
      } else {
        setError(safe);
      }
      return;
    }
    setBusy(true);
    try {
      const session = await registerMentor({
        email: suEmail,
        mentorName: suMentor,
        name: suName,
        contact: suContact,
        password: suPassword,
      });
      setMentor(session);
      setSuPassword('');
      setSuConfirm('');
      // Exact wait copy lives on /portal/pending — never open portal chrome.
      router.replace('/portal/pending');
    } catch (err) {
      setError(toSafeUserMessage(err, 'register') || SAFE_REGISTER_FAILED);
    } finally {
      setBusy(false);
    }
  };

  const submitDisabled =
    busy ||
    (tab === 'login' ? !loginReady : !registerReady || confirmMismatch);

  return (
    <View style={styles.root} nativeID="portal-root">
      <LinearGradient
        colors={['#04101F', '#03050A', '#050814']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowA} pointerEvents="none" />
      <View style={styles.glowB} pointerEvents="none" />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          compact && styles.scrollCompact,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.brand, compact && styles.brandCompact]}>
          <View style={[styles.logoWrap, compact && styles.logoCompact]}>
            <Image
              source={require('../../assets/mascot.jpg')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={[styles.title, compact && styles.titleCompact]}>
            Mentors Portal
          </Text>
          <Text style={styles.subtitle}>
            Secure mentor access · Super Admin approval required
          </Text>
        </View>

        <View style={[styles.cardShell, compact && styles.cardShellCompact]}>
          <LinearGradient
            colors={[
              'rgba(94,200,255,0.18)',
              'rgba(59,130,246,0.08)',
              'rgba(12,18,32,0.92)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardGlow}
          >
            <View style={styles.card}>
              <View style={styles.tabs}>
                <Pressable
                  onPress={() => switchTab('login')}
                  style={[styles.tab, tab === 'login' && styles.tabOn]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === 'login' }}
                >
                  <Text
                    style={[styles.tabText, tab === 'login' && styles.tabTextOn]}
                  >
                    Login
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => switchTab('register')}
                  style={[styles.tab, tab === 'register' && styles.tabOn]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === 'register' }}
                >
                  <Text
                    style={[
                      styles.tabText,
                      tab === 'register' && styles.tabTextOn,
                    ]}
                  >
                    Register
                  </Text>
                </Pressable>
              </View>

              {error ? (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              ) : null}

              {tab === 'login' ? (
                <View style={styles.form}>
                  <Field
                    label="EMAIL *"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Enter your email"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    textContentType="username"
                    autoComplete="email"
                    editable={!busy}
                    error={fieldErrors.email}
                  />
                  <Field
                    label="PASSWORD *"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    secureTextEntry={!showPw}
                    textContentType="password"
                    autoComplete="password"
                    editable={!busy}
                    error={fieldErrors.password}
                    right={
                      <Pressable
                        onPress={() => setShowPw((v) => !v)}
                        hitSlop={8}
                        accessibilityLabel={
                          showPw ? 'Hide password' : 'Show password'
                        }
                      >
                        <Ionicons
                          name={showPw ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color="#9CA3AF"
                        />
                      </Pressable>
                    }
                  />
                  <Pressable
                    onPress={() => setError(SAFE_RESET_MOCK)}
                    disabled={busy}
                  >
                    <Text style={styles.forgot}>Forgot your password?</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.primary,
                      submitDisabled && styles.primaryDisabled,
                    ]}
                    onPress={() => void onLogin()}
                    disabled={submitDisabled}
                    accessibilityRole="button"
                  >
                    {busy ? (
                      <ActivityIndicator color="#041018" />
                    ) : (
                      <Text style={styles.primaryText}>Login</Text>
                    )}
                  </Pressable>
                </View>
              ) : (
                <View style={styles.form}>
                  <Field
                    label="EMAIL *"
                    value={suEmail}
                    onChangeText={setSuEmail}
                    placeholder="Enter your email"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    editable={!busy}
                    error={fieldErrors.email}
                  />
                  <Field
                    label="MENTOR NAME *"
                    value={suMentor}
                    onChangeText={setSuMentor}
                    placeholder="Mentor display name"
                    editable={!busy}
                  />
                  <Field
                    label="NAME *"
                    value={suName}
                    onChangeText={setSuName}
                    placeholder="Full name"
                    editable={!busy}
                  />
                  <Field
                    label="CONTACT NUMBER *"
                    value={suContact}
                    onChangeText={setSuContact}
                    placeholder="Phone"
                    keyboardType="phone-pad"
                    editable={!busy}
                  />
                  <Field
                    label="PASSWORD *"
                    value={suPassword}
                    onChangeText={setSuPassword}
                    placeholder="Create password"
                    secureTextEntry={!showSuPw}
                    editable={!busy}
                    right={
                      <Pressable
                        onPress={() => setShowSuPw((v) => !v)}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={showSuPw ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color="#9CA3AF"
                        />
                      </Pressable>
                    }
                  />
                  <Field
                    label="CONFIRM PASSWORD *"
                    value={suConfirm}
                    onChangeText={setSuConfirm}
                    placeholder="Confirm password"
                    secureTextEntry={!showSuConfirm}
                    editable={!busy}
                    error={
                      confirmMismatch
                        ? 'Passwords do not match.'
                        : fieldErrors.confirm
                    }
                    right={
                      <Pressable
                        onPress={() => setShowSuConfirm((v) => !v)}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={
                            showSuConfirm ? 'eye-off-outline' : 'eye-outline'
                          }
                          size={18}
                          color="#9CA3AF"
                        />
                      </Pressable>
                    }
                  />
                  <Pressable
                    style={[
                      styles.primary,
                      submitDisabled && styles.primaryDisabled,
                    ]}
                    onPress={() => void onRegister()}
                    disabled={submitDisabled}
                    accessibilityRole="button"
                  >
                    {busy ? (
                      <ActivityIndicator color="#041018" />
                    ) : (
                      <Text style={styles.primaryText}>Submit</Text>
                    )}
                  </Pressable>
                </View>
              )}
            </View>
          </LinearGradient>
        </View>

        <Text style={styles.powered}>Edges · Lumo Edge Pro</Text>
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  right,
  error,
  ...rest
}: {
  label: string;
  right?: ReactNode;
  error?: string;
} & ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
        <TextInput
          placeholderTextColor="#6B7280"
          style={styles.input}
          autoCorrect={false}
          {...rest}
        />
        {right}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, maxWidth: '100%', overflow: 'hidden' },
  glowA: {
    position: 'absolute',
    top: -80,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(59,130,246,0.16)',
  },
  glowB: {
    position: 'absolute',
    bottom: 40,
    left: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(94,200,255,0.08)',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 28,
    flexGrow: 1,
    justifyContent: 'center',
  },
  scrollCompact: {
    paddingTop: 10,
    paddingBottom: 16,
    justifyContent: 'flex-start',
  },
  brand: { alignItems: 'center', marginBottom: 14 },
  brandCompact: { marginBottom: 8 },
  logoWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(94,200,255,0.55)',
    marginBottom: 8,
    backgroundColor: '#000000',
  },
  logoCompact: { width: 40, height: 40, borderRadius: 12, marginBottom: 6 },
  logo: { width: '100%', height: '100%' },
  title: {
    color: CYBER,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  titleCompact: { fontSize: 18 },
  subtitle: {
    marginTop: 4,
    color: '#9CA3AF',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: 280,
    paddingHorizontal: 8,
  },
  cardShell: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  cardShellCompact: { maxWidth: 400 },
  cardGlow: {
    borderRadius: 18,
    padding: 1,
  },
  card: {
    backgroundColor: 'rgba(10,14,24,0.88)',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(94,200,255,0.22)',
    padding: 14,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(3,5,10,0.9)',
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
  },
  tab: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  tabOn: { backgroundColor: BLUE },
  tabText: { color: '#9CA3AF', fontWeight: '700', fontSize: 14 },
  tabTextOn: { color: '#041018' },
  error: {
    color: '#FCA5A5',
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 16,
  },
  form: { gap: 10 },
  field: { gap: 4 },
  label: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 11,
    backgroundColor: 'rgba(5,8,14,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(55,65,81,0.9)',
    paddingHorizontal: 11,
    minHeight: 42,
  },
  inputRowError: { borderColor: 'rgba(248,113,113,0.7)' },
  input: {
    flex: 1,
    color: '#fff',
    paddingVertical: 9,
    fontSize: 16, // iOS Safari zooms inputs under 16px
    minWidth: 0,
  },
  fieldError: { color: '#FCA5A5', fontSize: 11 },
  forgot: {
    color: CYBER,
    textDecorationLine: 'underline',
    fontSize: 12,
    alignSelf: 'flex-start',
  },
  primary: {
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 2,
    minHeight: 44,
    justifyContent: 'center',
    shadowColor: CYBER,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  primaryDisabled: { opacity: 0.45 },
  primaryText: {
    color: '#041018',
    fontWeight: '800',
    fontSize: 15,
  },
  powered: {
    marginTop: 12,
    color: '#4B5563',
    fontSize: 11,
    textAlign: 'center',
  },
});
