import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { FlaskConical, Plus, Trophy } from 'lucide-react';

export default function ABTests() {
  const [experiments, setExperiments] = useState<any[]>([]);
  const [selectedResults, setSelectedResults] = useState<any>(null);
  const [selectedId, setSelectedId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', variantADesc: '', variantBDesc: '' });
  const [error, setError] = useState('');

  const load = () => {
    api.getABTests().then(setExperiments).catch((e) => setError(e.message));
  };

  useEffect(() => { load(); }, []);

  const viewResults = async (id: string) => {
    setSelectedId(id);
    try {
      const results = await api.getABTestResults(id);
      setSelectedResults(results);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createABTest(form);
      setShowCreate(false);
      setForm({ name: '', description: '', variantADesc: '', variantBDesc: '' });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <FlaskConical size={24} className="text-purple-400" />
            A/B Tests
          </h2>
          <p className="text-sm text-gray-500 mt-1">Prompt experiments and variant comparison</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors"
        >
          <Plus size={16} /> New Experiment
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Create New Experiment</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <input
                type="text" required value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <input
                type="text" value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Variant A Description</label>
              <textarea
                required value={form.variantADesc}
                onChange={(e) => setForm((f) => ({ ...f, variantADesc: e.target.value }))}
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Variant B Description</label>
              <textarea
                required value={form.variantBDesc}
                onChange={(e) => setForm((f) => ({ ...f, variantBDesc: e.target.value }))}
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors">
            Create Experiment
          </button>
        </form>
      )}

      {/* Experiments list */}
      <div className="space-y-3">
        {experiments.map((exp) => (
          <div key={exp._id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-white">{exp.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  exp.status === 'active'
                    ? 'bg-green-900/30 text-green-400'
                    : 'bg-gray-700 text-gray-400'
                }`}>
                  {exp.status}
                </span>
                {exp.winner && (
                  <span className="flex items-center gap-1 text-xs text-amber-400">
                    <Trophy size={12} /> Winner: {exp.winner}
                  </span>
                )}
              </div>
              <button
                onClick={() => viewResults(exp._id)}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 hover:bg-gray-700 transition-colors"
              >
                View Results
              </button>
            </div>
            {exp.description && <p className="text-sm text-gray-400 mb-2">{exp.description}</p>}

            {selectedId === exp._id && selectedResults && (
              <div className="mt-4 bg-gray-800/50 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <VariantCard label="Variant A" data={selectedResults.variantA} />
                  <VariantCard label="Variant B" data={selectedResults.variantB} />
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-400">
                    Confidence: <span className="text-white font-medium">{(selectedResults.confidence * 100).toFixed(1)}%</span>
                  </span>
                  <span className="text-gray-400">
                    Winner: <span className={`font-medium ${selectedResults.winner === 'inconclusive' ? 'text-gray-400' : 'text-amber-400'}`}>
                      {selectedResults.winner}
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
        {experiments.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
            <FlaskConical size={48} className="mx-auto mb-3 text-gray-600" />
            <p className="text-gray-500">No experiments yet. Create one to start testing.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function VariantCard({ label, data }: { label: string; data: any }) {
  return (
    <div className="bg-gray-900 rounded-lg p-3">
      <h4 className="text-sm font-medium text-white mb-2">{label}</h4>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-gray-500">Sent:</span> <span className="text-gray-300">{data.sent}</span></div>
        <div><span className="text-gray-500">Replied:</span> <span className="text-gray-300">{data.replied}</span></div>
        <div><span className="text-gray-500">Reply Rate:</span> <span className="text-gray-300">{(data.replyRate * 100).toFixed(1)}%</span></div>
        <div><span className="text-gray-500">Meetings:</span> <span className="text-gray-300">{data.meetingsBooked}</span></div>
      </div>
    </div>
  );
}
