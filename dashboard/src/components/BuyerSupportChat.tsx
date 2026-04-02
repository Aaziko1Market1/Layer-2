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

export default function BuyerSupportChat() {
  return (
    <SupportChat
      defaultRole="buyer"
      title="Buyer Support"
      position="bottom-right"
    />
  );
}
