import { useEffect, useState } from 'react';
import { api } from '../api/client';
import {
  MessageSquare, Send, AlertTriangle, Users, TrendingUp, Activity,
} from 'lucide-react';

interface Stats {
  infrastructure: { qdrant: boolean; redis: boolean; mongo: boolean };
  today: Record<string, number>;
  weeklyReplyRates: Record<string, number>;
  activeChatSessions: number;
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: any; color: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-400">{label}</span>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={18} />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

export default function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.getStats(), api.getAlerts()])
      .then(([s, a]) => { setStats(s); setAlerts(a.alerts); })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300">
          Failed to load dashboard: {error}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="animate-pulse text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  const today = stats.today;
  const sent = today.message_sent || 0;
  const replied = today.message_replied || 0;
  const handoffs = today.handoff_triggered || 0;
  const flagged = today.compliance_flagged || 0;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard Overview</h2>
        <p className="text-sm text-gray-500 mt-1">Real-time AI communicator metrics</p>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <div key={i} className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-3 flex items-center gap-3">
              <AlertTriangle size={16} className="text-amber-400 shrink-0" />
              <span className="text-sm text-amber-300">{alert}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Messages Sent Today" value={sent} icon={Send} color="bg-indigo-600/20 text-indigo-400" />
        <StatCard label="Replies Today" value={replied} icon={MessageSquare} color="bg-green-600/20 text-green-400" />
        <StatCard label="Handoffs Today" value={handoffs} icon={Users} color="bg-amber-600/20 text-amber-400" />
        <StatCard label="Compliance Flags" value={flagged} icon={AlertTriangle} color="bg-red-600/20 text-red-400" />
      </div>

      {/* Reply rates by channel */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp size={18} className="text-indigo-400" />
          Weekly Reply Rates by Channel
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Object.entries(stats.weeklyReplyRates).map(([channel, rate]) => (
            <div key={channel} className="bg-gray-800/50 rounded-lg p-4">
              <p className="text-sm text-gray-400 capitalize mb-1">{channel}</p>
              <p className="text-xl font-bold text-white">{rate}%</p>
              <div className="mt-2 w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-indigo-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(rate, 100)}%` }}
                />
              </div>
            </div>
          ))}
          {Object.keys(stats.weeklyReplyRates).length === 0 && (
            <p className="text-gray-500 text-sm col-span-4">No reply data yet</p>
          )}
        </div>
      </div>

      {/* Infrastructure health */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Activity size={18} className="text-green-400" />
          Infrastructure Status
        </h3>
        <div className="flex gap-6">
          {Object.entries(stats.infrastructure).map(([service, healthy]) => (
            <div key={service} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${healthy ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-300 capitalize">{service}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-indigo-500" />
            <span className="text-sm text-gray-300">
              {stats.activeChatSessions} active chat sessions
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
