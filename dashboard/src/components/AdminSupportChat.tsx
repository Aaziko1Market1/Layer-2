/**
 * AdminSupportChat
 * Drop this into the Admin / Operator Dashboard.
 * Role is locked to "admin" — no switcher shown.
 * Widget appears bottom-left to avoid overlap with other admin controls.
 *
 * Usage:
 *   import AdminSupportChat from '@/components/AdminSupportChat';
 *   <AdminSupportChat />
 */
import SupportChat from './SupportChat';

export default function AdminSupportChat() {
  return (
    <SupportChat
      defaultRole="admin"
      title="Admin Support"
      position="bottom-left"
    />
  );
}
