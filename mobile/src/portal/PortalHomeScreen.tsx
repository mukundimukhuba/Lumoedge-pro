import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAppState } from '../AppState';
import { ManageEasPanel } from './ManageEasPanel';
import { LicenseKeysPanel } from './LicenseKeysPanel';
import { ProfilePanel } from './ProfilePanel';
import { CommissionPanel } from './panels/CommissionPanel';
import { DashboardPanel } from './panels/DashboardPanel';
import { MentorsPanel } from './panels/MentorsPanel';
import { SelfHostingPanel } from './panels/SelfHostingPanel';
import { SettingsBrokersPanel } from './panels/SettingsBrokersPanel';
import { SignalDirectionPanel } from './panels/SignalDirectionPanel';
import { SubscriptionsPanel } from './panels/SubscriptionsPanel';
import { TopMentorsPanel } from './panels/TopMentorsPanel';
import {
  defaultSectionForSession,
  isPortalUnlocked,
  isSuperAdminEmail,
  navForSession,
  resolvePortalRole,
  type NavId,
} from './portalAccess';
import {
  CYAN,
  DESKTOP_SIDEBAR_MIN,
  GLOW_BORDER,
  PORTAL_BG,
  PORTAL_SURFACE_SOLID,
  PURPLE,
} from './portalTheme';

export function PortalHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const { width } = useWindowDimensions();
  const { mentor, setMentor, accent, setAccent } = useAppState();
  const [menuOpen, setMenuOpen] = useState(false);
  const [section, setSection] = useState<NavId>('dashboard');

  const isDesktop = width >= DESKTOP_SIDEBAR_MIN;
  const navItems = useMemo(
    () => navForSession({ email: mentor?.email, role: mentor?.role }),
    [mentor?.email, mentor?.role],
  );
  const isAdmin = isSuperAdminEmail(mentor?.email);
  const portalRole = resolvePortalRole(mentor?.email, mentor?.role);
  const unlocked = Boolean(
    mentor && isPortalUnlocked(mentor.status, mentor.email, mentor.role),
  );

  useEffect(() => {
    if (!mentor) {
      router.replace('/portal');
      return;
    }
    if (!isPortalUnlocked(mentor.status, mentor.email, mentor.role)) {
      router.replace('/portal/pending');
    }
  }, [mentor, router]);

  useEffect(() => {
    if (!mentor || !unlocked) return;
    const next = defaultSectionForSession(
      { email: mentor.email, role: mentor.role },
      String(params.section || ''),
    );
    setSection(next);
    const requested = String(params.section || '');
    if (requested && requested !== next) {
      router.setParams({ section: next });
    }
  }, [params.section, mentor, router, unlocked]);

  // Close overlay drawer when crossing into desktop layout.
  useEffect(() => {
    if (isDesktop) setMenuOpen(false);
  }, [isDesktop]);

  // Hard stop: never render Menu / sections for pending mentors.
  if (!mentor || !unlocked) {
    return <View style={styles.root} />;
  }

  const logout = () => {
    setMentor(null);
    router.replace('/portal');
  };

  const goSection = (id: NavId) => {
    if (!navItems.some((n) => n.id === id)) return;
    setSection(id);
    setMenuOpen(false);
    router.setParams({ section: id });
  };

  const cornerLogo = require('../../assets/app-corner-logo.jpg');

  const navList = (
    <>
      {navItems.map((item) => {
        const on = section === item.id;
        if (on) {
          return (
            <Pressable
              key={item.id}
              onPress={() => goSection(item.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: true }}
            >
              <LinearGradient
                colors={[PURPLE, BLUE_GRAD]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.navItemOn}
              >
                <Text style={styles.navTextOn}>{item.label}</Text>
              </LinearGradient>
            </Pressable>
          );
        }
        return (
          <Pressable
            key={item.id}
            onPress={() => goSection(item.id)}
            style={styles.navItem}
            accessibilityRole="button"
          >
            <Text style={styles.navText}>{item.label}</Text>
          </Pressable>
        );
      })}
      <View style={styles.sep} />
      <Pressable
        onPress={() => {
          setMenuOpen(false);
          logout();
        }}
        style={styles.navItem}
        accessibilityRole="button"
        accessibilityLabel="Logout"
      >
        <Text style={styles.logout}>Logout</Text>
      </Pressable>
    </>
  );

  const sidebarHead = (
    <View style={styles.drawerHead}>
      <Image source={cornerLogo} style={styles.avatar} resizeMode="cover" />
      <Text style={styles.userName} numberOfLines={1}>
        {mentor.mentorName || mentor.name}
      </Text>
      {!isDesktop ? (
        <Pressable
          onPress={() => setMenuOpen(false)}
          style={styles.headBtn}
          accessibilityLabel="close menu"
          hitSlop={6}
        >
          <Ionicons name="close" size={18} color="#E5E7EB" />
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => setAccent(accent === '#FF0000' ? '#3EE0FF' : '#FF0000')}
        style={styles.headBtn}
        accessibilityLabel="toggle theme"
        hitSlop={6}
      >
        <Ionicons name="sunny-outline" size={18} color="#E5E7EB" />
      </Pressable>
    </View>
  );

  return (
    <View style={styles.root} nativeID="portal-root">
      <View style={[styles.shell, isDesktop && styles.shellDesktop]}>
        {isDesktop ? (
          <View style={styles.desktopSidebar} accessibilityViewIsModal={false}>
            {sidebarHead}
            <Text style={styles.drawerBrand}>Edges Mentors Portal</Text>
            <ScrollView
              style={styles.navScroll}
              contentContainerStyle={styles.navScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {navList}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.mainCol}>
          <View style={styles.topBar}>
            {!isDesktop ? (
              <Pressable
                onPress={() => setMenuOpen(true)}
                style={styles.menuOpener}
                accessibilityRole="button"
                accessibilityLabel="Open Edges Mentors Portal menu"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <View style={styles.logoBtn}>
                  <Image
                    source={cornerLogo}
                    style={styles.cornerLogo}
                    resizeMode="cover"
                  />
                </View>
                <View style={styles.menuLabelWrap}>
                  <Text style={styles.menuLabel}>Menu</Text>
                  <Ionicons name="chevron-forward" size={14} color={CYAN} />
                </View>
              </Pressable>
            ) : (
              <View style={styles.desktopBrandWrap}>
                <Text style={styles.desktopBrand}>Edges Mentors Portal</Text>
              </View>
            )}
            <Text style={styles.topTitle}>Mentors Portal</Text>
            <Pressable
              onPress={() => router.replace('/')}
              style={styles.iconBtn}
              accessibilityLabel="back to ea"
            >
              <Ionicons name="phone-portrait-outline" size={20} color="#E5E7EB" />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={[
              styles.content,
              isDesktop && styles.contentDesktop,
            ]}
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.h1, isDesktop && styles.h1Desktop]}>
              {navItems.find((n) => n.id === section)?.label || 'Dashboard'}
            </Text>
            <Text style={styles.meta}>
              Signed in as {mentor.name || mentor.mentorName} · {mentor.email}
              {isAdmin
                ? ' · Super admin'
                : portalRole === 'regular_admin'
                  ? ' · Regular admin'
                  : ' · Mentor'}
            </Text>
            <Text style={styles.brandLine}>Edges · Lumo Edge Pro</Text>

            {section === 'dashboard' ? (
              <DashboardPanel />
            ) : section === 'mentors' && isAdmin ? (
              <MentorsPanel />
            ) : section === 'subscriptions' && isAdmin ? (
              <SubscriptionsPanel />
            ) : section === 'top-mentors' && isAdmin ? (
              <TopMentorsPanel />
            ) : section === 'manage-eas' ? (
              <ManageEasPanel />
            ) : section === 'license-keys' ? (
              <LicenseKeysPanel />
            ) : section === 'profile' ? (
              <ProfilePanel mentor={mentor} />
            ) : section === 'settings' && isAdmin ? (
              <SettingsBrokersPanel />
            ) : section === 'mentor-commission' && isAdmin ? (
              <CommissionPanel />
            ) : section === 'self-hosting' ? (
              <SelfHostingPanel />
            ) : section === 'add-signal-direction' ? (
              <SignalDirectionPanel />
            ) : (
              <Text style={styles.meta}>
                You do not have access to this section.
              </Text>
            )}
          </ScrollView>
        </View>
      </View>

      {!isDesktop ? (
        <Modal
          visible={menuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuOpen(false)}
          statusBarTranslucent
        >
          <View style={styles.drawerRoot}>
            <Pressable
              style={styles.drawerScrim}
              onPress={() => setMenuOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close menu"
            />
            <View style={styles.drawer} accessibilityViewIsModal>
              {sidebarHead}
              <Text style={styles.drawerBrand}>Edges Mentors Portal</Text>
              <ScrollView
                style={styles.navScroll}
                contentContainerStyle={styles.navScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {navList}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const BLUE_GRAD = '#3B82F6';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PORTAL_BG,
    maxWidth: '100%',
    ...(Platform.OS === 'web'
      ? ({ overflowX: 'hidden' } as object)
      : { overflow: 'hidden' }),
  },
  shell: { flex: 1, maxWidth: '100%' },
  shellDesktop: { flexDirection: 'row' },
  mainCol: { flex: 1, minWidth: 0, maxWidth: '100%' },
  topBar: {
    zIndex: 60,
    elevation: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 52,
    paddingBottom: 12,
    backgroundColor: PORTAL_BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GLOW_BORDER,
  },
  topTitle: {
    color: '#F9FAFB',
    fontWeight: '800',
    fontSize: 15,
    flexShrink: 1,
    textAlign: 'center',
  },
  desktopBrandWrap: { minWidth: 120, maxWidth: '40%' },
  desktopBrand: {
    color: CYAN,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(21,26,36,0.9)',
    borderWidth: 1,
    borderColor: GLOW_BORDER,
  },
  menuOpener: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingRight: 8,
    paddingVertical: 2,
    borderRadius: 14,
    backgroundColor: 'rgba(94,200,255,0.12)',
    borderWidth: 1.5,
    borderColor: CYAN,
    maxWidth: '46%',
  },
  logoBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A1220',
    overflow: 'hidden',
  },
  cornerLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  menuLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingRight: 6,
  },
  menuLabel: {
    color: '#E0F2FE',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  scroll: { flex: 1, zIndex: 1, maxWidth: '100%' },
  content: {
    padding: 16,
    gap: 8,
    paddingBottom: 40,
    paddingTop: 12,
    maxWidth: '100%',
  },
  contentDesktop: { paddingHorizontal: 28, maxWidth: 960 },
  h1: { color: '#fff', fontSize: 22, fontWeight: '800' },
  h1Desktop: { fontSize: 26 },
  meta: { color: '#9CA3AF', fontSize: 13 },
  brandLine: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  desktopSidebar: {
    width: 260,
    maxWidth: 280,
    height: '100%',
    backgroundColor: PORTAL_SURFACE_SOLID,
    paddingTop: 56,
    paddingHorizontal: 14,
    borderRightWidth: 1,
    borderRightColor: GLOW_BORDER,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '4px 0 28px rgba(94,200,255,0.06)',
        } as object)
      : null),
  },
  drawerRoot: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'transparent',
  },
  drawerScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  drawer: {
    width: '82%',
    maxWidth: 340,
    height: '100%',
    backgroundColor: PORTAL_SURFACE_SOLID,
    paddingTop: 56,
    paddingHorizontal: 14,
    borderRightWidth: 1,
    borderRightColor: GLOW_BORDER,
    zIndex: 2,
    elevation: 24,
    shadowColor: CYAN,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 4, height: 0 },
  },
  drawerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CYAN,
    backgroundColor: '#000000',
  },
  userName: {
    flex: 1,
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  headBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CYAN,
    backgroundColor: 'rgba(94,200,255,0.08)',
  },
  drawerBrand: {
    color: CYAN,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 14,
    marginLeft: 2,
  },
  navScroll: { flex: 1 },
  navScrollContent: { paddingBottom: 28 },
  navItem: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 4,
  },
  navItemOn: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(94,200,255,0.55)',
  },
  navText: { color: '#F3F4F6', fontSize: 15, fontWeight: '500' },
  navTextOn: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2A3140',
    marginVertical: 12,
    marginHorizontal: 4,
  },
  logout: { color: '#FF3B3B', fontSize: 15, fontWeight: '800' },
});
