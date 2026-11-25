/**
 * Mentors / Super Admin portal visual tokens.
 * UI-only — no auth/payments/backend coupling.
 */
import { Platform, type ViewStyle } from 'react-native';

export const PORTAL_BG = '#05070D';
export const PORTAL_SURFACE = 'rgba(12, 16, 28, 0.78)';
export const PORTAL_SURFACE_SOLID = '#0C101C';
export const CYAN = '#5EC8FF';
export const PURPLE = '#7C5CFF';
export const BLUE = '#3B82F6';
export const GLOW_BORDER = 'rgba(94, 200, 255, 0.28)';
export const GLOW_BORDER_STRONG = 'rgba(124, 92, 255, 0.45)';

/** iOS Safari auto-zooms focused inputs under 16px. */
export const INPUT_FONT_SIZE = 16;

/** Persistent desktop sidebar breakpoint (px). */
export const DESKTOP_SIDEBAR_MIN = 768;

const webGlassExtras =
  Platform.OS === 'web'
    ? ({
        // RN-web CSS extras (not in RN ViewStyle typings)
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow:
          '0 0 24px rgba(94,200,255,0.08), inset 0 1px 0 rgba(255,255,255,0.04)',
      } as unknown as ViewStyle)
    : ({
        shadowColor: CYAN,
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 0 },
      } as ViewStyle);

export const glassCard: ViewStyle = {
  backgroundColor: PORTAL_SURFACE,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: GLOW_BORDER,
  padding: 12,
  gap: 4,
  ...webGlassExtras,
};
