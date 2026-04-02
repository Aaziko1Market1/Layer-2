/**
 * BuyerSupportChat
 * Drop this into any Buyer / Importer panel.
 * Role is locked to "buyer" — no switcher shown.
 * Widget appears bottom-right by default.
 *
 * Usage:
 *   import BuyerSupportChat from '@/components/BuyerSupportChat';
 *   <BuyerSupportChat />
 */
import SupportChat from './SupportChat';

// Points to the deployed Layer-2 AI service at ai.aaziko.com
const API_URL = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
  ? 'http://ai-communicator.43.249.231.93.sslip.io/api/support-chat'
  : '/api/support-chat';

export default function BuyerSupportChat() {
  return (
    <SupportChat
      defaultRole="buyer"
      title="Buyer Support"
      position="bottom-right"
      apiBase={API_URL}
    />
  );
}
