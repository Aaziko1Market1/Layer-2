import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { BarChart3, TrendingUp, RefreshCw } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts';

export default function Analytics() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [replyRates, setReplyRates] = useState<Record<string, number>>({});
  const [trend, setTrend] = useState<any[]>([]);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [c, rr, t] = await Promise.all([
        api.getEventCounts(period),
        api.getReplyRates({ period }),
        api.getReplyRatesTrend('daily', 30),
      ]);
      setCounts(c);
      setReplyRates(rr);
      setTrend(t.map((item: any) => ({
        date: item.date_key || new Date(item.aggregated_at).toLocaleDateString(),
        ...item.rates,
      })));
    } catch {
      // Dashboard may be offline
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [period]);

  const eventData = Object.entries(counts).map(([name, count]) => ({
    name: name.replace('_', ' '),
    count,
  }));

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 size={24} className="text-indigo-400" />
            Analytics
          </h2>
          <p className="text-sm text-gray-500 mt-1">Message performance and engagement metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {(['daily', 'weekly', 'monthly'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  period === p
                    ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-700'
                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            className="p-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:bg-gray-700 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Event counts bar chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Event Counts ({period})</h3>
        {eventData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={eventData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#f3f4f6' }}
                itemStyle={{ color: '#818cf8' }}
              />
              <Bar dataKey="count" fill="#818cf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 text-sm py-8 text-center">No event data for this period</p>
        )}
      </div>

      {/* Reply rates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-green-400" />
            Reply Rates by Channel
          </h3>
          <div className="space-y-4">
            {Object.entries(replyRates).map(([channel, rate]) => (
              <div key={channel}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-300 capitalize">{channel}</span>
                  <span className="text-sm font-medium text-white">{rate}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all ${
                      rate >= 20 ? 'bg-green-500' : rate >= 10 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(rate, 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {Object.keys(replyRates).length === 0 && (
              <p className="text-gray-500 text-sm">No reply data yet</p>
            )}
          </div>
        </div>

        {/* Trend chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">30-Day Reply Rate Trend</h3>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#f3f4f6' }}
                />
                <Line type="monotone" dataKey="email" stroke="#818cf8" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="whatsapp" stroke="#34d399" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="linkedin" stroke="#60a5fa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-sm py-8 text-center">No trend data available</p>
          )}
        </div>
      </div>
    </div>
  );
}
