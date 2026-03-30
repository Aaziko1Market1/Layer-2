import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { MessageSquare, UserCheck, UserX, ChevronRight, Search } from 'lucide-react';

export default function Conversations() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [filter, setFilter] = useState({ channel: '', status: '' });
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    const params: Record<string, string> = {};
    if (filter.channel) params.channel = filter.channel;
    if (filter.status) params.status = filter.status;
    api.getConversations(params)
      .then(setConversations)
      .catch((e) => setError(e.message));
  };

  useEffect(() => { load(); }, [filter]);

  const filtered = conversations.filter((c) =>
    !search || c.buyerId?.toLowerCase().includes(search.toLowerCase())
  );

  const handleTakeover = async (buyerId: string) => {
    await api.takeover(buyerId);
    load();
  };

  const handleRelease = async (buyerId: string) => {
    await api.release(buyerId);
    load();
  };

  return (
    <div className="flex h-full">
      {/* List panel */}
      <div className="w-96 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800 space-y-3">
          <h2 className="text-lg font-bold text-white">Conversations</h2>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-500" />
            <input
              type="text"
              placeholder="Search buyer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filter.channel}
              onChange={(e) => setFilter((f) => ({ ...f, channel: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none"
            >
              <option value="">All channels</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="linkedin">LinkedIn</option>
              <option value="chat">Chat</option>
            </select>
            <select
              value={filter.status}
              onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none"
            >
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="human_takeover">Human Takeover</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && <p className="p-4 text-red-400 text-sm">{error}</p>}
          {filtered.length === 0 && !error && (
            <p className="p-4 text-gray-500 text-sm">No conversations found</p>
          )}
          {filtered.map((conv) => (
            <button
              key={conv.buyerId || conv._id}
              onClick={() => setSelected(conv)}
              className={`w-full text-left p-4 border-b border-gray-800 hover:bg-gray-800/50 transition-colors ${
                selected?.buyerId === conv.buyerId ? 'bg-gray-800/70' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white truncate">{conv.buyerId || conv._id}</span>
                <ChevronRight size={14} className="text-gray-600" />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  conv.status === 'human_takeover'
                    ? 'bg-amber-900/30 text-amber-400'
                    : conv.status === 'active'
                      ? 'bg-green-900/30 text-green-400'
                      : 'bg-gray-700 text-gray-400'
                }`}>
                  {conv.status || 'active'}
                </span>
                <span className="text-xs text-gray-500 capitalize">{conv.channel || 'email'}</span>
                <span className="text-xs text-gray-600">{conv.messages?.length || 0} msgs</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <MessageSquare size={48} className="mx-auto mb-3 opacity-30" />
              <p>Select a conversation to view details</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{selected.buyerId}</h3>
                <p className="text-xs text-gray-500">
                  {selected.channel} &middot; {selected.status} &middot; {selected.messages?.length || 0} messages
                </p>
              </div>
              <div className="flex gap-2">
                {selected.status !== 'human_takeover' ? (
                  <button
                    onClick={() => handleTakeover(selected.buyerId)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/20 text-amber-400 rounded-lg text-sm hover:bg-amber-600/30 transition-colors"
                  >
                    <UserCheck size={14} /> Take Over
                  </button>
                ) : (
                  <button
                    onClick={() => handleRelease(selected.buyerId)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 text-green-400 rounded-lg text-sm hover:bg-green-600/30 transition-colors"
                  >
                    <UserX size={14} /> Release to AI
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {(selected.messages || []).map((msg: any, i: number) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'agent' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[70%] rounded-xl px-4 py-2.5 ${
                    msg.role === 'agent'
                      ? 'bg-indigo-600/20 text-indigo-100 border border-indigo-800/30'
                      : 'bg-gray-800 text-gray-200 border border-gray-700'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {msg.role === 'agent' ? 'Arjun (AI)' : 'Buyer'} &middot; {
                        msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ''
                      }
                    </p>
                  </div>
                </div>
              ))}
              {(!selected.messages || selected.messages.length === 0) && (
                <p className="text-center text-gray-500 text-sm">No messages yet</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
