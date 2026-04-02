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

// Points to the deployed Layer-2 AI service at ai.aaziko.com
const API_URL = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
  ? 'https://ai.aaziko.com/api/support-chat'
  : '/api/support-chat';

export default function VendorSupportChat() {
  return (
    <SupportChat
      defaultRole="seller"
      title="Vendor Support"
      position="bottom-right"
      apiBase={API_URL}
    />
  );
}
