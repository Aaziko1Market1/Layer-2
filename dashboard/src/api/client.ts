const BASE_URL = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Dashboard
  getStats: () => request<any>('/dashboard/stats'),
  getConversations: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/dashboard/conversations${qs}`);
  },
  getConversation: (id: string) => request<any>(`/dashboard/conversations/${encodeURIComponent(id)}`),
  takeover: (buyerId: string) => request<any>(`/dashboard/conversations/${encodeURIComponent(buyerId)}/takeover`, { method: 'POST', body: '{}' }),
  release: (buyerId: string) => request<any>(`/dashboard/conversations/${encodeURIComponent(buyerId)}/release`, { method: 'POST', body: '{}' }),
  getLinkedInOutbox: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/dashboard/linkedin/outbox${qs}`);
  },
  markLinkedInSent: (id: string) => request<any>(`/dashboard/linkedin/outbox/${id}/sent`, { method: 'POST', body: '{}' }),
  markLinkedInSkip: (id: string) => request<any>(`/dashboard/linkedin/outbox/${id}/skip`, { method: 'POST', body: '{}' }),
  getReport: () => request<any>('/dashboard/report'),
  generateReport: () => request<any>('/dashboard/report/generate', { method: 'POST', body: '{}' }),

  // Analytics
  getEvents: (limit?: number) => request<any[]>(`/analytics/events?limit=${limit || 20}`),
  getEventCounts: (period: string) => request<Record<string, number>>(`/analytics/events/counts/${period}`),
  getReplyRates: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<Record<string, number>>(`/analytics/reply-rates${qs}`);
  },
  getReplyRatesTrend: (period?: string, days?: number) =>
    request<any[]>(`/analytics/reply-rates/trend?period=${period || 'daily'}&days=${days || 30}`),
  getABTests: () => request<any[]>('/analytics/ab-tests'),
  getABTestResults: (id: string) => request<any>(`/analytics/ab-tests/${id}/results`),
  createABTest: (data: any) => request<any>('/analytics/ab-tests', { method: 'POST', body: JSON.stringify(data) }),
  getAlerts: () => request<{ alerts: string[] }>('/analytics/alerts'),

  // Handoff Queue
  getHandoffQueue: (status?: string) => {
    const qs = status ? `?status=${status}` : '';
    return request<any[]>(`/dashboard/handoff-queue${qs}`);
  },
  acceptHandoff: (id: string) => request<any>(`/dashboard/handoff-queue/${id}/accept`, { method: 'POST', body: '{}' }),
  returnHandoff: (id: string) => request<any>(`/dashboard/handoff-queue/${id}/return`, { method: 'POST', body: '{}' }),

  // RAG
  getHealth: () => request<any>('/rag/health'),
  searchBuyers: (query: string, filters?: Record<string, string>) => {
    const body = { query, filters };
    return request<any>('/rag/buyer-intel', { method: 'POST', body: JSON.stringify(body) });
  },
  getBuyerProfile: (name: string, country: string) =>
    request<any>(`/rag/buyer/${encodeURIComponent(name)}/${encodeURIComponent(country)}`),
  searchProducts: (query: string, filters?: Record<string, string>) => {
    const body = { query, filters };
    return request<any>('/rag/products', { method: 'POST', body: JSON.stringify(body) });
  },

  // Communicate
  sendIncoming: (data: any) => request<any>('/communicate/incoming', { method: 'POST', body: JSON.stringify(data) }),
  sendOutbound: (data: any) => request<any>('/communicate/outbound', { method: 'POST', body: JSON.stringify(data) }),

  // Buyers (shortlist_buyer_seller)
  getBuyers: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ buyers: any[]; total: number }>(`/buyers${qs}`);
  },
  getBuyerFilters: () => request<{ countries: string[]; categories: string[] }>('/buyers/filters'),
  getBuyerDetail: (id: string) => request<any>(`/buyers/${id}`),
  sendEmailToBuyer: (id: string) =>
    request<any>(`/buyers/${id}/send-email`, { method: 'POST', body: '{}' }),
  bulkSendEmails: (buyer_ids: string[]) =>
    request<any>('/buyers/bulk-send', { method: 'POST', body: JSON.stringify({ buyer_ids }) }),
  previewEmail: (id: string) =>
    request<{ subject: string; body: string; to_email: string | null }>(`/buyers/${id}/preview-email`, { method: 'POST', body: '{}' }),
  previewMessage: (id: string, channel: 'linkedin' | 'whatsapp') =>
    request<any>(`/buyers/${id}/preview-message?channel=${channel}`, { method: 'POST', body: '{}' }),
  sendCustomEmail: (id: string, subject: string, body: string) =>
    request<any>(`/buyers/${id}/send-custom`, { method: 'POST', body: JSON.stringify({ subject, body }) }),
  getBuyerEmails: (id: string) =>
    request<{ emails: any[] }>(`/buyers/${id}/emails`),
  getOutreachList: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ records: any[]; total: number }>(`/buyers/outreach/list${qs}`);
  },
  getOutreachSummary: () => request<any>('/buyers/outreach/summary'),
  processFollowUps: () =>
    request<any>('/buyers/outreach/process-followups', { method: 'POST', body: '{}' }),
  getBuyerConversation: (id: string) => request<any>(`/buyers/${id}/conversation`),

  // Auto-Mail Campaigns
  getAutoMailCampaigns: (status?: string) => {
    const qs = status ? `?status=${status}` : '';
    return request<any[]>(`/automail/campaigns${qs}`);
  },
  getAutoMailCampaign: (id: string) => request<any>(`/automail/campaigns/${id}`),
  createAutoMailCampaign: (data: any) =>
    request<any>('/automail/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  activateAutoMailCampaign: (id: string) =>
    request<any>(`/automail/campaigns/${id}/activate`, { method: 'POST', body: '{}' }),
  pauseAutoMailCampaign: (id: string) =>
    request<any>(`/automail/campaigns/${id}/pause`, { method: 'POST', body: '{}' }),
  resumeAutoMailCampaign: (id: string) =>
    request<any>(`/automail/campaigns/${id}/resume`, { method: 'POST', body: '{}' }),
  getAutoMailCampaignStats: (id: string) => request<any>(`/automail/campaigns/${id}/stats`),
  getAutoMailCampaignOutreach: (id: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/automail/campaigns/${id}/outreach${qs}`);
  },
  getAutoMailBuyers: (type: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/automail/buyers/${type}${qs}`);
  },
  getAutoMailSummary: (campaignId?: string) => {
    const qs = campaignId ? `?campaign_id=${campaignId}` : '';
    return request<any>(`/automail/summary${qs}`);
  },
  getAutoMailEmailStats: () => request<any>('/automail/email-stats'),
  processAutoMail: () => request<any>('/automail/process', { method: 'POST', body: '{}' }),
  tagAutoMailBuyer: (id: string, tag: string) =>
    request<any>(`/automail/buyers/${id}/tag`, { method: 'POST', body: JSON.stringify({ tag }) }),
  updateAutoMailBuyerStatus: (id: string, status: string) =>
    request<any>(`/automail/buyers/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
