import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, Send, BarChart3, FlaskConical,
  Linkedin, Activity, Settings, UserCheck, Users, Mail, Inbox,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/conversations', label: 'Conversations', icon: MessageSquare },
  { to: '/outbound', label: 'Outbound', icon: Send },
  { to: '/buyer-outreach', label: 'Buyer Outreach', icon: Inbox },
  { to: '/automail', label: 'Campaigns', icon: Mail },
  { to: '/linkedin', label: 'LinkedIn Queue', icon: Linkedin },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/ab-tests', label: 'A/B Tests', icon: FlaskConical },
  { to: '/handoff', label: 'Handoff Queue', icon: UserCheck },
  { to: '/buyers', label: 'Buyer Intelligence', icon: Users },
  { to: '/health', label: 'Health', icon: Activity },
];

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-5 border-b border-gray-800">
          <h1 className="text-lg font-bold text-white tracking-tight">
            Aaziko AI
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Communicator Dashboard</p>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-3">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-400 font-medium'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <NavLink
            to="/settings"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
          >
            <Settings size={18} />
            Settings
          </NavLink>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
