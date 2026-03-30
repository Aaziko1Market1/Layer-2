import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { UserCheck, Clock, AlertTriangle, ArrowRight, RotateCcw } from 'lucide-react';

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-900/30 text-red-400 border-red-800',
  medium: 'bg-amber-900/30 text-amber-400 border-amber-800',
  low: 'bg-gray-800 text-gray-400 border-gray-700',
};


export default function HandoffQueue() {
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState('pending');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const data = await api.getHandoffQueue(filter);
      setItems(data);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const handleAccept = async (id: string) => {
    try {
      await api.acceptHandoff(id);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleReturn = async (id: string) => {
    try {
      await api.returnHandoff(id);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const timeSince = (dateStr: string) => {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    return `${Math.floor(mins / 1440)}d`;
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <UserCheck size={24} className="text-amber-400" />
            Handoff Queue
          </h2>
          <p className="text-sm text-gray-500 mt-1">Conversations requiring human intervention</p>
        </div>
        <div className="flex gap-2">
          {['pending', 'accepted', 'returned'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item._id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-medium text-white">{item.buyerName}</span>
                  <span className="text-xs text-gray-500">{item.country}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.low}`}>
                    {item.priority}
                  </span>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock size={10} /> {timeSince(item.created_at)} in queue
                  </span>
                </div>

                <div className="flex items-start gap-2 mb-3">
                  <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-300">{item.reason}</p>
                </div>

                {item.contextSummary && (
                  <p className="text-xs text-gray-500 bg-gray-800/50 rounded-lg p-3 mb-3">
                    {item.contextSummary}
                  </p>
                )}

                {item.assignedTo && (
                  <p className="text-xs text-gray-500">
                    Assigned to: <span className="text-gray-300">{item.assignedTo}</span>
                  </p>
                )}
              </div>

              <div className="flex gap-2 ml-4 shrink-0">
                {item.status === 'pending' && (
                  <button
                    onClick={() => handleAccept(item._id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-900/30 border border-green-800 text-green-400 rounded-lg text-xs hover:bg-green-900/50 transition-colors"
                  >
                    <ArrowRight size={12} /> Accept
                  </button>
                )}
                {item.status === 'accepted' && (
                  <button
                    onClick={() => handleReturn(item._id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg text-xs hover:bg-gray-700 transition-colors"
                  >
                    <RotateCcw size={12} /> Return to AI
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
            <UserCheck size={48} className="mx-auto mb-3 text-gray-600" />
            <p className="text-gray-500">No {filter} handoffs</p>
          </div>
        )}
      </div>
    </div>
  );
}
