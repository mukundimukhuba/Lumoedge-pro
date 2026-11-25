import { PortalLoginScreen } from '../../src/portal/PortalLoginScreen';
import { usePortalAuthGate } from '../../src/portal/usePortalAuthGate';

export default function PortalLoginRoute() {
  usePortalAuthGate();
  return <PortalLoginScreen />;
}
