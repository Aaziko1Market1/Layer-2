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

// Points to the deployed Layer-2 AI service at ai.aaziko.com
const API_URL = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
  ? 'https://ai.aaziko.com/api/support-chat'
  : '/api/support-chat';

export default function AdminSupportChat() {
  return (
    <SupportChat
      defaultRole="admin"
      title="Admin Support"
      position="bottom-left"
      apiBase={API_URL}
    />
  );
}
