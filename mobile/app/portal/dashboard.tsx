import { PortalHomeScreen } from '../../src/portal/PortalHomeScreen';
import { usePortalAuthGate } from '../../src/portal/usePortalAuthGate';

export default function PortalDashboardRoute() {
  usePortalAuthGate();
  return <PortalHomeScreen />;
}
