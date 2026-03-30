import { useEffect, useState } from 'react';
import {
  Mail, Play, Pause, Plus, Users, UserCheck, UserX, HelpCircle,
  TrendingUp, RefreshCw, Clock, Send,
} from 'lucide-react';
import { api } from '../api/client';

interface Campaign {
  _id: string;
  campaign_name: string;
  description?: string;
  persona: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
  stats: {
    total_targeted: number;
    total_sent: number;
    total_delivered: number;
    total_opened: number;
    total_replied: number;
    total_interested: number;
    total_not_interested: number;
    total_bounced: number;
  };
  created_at: string;
  updated_at: string;
}

interface OutreachSummary {
  total: number;
  by_status: Record<string, number>;
  by_stage: Record<string, number>;
  response_rate: number;
  interest_rate: number;
}

interface BuyerOutreach {
  _id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_country: string;
  buyer_tier: string;
  current_stage: string;
  response_status: string;
  emails_sent: Array<{
    stage: string;
    subject: string;
    sent_at: string;
    reply_text?: string;
    reply_classification?: string;
  }>;
  last_email_sent_at?: string;
  last_response_at?: string;
  response_summary?: string;
  tags: string[];
}

interface EmailStats {
  sent: number;
  bounced: number;
  remaining: number;
  bounceRate: number;
}

type TabView = 'campaigns' | 'interested' | 'not-interested' | 'questions' | 'unresponsive';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-700 text-gray-300',
  active: 'bg-emerald-900/50 text-emerald-400',
  paused: 'bg-amber-900/50 text-amber-400',
  completed: 'bg-blue-900/50 text-blue-400',
  cancelled: 'bg-red-900/50 text-red-400',
  pending: 'bg-gray-700 text-gray-300',
  delivered: 'bg-sky-900/50 text-sky-400',
  opened: 'bg-violet-900/50 text-violet-400',
  replied: 'bg-blue-900/50 text-blue-400',
  interested: 'bg-emerald-900/50 text-emerald-400',
  not_interested: 'bg-red-900/50 text-red-400',
  question: 'bg-amber-900/50 text-amber-400',
  bounced: 'bg-red-900/50 text-red-400',
};

export default function AutoMail() {
  const [activeTab, setActiveTab] = useState<TabView>('campaigns');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [summary, setSummary] = useState<OutreachSummary | null>(null);
  const [emailStats, setEmailStats] = useState<EmailStats | null>(null);
  const [buyers, setBuyers] = useState<BuyerOutreach[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab !== 'campaigns') {
      loadBuyerList(activeTab);
    }
  }, [activeTab, selectedCampaign]);

  async function loadData() {
    setLoading(true);
    try {
      const [campaignList, summaryData, stats] = await Promise.all([
        api.getAutoMailCampaigns(),
        api.getAutoMailSummary(),
        api.getAutoMailEmailStats(),
      ]);
      setCampaigns(campaignList);
      setSummary(summaryData);
      setEmailStats(stats);
    } catch (err) {
      console.error('Failed to load automail data', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadBuyerList(tab: TabView) {
    try {
      let list: BuyerOutreach[];
      const params = selectedCampaign ? { campaign_id: selectedCampaign } : undefined;
      switch (tab) {
        case 'interested':
          list = await api.getAutoMailBuyers('interested', params);
          break;
        case 'not-interested':
          list = await api.getAutoMailBuyers('not-interested', params);
          break;
        case 'questions':
          list = await api.getAutoMailBuyers('questions', params);
          break;
        case 'unresponsive':
          list = selectedCampaign
            ? await api.getAutoMailBuyers('unresponsive', { campaign_id: selectedCampaign, days: '5' })
            : [];
          break;
        default:
          list = [];
      }
      setBuyers(list);
    } catch (err) {
      console.error('Failed to load buyers', err);
    }
  }

  async function handleActivate(campaignId: string) {
    try {
      await api.activateAutoMailCampaign(campaignId);
      loadData();
    } catch (err) {
      console.error('Activate failed', err);
    }
  }

  async function handlePause(campaignId: string) {
    try {
      await api.pauseAutoMailCampaign(campaignId);
      loadData();
    } catch (err) {
      console.error('Pause failed', err);
    }
  }

  async function handleResume(campaignId: string) {
    try {
      await api.resumeAutoMailCampaign(campaignId);
      loadData();
    } catch (err) {
      console.error('Resume failed', err);
    }
  }

  async function handleProcessNow() {
    try {
      await api.processAutoMail();
      loadData();
    } catch (err) {
      console.error('Process failed', err);
    }
  }

  const tabs: { key: TabView; label: string; icon: typeof Mail }[] = [
    { key: 'campaigns', label: 'Campaigns', icon: Mail },
    { key: 'interested', label: 'Interested', icon: UserCheck },
    { key: 'not-interested', label: 'Not Interested', icon: UserX },
    { key: 'questions', label: 'Questions', icon: HelpCircle },
    { key: 'unresponsive', label: 'Unresponsive', icon: Clock },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Mail className="text-indigo-400" />
            Auto-Mail Campaigns
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Automated email outreach, tracking, and follow-ups via Zoho Mail
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleProcessNow}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
          >
            <RefreshCw size={16} />
            Process Now
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm text-white font-medium transition-colors"
          >
            <Plus size={16} />
            New Campaign
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {summary && emailStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatCard label="Total Outreach" value={summary.total} icon={Users} color="text-blue-400" />
          <StatCard label="Response Rate" value={`${(summary.response_rate * 100).toFixed(1)}%`} icon={TrendingUp} color="text-emerald-400" />
          <StatCard label="Interest Rate" value={`${(summary.interest_rate * 100).toFixed(1)}%`} icon={UserCheck} color="text-green-400" />
          <StatCard label="Interested" value={summary.by_status.interested || 0} icon={UserCheck} color="text-emerald-400" />
          <StatCard label="Sent Today" value={emailStats.sent} icon={Send} color="text-indigo-400" />
          <StatCard label="Remaining Today" value={emailStats.remaining} icon={Mail} color="text-amber-400" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors ${
              activeTab === key
                ? 'bg-gray-800 text-white font-medium'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Icon size={16} />
            {label}
            {key !== 'campaigns' && summary?.by_status[key === 'not-interested' ? 'not_interested' : key] !== undefined && (
              <span className="ml-1 px-1.5 py-0.5 bg-gray-700 rounded text-xs">
                {summary.by_status[key === 'not-interested' ? 'not_interested' : key] || 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Campaign filter for buyer tabs */}
      {activeTab !== 'campaigns' && campaigns.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Filter by campaign:</span>
          <select
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c._id} value={c._id}>{c.campaign_name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-500">Loading...</div>
      ) : activeTab === 'campaigns' ? (
        <CampaignList
          campaigns={campaigns}
          onActivate={handleActivate}
          onPause={handlePause}
          onResume={handleResume}
        />
      ) : (
        <BuyerList buyers={buyers} tab={activeTab} />
      )}

      {showCreateModal && (
        <CreateCampaignModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); loadData(); }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string;
  value: string | number;
  icon: typeof Mail;
  color: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className={color} />
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function CampaignList({ campaigns, onActivate, onPause, onResume }: {
  campaigns: Campaign[];
  onActivate: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  if (campaigns.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        <Mail size={48} className="mx-auto mb-4 opacity-50" />
        <p>No campaigns yet. Create your first campaign to start outreach.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {campaigns.map((campaign) => (
        <div key={campaign._id} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-white">{campaign.campaign_name}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[campaign.status]}`}>
                  {campaign.status}
                </span>
              </div>
              {campaign.description && (
                <p className="text-sm text-gray-400 mt-1">{campaign.description}</p>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Persona: {campaign.persona} | Created: {new Date(campaign.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              {campaign.status === 'draft' && (
                <button
                  onClick={() => onActivate(campaign._id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm text-white transition-colors"
                >
                  <Play size={14} /> Activate
                </button>
              )}
              {campaign.status === 'active' && (
                <button
                  onClick={() => onPause(campaign._id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm text-white transition-colors"
                >
                  <Pause size={14} /> Pause
                </button>
              )}
              {campaign.status === 'paused' && (
                <button
                  onClick={() => onResume(campaign._id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm text-white transition-colors"
                >
                  <Play size={14} /> Resume
                </button>
              )}
            </div>
          </div>

          {/* Campaign Stats */}
          <div className="grid grid-cols-4 md:grid-cols-8 gap-3 mt-4 pt-4 border-t border-gray-800">
            <MiniStat label="Targeted" value={campaign.stats.total_targeted} />
            <MiniStat label="Sent" value={campaign.stats.total_sent} />
            <MiniStat label="Delivered" value={campaign.stats.total_delivered} />
            <MiniStat label="Opened" value={campaign.stats.total_opened} />
            <MiniStat label="Replied" value={campaign.stats.total_replied} />
            <MiniStat label="Interested" value={campaign.stats.total_interested} color="text-emerald-400" />
            <MiniStat label="Not Int." value={campaign.stats.total_not_interested} color="text-red-400" />
            <MiniStat label="Bounced" value={campaign.stats.total_bounced} color="text-red-400" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-semibold ${color || 'text-white'}`}>{value}</div>
    </div>
  );
}

function BuyerList({ buyers, tab }: { buyers: BuyerOutreach[]; tab: TabView }) {
  if (buyers.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Users size={48} className="mx-auto mb-4 opacity-50" />
        <p>No buyers found in this category.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-800/50">
          <tr>
            <th className="text-left px-4 py-3 text-gray-400 font-medium">Buyer</th>
            <th className="text-left px-4 py-3 text-gray-400 font-medium">Country</th>
            <th className="text-left px-4 py-3 text-gray-400 font-medium">Tier</th>
            <th className="text-left px-4 py-3 text-gray-400 font-medium">Stage</th>
            <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
            <th className="text-left px-4 py-3 text-gray-400 font-medium">Emails</th>
            <th className="text-left px-4 py-3 text-gray-400 font-medium">Last Activity</th>
            {(tab === 'interested' || tab === 'questions') && (
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Response</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {buyers.map((buyer) => (
            <tr key={buyer._id} className="hover:bg-gray-800/30 transition-colors">
              <td className="px-4 py-3">
                <div>
                  <div className="font-medium text-white">{buyer.buyer_name}</div>
                  <div className="text-xs text-gray-500">{buyer.buyer_email}</div>
                </div>
              </td>
              <td className="px-4 py-3 text-gray-300">{buyer.buyer_country}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded-full text-xs ${statusColors[buyer.buyer_tier] || 'bg-gray-700 text-gray-300'}`}>
                  {buyer.buyer_tier}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-300 text-xs">{buyer.current_stage.replace(/_/g, ' ')}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded-full text-xs ${statusColors[buyer.response_status]}`}>
                  {buyer.response_status.replace(/_/g, ' ')}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-300">{buyer.emails_sent.length}</td>
              <td className="px-4 py-3 text-gray-400 text-xs">
                {buyer.last_response_at
                  ? new Date(buyer.last_response_at).toLocaleString()
                  : buyer.last_email_sent_at
                    ? new Date(buyer.last_email_sent_at).toLocaleString()
                    : '—'}
              </td>
              {(tab === 'interested' || tab === 'questions') && (
                <td className="px-4 py-3 text-gray-300 text-xs max-w-xs truncate">
                  {buyer.response_summary || '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateCampaignModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [persona, setPersona] = useState('arjun');
  const [countries, setCountries] = useState('');
  const [tiers, setTiers] = useState<string[]>([]);
  const [hsCodesInput, setHsCodesInput] = useState('');
  const [excludeNotInterested, setExcludeNotInterested] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createAutoMailCampaign({
        name,
        description,
        persona,
        target_filters: {
          countries: countries ? countries.split(',').map((c) => c.trim()) : undefined,
          buyer_tiers: tiers.length > 0 ? tiers : undefined,
          hs_codes: hsCodesInput ? hsCodesInput.split(',').map((c) => c.trim()) : undefined,
          exclude_not_interested: excludeNotInterested,
        },
      });
      onCreated();
    } catch (err) {
      console.error('Create campaign failed', err);
    } finally {
      setSubmitting(false);
    }
  }

  const tierOptions = ['platinum', 'gold', 'silver', 'bronze'];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-4">Create Campaign</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Campaign Name</label>
            <input
              type="text" required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="e.g. US Textile Buyers Q1"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <input
              type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Persona</label>
            <select
              value={persona} onChange={(e) => setPersona(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="arjun">Arjun (Buyer Relations)</option>
              <option value="priya">Priya (Manufacturing)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Target Countries (comma-separated)</label>
            <input
              type="text" value={countries} onChange={(e) => setCountries(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="e.g. USA, UK, Germany"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Buyer Tiers</label>
            <div className="flex gap-2 flex-wrap">
              {tierOptions.map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={tiers.includes(t)}
                    onChange={(e) => setTiers(e.target.checked ? [...tiers, t] : tiers.filter((x) => x !== t))}
                    className="rounded border-gray-600"
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">HS Codes (comma-separated)</label>
            <input
              type="text" value={hsCodesInput} onChange={(e) => setHsCodesInput(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="e.g. 5201, 6104, 7108"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox" checked={excludeNotInterested}
              onChange={(e) => setExcludeNotInterested(e.target.checked)}
              className="rounded border-gray-600"
            />
            Exclude previously not-interested buyers
          </label>
          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={submitting || !name}
              className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm text-white font-medium transition-colors"
            >
              {submitting ? 'Creating...' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
