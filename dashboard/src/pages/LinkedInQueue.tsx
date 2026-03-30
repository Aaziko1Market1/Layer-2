import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Linkedin, Check, SkipForward, Clock, ExternalLink } from 'lucide-react';

export default function LinkedInQueue() {
  const [items, setItems] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [error, setError] = useState('');

  const load = () => {
    api.getLinkedInOutbox({ status: statusFilter })
      .then(setItems)
      .catch((e) => setError(e.message));
  };

  useEffect(() => { load(); }, [statusFilter]);

  const handleSent = async (id: string) => {
    await api.markLinkedInSent(id);
    load();
  };

  const handleSkip = async (id: string) => {
    await api.markLinkedInSkip(id);
    load();
  };

  const typeColors: Record<string, string> = {
    connection_request: 'bg-blue-900/30 text-blue-400',
    message: 'bg-indigo-900/30 text-indigo-400',
    follow_up: 'bg-purple-900/30 text-purple-400',
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Linkedin size={24} className="text-blue-400" />
            LinkedIn Outbox
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Review AI-generated LinkedIn messages before sending manually.
          </p>
        </div>
        <div className="flex gap-2">
          {['pending', 'sent', 'skipped', 'responded'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                statusFilter === s
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-700'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
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

      {items.length === 0 && !error && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Clock size={48} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-500">No {statusFilter} messages in the outbox</p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item._id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-white">{item.buyerName}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${typeColors[item.messageType] || 'bg-gray-700 text-gray-400'}`}>
                  {item.messageType?.replace('_', ' ')}
                </span>
                <span className="text-xs text-gray-500">Step {item.sequenceStep}</span>
              </div>
              {item.linkedinUrl && (
                <a
                  href={item.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <ExternalLink size={14} />
                </a>
              )}
            </div>

            <div className="bg-gray-800/50 rounded-lg p-3 mb-4">
              <p className="text-sm text-gray-300 whitespace-pre-wrap">
                {item.generatedMessage || '(AI message not generated yet)'}
              </p>
            </div>

            {statusFilter === 'pending' && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleSent(item._id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 text-green-400 rounded-lg text-sm hover:bg-green-600/30 transition-colors"
                >
                  <Check size={14} /> Mark as Sent
                </button>
                <button
                  onClick={() => handleSkip(item._id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 text-gray-400 rounded-lg text-sm hover:bg-gray-600 transition-colors"
                >
                  <SkipForward size={14} /> Skip
                </button>
              </div>
            )}

            <p className="text-xs text-gray-600 mt-2">
              Generated: {item.generated_at ? new Date(item.generated_at).toLocaleString() : 'N/A'}
              {item.sent_at && ` · Sent: ${new Date(item.sent_at).toLocaleString()}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
