import { MongoClient, Db, ObjectId, Filter } from 'mongodb';
import { env } from '../../config/env';
import logger from '../../utils/logger';

export interface ShortlistBuyer {
  _id: string;
  type: 'buyer' | 'seller';
  name: string;
  category: string;
  totalAmount: number;
  transactionCount: number;
  lastUpdated: Date;
  address: string;
  country: string;
  hsCodes: number[];
  products: string[];
  buyer_id: string;
  vendor_id: string;
  intent_priority: 'cold' | 'warm' | 'hot';
  intent_score: number;
  intent_signals: string[];
  lead_priority: 'low' | 'medium' | 'high';
  lead_score: number;
  lead_score_breakdown: {
    value_score: number;
    frequency_score: number;
    diversity_score: number;
    recency_score: number;
  };
  lead_scored_at: Date;
  // ── TT pipeline enrichment fields (stored directly in shortlist_buyer_seller) ──
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
  // ── Legacy scraped fields ──────────────────────────────────────────────────
  filteredContactData?: {
    contactPersonName?: string;
    contactPersonPosition?: string;
    contactDetails?: {
      email?: string;
      phone?: string;
      website?: string;
      allEmails?: string[];
      allPhones?: string[];
    };
    icebreakerPoints?: Array<{ point: string; description: string }>;
    companyInfo?: {
      name?: string;
      country?: string;
      category?: string;
      domain?: string;
      address?: string;
    };
    dataQuality?: {
      hasEmail?: boolean;
      hasPhone?: boolean;
      hasSocial?: boolean;
      hasWebsite?: boolean;
      hasContactPerson?: boolean;
    };
  };
  scrapedData?: {
    google?: {
      name?: string;
      phone?: string;
      website?: string;
      address?: string;
      description?: string;
      emails?: string[];
    };
    apollo?: {
      email?: string;
      contactPerson?: string;
      linkedin_url?: string;
    };
    general?: {
      emails?: string[];
      description?: string;
      industry?: string;
    };
  };
}

export interface BuyerListFilters {
  type?: 'buyer' | 'seller';
  country?: string;
  category?: string;
  lead_priority?: string;
  intent_priority?: string;
  hasEmail?: boolean;
  min_lead_score?: number;
  min_trade_volume?: number;
  hs_code?: string;
  search?: string;
  limit?: number;
  skip?: number;
  sort?: 'lead_score' | 'totalAmount' | 'transactionCount' | 'lastUpdated';
  sortDir?: 1 | -1;
}

export class ShortlistBuyerService {
  private mongo!: Db;
  private mongoClient: MongoClient;

  constructor() {
    this.mongoClient = new MongoClient(env.MONGODB_URI);
  }

  async initialize(): Promise<void> {
    await this.mongoClient.connect();
    this.mongo = this.mongoClient.db(env.MONGODB_DB);
    logger.info('ShortlistBuyerService initialized', { db: env.MONGODB_DB });
  }

  getDb(): Db {
    return this.mongo;
  }

  async listBuyers(filters: BuyerListFilters = {}): Promise<{
    buyers: ShortlistBuyer[];
    total: number;
  }> {
    const query: Filter<any> = { type: filters.type || 'buyer' };

    // Email filter — checks all email sources
    if (filters.hasEmail === true) {
      query.$or = this.buildEmailExistsQuery();
    }

    if (filters.country) {
      query.country = { $regex: filters.country, $options: 'i' };
    }
    if (filters.category) {
      query.category = filters.category;
    }
    if (filters.lead_priority) {
      query.lead_priority = filters.lead_priority;
    }
    if (filters.intent_priority) {
      query.intent_priority = filters.intent_priority;
    }
    if (filters.min_lead_score !== undefined) {
      query.lead_score = { $gte: filters.min_lead_score };
    }
    if (filters.min_trade_volume !== undefined) {
      query.totalAmount = { $gte: filters.min_trade_volume };
    }
    if (filters.hs_code) {
      query.hsCodes = { $in: [parseInt(filters.hs_code, 10), filters.hs_code] };
    }
    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { country: { $regex: filters.search, $options: 'i' } },
        { buyer_id: { $regex: filters.search, $options: 'i' } },
        { 'filteredContactData.contactDetails.email': { $regex: filters.search, $options: 'i' } },
      ];
    }

    // Only include records with a valid name
    query.name = { $exists: true, $nin: [null, '', 'NULL', 'N/A'] };

    const sortField = filters.sort || 'totalAmount';
    const sortDir = filters.sortDir ?? -1;
    const limit = Math.min(filters.limit || 50, 200);
    const skip = filters.skip || 0;

    const [buyers, total] = await Promise.all([
      this.mongo
        .collection('shortlist_buyer_seller')
        .find(query)
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limit)
        .toArray(),
      this.mongo.collection('shortlist_buyer_seller').countDocuments(query),
    ]);

    return {
      buyers: buyers.map((b) => this.normalize(b)),
      total,
    };
  }

  async getBuyerById(id: string): Promise<ShortlistBuyer | null> {
    try {
      const doc = await this.mongo
        .collection('shortlist_buyer_seller')
        .findOne({ _id: new ObjectId(id) });
      return doc ? this.normalize(doc) : null;
    } catch {
      return null;
    }
  }

  async getBuyersByIds(ids: string[]): Promise<ShortlistBuyer[]> {
    const objectIds = ids.map((id) => {
      try { return new ObjectId(id); } catch { return null; }
    }).filter(Boolean) as ObjectId[];

    const docs = await this.mongo
      .collection('shortlist_buyer_seller')
      .find({ _id: { $in: objectIds } })
      .toArray();

    return docs.map((d) => this.normalize(d));
  }

  // ── Shared email-exists query (all sources, strict type checks) ──────
  // IMPORTANT: Use $type:'string' + $regex to avoid false-positives from
  // null/undefined fields. Do NOT use $ne:null,$ne:'' (JS duplicate-key bug).
  // Use $type:'array' for array fields to exclude null/empty entries.
  private buildEmailExistsQuery(): Filter<any>[] {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return [
      // TT pipeline — primary_email (string with valid format)
      { primary_email: { $type: 'string', $regex: emailRegex } },
      // TT pipeline — all_emails (non-empty array of strings)
      { all_emails: { $type: 'array', $not: { $size: 0 } } },
      // TT pipeline — contact_details array, at least one valid email
      { contact_details: { $elemMatch: { email: { $type: 'string', $regex: emailRegex } } } },
      // Legacy scraper — filteredContactData nested email
      { 'filteredContactData.contactDetails.email': { $type: 'string', $regex: emailRegex } },
      // Legacy scraper — filteredContactData allEmails array
      { 'filteredContactData.contactDetails.allEmails': { $type: 'array', $not: { $size: 0 } } },
      // General scraper emails
      { 'scrapedData.general.emails': { $type: 'array', $not: { $size: 0 } } },
      // Google scraper emails
      { 'scrapedData.google.emails': { $type: 'array', $not: { $size: 0 } } },
      // Apollo scraper — only if actual valid email string
      { 'scrapedData.apollo.email': { $type: 'string', $regex: emailRegex } },
    ];
  }

  // ── Count buyers with at least one email (any source) ─────────────────
  async getWithEmailCount(type: 'buyer' | 'seller' = 'buyer'): Promise<number> {
    return this.mongo.collection('shortlist_buyer_seller').countDocuments({
      type,
      name: { $exists: true, $nin: [null, '', 'NULL', 'N/A'] },
      $or: this.buildEmailExistsQuery(),
    });
  }

  async getCountries(): Promise<string[]> {
    const countries = await this.mongo
      .collection('shortlist_buyer_seller')
      .distinct('country', { type: 'buyer' });
    return countries.filter(Boolean).sort();
  }

  async getCategories(): Promise<string[]> {
    const categories = await this.mongo
      .collection('shortlist_buyer_seller')
      .distinct('category', { type: 'buyer' });
    return categories.filter(Boolean).sort();
  }

  extractPrimaryEmail(buyer: ShortlistBuyer): string {
    // 1. TT pipeline primary_email (highest priority — verified by Hunter/Snov/Brave)
    if (buyer.primary_email && this.isValidEmail(buyer.primary_email)) return buyer.primary_email;

    // 2. TT pipeline all_emails array
    if (buyer.all_emails?.length) {
      const valid = buyer.all_emails.find((e) => this.isValidEmail(e));
      if (valid) return valid;
    }

    // 3. TT pipeline contact_details array
    if (buyer.contact_details?.length) {
      const found = buyer.contact_details.find((c) => c.email && this.isValidEmail(c.email));
      if (found?.email) return found.email;
    }

    // 4. Legacy filteredContactData
    const fc = buyer.filteredContactData?.contactDetails;
    if (fc?.email && this.isValidEmail(fc.email)) return fc.email;
    if (fc?.allEmails?.length) {
      const valid = fc.allEmails.find((e) => this.isValidEmail(e));
      if (valid) return valid;
    }

    // 5. Legacy scrapedData
    if (buyer.scrapedData?.general?.emails?.length) {
      const valid = buyer.scrapedData.general.emails.find((e) => this.isValidEmail(e));
      if (valid) return valid;
    }
    if (buyer.scrapedData?.apollo?.email && this.isValidEmail(buyer.scrapedData.apollo.email)) {
      return buyer.scrapedData.apollo.email;
    }

    return '';
  }

  extractAllEmails(buyer: ShortlistBuyer): string[] {
    const emails = new Set<string>();
    const add = (e?: string | null) => { if (e && this.isValidEmail(e)) emails.add(e.toLowerCase().trim()); };

    // TT pipeline fields (new — highest quality)
    add(buyer.primary_email);
    buyer.all_emails?.forEach(add);
    buyer.contact_details?.forEach((c) => add(c.email));

    // Legacy fields
    add(buyer.filteredContactData?.contactDetails?.email);
    buyer.filteredContactData?.contactDetails?.allEmails?.forEach(add);
    buyer.scrapedData?.general?.emails?.forEach(add);
    add(buyer.scrapedData?.apollo?.email);

    return [...emails];
  }

  extractAllPhones(buyer: ShortlistBuyer): string[] {
    const phones = new Set<string>();
    buyer.all_phones?.forEach((p) => { if (p) phones.add(p); });
    buyer.contact_details?.forEach((c) => { if (c.phone) phones.add(c.phone); });
    const fp = buyer.filteredContactData?.contactDetails?.phone;
    if (fp) phones.add(fp);
    return [...phones];
  }

  extractContactPersonName(buyer: ShortlistBuyer): string {
    // From TT pipeline contact_details — pick the contact with a name
    const named = buyer.contact_details?.find((c) => c.name && c.name.trim().length > 2);
    if (named?.name) return named.name;
    return buyer.filteredContactData?.contactPersonName || '';
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  private normalize(doc: any): ShortlistBuyer {
    return {
      ...doc,
      _id: doc._id?.toString(),
    } as ShortlistBuyer;
  }

  async close(): Promise<void> {
    await this.mongoClient.close();
  }
}

export const shortlistBuyerService = new ShortlistBuyerService();
