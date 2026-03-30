import { useState } from 'react';
import { api } from '../api/client';
import { Send, CheckCircle, XCircle } from 'lucide-react';

export default function Outbound() {
  const [form, setForm] = useState({ buyerName: '', country: '', channel: '', message: '' });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data: any = { buyerName: form.buyerName, country: form.country };
      if (form.channel) data.channel = form.channel;
      if (form.message) data.message = form.message;
      const res = await api.sendOutbound(data);
      setResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-2xl font-bold text-white mb-2">Send Outbound Message</h2>
      <p className="text-sm text-gray-500 mb-8">
        Send a message to a buyer through the AI communicator pipeline.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Buyer Name *</label>
            <input
              type="text"
              required
              value={form.buyerName}
              onChange={(e) => setForm((f) => ({ ...f, buyerName: e.target.value }))}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              placeholder="e.g. ABC Trading Co"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Country *</label>
            <input
              type="text"
              required
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              placeholder="e.g. United States"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Channel (optional — auto-selected if blank)</label>
          <select
            value={form.channel}
            onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="">Auto-select best channel</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="linkedin">LinkedIn</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Custom Message (optional — AI generates if blank)</label>
          <textarea
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            rows={4}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
            placeholder="Leave blank for AI-generated message..."
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          <Send size={16} />
          {loading ? 'Sending...' : 'Send Message'}
        </button>
      </form>

      {error && (
        <div className="mt-6 bg-red-900/30 border border-red-800 rounded-xl p-4 flex items-center gap-3">
          <XCircle size={18} className="text-red-400 shrink-0" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}

      {result && (
        <div className={`mt-6 rounded-xl p-4 flex items-center gap-3 ${
          result.success
            ? 'bg-green-900/30 border border-green-800'
            : 'bg-red-900/30 border border-red-800'
        }`}>
          {result.success ? (
            <CheckCircle size={18} className="text-green-400 shrink-0" />
          ) : (
            <XCircle size={18} className="text-red-400 shrink-0" />
          )}
          <div>
            <p className={`text-sm ${result.success ? 'text-green-300' : 'text-red-300'}`}>
              {result.success ? 'Message sent successfully' : `Failed: ${result.error}`}
            </p>
            {result.messageId && (
              <p className="text-xs text-gray-500 mt-1">ID: {result.messageId}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
