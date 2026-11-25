import { Stack } from 'expo-router';
import { usePortalAuthGate } from '../../src/portal/usePortalAuthGate';

/**
 * Portal stack — auth gate runs for every /portal/* route
 * (login, pending, dashboard). Pending mentors cannot stay on dashboard.
 */
export default function PortalLayout() {
  usePortalAuthGate();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#05070D' },
      }}
    />
  );
}
