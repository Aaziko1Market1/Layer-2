import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Search, Send, Mail, CheckSquare, Square, RefreshCw,
  Users, Clock, Eye, ChevronLeft, ChevronRight, Star, Globe,
  AtSign, Phone, Package, TrendingUp, Zap, X, Edit3, CheckCircle2, AlertCircle, Loader2,
  ChevronDown, ChevronUp, RotateCcw, Linkedin, MessageCircle, Copy, Check,
} from 'lucide-react';
import { api } from '../api/client';

// ── Email draft helpers (localStorage — persists across page reloads) ─────
type Draft = { subject: string; body: string; to_email: string | null };
const DRAFT_KEY = (id: string) => `aaziko_email_draft_${id}`;
const loadDraft = (id: string): Draft | null => {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY(id)) || 'null'); } catch { return null; }
};
const saveDraft = (id: string, d: Draft) => {
  try { localStorage.setItem(DRAFT_KEY(id), JSON.stringify(d)); } catch {}
};
const clearDraft = (id: string) => {
  try { localStorage.removeItem(DRAFT_KEY(id)); } catch {}
};

interface Buyer {
  _id: string;
  name: string;
  country: string;
  category: string;
  totalAmount: number;
  transactionCount: number;
  hsCodes: number[];
  products: string[];
  buyer_id: string;
  lead_score: number;
  lead_priority: 'low' | 'medium' | 'high';
  intent_priority: 'cold' | 'warm' | 'hot';
  intent_score: number;
  primaryEmail: string;
  allExtractedEmails: string[];
  allExtractedPhones?: string[];
  contactPersonName?: string;
  // TT pipeline enrichment fields
  primary_email?: string;
  all_emails?: string[];
  all_phones?: string[];
  all_linkedins?: string[];
  domain_found?: string;
  enrichment_status?: string;
  contact_details?: Array<{
    email?: string | null;
    phone?: string | null;
    name?: string | null;
    position?: string | null;
    linkedin?: string | null;
    source?: string;
  }>;
  filteredContactData?: {
    contactPersonName?: string;
    contactPersonPosition?: string;
    contactDetails?: { email?: string; phone?: string; website?: string; allEmails?: string[]; allPhones?: string[] };
    dataQuality?: { hasEmail?: boolean; hasPhone?: boolean; hasWebsite?: boolean };
    icebreakerPoints?: Array<{ point: string; description?: string }>;
    companyInfo?: { domain?: string };
  };
  scrapedData?: {
    google?: { phone?: string; website?: string; address?: string; description?: string; emails?: string[] };
    apollo?: { email?: string; contactPerson?: string; linkedin_url?: string };
    general?: { emails?: string[]; description?: string; industry?: string };
  };
}

interface OutreachSummary {
  queued?: number; sent?: number; failed?: number;
  replied?: number; interested?: number; not_interested?: number;
  question?: number; bounced?: number;
}

interface OutreachRecord {
  _id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_country: string;
  stage: string;
  status: string;
  email_subject: string;
  email_body?: string;
  sent_at?: string;
  replied_at?: string;
  reply_text?: string;
  reply_classification?: string;
  reply_auto_responded?: boolean;
  next_followup_at?: string;
}

const INTENT_COLORS: Record<string, string> = {
  hot: 'bg-red-900/50 text-red-400 border-red-800',
  warm: 'bg-amber-900/50 text-amber-400 border-amber-800',
  cold: 'bg-sky-900/50 text-sky-400 border-sky-800',
};
const LEAD_COLORS: Record<string, string> = {
  high: 'bg-emerald-900/50 text-emerald-400 border-emerald-800',
  medium: 'bg-amber-900/50 text-amber-400 border-amber-800',
  low: 'bg-gray-700 text-gray-400 border-gray-600',
};
const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-sky-900/50 text-sky-400',
  delivered: 'bg-blue-900/50 text-blue-400',
  opened: 'bg-violet-900/50 text-violet-400',
  replied: 'bg-indigo-900/50 text-indigo-400',
  interested: 'bg-emerald-900/50 text-emerald-400',
  not_interested: 'bg-red-900/50 text-red-400',
  question: 'bg-amber-900/50 text-amber-400',
  failed: 'bg-red-900/50 text-red-400',
  queued: 'bg-gray-700 text-gray-400',
  bounced: 'bg-red-900/50 text-red-400',
};

type ActiveTab = 'buyers' | 'outreach';

export default function BuyerOutreach() {
  const [tab, setTab] = useState<ActiveTab>('buyers');

  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);
  // Channel selector in detail panel: email | linkedin | whatsapp
  const [activeChannel, setActiveChannel] = useState<'email' | 'linkedin' | 'whatsapp'>('email');

  // Preview & Edit state (Email)
  const [preview, setPreview] = useState<{ subject: string; body: string; to_email: string | null } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [sendingCustom, setSendingCustom] = useState(false);
  const [sendCustomResult, setSendCustomResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Social message state (LinkedIn / WhatsApp)
  const [socialMsg, setSocialMsg] = useState<any>(null);
  const [socialLoading, setSocialLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // Buyer email history
  const [buyerEmails, setBuyerEmails] = useState<any[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);

  // Filters — default to ALL buyers, sorted by trade volume
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [leadPriority, setLeadPriority] = useState('');
  const [intentPriority, setIntentPriority] = useState('');
  const [hasEmail, setHasEmail] = useState('');          // '' = all buyers
  const [minTradeVolume, setMinTradeVolume] = useState('');
  const [sortField, setSortField] = useState('totalAmount');
  const [countries, setCountries] = useState<string[]>([]);

  // Outreach
  const [outreach, setOutreach] = useState<OutreachRecord[]>([]);
  const [outreachTotal, setOutreachTotal] = useState(0);
  const [outreachPage, setOutreachPage] = useState(0);
  const [outreachStatus, setOutreachStatus] = useState('');
  const [summary, setSummary] = useState<OutreachSummary>({});

  // With-email count (real from DB)
  const [withEmailCount, setWithEmailCount] = useState<number | null>(null);

  // Detail panel
  const [selectedBuyer, setSelectedBuyer] = useState<Buyer | null>(null);
  const [buyerDetail, setBuyerDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Bulk Preview & Send modal
  const [bulkPreviewOpen, setBulkPreviewOpen] = useState(false);
  const [bulkPreviews, setBulkPreviews] = useState<Array<{
    buyer: Buyer;
    status: 'pending' | 'loading' | 'ready' | 'sent' | 'error';
    subject: string;
    body: string;
    to_email: string | null;
    error?: string;
    expanded: boolean;
  }>>([]);
  // Cache backed by localStorage — survives page reloads
  const previewCache = useRef({
    get: (id: string) => loadDraft(id),
    set: (id: string, d: Draft) => saveDraft(id, d),
    delete: (id: string) => clearDraft(id),
    has: (id: string) => loadDraft(id) !== null,
  });

  const PER_PAGE = 50;

  useEffect(() => {
    api.getBuyerFilters().then((f) => setCountries(f.countries || [])).catch(() => {});

    // Load immediately then poll every 20s so the count updates live during enrichment
    const fetchStats = () => {
      api.getBuyerStats().then((s) => setWithEmailCount(s.withEmail)).catch(() => {});
    };
    fetchStats();
    const statsInterval = setInterval(fetchStats, 20_000);
    return () => clearInterval(statsInterval);
  }, []);

  const loadBuyers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        type: 'buyer',
        limit: String(PER_PAGE),
        skip: String(page * PER_PAGE),
        sort: sortField,
      };
      if (search) params.search = search;
      if (country) params.country = country;
      if (leadPriority) params.lead_priority = leadPriority;
      if (intentPriority) params.intent_priority = intentPriority;
      if (hasEmail) params.hasEmail = hasEmail;
      if (minTradeVolume) params.min_trade_volume = minTradeVolume;

      const result = await api.getBuyers(params);
      setBuyers(result.buyers || []);
      setTotal(result.total || 0);
      setSelected(new Set());
    } catch (err) {
      console.error('Failed to load buyers', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, country, leadPriority, intentPriority, hasEmail, minTradeVolume, sortField]);

  const loadOutreach = useCallback(async () => {
    const params: Record<string, string> = {
      limit: String(PER_PAGE),
      skip: String(outreachPage * PER_PAGE),
    };
    if (outreachStatus) params.status = outreachStatus;
    const [listResult, summaryResult] = await Promise.all([
      api.getOutreachList(params),
      api.getOutreachSummary(),
    ]);
    setOutreach(listResult.records || []);
    setOutreachTotal(listResult.total || 0);
    setSummary(summaryResult || {});
  }, [outreachPage, outreachStatus]);

  useEffect(() => { if (tab === 'buyers') loadBuyers(); }, [loadBuyers, tab]);
  useEffect(() => { if (tab === 'outreach') loadOutreach(); }, [loadOutreach, tab]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === buyers.length && buyers.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(buyers.map((b) => b._id)));
    }
  };

  const handleBulkSend = async () => {
    if (selected.size === 0) return;
    // Filter only buyers with email
    const withEmail = Array.from(selected).filter((id) => {
      const b = buyers.find((x) => x._id === id);
      return b && b.primaryEmail;
    });
    if (withEmail.length === 0) {
      alert('None of the selected buyers have email addresses.');
      return;
    }
    setSending(true);
    setSendResult(null);
    try {
      const result = await api.bulkSendEmails(withEmail);
      setSendResult({ ...result, noEmail: selected.size - withEmail.length });
      loadBuyers();
      setTimeout(() => setSendResult(null), 10000);
    } finally {
      setSending(false);
    }
  };

  const handleSendOne = async (buyer: Buyer, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!buyer.primaryEmail) {
      alert(`No email found for ${buyer.name}`);
      return;
    }
    try {
      await api.sendEmailToBuyer(buyer._id);
      alert(`✅ AI email queued for ${buyer.name} → ${buyer.primaryEmail}`);
      loadBuyers();
    } catch (err: any) {
      alert(`❌ ${err.message || 'Failed to send'}`);
    }
  };

  const handleViewDetail = async (buyer: Buyer, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedBuyer(buyer);
    setSendCustomResult(null);
    setSocialMsg(null);
    setActiveChannel('email');

    // Auto-load saved draft if available
    const saved = loadDraft(buyer._id);
    if (saved) {
      setPreview(saved);
      setEditSubject(saved.subject);
      setEditBody(saved.body);
    } else {
      setPreview(null);
      setEditSubject('');
      setEditBody('');
    }

    setDetailLoading(true);
    setEmailsLoading(true);
    try {
      const [detail, emailsResult] = await Promise.all([
        api.getBuyerDetail(buyer._id),
        api.getBuyerEmails(buyer._id),
      ]);
      setBuyerDetail(detail);
      setBuyerEmails(emailsResult.emails || []);
    } catch {
      setBuyerDetail(null);
      setBuyerEmails([]);
    } finally {
      setDetailLoading(false);
      setEmailsLoading(false);
    }
  };

  const handlePreviewEmail = async () => {
    if (!selectedBuyer) return;
    // Load from localStorage if available — no re-generate
    const saved = loadDraft(selectedBuyer._id);
    if (saved) {
      setPreview(saved);
      setEditSubject(saved.subject);
      setEditBody(saved.body);
      setSendCustomResult(null);
      return;
    }
    // Not cached — generate via AI
    setPreviewLoading(true);
    setPreview(null);
    setSendCustomResult(null);
    try {
      const p = await api.previewEmail(selectedBuyer._id);
      saveDraft(selectedBuyer._id, p);   // persist for next reload
      setPreview(p);
      setEditSubject(p.subject);
      setEditBody(p.body);
    } catch (err: any) {
      alert('Preview failed: ' + (err.message || 'Unknown error'));
    } finally {
      setPreviewLoading(false);
    }
  };

  // Force-regenerate email even if a draft already exists
  const handleRegeneratePreview = async () => {
    if (!selectedBuyer) return;
    setPreviewLoading(true);
    setPreview(null);
    setSendCustomResult(null);
    try {
      const p = await api.previewEmail(selectedBuyer._id);
      saveDraft(selectedBuyer._id, p);
      setPreview(p);
      setEditSubject(p.subject);
      setEditBody(p.body);
    } catch (err: any) {
      alert('Regenerate failed: ' + (err.message || 'Unknown error'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSendCustom = async () => {
    if (!selectedBuyer || !editSubject || !editBody) return;
    setSendingCustom(true);
    setSendCustomResult(null);
    try {
      await api.sendCustomEmail(selectedBuyer._id, editSubject, editBody);
      clearDraft(selectedBuyer._id);   // remove draft after successful send
      setSendCustomResult({ ok: true, msg: `Email sent to ${preview?.to_email || selectedBuyer.primaryEmail}` });
      setPreview(null);
      // Reload email history
      const emailsResult = await api.getBuyerEmails(selectedBuyer._id);
      setBuyerEmails(emailsResult.emails || []);
    } catch (err: any) {
      setSendCustomResult({ ok: false, msg: err.message || 'Send failed' });
    } finally {
      setSendingCustom(false);
    }
  };

  const handleGenerateSocial = async (channel: 'linkedin' | 'whatsapp') => {
    if (!selectedBuyer) return;
    setSocialLoading(true);
    setSocialMsg(null);
    try {
      const result = await api.previewMessage(selectedBuyer._id, channel);
      setSocialMsg(result);
    } catch (err: any) {
      alert(`Generate failed: ${err.message || 'Unknown error'}`);
    } finally {
      setSocialLoading(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  const handleProcessFollowups = async () => {
    const result = await api.processFollowUps();
    alert(`Follow-ups: ${result.sent} sent, ${result.skipped} skipped`);
    loadOutreach();
  };

  // Open bulk preview modal — load selected buyers and start generating previews
  const openBulkPreview = async () => {
    const selectedBuyers = buyers.filter((b) => selected.has(b._id));
    if (selectedBuyers.length === 0) return;

    // Init — use cached preview if available, otherwise mark as pending
    setBulkPreviews(selectedBuyers.map((b) => {
      const cached = previewCache.current.get(b._id);
      if (cached) {
        return { buyer: b, status: 'ready' as const, ...cached, expanded: false };
      }
      return { buyer: b, status: 'pending' as const, subject: '', body: '', to_email: b.primaryEmail || null, expanded: false };
    }));
    setBulkPreviewOpen(true);

    // Only generate for buyers NOT already in cache
    const needGenerate = selectedBuyers.filter((b) => !previewCache.current.has(b._id));
    for (let i = 0; i < needGenerate.length; i += 2) {
      const chunk = needGenerate.slice(i, i + 2);
      await Promise.allSettled(chunk.map(async (buyer) => {
        setBulkPreviews((prev) => prev.map((p) =>
          p.buyer._id === buyer._id ? { ...p, status: 'loading' as const } : p
        ));
        try {
          const result = await api.previewEmail(buyer._id);
          // Save to cache
          previewCache.current.set(buyer._id, { subject: result.subject, body: result.body, to_email: result.to_email });
          setBulkPreviews((prev) => prev.map((p) =>
            p.buyer._id === buyer._id
              ? { ...p, status: 'ready' as const, subject: result.subject, body: result.body, to_email: result.to_email, expanded: i < 3 }
              : p
          ));
        } catch (err: any) {
          setBulkPreviews((prev) => prev.map((p) =>
            p.buyer._id === buyer._id
              ? { ...p, status: 'error' as const, error: err.message || 'Generation failed' }
              : p
          ));
        }
      }));
    }
  };

  const updateBulkPreview = (buyerId: string, field: 'subject' | 'body', value: string) => {
    setBulkPreviews((prev) => prev.map((p) => {
      if (p.buyer._id !== buyerId) return p;
      const updated = { ...p, [field]: value };
      // Keep localStorage in sync with edits
      const cached = previewCache.current.get(buyerId);
      if (cached) previewCache.current.set(buyerId, { ...cached, [field]: value });
      return updated;
    }));
  };

  const toggleBulkExpanded = (buyerId: string) => {
    setBulkPreviews((prev) => prev.map((p) =>
      p.buyer._id === buyerId ? { ...p, expanded: !p.expanded } : p
    ));
  };

  const sendOneBulkEmail = async (buyerId: string) => {
    const item = bulkPreviews.find((p) => p.buyer._id === buyerId);
    if (!item || !item.to_email || !item.subject || !item.body) return;
    setBulkPreviews((prev) => prev.map((p) =>
      p.buyer._id === buyerId ? { ...p, status: 'loading' as const } : p
    ));
    try {
      await api.sendCustomEmail(buyerId, item.subject, item.body);
      // Remove from cache — email sent, buyer gets fresh email next time
      previewCache.current.delete(buyerId);
      setBulkPreviews((prev) => prev.map((p) =>
        p.buyer._id === buyerId ? { ...p, status: 'sent' as const } : p
      ));
    } catch (err: any) {
      setBulkPreviews((prev) => prev.map((p) =>
        p.buyer._id === buyerId ? { ...p, status: 'error' as const, error: err.message } : p
      ));
    }
  };

  const sendAllBulkEmails = async () => {
    const ready = bulkPreviews.filter((p) => p.status === 'ready' && p.to_email);
    for (const item of ready) {
      await sendOneBulkEmail(item.buyer._id);
    }
    loadBuyers();
  };

  const totalPages = Math.ceil(total / PER_PAGE);

  // Track initial email count to show delta during enrichment
  const baseEmailCountRef = useRef<number | null>(null);
  if (withEmailCount !== null && baseEmailCountRef.current === null) {
    baseEmailCountRef.current = withEmailCount;
  }
  const emailDelta = withEmailCount !== null && baseEmailCountRef.current !== null
    ? withEmailCount - baseEmailCountRef.current
    : 0;

  // Stat cards
  const statsCards = [
    { label: 'Total Buyers', value: total.toLocaleString(), icon: <Users size={18} />, color: 'text-indigo-400' },
    {
      label: 'With Email',
      value: withEmailCount === null ? '...' : withEmailCount.toLocaleString(),
      icon: <AtSign size={18} />,
      color: 'text-emerald-400',
      delta: emailDelta,
    },
    { label: 'Outreach Sent', value: summary.sent || 0, icon: <Mail size={18} />, color: 'text-sky-400' },
    { label: 'Replied', value: summary.replied || 0, icon: <TrendingUp size={18} />, color: 'text-violet-400' },
    { label: 'Interested', value: summary.interested || 0, icon: <Star size={18} />, color: 'text-amber-400' },
    { label: 'Follow-ups Due', value: summary.queued || 0, icon: <Clock size={18} />, color: 'text-orange-400' },
  ];

  return (
    <div className="flex h-full bg-gray-950">
      {/* Main */}
      <div className={`flex-1 flex flex-col min-w-0 overflow-hidden ${selectedBuyer ? 'hidden lg:flex' : 'flex'}`}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 bg-gray-900">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Users className="text-indigo-400" size={22} />
                Buyer Outreach
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Dhruval DB · shortlist_buyer_seller · AI-powered Zoho email system
              </p>
            </div>
            <div className="flex gap-2">
              {tab === 'outreach' && (
                <button
                  onClick={handleProcessFollowups}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded-lg text-sm transition-colors border border-amber-800/30"
                >
                  <Clock size={14} /> Process Follow-ups
                </button>
              )}
              {tab === 'buyers' && selected.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{selected.size} selected</span>
                  <button
                    onClick={openBulkPreview}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm text-white font-medium transition-colors"
                  >
                    <Eye size={14} />
                    Preview & Send ({selected.size})
                  </button>
                  <button
                    onClick={handleBulkSend}
                    disabled={sending}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-sm text-gray-300 transition-colors"
                    title="Send without preview"
                  >
                    <Send size={14} />
                    {sending ? 'Sending...' : 'Send All'}
                  </button>
                </div>
              )}
              {tab === 'buyers' && selected.size === 0 && (
                <div className="text-xs text-gray-600 bg-gray-800/60 px-3 py-2 rounded-lg">
                  ☑ Select buyers → Preview &amp; Send
                </div>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {statsCards.map((s) => (
              <div key={s.label} className="bg-gray-800/60 rounded-xl p-3 flex items-center gap-2">
                <span className={s.color}>{s.icon}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 leading-none">
                    <span className="text-lg font-bold text-white">{s.value}</span>
                    {'delta' in s && (s as any).delta > 0 && (
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-900/40 border border-emerald-700/40 rounded px-1 py-0.5 animate-pulse">
                        +{(s as any).delta.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs text-gray-500">{s.label}</span>
                    {'delta' in s && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Live — updates every 20s" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Send result */}
        {sendResult && (
          <div className="mx-6 mt-3 p-3 bg-emerald-900/20 border border-emerald-800/50 rounded-xl text-sm flex items-center justify-between">
            <div>
              <span className="text-emerald-400 font-medium">✅ {sendResult.sent} queued</span>
              {sendResult.skipped > 0 && <span className="text-gray-400 ml-3">{sendResult.skipped} skipped</span>}
              {sendResult.failed > 0 && <span className="text-red-400 ml-3">{sendResult.failed} failed</span>}
              {sendResult.noEmail > 0 && <span className="text-amber-400 ml-3">{sendResult.noEmail} no email</span>}
            </div>
            <button onClick={() => setSendResult(null)}><X size={14} className="text-gray-500" /></button>
          </div>
        )}

        {/* Tabs */}
        <div className="px-6 pt-3 flex gap-1 border-b border-gray-800 bg-gray-900">
          {(['buyers', 'outreach'] as ActiveTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm capitalize font-medium transition-colors border-b-2 -mb-px ${
                tab === t
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {t === 'buyers' ? `All Buyers (${total.toLocaleString()})` : 'Outreach Log'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === 'buyers' ? (
            <>
              {/* Filters */}
              <div className="p-4 border-b border-gray-800 bg-gray-900/50 flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-52">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                    placeholder="Search company name, country, buyer ID..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <select
                  value={country}
                  onChange={(e) => { setCountry(e.target.value); setPage(0); }}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 min-w-36"
                >
                  <option value="">All Countries</option>
                  {countries.slice(0, 100).map((c) => <option key={c}>{c}</option>)}
                </select>

                <select
                  value={hasEmail}
                  onChange={(e) => { setHasEmail(e.target.value); setPage(0); }}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
                >
                  <option value="">All buyers</option>
                  <option value="true">Has email (~49)</option>
                </select>

                <select
                  value={leadPriority}
                  onChange={(e) => { setLeadPriority(e.target.value); setPage(0); }}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
                >
                  <option value="">All leads</option>
                  <option value="high">High priority</option>
                  <option value="medium">Medium priority</option>
                  <option value="low">Low priority</option>
                </select>

                <select
                  value={intentPriority}
                  onChange={(e) => { setIntentPriority(e.target.value); setPage(0); }}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
                >
                  <option value="">All intent</option>
                  <option value="hot">Hot</option>
                  <option value="warm">Warm</option>
                  <option value="cold">Cold</option>
                </select>

                <select
                  value={sortField}
                  onChange={(e) => { setSortField(e.target.value); setPage(0); }}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
                >
                  <option value="totalAmount">Sort: Trade Volume</option>
                  <option value="lead_score">Sort: Lead Score</option>
                  <option value="transactionCount">Sort: Shipments</option>
                  <option value="lastUpdated">Sort: Last Updated</option>
                </select>

                <input
                  type="number"
                  value={minTradeVolume}
                  onChange={(e) => { setMinTradeVolume(e.target.value); setPage(0); }}
                  placeholder="Min $volume"
                  className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500"
                />

                <button
                  onClick={() => { setSearch(''); setCountry(''); setLeadPriority(''); setIntentPriority(''); setHasEmail(''); setMinTradeVolume(''); setSortField('totalAmount'); setPage(0); }}
                  className="px-3 py-2 text-xs text-gray-400 hover:text-gray-200 bg-gray-800 border border-gray-700 rounded-lg"
                >
                  Reset
                </button>

                <button onClick={loadBuyers} className="p-2 bg-gray-800 border border-gray-700 hover:bg-gray-700 rounded-lg text-gray-400 transition-colors">
                  <RefreshCw size={15} />
                </button>
              </div>

              {/* Selection bar */}
              <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-3 text-sm bg-gray-900/30">
                <button onClick={toggleSelectAll} className="flex items-center gap-2 text-gray-400 hover:text-gray-200 transition-colors">
                  {selected.size === buyers.length && buyers.length > 0
                    ? <CheckSquare size={15} className="text-indigo-400" />
                    : <Square size={15} />
                  }
                  <span>{selected.size > 0 ? `${selected.size} selected` : 'Select all on page'}</span>
                </button>
                {selected.size > 0 && (
                  <span className="text-gray-600 text-xs">· Click "Send AI Email" to generate &amp; send emails via Arjun persona</span>
                )}
              </div>

              {/* Buyer table */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-24 text-gray-500 gap-3">
                  <RefreshCw size={24} className="animate-spin text-indigo-500" />
                  <span>Loading buyers from Dhruval database...</span>
                </div>
              ) : buyers.length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                  <Users size={40} className="mx-auto mb-3 opacity-30" />
                  <p>No buyers found. Try adjusting filters.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-800/95 backdrop-blur-sm z-10">
                      <tr>
                        <th className="w-10 px-3 py-3 text-left">
                          <Square size={14} className="text-gray-600" />
                        </th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Company</th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Country</th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">HS Code</th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Trade Volume</th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Lead Score</th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Priority</th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Email</th>
                        <th className="w-24 px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                      {buyers.map((buyer) => {
                        const isSelected = selected.has(buyer._id);
                        const hasEmailAddr = Boolean(buyer.primaryEmail);
                        return (
                          <tr
                            key={buyer._id}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-indigo-950/30 hover:bg-indigo-950/40'
                                : 'hover:bg-gray-800/40'
                            }`}
                            onClick={(e) => handleViewDetail(buyer, e)}
                          >
                            <td className="px-3 py-3" onClick={(e) => { e.stopPropagation(); toggleSelect(buyer._id); }}>
                              <button className="p-0.5">
                                {isSelected
                                  ? <CheckSquare size={15} className="text-indigo-400" />
                                  : <Square size={15} className="text-gray-600" />
                                }
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-white text-sm leading-tight">{buyer.name}</div>
                              <div className="text-xs text-gray-500 mt-0.5 font-mono">{buyer.buyer_id}</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-1 text-gray-300 text-xs">
                                <Globe size={11} className="text-gray-500 flex-shrink-0" />
                                {buyer.country}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                              {buyer.hsCodes?.[0] || '—'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-white text-sm font-medium">
                                ${buyer.totalAmount ? buyer.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'}
                              </div>
                              <div className="text-xs text-gray-500">{buyer.transactionCount || 0} shipments</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-14 bg-gray-700 rounded-full h-1.5">
                                  <div
                                    className="bg-indigo-500 h-1.5 rounded-full transition-all"
                                    style={{ width: `${Math.min(buyer.lead_score || 0, 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-300 tabular-nums">{buyer.lead_score || 0}</span>
                              </div>
                              <div className="mt-1">
                                <span className={`px-1.5 py-0.5 rounded text-xs border ${INTENT_COLORS[buyer.intent_priority] || 'text-gray-400'}`}>
                                  {buyer.intent_priority || 'cold'}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs border ${LEAD_COLORS[buyer.lead_priority] || 'bg-gray-700 text-gray-400 border-gray-600'}`}>
                                {buyer.lead_priority || 'low'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {hasEmailAddr ? (
                                <div>
                                  <div className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                                    <span className="text-xs text-emerald-400 truncate max-w-[140px]">
                                      {buyer.primaryEmail}
                                    </span>
                                  </div>
                                  {buyer.allExtractedEmails?.length > 1 && (
                                    <div className="text-xs text-gray-500 mt-0.5">
                                      +{buyer.allExtractedEmails.length - 1} more
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="flex items-center gap-1 text-xs text-gray-600">
                                  <span className="w-1.5 h-1.5 rounded-full bg-gray-600 flex-shrink-0" />
                                  No email
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={(e) => handleViewDetail(buyer, e)}
                                  title="View details"
                                  className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
                                >
                                  <Eye size={14} />
                                </button>
                                <button
                                  onClick={(e) => handleSendOne(buyer, e)}
                                  title={hasEmailAddr ? 'Send AI email' : 'No email available'}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    hasEmailAddr
                                      ? 'hover:bg-indigo-700/40 text-indigo-400 hover:text-indigo-300'
                                      : 'text-gray-700 cursor-not-allowed'
                                  }`}
                                >
                                  <Send size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              <div className="px-6 py-3 border-t border-gray-800 bg-gray-900/50 flex items-center justify-between text-sm text-gray-400">
                <span>
                  Showing {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, total)} of{' '}
                  <span className="text-white font-medium">{total.toLocaleString()}</span> buyers
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">Page {page + 1} / {Math.max(1, totalPages)}</span>
                  <button
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                    className="p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <OutreachLog
              records={outreach}
              total={outreachTotal}
              page={outreachPage}
              setPage={setOutreachPage}
              status={outreachStatus}
              setStatus={setOutreachStatus}
              summary={summary}
              perPage={PER_PAGE}
            />
          )}
        </div>
      </div>

      {/* Buyer Detail Panel */}
      {selectedBuyer && (
        <div className="w-full lg:w-[420px] bg-gray-900 border-l border-gray-800 flex flex-col">
          {/* Panel header */}
          <div className="border-b border-gray-800">
            <div className="p-4 flex items-center gap-3">
              <button
                onClick={() => { setSelectedBuyer(null); setBuyerDetail(null); setPreview(null); setSocialMsg(null); }}
                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-white truncate">{selectedBuyer.name}</h2>
                <p className="text-xs text-gray-500">{selectedBuyer.country} · {selectedBuyer.buyer_id}</p>
              </div>
            </div>
            {/* Channel tabs */}
            <div className="flex px-4 gap-1 pb-0">
              {([
                { key: 'email', label: 'Email', icon: <Mail size={12} />, color: 'text-amber-400 border-amber-500' },
                { key: 'linkedin', label: 'LinkedIn', icon: <Linkedin size={12} />, color: 'text-blue-400 border-blue-500' },
                { key: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle size={12} />, color: 'text-emerald-400 border-emerald-500' },
              ] as const).map((ch) => (
                <button
                  key={ch.key}
                  onClick={() => { setActiveChannel(ch.key); setSocialMsg(null); setPreview(null); }}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                    activeChannel === ch.key
                      ? ch.color
                      : 'text-gray-500 border-transparent hover:text-gray-300'
                  }`}
                >
                  {ch.icon} {ch.label}
                </button>
              ))}
              {/* Action button aligned right */}
              <div className="ml-auto pb-1 flex items-center gap-1.5">
                {activeChannel === 'email' && (
                  <>
                    {preview && (
                      <button onClick={handleRegeneratePreview} disabled={previewLoading}
                        className="flex items-center gap-1 px-2 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-lg text-xs text-gray-300 transition-colors">
                        <RotateCcw size={11} />
                        {previewLoading ? 'Generating...' : 'Regenerate'}
                      </button>
                    )}
                    <button onClick={handlePreviewEmail} disabled={previewLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 rounded-lg text-xs text-white font-medium transition-colors">
                      {previewLoading ? <Loader2 size={12} className="animate-spin" /> : <Edit3 size={12} />}
                      {previewLoading ? 'Generating...' : preview ? 'Draft Loaded' : 'Generate Email'}
                    </button>
                  </>
                )}
                {activeChannel === 'linkedin' && (
                  <>
                    {socialMsg?.channel === 'linkedin' && (
                      <button onClick={() => handleGenerateSocial('linkedin')} disabled={socialLoading}
                        className="flex items-center gap-1 px-2 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-lg text-xs text-gray-300 transition-colors">
                        <RotateCcw size={11} /> Regenerate
                      </button>
                    )}
                    <button onClick={() => handleGenerateSocial('linkedin')} disabled={socialLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 rounded-lg text-xs text-white font-medium transition-colors">
                      {socialLoading ? <Loader2 size={12} className="animate-spin" /> : <Linkedin size={12} />}
                      {socialLoading ? 'Generating...' : socialMsg?.channel === 'linkedin' ? 'Regenerate' : 'Generate Messages'}
                    </button>
                  </>
                )}
                {activeChannel === 'whatsapp' && (
                  <>
                    {socialMsg?.channel === 'whatsapp' && (
                      <button onClick={() => handleGenerateSocial('whatsapp')} disabled={socialLoading}
                        className="flex items-center gap-1 px-2 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-lg text-xs text-gray-300 transition-colors">
                        <RotateCcw size={11} /> Regenerate
                      </button>
                    )}
                    <button onClick={() => handleGenerateSocial('whatsapp')} disabled={socialLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded-lg text-xs text-white font-medium transition-colors">
                      {socialLoading ? <Loader2 size={12} className="animate-spin" /> : <MessageCircle size={12} />}
                      {socialLoading ? 'Generating...' : socialMsg?.channel === 'whatsapp' ? 'Regenerate' : 'Generate Message'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* ── LinkedIn Message Panel ───────────────────────────── */}
            {activeChannel === 'linkedin' && socialMsg?.channel === 'linkedin' && (
              <div className="bg-gray-800 rounded-xl p-4 space-y-3 border border-blue-700/40">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wide flex items-center gap-1.5">
                    <Linkedin size={12} /> LinkedIn Outreach — 3-Step Sequence
                  </h3>
                  {socialMsg.linkedin_url && (
                    <a href={socialMsg.linkedin_url} target="_blank" rel="noreferrer"
                      className="text-xs text-blue-400 hover:underline truncate max-w-[140px]">{socialMsg.linkedin_url.replace('https://www.linkedin.com/in/', '')}</a>
                  )}
                </div>
                <p className="text-xs text-gray-500">Copy each message and send manually on LinkedIn. These follow the 3-step relationship sequence.</p>

                {/* Connection Request */}
                {socialMsg.connection_request && (
                  <SocialMessageBlock
                    label="Connection Request" sublabel="300 chars max · send when you find their profile"
                    text={socialMsg.connection_request}
                    color="blue"
                    msgKey="linkedin_conn"
                    copiedKey={copiedKey}
                    onCopy={handleCopy}
                  />
                )}
                {/* Step 1 */}
                {socialMsg.message_step1 && (
                  <SocialMessageBlock
                    label="Step 1 — Insight" sublabel="Send after they accept the connection"
                    text={socialMsg.message_step1}
                    color="blue"
                    msgKey="linkedin_1"
                    copiedKey={copiedKey}
                    onCopy={handleCopy}
                  />
                )}
                {/* Step 2 */}
                {socialMsg.message_step2 && (
                  <SocialMessageBlock
                    label="Step 2 — Relate" sublabel="3–5 days after Step 1"
                    text={socialMsg.message_step2}
                    color="blue"
                    msgKey="linkedin_2"
                    copiedKey={copiedKey}
                    onCopy={handleCopy}
                  />
                )}
                {/* Step 3 */}
                {socialMsg.message_step3 && (
                  <SocialMessageBlock
                    label="Step 3 — Offer" sublabel="5–7 days after Step 2"
                    text={socialMsg.message_step3}
                    color="blue"
                    msgKey="linkedin_3"
                    copiedKey={copiedKey}
                    onCopy={handleCopy}
                  />
                )}
              </div>
            )}

            {/* ── WhatsApp Message Panel ───────────────────────────── */}
            {activeChannel === 'whatsapp' && socialMsg?.channel === 'whatsapp' && (
              <div className="bg-gray-800 rounded-xl p-4 space-y-3 border border-emerald-700/40">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                    <MessageCircle size={12} /> WhatsApp Message
                  </h3>
                  {socialMsg.phone && (
                    <span className="text-xs text-emerald-400 font-mono">{socialMsg.phone}</span>
                  )}
                </div>
                <p className="text-xs text-gray-500">Copy and send manually on WhatsApp. 2–3 lines max, like texting a colleague.</p>

                {socialMsg.message && (
                  <SocialMessageBlock
                    label={socialMsg.message2 ? 'Message 1' : 'Message'}
                    sublabel="Opening message"
                    text={socialMsg.message}
                    color="emerald"
                    msgKey="wa_1"
                    copiedKey={copiedKey}
                    onCopy={handleCopy}
                  />
                )}
                {socialMsg.message2 && (
                  <SocialMessageBlock
                    label="Message 2" sublabel="Send 2–5 seconds after Message 1"
                    text={socialMsg.message2}
                    color="emerald"
                    msgKey="wa_2"
                    copiedKey={copiedKey}
                    onCopy={handleCopy}
                  />
                )}
                {socialMsg.phone && (
                  <a
                    href={`https://wa.me/${socialMsg.phone.replace(/\D/g, '')}?text=${encodeURIComponent(socialMsg.message || '')}`}
                    target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 justify-center w-full py-2 bg-emerald-700/30 hover:bg-emerald-700/50 text-emerald-400 rounded-lg text-xs font-medium border border-emerald-700/40 transition-colors"
                  >
                    <MessageCircle size={12} /> Open WhatsApp with this number
                  </a>
                )}
              </div>
            )}

            {/* Loading state for social */}
            {(activeChannel === 'linkedin' || activeChannel === 'whatsapp') && socialLoading && (
              <div className="bg-gray-800 rounded-xl p-6 flex flex-col items-center gap-3 border border-gray-700">
                <Loader2 size={20} className="animate-spin text-indigo-400" />
                <p className="text-xs text-gray-400">Generating {activeChannel === 'linkedin' ? 'LinkedIn' : 'WhatsApp'} messages with AI...</p>
              </div>
            )}

            {/* Empty state for social */}
            {(activeChannel === 'linkedin' || activeChannel === 'whatsapp') && !socialLoading && !socialMsg && (
              <div className="bg-gray-800/50 rounded-xl p-6 flex flex-col items-center gap-3 border border-dashed border-gray-700">
                {activeChannel === 'linkedin'
                  ? <Linkedin size={28} className="text-gray-600" />
                  : <MessageCircle size={28} className="text-gray-600" />
                }
                <p className="text-xs text-gray-500 text-center">
                  Click <strong className="text-gray-300">Generate Messages</strong> above to create personalised{' '}
                  {activeChannel === 'linkedin' ? 'LinkedIn connection request + 3-step message sequence' : 'WhatsApp opening message'} for {selectedBuyer.name}.
                </p>
              </div>
            )}

            {/* ── Preview & Edit Panel (Email) ──────────────────────── */}
            {activeChannel === 'email' && preview && (
              <div className="bg-gray-800 rounded-xl p-4 space-y-3 border border-amber-700/40">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                    <Edit3 size={12} /> Email Preview — Edit before sending
                  </h3>
                  <button onClick={() => setPreview(null)} className="text-gray-600 hover:text-gray-300">
                    <X size={14} />
                  </button>
                </div>
                {preview.to_email ? (
                  <p className="text-xs text-gray-500">To: <span className="text-emerald-400">{preview.to_email}</span></p>
                ) : (
                  <p className="text-xs text-red-400">No email address found for this buyer</p>
                )}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Subject</label>
                  <input
                    value={editSubject}
                    onChange={e => {
                      setEditSubject(e.target.value);
                      if (selectedBuyer) saveDraft(selectedBuyer._id, { subject: e.target.value, body: editBody, to_email: preview?.to_email ?? null });
                    }}
                    className="w-full bg-gray-700 text-white text-xs rounded-lg px-3 py-2 border border-gray-600 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 flex items-center justify-between">
                    <span>Email Body (edit as needed)</span>
                    <span className="text-gray-600 text-xs normal-case font-normal">Auto-saved</span>
                  </label>
                  <textarea
                    value={editBody}
                    onChange={e => {
                      setEditBody(e.target.value);
                      if (selectedBuyer) saveDraft(selectedBuyer._id, { subject: editSubject, body: e.target.value, to_email: preview?.to_email ?? null });
                    }}
                    rows={12}
                    className="w-full bg-gray-700 text-white text-xs rounded-lg px-3 py-2 border border-gray-600 focus:border-amber-500 focus:outline-none resize-y font-mono leading-relaxed"
                  />
                </div>
                {sendCustomResult && (
                  <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${sendCustomResult.ok ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>
                    {sendCustomResult.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    {sendCustomResult.msg}
                  </div>
                )}
                <button
                  onClick={handleSendCustom}
                  disabled={sendingCustom || !preview.to_email || !editSubject || !editBody}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm text-white font-medium transition-colors"
                >
                  {sendingCustom ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {sendingCustom ? 'Sending...' : 'Send This Email'}
                </button>
              </div>
            )}

            {/* ── Sent Emails History ──────────────────────────────── */}
            <div className="bg-gray-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                <Mail size={12} /> Sent Emails
              </h3>
              {emailsLoading ? (
                <div className="text-xs text-gray-600 text-center py-3">Loading...</div>
              ) : buyerEmails.length === 0 ? (
                <div className="text-xs text-gray-600 text-center py-3">No emails sent yet — click "Preview &amp; Edit" to compose</div>
              ) : (
                <div className="space-y-2">
                  {buyerEmails.map((em: any) => (
                    <div key={em._id} className="border border-gray-700 rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-700/50 transition-colors text-left"
                        onClick={() => setExpandedEmail(expandedEmail === em._id ? null : em._id)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white font-medium truncate">{em.email_subject}</p>
                          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[em.status] || 'bg-gray-700 text-gray-400'}`}>
                              {em.status}
                            </span>
                            <span className="capitalize text-gray-600">{em.stage?.replace('_', ' ')}</span>
                            {em.sent_at && <span>{new Date(em.sent_at).toLocaleDateString()}</span>}
                          </p>
                        </div>
                        <Eye size={13} className={`flex-shrink-0 ml-2 ${expandedEmail === em._id ? 'text-amber-400' : 'text-gray-600'}`} />
                      </button>
                      {expandedEmail === em._id && (
                        <div className="px-3 pb-3 space-y-2 bg-gray-900/40">
                          <p className="text-xs text-gray-500">To: <span className="text-gray-300">{em.buyer_email}</span></p>
                          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed bg-gray-900/60 rounded-lg p-3 max-h-64 overflow-y-auto">
                            {em.email_body}
                          </pre>
                          {em.reply_text && (
                            <div className="mt-2">
                              <p className="text-xs text-blue-400 font-medium mb-1">↩ Buyer Reply:</p>
                              <pre className="text-xs text-blue-200 whitespace-pre-wrap font-sans leading-relaxed bg-blue-900/20 rounded-lg p-3 max-h-40 overflow-y-auto">
                                {em.reply_text}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Trade info */}
            <div className="bg-gray-800 rounded-xl p-4 space-y-2.5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                <TrendingUp size={12} /> Trade Data
              </h3>
              {[
                ['Trade Volume', `$${selectedBuyer.totalAmount?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || 0}`],
                ['Shipments', selectedBuyer.transactionCount || 0],
                ['HS Codes', selectedBuyer.hsCodes?.join(', ') || '—'],
                ['Category', selectedBuyer.category || '—'],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{k}</span>
                  <span className="text-xs text-gray-200 font-medium">{v}</span>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Lead Score</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-gray-700 rounded-full h-1.5">
                    <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${selectedBuyer.lead_score || 0}%` }} />
                  </div>
                  <span className="text-xs text-white">{selectedBuyer.lead_score || 0}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs border ${INTENT_COLORS[selectedBuyer.intent_priority]}`}>
                  {selectedBuyer.intent_priority} intent
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs border ${LEAD_COLORS[selectedBuyer.lead_priority]}`}>
                  {selectedBuyer.lead_priority} lead
                </span>
              </div>
            </div>

            {/* Contact info */}
            <div className="bg-gray-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                <AtSign size={12} /> Contact
                {selectedBuyer.enrichment_status === 'done' && (
                  <span className="ml-auto px-1.5 py-0.5 bg-emerald-900/50 text-emerald-400 rounded text-xs border border-emerald-800/30">
                    Pipeline Enriched
                  </span>
                )}
              </h3>

              {/* Contact person name — from TT pipeline or legacy */}
              {(selectedBuyer.contactPersonName || selectedBuyer.filteredContactData?.contactPersonName) && (
                <div className="text-sm text-white mb-2">
                  {selectedBuyer.contactPersonName || selectedBuyer.filteredContactData?.contactPersonName}
                  {selectedBuyer.filteredContactData?.contactPersonPosition && (
                    <span className="text-gray-400 ml-1">· {selectedBuyer.filteredContactData.contactPersonPosition}</span>
                  )}
                </div>
              )}

              {/* TT pipeline contact_details — show each contact with name + source */}
              {(selectedBuyer.contact_details?.length ?? 0) > 0 && (
                <div className="space-y-2 mb-3">
                  {(selectedBuyer.contact_details ?? []).map((c, i) => (
                    <div key={i} className="bg-gray-700/50 rounded-lg px-3 py-2 space-y-0.5">
                      {c.name && <div className="text-xs text-white font-medium">{c.name}{c.position ? <span className="text-gray-400 font-normal ml-1">· {c.position}</span> : ''}</div>}
                      {c.email && (
                        <div className="flex items-center gap-1.5">
                          <AtSign size={10} className="text-emerald-400 flex-shrink-0" />
                          <a href={`mailto:${c.email}`} className="text-emerald-400 hover:underline text-xs">{c.email}</a>
                          {i === 0 && <span className="text-xs text-gray-600">primary</span>}
                        </div>
                      )}
                      {c.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone size={10} className="text-gray-400 flex-shrink-0" />
                          <span className="text-gray-300 text-xs">{c.phone}</span>
                        </div>
                      )}
                      {c.linkedin && (
                        <div className="flex items-center gap-1.5">
                          <Zap size={10} className="text-blue-400 flex-shrink-0" />
                          <a href={c.linkedin} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-xs truncate">{c.linkedin.replace('https://www.linkedin.com/in/', '')}</a>
                        </div>
                      )}
                      <div className="text-xs text-gray-600">via {c.source}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Fallback: show allExtractedEmails if no contact_details */}
              {(!(selectedBuyer.contact_details?.length ?? 0)) && (
                selectedBuyer.allExtractedEmails?.length > 0 ? (
                  <div className="space-y-1 mb-2">
                    {selectedBuyer.allExtractedEmails.map((e, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-sm">
                        <AtSign size={12} className="text-emerald-400 flex-shrink-0" />
                        <a href={`mailto:${e}`} className="text-emerald-400 hover:underline">{e}</a>
                        {i === 0 && <span className="text-xs text-gray-600">primary</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-600 mb-2">No email addresses found</div>
                )
              )}

              {/* Domain */}
              {(selectedBuyer.domain_found || selectedBuyer.filteredContactData?.companyInfo?.domain || selectedBuyer.filteredContactData?.contactDetails?.website) && (
                <div className="flex items-center gap-1.5 text-sm text-sky-400 mt-1">
                  <Globe size={12} />
                  <a href={`https://${selectedBuyer.domain_found || selectedBuyer.filteredContactData?.companyInfo?.domain || selectedBuyer.filteredContactData?.contactDetails?.website}`}
                     target="_blank" rel="noreferrer"
                     className="hover:underline truncate">
                    {selectedBuyer.domain_found || selectedBuyer.filteredContactData?.companyInfo?.domain || selectedBuyer.filteredContactData?.contactDetails?.website}
                  </a>
                </div>
              )}
            </div>

            {/* Products */}
            {selectedBuyer.products?.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                  <Package size={12} /> Products ({selectedBuyer.products.length})
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {selectedBuyer.products.slice(0, 10).map((p, i) => (
                    <span key={i} className="bg-indigo-900/40 text-indigo-300 text-xs px-2 py-1 rounded-md border border-indigo-800/30">
                      {p.replace(/^RAW MATERIALS FOR[^:]+:/i, '').replace(/^[A-Z\s]+:\s*/i, '').trim().substring(0, 40)}
                    </span>
                  ))}
                  {selectedBuyer.products.length > 10 && (
                    <span className="text-xs text-gray-500 self-center">+{selectedBuyer.products.length - 10} more</span>
                  )}
                </div>
              </div>
            )}

            {/* Icebreakers */}
            {selectedBuyer.filteredContactData?.icebreakerPoints?.length ? (
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                  <Star size={12} /> AI Icebreakers
                </h3>
                <div className="space-y-2">
                  {selectedBuyer.filteredContactData.icebreakerPoints.slice(0, 4).map((pt, i) => (
                    <div key={i} className="flex gap-2 text-xs text-gray-300">
                      <span className="text-amber-400 flex-shrink-0 mt-0.5">▸</span>
                      <div>
                        <span className="font-medium text-gray-200">{pt.point}</span>
                        {pt.description && <p className="text-gray-500 mt-0.5">{pt.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Outreach memory */}
            {detailLoading ? (
              <div className="text-xs text-gray-500 text-center py-4">Loading outreach history...</div>
            ) : buyerDetail?.memory ? (
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Outreach Memory</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Emails sent</span>
                    <span className="text-white">{buyerDetail.memory.emails_sent || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[buyerDetail.memory.overall_status] || 'text-gray-300'}`}>
                      {buyerDetail.memory.overall_status}
                    </span>
                  </div>
                  {buyerDetail.memory.response_summary && (
                    <div className="mt-2 text-gray-300 bg-gray-700/50 rounded-lg p-2.5">
                      {buyerDetail.memory.response_summary}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Conversation */}
            {buyerDetail?.conversation?.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Conversation</h3>
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {buyerDetail.conversation.map((msg: any, i: number) => (
                    <div
                      key={i}
                      className={`text-xs p-2.5 rounded-lg ${
                        msg.type === 'buyer-reply'
                          ? 'bg-blue-900/30 text-blue-200 ml-4'
                          : 'bg-indigo-900/30 text-indigo-200 mr-4'
                      }`}
                    >
                      <div className="font-medium mb-1 text-gray-400">
                        {msg.type === 'buyer-reply' ? '← Buyer' : '→ AI (Arjun)'}
                      </div>
                      {String(msg.message || '').substring(0, 300)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bulk Preview & Send Modal ──────────────────────────────── */}
      {bulkPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl my-6">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Eye size={18} className="text-indigo-400" />
                  Preview & Send — {bulkPreviews.length} Buyer{bulkPreviews.length !== 1 ? 's' : ''}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">AI-generated emails by Arjun · Edit subject/body then send</p>
              </div>
              <div className="flex items-center gap-2">
                {bulkPreviews.some((p) => p.status === 'ready') && (
                  <button onClick={sendAllBulkEmails}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm text-white font-medium">
                    <Send size={14} />
                    Send All Ready ({bulkPreviews.filter((p) => p.status === 'ready' && p.to_email).length})
                  </button>
                )}
                <button onClick={() => setBulkPreviewOpen(false)} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400">
                  <X size={18} />
                </button>
              </div>
            </div>
            {/* Status bar */}
            <div className="px-6 py-2 border-b border-gray-800 flex gap-4 text-xs">
              {(['pending', 'loading', 'ready', 'sent', 'error'] as const).map((s) => {
                const n = bulkPreviews.filter((p) => p.status === s).length;
                if (!n) return null;
                const cls: Record<string, string> = { pending: 'text-gray-500', loading: 'text-blue-400', ready: 'text-emerald-400', sent: 'text-green-300', error: 'text-red-400' };
                return <span key={s} className={cls[s]}>{n} {s}</span>;
              })}
            </div>
            {/* Email cards */}
            <div className="divide-y divide-gray-800 max-h-[70vh] overflow-y-auto">
              {bulkPreviews.map((item) => (
                <div key={item.buyer._id} className="px-6 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-white text-sm truncate">{item.buyer.name}</p>
                      <p className="text-xs text-gray-500">
                        {item.buyer.country} · {item.to_email
                          ? <span className="text-emerald-400">{item.to_email}</span>
                          : <span className="text-red-400">No email</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      {item.status === 'loading' && <Loader2 size={14} className="animate-spin text-blue-400" />}
                      {item.status === 'ready' && (
                        <>
                          <button onClick={() => toggleBulkExpanded(item.buyer._id)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-700">
                            {item.expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            {item.expanded ? 'Collapse' : 'Edit'}
                          </button>
                          <button
                            title="Regenerate email"
                            onClick={async () => {
                              previewCache.current.delete(item.buyer._id);
                              setBulkPreviews((prev) => prev.map((p) =>
                                p.buyer._id === item.buyer._id ? { ...p, status: 'loading' as const } : p
                              ));
                              try {
                                const result = await api.previewEmail(item.buyer._id);
                                previewCache.current.set(item.buyer._id, { subject: result.subject, body: result.body, to_email: result.to_email });
                                setBulkPreviews((prev) => prev.map((p) =>
                                  p.buyer._id === item.buyer._id
                                    ? { ...p, status: 'ready' as const, subject: result.subject, body: result.body, to_email: result.to_email }
                                    : p
                                ));
                              } catch {
                                setBulkPreviews((prev) => prev.map((p) =>
                                  p.buyer._id === item.buyer._id ? { ...p, status: 'error' as const, error: 'Regeneration failed' } : p
                                ));
                              }
                            }}
                            className="p-1.5 rounded text-gray-600 hover:text-gray-300 hover:bg-gray-700"
                          >
                            <RefreshCw size={11} />
                          </button>
                          {item.to_email && (
                            <button onClick={() => sendOneBulkEmail(item.buyer._id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs text-white font-medium">
                              <Send size={11} /> Send
                            </button>
                          )}
                        </>
                      )}
                      {item.status === 'sent' && <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 size={13} /> Sent</span>}
                      {item.status === 'error' && <span className="flex items-center gap-1 text-xs text-red-400" title={item.error}><AlertCircle size={13} /> Error</span>}
                      {item.status === 'pending' && <span className="text-xs text-gray-600">Queued…</span>}
                    </div>
                  </div>
                  {/* Collapsed — just subject */}
                  {item.status === 'ready' && !item.expanded && (
                    <div onClick={() => toggleBulkExpanded(item.buyer._id)}
                      className="cursor-pointer bg-gray-800/50 rounded-lg px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 truncate">
                      <span className="text-gray-500 mr-1">Subject:</span>{item.subject}
                    </div>
                  )}
                  {/* Expanded — editable */}
                  {item.status === 'ready' && item.expanded && (
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Subject</label>
                        <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          value={item.subject} onChange={(e) => updateBulkPreview(item.buyer._id, 'subject', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Body</label>
                        <textarea className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono leading-relaxed"
                          rows={10} value={item.body} onChange={(e) => updateBulkPreview(item.buyer._id, 'body', e.target.value)} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => toggleBulkExpanded(item.buyer._id)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white">Collapse</button>
                        {item.to_email && (
                          <button onClick={() => sendOneBulkEmail(item.buyer._id)}
                            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm text-white font-medium">
                            <Send size={13} /> Send to {item.to_email}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Social Message Block ──────────────────────────────────────────────────────
function SocialMessageBlock({
  label, sublabel, text, color, msgKey, copiedKey, onCopy,
}: {
  label: string;
  sublabel: string;
  text: string;
  color: 'blue' | 'emerald';
  msgKey: string;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const colors = {
    blue: 'border-blue-800/40 bg-blue-900/10',
    emerald: 'border-emerald-800/40 bg-emerald-900/10',
  };
  const labelColors = { blue: 'text-blue-300', emerald: 'text-emerald-300' };
  const isCopied = copiedKey === msgKey;
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${colors[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <span className={`text-xs font-semibold ${labelColors[color]}`}>{label}</span>
          <span className="text-xs text-gray-600 ml-2">{sublabel}</span>
        </div>
        <button
          onClick={() => onCopy(text, msgKey)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
            isCopied
              ? 'bg-emerald-700/40 text-emerald-300'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-gray-200'
          }`}
        >
          {isCopied ? <Check size={11} /> : <Copy size={11} />}
          {isCopied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="text-xs text-gray-200 whitespace-pre-wrap font-sans leading-relaxed bg-gray-900/50 rounded-lg p-2.5 max-h-40 overflow-y-auto">
        {text}
      </pre>
    </div>
  );
}

function OutreachLog({ records, total, page, setPage, status, setStatus, summary, perPage }: {
  records: OutreachRecord[];
  total: number;
  page: number;
  setPage: (n: number) => void;
  status: string;
  setStatus: (s: string) => void;
  summary: OutreachSummary;
  perPage: number;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const totalPages = Math.ceil(total / perPage);
  const statKeys = ['sent', 'replied', 'interested', 'not_interested', 'question', 'bounced', 'failed', 'queued'] as const;

  return (
    <div className="flex flex-col h-full">
      {/* Summary cards */}
      <div className="p-4 grid grid-cols-4 md:grid-cols-8 gap-2 border-b border-gray-800 bg-gray-900/30">
        {statKeys.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(status === s ? '' : s)}
            className={`p-3 rounded-xl text-center transition-all border ${
              status === s
                ? 'border-indigo-500 bg-indigo-900/30'
                : 'border-gray-800 bg-gray-800/50 hover:border-gray-600'
            }`}
          >
            <div className={`text-xl font-bold ${STATUS_COLORS[s]?.split(' ')[1] || 'text-white'}`}>
              {summary[s as keyof OutreachSummary] ?? 0}
            </div>
            <div className="text-xs text-gray-500 mt-0.5 capitalize">{s.replace('_', ' ')}</div>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {records.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <Mail size={44} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm">No outreach records yet.</p>
            <p className="text-xs mt-1">Go to "All Buyers" tab → select buyers → click "Send AI Email".</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/60">
            {records.map((r) => (
              <div key={r._id}>
                {/* Row — click to expand */}
                <div
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/40 cursor-pointer transition-colors"
                  onClick={() => setExpanded(expanded === r._id ? null : r._id)}
                >
                  <Eye size={14} className={`flex-shrink-0 ${expanded === r._id ? 'text-amber-400' : 'text-gray-600'}`} />
                  <div className="flex-1 min-w-0 grid grid-cols-7 gap-3 items-center text-sm">
                    <div className="col-span-2">
                      <div className="font-medium text-white leading-tight truncate">{r.buyer_name}</div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate">{r.buyer_email}</div>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <div className="text-xs text-gray-300 truncate font-medium">{r.email_subject}</div>
                      <div className="text-xs text-gray-600 mt-0.5 capitalize">{r.stage?.replace('_', ' ')} · {r.buyer_country}</div>
                    </div>
                    <div>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[r.status] || 'bg-gray-700 text-gray-300'}`}>
                        {r.status?.replace('_', ' ')}
                      </span>
                      {r.reply_auto_responded && (
                        <span className="ml-1 px-1.5 py-0.5 bg-indigo-900/50 text-indigo-400 rounded text-xs">AI↩</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {r.sent_at ? new Date(r.sent_at).toLocaleDateString() : '—'}
                    </div>
                    <div className="text-xs">
                      {r.next_followup_at ? (
                        <span className="flex items-center gap-1 text-amber-500">
                          <Clock size={10} /> {new Date(r.next_followup_at).toLocaleDateString()}
                        </span>
                      ) : r.replied_at ? (
                        <span className="text-blue-400">Replied {new Date(r.replied_at).toLocaleDateString()}</span>
                      ) : '—'}
                    </div>
                  </div>
                </div>

                {/* Expanded — full email body */}
                {expanded === r._id && (
                  <div className="px-4 pb-4 bg-gray-900/60 border-t border-gray-800/60 space-y-3">
                    <div className="pt-3">
                      <p className="text-xs text-gray-500 mb-1">
                        <span className="font-medium text-gray-400">To:</span> {r.buyer_email}
                        {' · '}
                        <span className="font-medium text-gray-400">Stage:</span> {r.stage?.replace(/_/g, ' ')}
                        {' · '}
                        <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[r.status] || 'text-gray-400'}`}>{r.status}</span>
                      </p>
                      <p className="text-sm font-semibold text-white mb-3">Subject: {r.email_subject}</p>
                      <pre className="text-sm text-gray-200 whitespace-pre-wrap font-sans leading-relaxed bg-gray-800/60 rounded-xl p-4 max-h-80 overflow-y-auto border border-gray-700/50">
                        {(r as any).email_body || '(Email body not stored — check email_outreach_log collection)'}
                      </pre>
                    </div>

                    {/* Reply section */}
                    {(r as any).reply_text && (
                      <div>
                        <p className="text-xs font-semibold text-blue-400 mb-2 flex items-center gap-1.5">
                          <Mail size={12} /> Buyer Reply
                          {r.reply_classification && (
                            <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[r.reply_classification]}`}>
                              {r.reply_classification.replace('_', ' ')}
                            </span>
                          )}
                        </p>
                        <pre className="text-sm text-blue-200 whitespace-pre-wrap font-sans leading-relaxed bg-blue-900/20 rounded-xl p-4 max-h-48 overflow-y-auto border border-blue-800/30">
                          {(r as any).reply_text}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-6 py-3 border-t border-gray-800 bg-gray-900/50 flex items-center justify-between text-sm text-gray-400">
        <span>{total} records · page {page + 1} / {Math.max(1, totalPages)}</span>
        <div className="flex gap-2">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

    </div>
  );
}
