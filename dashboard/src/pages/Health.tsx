import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Activity, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';

export default function Health() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const h = await api.getHealth();
      setHealth(h);
      setLastCheck(new Date());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const services = health
    ? [
        { name: 'Qdrant Vector DB', status: health.qdrant, description: 'Vector search engine for RAG' },
        { name: 'Redis', status: health.redis, description: 'Cache and message queue' },
        { name: 'MongoDB', status: health.mongo, description: 'Primary document store' },
      ]
    : [];

  const allHealthy = services.every((s) => s.status);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity size={24} className="text-green-400" />
            System Health
          </h2>
          <p className="text-sm text-gray-500 mt-1">Infrastructure and service status</p>
        </div>
        <div className="flex items-center gap-3">
          {lastCheck && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock size={12} /> Last check: {lastCheck.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-gray-700 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {/* Overall status */}
      <div className={`rounded-xl p-6 border ${
        allHealthy
          ? 'bg-green-900/10 border-green-800/50'
          : 'bg-red-900/10 border-red-800/50'
      }`}>
        <div className="flex items-center gap-3">
          {allHealthy ? (
            <CheckCircle size={32} className="text-green-400" />
          ) : (
            <XCircle size={32} className="text-red-400" />
          )}
          <div>
            <h3 className={`text-lg font-semibold ${allHealthy ? 'text-green-400' : 'text-red-400'}`}>
              {allHealthy ? 'All Systems Operational' : 'System Degraded'}
            </h3>
            <p className="text-sm text-gray-500">
              {services.filter((s) => s.status).length}/{services.length} services healthy
            </p>
          </div>
        </div>
      </div>

      {/* Service details */}
      <div className="space-y-3">
        {services.map((service) => (
          <div key={service.name} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-3 h-3 rounded-full ${service.status ? 'bg-green-500' : 'bg-red-500'}`} />
              <div>
                <h4 className="text-sm font-medium text-white">{service.name}</h4>
                <p className="text-xs text-gray-500">{service.description}</p>
              </div>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              service.status
                ? 'bg-green-900/30 text-green-400'
                : 'bg-red-900/30 text-red-400'
            }`}>
              {service.status ? 'Healthy' : 'Down'}
            </span>
          </div>
        ))}
      </div>

      {!health && !error && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Activity size={48} className="mx-auto mb-3 text-gray-600 animate-pulse" />
          <p className="text-gray-500">Checking services...</p>
        </div>
      )}
    </div>
  );
}
