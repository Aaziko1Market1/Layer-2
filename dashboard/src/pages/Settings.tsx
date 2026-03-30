import { useState } from 'react';
import { Settings as SettingsIcon, Save, RefreshCw } from 'lucide-react';
import { api } from '../api/client';

export default function Settings() {
  const [generating, setGenerating] = useState(false);
  const [reportResult, setReportResult] = useState<string | null>(null);

  const handleGenerateReport = async () => {
    setGenerating(true);
    setReportResult(null);
    try {
      await api.generateReport();
      setReportResult('Report generated successfully');
    } catch (e: any) {
      setReportResult(`Failed: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <SettingsIcon size={24} className="text-gray-400" />
          Settings
        </h2>
        <p className="text-sm text-gray-500 mt-1">System configuration and maintenance</p>
      </div>

      {/* Report generation */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">Weekly Report</h3>
        <p className="text-sm text-gray-400">
          Generate the weekly optimization report manually. This analyzes reply rates,
          top/bottom performing patterns, model tier comparisons, and provides suggestions.
        </p>
        <button
          onClick={handleGenerateReport}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          {generating ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          {generating ? 'Generating...' : 'Generate Report Now'}
        </button>
        {reportResult && (
          <p className={`text-sm ${reportResult.startsWith('Failed') ? 'text-red-400' : 'text-green-400'}`}>
            {reportResult}
          </p>
        )}
      </div>

      {/* System info */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">System Information</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Application</span>
            <span className="text-gray-200">Aaziko AI Communicator</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Persona</span>
            <span className="text-gray-200">Arjun Mehta (Senior Trade Advisor)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Channels</span>
            <span className="text-gray-200">Email, WhatsApp, LinkedIn, Chat</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Model Tiers</span>
            <span className="text-gray-200">Premium, Mid, Local, Research, Intent</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">RAG Backend</span>
            <span className="text-gray-200">Qdrant + MongoDB + Redis</span>
          </div>
        </div>
      </div>

      {/* Environment info */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">Environment</h3>
        <p className="text-sm text-gray-400">
          Environment variables are loaded from <code className="text-indigo-400">.env</code> at server startup.
          Refer to <code className="text-indigo-400">.env.example</code> for all available configuration options.
        </p>
        <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-500 font-mono">
          API_BASE_URL, MONGODB_URI, QDRANT_URL, REDIS_URL,
          PREMIUM_MODEL_*, MID_MODEL_*, LOCAL_MODEL_*,
          SENDGRID_API_KEY, WHATSAPP_TOKEN, ...
        </div>
      </div>
    </div>
  );
}
