// ============================================================
// Aaziko AI Communicator Agents - Core Type Definitions
// ============================================================

export type BuyerTier = 'platinum' | 'gold' | 'silver' | 'bronze';
export type CommunicationModelTier = 'premium' | 'mid' | 'local';
export type Channel = 'email' | 'whatsapp' | 'linkedin' | 'chat';
export type MessageDirection = 'inbound' | 'outbound';
export type EmotionState = 'frustrated' | 'excited' | 'neutral' | 'skeptical' | 'urgent' | 'confused';

export type IntentType =
  | 'product_inquiry'
  | 'pricing_request'
  | 'compliance_question'
  | 'order_placement'
  | 'sample_request'
  | 'factory_visit'
  | 'general_question'
  | 'complaint'
  | 'follow_up'
  | 'meeting_request'
  | 'unknown';

export interface BuyerProfile {
  _id?: string;
  normalized_name: string;
  buyer_name: string;
  company?: string;
  country: string;
  hs_codes: string[];
  product_categories: string[];
  total_trade_volume_usd: number;
  total_quantity: number;
  avg_unit_price_usd: number;
  trade_count: number;
  first_trade_date: Date;
  last_trade_date: Date;
  trade_frequency_per_month: number;
  ports_used: string[];
  indian_suppliers: string[];
  top_supplier: string;
  buyer_addresses: string[];
  buyer_tier: BuyerTier;
  communication_model_tier: CommunicationModelTier;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  timezone?: string;
  preferred_channel?: Channel;
  last_updated: Date;
}

export interface Product {
  _id?: string;
  product_name: string;
  category: string;
  hs_code: string;
  seller_name: string;
  seller_location: string;
  seller_verified: boolean;
  price_range_usd: { min: number; max: number };
  moq: number;
  certifications: string[];
  description: string;
}

export interface ComplianceInfo {
  _id?: string;
  hs_code: string;
  country: string;
  import_duty_rate: number;
  vat_rate: number;
  excise_rate: number;
  anti_dumping_duty: number;
  required_certifications: string[];
  ntm_codes: string[];
  required_documents: string[];
  labeling_requirements: string[];
  special_permits: string[];
  data_confidence_score: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface IncomingMessage {
  id: string;
  channel: Channel;
  senderName: string;
  senderEmail?: string;
  senderPhone?: string;
  senderCountry?: string;
  text: string;
  subject?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface OutgoingMessage {
  id: string;
  channel: Channel;
  recipientId: string;
  text: string;
  subject?: string;
  scheduledSendTime?: Date;
  modelTierUsed: CommunicationModelTier;
  complianceFlags: ComplianceFlag[];
  variant?: 'A' | 'B';
  emotionState?: EmotionState;
  metadata?: Record<string, any>;
}

export interface ComplianceFlag {
  claim: string;
  expected: string;
  actual: string;
  confidence: number;
  action: 'auto_edited' | 'flagged_for_review' | 'approved';
}

export interface ChannelMessage {
  text: string;
  subject?: string;
  html?: string;
  attachments?: Attachment[];
}

export interface Attachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
}

export interface DeliveryResult {
  success: boolean;
  messageId: string;
  channel: Channel;
  timestamp: Date;
  error?: string;
}

export interface DeliveryStatus {
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'bounced';
  timestamp: Date;
}

export interface Conversation {
  _id?: string;
  buyerId: string;
  buyerName: string;
  channel: Channel;
  messages: ConversationMessage[];
  model_tier_used: CommunicationModelTier;
  compliance_flags: ComplianceFlag[];
  status: 'active' | 'paused' | 'human_takeover' | 'closed';
  handoff_reason?: string;
  assigned_to?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ConversationMessage {
  role: 'buyer' | 'agent';
  content: string;
  channel: Channel;
  timestamp: Date;
  model_used?: string;
  emotion_detected?: EmotionState;
}

export interface BuyerIntelligenceQuery {
  query: string;
  filters?: {
    country?: string;
    hsCode?: string;
    minVolume?: number;
    buyerTier?: BuyerTier;
    limit?: number;
  };
}

export interface RAGSearchResult<T> {
  results: T[];
  scores: number[];
  totalFound: number;
  queryTime: number;
}

export interface HandoffItem {
  _id?: string;
  buyerId: string;
  buyerName: string;
  country: string;
  conversationId: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  contextSummary: string;
  assignedTo?: string;
  status: 'pending' | 'accepted' | 'returned';
  created_at: Date;
  updated_at: Date;
}

export interface LinkedInOutboxItem {
  _id?: string;
  buyerId: string;
  buyerName: string;
  linkedinUrl: string;
  messageType: 'connection_request' | 'message' | 'follow_up';
  generatedMessage: string;
  sequenceStep: number;
  status: 'pending' | 'sent' | 'skipped' | 'responded';
  generated_at: Date;
  sent_at?: Date;
}

export interface ABExperiment {
  _id?: string;
  name: string;
  description: string;
  variantADesc: string;
  variantBDesc: string;
  status: 'active' | 'concluded';
  winner?: 'A' | 'B' | 'inconclusive';
  confidence?: number;
  created_at: Date;
  concluded_at?: Date;
}

export interface AnalyticsEvent {
  eventType: string;
  buyerId: string;
  conversationId?: string;
  channel: Channel;
  messageId?: string;
  model_tier_used?: CommunicationModelTier;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface MemoryCallback {
  type: 'product_reference' | 'pain_point' | 'personal_detail' | 'previous_quote';
  phrase: string;
  sourceMessageIndex: number;
}

export interface IntentClassification {
  intent: IntentType;
  confidence: number;
  entities: {
    hsCode?: string;
    country?: string;
    product?: string;
    quantity?: number;
    priceRange?: { min: number; max: number };
  };
}

// ============================================================
// Auto-Mail Campaign Types
// ============================================================

export type BuyerResponseStatus =
  | 'pending'        // email sent, no response yet
  | 'delivered'      // confirmed delivered
  | 'opened'         // buyer opened the email
  | 'replied'        // buyer replied (any reply)
  | 'interested'     // buyer expressed interest
  | 'not_interested' // buyer said not interested
  | 'question'       // buyer asked a question
  | 'bounced'        // email bounced
  | 'unsubscribed';  // buyer opted out

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';

export type FollowUpStage =
  | 'initial_outreach'
  | 'first_followup'
  | 'second_followup'
  | 'third_followup'
  | 'final_followup';

export interface AutoMailCampaign {
  _id?: string;
  campaign_name: string;
  description?: string;
  persona: string;
  status: CampaignStatus;
  target_filters: {
    countries?: string[];
    buyer_tiers?: BuyerTier[];
    hs_codes?: string[];
    product_categories?: string[];
    min_trade_volume?: number;
    max_trade_volume?: number;
    exclude_responded?: boolean;
    exclude_not_interested?: boolean;
  };
  email_sequence: EmailSequenceStep[];
  stats: CampaignStats;
  created_at: Date;
  updated_at: Date;
}

export interface EmailSequenceStep {
  stage: FollowUpStage;
  delay_hours: number;
  subject_template: string;
  prompt_instruction: string;
  enabled: boolean;
}

export interface CampaignStats {
  total_targeted: number;
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_replied: number;
  total_interested: number;
  total_not_interested: number;
  total_bounced: number;
}

export interface BuyerOutreach {
  _id?: string;
  campaign_id: string;
  buyer_id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_country: string;
  buyer_tier: BuyerTier;
  current_stage: FollowUpStage;
  response_status: BuyerResponseStatus;
  emails_sent: OutreachEmail[];
  last_email_sent_at?: Date;
  last_response_at?: Date;
  next_followup_at?: Date;
  response_summary?: string;
  ai_analysis?: string;
  tags: string[];
  created_at: Date;
  updated_at: Date;
}

export interface OutreachEmail {
  message_id: string;
  stage: FollowUpStage;
  subject: string;
  body_text: string;
  body_html?: string;
  sent_at: Date;
  delivered_at?: Date;
  opened_at?: Date;
  replied_at?: Date;
  reply_text?: string;
  reply_classification?: BuyerResponseStatus;
  zoho_message_id?: string;
}

export interface InboundEmailParsed {
  from_email: string;
  from_name: string;
  to_email: string;
  subject: string;
  text_body: string;
  html_body?: string;
  in_reply_to?: string;
  message_id: string;
  date: Date;
  headers: Record<string, string>;
}

export interface AutoMailConfig {
  enabled: boolean;
  max_emails_per_day: number;
  max_emails_per_hour: number;
  followup_intervals_hours: number[];
  sender_name: string;
  sender_email: string;
  reply_to_email: string;
  inbox_poll_interval_seconds: number;
  working_hours: { start: number; end: number };
  working_days: number[];
  timezone: string;
}
