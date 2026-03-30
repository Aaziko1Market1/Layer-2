import { useState } from 'react';
import { api } from '../api/client';
import { Search, Globe, Package, DollarSign, TrendingUp, Users } from 'lucide-react';

const TIER_COLORS: Record<string, string> = {
  platinum: 'bg-purple-900/30 text-purple-400 border-purple-800',
  gold: 'bg-amber-900/30 text-amber-400 border-amber-800',
  silver: 'bg-gray-700 text-gray-300 border-gray-600',
  bronze: 'bg-orange-900/30 text-orange-400 border-orange-800',
};

export default function BuyerIntelligence() {
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [hsCode, setHsCode] = useState('');
  const [tier, setTier] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setSelected(null);
    try {
      const filters: Record<string, string> = {};
      if (country) filters.country = country;
      if (hsCode) filters.hsCode = hsCode;
      if (tier) filters.buyerTier = tier;
      const data = await api.searchBuyers(query, Object.keys(filters).length > 0 ? filters : undefined);
      setResults(data.results || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const formatUsd = (n: number) => {
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Users size={24} className="text-blue-400" />
          Buyer Intelligence
        </h2>
        <p className="text-sm text-gray-500 mt-1">Search and explore buyer profiles from trade data</p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search buyers by name, product, HS code..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
        <div className="flex gap-3">
          <input
            type="text" value={country} onChange={(e) => setCountry(e.target.value)}
            placeholder="Country filter"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500 w-40"
          />
          <input
            type="text" value={hsCode} onChange={(e) => setHsCode(e.target.value)}
            placeholder="HS code filter"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500 w-40"
          />
          <select
            value={tier} onChange={(e) => setTier(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500 w-40"
          >
            <option value="">All tiers</option>
            <option value="platinum">Platinum</option>
            <option value="gold">Gold</option>
            <option value="silver">Silver</option>
            <option value="bronze">Bronze</option>
          </select>
        </div>
      </form>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Results list */}
        <div className="col-span-1 space-y-2 max-h-[70vh] overflow-y-auto">
          {results.map((buyer, i) => (
            <button
              key={buyer._id || i}
              onClick={() => setSelected(buyer)}
              className={`w-full text-left bg-gray-900 border rounded-xl p-4 transition-colors ${
                selected === buyer ? 'border-indigo-500' : 'border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white truncate">{buyer.buyer_name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${TIER_COLORS[buyer.buyer_tier] || TIER_COLORS.bronze}`}>
                  {buyer.buyer_tier}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Globe size={10} /> {buyer.country}
                <span className="ml-auto">{formatUsd(buyer.total_trade_volume_usd)}</span>
              </div>
            </button>
          ))}
          {results.length === 0 && !loading && (
            <div className="text-center py-12 text-gray-500 text-sm">
              {query ? 'No buyers found' : 'Enter a search query to find buyers'}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="col-span-2">
          {selected ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">{selected.buyer_name}</h3>
                  <p className="text-sm text-gray-400 flex items-center gap-1"><Globe size={12} /> {selected.country}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${TIER_COLORS[selected.buyer_tier] || TIER_COLORS.bronze}`}>
                  {selected.buyer_tier} — {selected.communication_model_tier} model
                </span>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <Stat icon={<DollarSign size={14} />} label="Trade Volume" value={formatUsd(selected.total_trade_volume_usd)} />
                <Stat icon={<Package size={14} />} label="Shipments" value={selected.trade_count?.toString() || '0'} />
                <Stat icon={<TrendingUp size={14} />} label="Avg Unit Price" value={formatUsd(selected.avg_unit_price_usd || 0)} />
                <Stat icon={<TrendingUp size={14} />} label="Freq/Month" value={(selected.trade_frequency_per_month || 0).toFixed(1)} />
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="text-xs text-gray-500 mb-1 uppercase tracking-wider">HS Codes</h4>
                  <div className="flex flex-wrap gap-1">
                    {(selected.hs_codes || []).slice(0, 10).map((code: string) => (
                      <span key={code} className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded">{code}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Product Categories</h4>
                  <div className="flex flex-wrap gap-1">
                    {(selected.product_categories || []).slice(0, 6).map((cat: string) => (
                      <span key={cat} className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded">{cat}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Indian Suppliers</h4>
                  <ul className="space-y-1">
                    {(selected.indian_suppliers || []).slice(0, 5).map((s: string) => (
                      <li key={s} className="text-xs text-gray-300">
                        {s === selected.top_supplier ? <span className="text-amber-400">★</span> : '·'} {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Ports Used</h4>
                  <div className="flex flex-wrap gap-1">
                    {(selected.ports_used || []).slice(0, 8).map((port: string) => (
                      <span key={port} className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded">{port}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 text-xs text-gray-500">
                <span>First trade: {selected.first_trade_date ? new Date(selected.first_trade_date).toLocaleDateString() : 'N/A'}</span>
                <span>Last trade: {selected.last_trade_date ? new Date(selected.last_trade_date).toLocaleDateString() : 'N/A'}</span>
              </div>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-16 text-center">
              <Users size={48} className="mx-auto mb-3 text-gray-600" />
              <p className="text-gray-500">Select a buyer to view their full profile</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-1">{icon} {label}</div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
