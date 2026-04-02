/**
 * VendorSupportChat
 * Drop this into any Vendor / Seller panel.
 * Role is locked to "seller" — no switcher shown.
 * Widget appears bottom-right by default.
 *
 * Usage:
 *   import VendorSupportChat from '@/components/VendorSupportChat';
 *   <VendorSupportChat />
 */
import SupportChat from './SupportChat';

export default function VendorSupportChat() {
  return (
    <SupportChat
      defaultRole="seller"
      title="Vendor Support"
      position="bottom-right"
    />
  );
}
