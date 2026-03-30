import { Db, ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env';
import logger from '../../utils/logger';
import { zohoEmailEngine } from '../channels/zoho-email.engine';
import { chatWithFallback } from '../orchestrator/tier-router';
import { shortlistBuyerService, ShortlistBuyer } from './shortlist-buyer.service';
import { InboundEmailParsed } from '../../models/types';

// ─── Collection names (all stored in Dhruval DB) ───────────────────────
const COL_OUTREACH    = 'email_outreach_log';
const COL_MEMORY      = 'ai_agent_memory';
const COL_CONV        = 'outreach_conversations';

export type OutreachStatus =
  | 'queued'
  | 'sent'
  | 'failed'
  | 'delivered'
  | 'opened'
  | 'replied'
  | 'interested'
  | 'not_interested'
  | 'question'
  | 'bounced'
  | 'unsubscribed';

export type FollowUpStage = 'initial' | 'followup_1' | 'followup_2' | 'followup_3';

export interface EmailOutreachRecord {
  _id?: string;
  buyer_db_id: string;       // _id from shortlist_buyer_seller
  buyer_id: string;          // buyer_id field (XXVL...)
  buyer_name: string;
  buyer_email: string;
  buyer_country: string;
  buyer_category: string;
  lead_score: number;
  lead_priority: string;
  intent_priority: string;
  stage: FollowUpStage;
  status: OutreachStatus;
  email_subject: string;
  email_body: string;
  message_id: string;
  sent_at?: Date;
  failed_at?: Date;
  fail_reason?: string;
  // reply tracking
  replied_at?: Date;
  reply_text?: string;
  reply_classification?: OutreachStatus;
  reply_auto_responded?: boolean;
  reply_auto_response_at?: Date;
  // follow-up scheduling
  next_followup_at?: Date;
  followup_suppressed?: boolean;  // true if replied or not_interested
  // metadata
  created_at: Date;
  updated_at: Date;
}

export interface BuyerMemory {
  buyer_db_id: string;
  buyer_name: string;
  buyer_country: string;
  emails_sent: number;
  last_email_sent_at?: Date;
  last_reply_at?: Date;
  overall_status: OutreachStatus;
  response_summary?: string;
  icebreakers_used: string[];
  topics_discussed: string[];
  ai_notes: string;
  updated_at: Date;
}

export class EmailOutreachService {
  private db!: Db;

  async initialize(): Promise<void> {
    this.db = shortlistBuyerService.getDb();

    // Indexes
    await this.db.collection(COL_OUTREACH).createIndex({ buyer_db_id: 1, stage: 1 });
    await this.db.collection(COL_OUTREACH).createIndex({ status: 1 });
    await this.db.collection(COL_OUTREACH).createIndex({ next_followup_at: 1 });
    await this.db.collection(COL_OUTREACH).createIndex({ buyer_email: 1 });
    await this.db.collection(COL_OUTREACH).createIndex({ sent_at: -1 });

    logger.info('EmailOutreachService initialized');
  }

  // ─── Preview email for buyer (generate without sending) ──────────────
  async previewEmail(buyer: ShortlistBuyer): Promise<{ subject: string; body: string; to_email: string | null }> {
    const { subject, body } = await this.generateEmail(buyer, 'initial');
    const to_email = shortlistBuyerService.extractPrimaryEmail(buyer);
    return { subject, body, to_email };
  }

  // ─── Send custom (edited) email to buyer ──────────────────────────────
  async sendCustomEmail(buyer: ShortlistBuyer, subject: string, body: string): Promise<EmailOutreachRecord> {
    const email = shortlistBuyerService.extractPrimaryEmail(buyer);
    if (!email) throw new Error(`No valid email for buyer: ${buyer.name}`);

    const record: Omit<EmailOutreachRecord, '_id'> = {
      buyer_db_id: buyer._id,
      buyer_id: buyer.buyer_id,
      buyer_name: buyer.name,
      buyer_email: email,
      buyer_country: buyer.country,
      buyer_category: buyer.category,
      lead_score: buyer.lead_score,
      lead_priority: buyer.lead_priority,
      intent_priority: buyer.intent_priority,
      stage: 'initial',
      status: 'queued',
      email_subject: subject,
      email_body: body,
      message_id: uuidv4(),
      next_followup_at: new Date(Date.now() + 5 * 24 * 3600 * 1000),
      created_at: new Date(),
      updated_at: new Date(),
    };

    const result = await this.db.collection(COL_OUTREACH).insertOne(record);
    const insertedId = result.insertedId.toHexString();

    const sendResult = await zohoEmailEngine.sendMessage(email, {
      text: body,
      subject,
      html: this.buildHtml(buyer, body),
    });

    const updateFields: any = sendResult.success
      ? { status: 'sent', sent_at: new Date(), message_id: sendResult.messageId, updated_at: new Date() }
      : { status: 'failed', failed_at: new Date(), fail_reason: sendResult.error, updated_at: new Date() };

    await this.db.collection(COL_OUTREACH).updateOne({ _id: result.insertedId }, { $set: updateFields });
    if (sendResult.success) await this.upsertMemory(buyer, 'initial');

    return { ...record, _id: insertedId, ...updateFields };
  }

  // ─── Get sent emails for one buyer ────────────────────────────────────
  async getBuyerEmails(buyerDbId: string): Promise<EmailOutreachRecord[]> {
    return this.db.collection(COL_OUTREACH)
      .find({ buyer_db_id: buyerDbId })
      .sort({ created_at: -1 })
      .limit(20)
      .toArray() as any;
  }

  // ─── Send initial email to buyer ──────────────────────────────────────
  async sendInitialEmail(buyer: ShortlistBuyer): Promise<EmailOutreachRecord> {
    const email = shortlistBuyerService.extractPrimaryEmail(buyer);
    if (!email) throw new Error(`No valid email for buyer: ${buyer.name}`);

    const existing = await this.db.collection(COL_OUTREACH).findOne({
      buyer_db_id: buyer._id,
      stage: 'initial',
      status: { $in: ['sent', 'delivered', 'opened', 'replied', 'interested', 'not_interested', 'question'] },
    });
    if (existing) throw new Error(`Initial email already sent to ${buyer.name}`);

    const { subject, body } = await this.generateEmail(buyer, 'initial');

    const record: Omit<EmailOutreachRecord, '_id'> = {
      buyer_db_id: buyer._id,
      buyer_id: buyer.buyer_id,
      buyer_name: buyer.name,
      buyer_email: email,
      buyer_country: buyer.country,
      buyer_category: buyer.category,
      lead_score: buyer.lead_score,
      lead_priority: buyer.lead_priority,
      intent_priority: buyer.intent_priority,
      stage: 'initial',
      status: 'queued',
      email_subject: subject,
      email_body: body,
      message_id: uuidv4(),
      next_followup_at: new Date(Date.now() + 5 * 24 * 3600 * 1000), // 5 days
      created_at: new Date(),
      updated_at: new Date(),
    };

    const result = await this.db.collection(COL_OUTREACH).insertOne(record);
    const insertedId = result.insertedId.toHexString();

    const sendResult = await zohoEmailEngine.sendMessage(email, {
      text: body,
      subject,
      html: this.buildHtml(buyer, body),
    });

    const updateFields: any = sendResult.success
      ? { status: 'sent', sent_at: new Date(), 'message_id': sendResult.messageId, updated_at: new Date() }
      : { status: 'failed', failed_at: new Date(), fail_reason: sendResult.error, updated_at: new Date() };

    await this.db.collection(COL_OUTREACH).updateOne(
      { _id: result.insertedId },
      { $set: updateFields }
    );

    // Update buyer memory
    await this.upsertMemory(buyer, 'initial');

    logger.info('Initial email sent', {
      buyer: buyer.name,
      email,
      success: sendResult.success,
    });

    return { ...record, _id: insertedId, ...updateFields };
  }

  // ─── Send emails to multiple buyers (bulk) ────────────────────────────
  async sendBulkEmails(buyerIds: string[]): Promise<{
    sent: number;
    failed: number;
    skipped: number;
    results: Array<{ buyer: string; success: boolean; reason?: string }>;
  }> {
    const buyers = await shortlistBuyerService.getBuyersByIds(buyerIds);
    let sent = 0, failed = 0, skipped = 0;
    const results: Array<{ buyer: string; success: boolean; reason?: string }> = [];

    for (const buyer of buyers) {
      try {
        await this.sendInitialEmail(buyer);
        sent++;
        results.push({ buyer: buyer.name, success: true });
      } catch (err: any) {
        const reason = err.message || 'Unknown error';
        if (reason.includes('already sent')) {
          skipped++;
          results.push({ buyer: buyer.name, success: false, reason: 'Already sent' });
        } else if (reason.includes('No valid email')) {
          skipped++;
          results.push({ buyer: buyer.name, success: false, reason: 'No email address' });
        } else {
          failed++;
          results.push({ buyer: buyer.name, success: false, reason });
        }
      }
    }

    return { sent, failed, skipped, results };
  }

  // ─── Process 5-day follow-ups ─────────────────────────────────────────
  async processFollowUps(): Promise<{ sent: number; skipped: number }> {
    const now = new Date();
    const due = await this.db
      .collection(COL_OUTREACH)
      .find({
        next_followup_at: { $lte: now },
        followup_suppressed: { $ne: true },
        status: { $in: ['sent', 'delivered', 'opened'] },
      })
      .limit(20)
      .toArray() as unknown as EmailOutreachRecord[];

    let sent = 0, skipped = 0;

    for (const record of due) {
      try {
        const nextStage = this.getNextStage(record.stage);
        if (!nextStage) {
          // All follow-ups exhausted — suppress
          await this.db.collection(COL_OUTREACH).updateOne(
            { _id: new ObjectId(record._id) },
            { $set: { followup_suppressed: true, next_followup_at: null, updated_at: new Date() } }
          );
          skipped++;
          continue;
        }

        const buyer = await shortlistBuyerService.getBuyerById(record.buyer_db_id);
        if (!buyer) { skipped++; continue; }

        const { subject, body } = await this.generateEmail(buyer, nextStage, record);
        const sendResult = await zohoEmailEngine.sendMessage(record.buyer_email, {
          text: body,
          subject,
          html: this.buildHtml(buyer, body),
        });

        const newRecord: Omit<EmailOutreachRecord, '_id'> = {
          buyer_db_id: record.buyer_db_id,
          buyer_id: record.buyer_id,
          buyer_name: record.buyer_name,
          buyer_email: record.buyer_email,
          buyer_country: record.buyer_country,
          buyer_category: record.buyer_category,
          lead_score: record.lead_score,
          lead_priority: record.lead_priority,
          intent_priority: record.intent_priority,
          stage: nextStage,
          status: sendResult.success ? 'sent' : 'failed',
          email_subject: subject,
          email_body: body,
          message_id: sendResult.messageId || uuidv4(),
          sent_at: sendResult.success ? new Date() : undefined,
          failed_at: sendResult.success ? undefined : new Date(),
          fail_reason: sendResult.error,
          next_followup_at: nextStage !== 'followup_3'
            ? new Date(Date.now() + 5 * 24 * 3600 * 1000)
            : undefined,
          created_at: new Date(),
          updated_at: new Date(),
        };

        await this.db.collection(COL_OUTREACH).insertOne(newRecord);

        // Suppress old record's follow-up
        await this.db.collection(COL_OUTREACH).updateOne(
          { _id: new ObjectId(record._id) },
          { $set: { followup_suppressed: true, next_followup_at: null, updated_at: new Date() } }
        );

        if (sendResult.success) {
          sent++;
          await this.upsertMemory(buyer, nextStage);
          logger.info('Follow-up sent', { buyer: record.buyer_name, stage: nextStage });
        } else {
          skipped++;
        }
      } catch (err) {
        logger.error('Follow-up processing error', { buyer: record.buyer_name, error: err });
        skipped++;
      }
    }

    return { sent, skipped };
  }

  // ─── Handle inbound email reply ───────────────────────────────────────
  async handleReply(email: InboundEmailParsed): Promise<void> {
    const record = await this.db.collection(COL_OUTREACH).findOne({
      buyer_email: { $regex: new RegExp(`^${email.from_email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      status: { $in: ['sent', 'delivered', 'opened'] },
    }) as unknown as EmailOutreachRecord | null;

    if (!record) {
      logger.info('No active outreach found for reply', { from: email.from_email });
      return;
    }

    const classification = await this.classifyReply(email.text_body, email.subject);

    await this.db.collection(COL_OUTREACH).updateOne(
      { _id: new ObjectId(record._id) },
      {
        $set: {
          status: classification,
          replied_at: new Date(),
          reply_text: email.text_body.substring(0, 3000),
          reply_classification: classification,
          followup_suppressed: ['not_interested', 'interested'].includes(classification),
          next_followup_at: ['not_interested', 'interested'].includes(classification) ? null : record.next_followup_at,
          updated_at: new Date(),
        },
      }
    );

    // Store in outreach_conversations
    await this.db.collection(COL_CONV).insertOne({
      buyerId: record.buyer_db_id,
      buyerName: record.buyer_name,
      channel: 'email',
      type: 'buyer-reply',
      message: email.text_body.substring(0, 2000),
      subject: email.subject,
      classification,
      confidence: 0.9,
      createdAt: new Date(),
    });

    // Update buyer memory
    await this.db.collection(COL_MEMORY).updateOne(
      { buyer_db_id: record.buyer_db_id },
      {
        $set: {
          last_reply_at: new Date(),
          overall_status: classification,
          response_summary: email.text_body.substring(0, 500),
          updated_at: new Date(),
        },
        $push: { topics_discussed: email.subject } as any,
      },
      { upsert: false }
    );

    logger.info('Reply recorded', { buyer: record.buyer_name, classification });

    // Auto-reply if it's a question or interest
    if (['question', 'interested', 'replied'].includes(classification)) {
      await this.autoReply(email, record, classification);
    }
  }

  // ─── AI auto-reply ────────────────────────────────────────────────────
  private async autoReply(
    email: InboundEmailParsed,
    record: EmailOutreachRecord,
    classification: string
  ): Promise<void> {
    const buyer = await shortlistBuyerService.getBuyerById(record.buyer_db_id);
    if (!buyer) return;

    const memory = await this.db.collection(COL_MEMORY).findOne({
      buyer_db_id: record.buyer_db_id,
    }) as BuyerMemory | null;

    const previousConversation = await this.db
      .collection(COL_CONV)
      .find({ buyerId: record.buyer_db_id })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    const icebreakerContext = buyer.filteredContactData?.icebreakerPoints
      ?.map((p) => `• ${p.point}`)
      .join('\n') || '';

    const systemPrompt = `You are ${env.ZOHO_FROM_NAME || 'Arjun'}, Senior Trade Consultant at Aaziko — India's premier B2B sourcing platform.

You are replying to a buyer's email. Be helpful, specific, and professional.

BUYER PROFILE:
Company: ${buyer.name}
Country: ${buyer.country}
HS Codes: ${buyer.hsCodes.join(', ')}
Products sourced: ${buyer.products.slice(0, 6).join(', ')}
Trade Volume: $${buyer.totalAmount?.toLocaleString()} across ${buyer.transactionCount} shipments
Lead Score: ${buyer.lead_score}/100

${icebreakerContext ? `COMPANY INSIGHTS:\n${icebreakerContext}\n` : ''}
${memory?.ai_notes ? `MEMORY NOTES:\n${memory.ai_notes}\n` : ''}

CLASSIFICATION OF THEIR REPLY: ${classification}

THEIR EMAIL:
Subject: ${email.subject}
${email.text_body}

INSTRUCTIONS:
- Reply directly and helpfully to their email
- If they asked a question, answer it specifically with Aaziko's value proposition
- If they are interested, propose a concrete next step (call, sample, quotation)
- Reference their specific products and trade data
- Keep response concise (150-250 words)
- Sign as ${env.ZOHO_FROM_NAME || 'Arjun'} from Aaziko
- Do NOT include a Subject: line`;

    const { response } = await chatWithFallback(
      'premium',
      systemPrompt,
      [{ role: 'user', content: 'Generate my reply' }]
    );

    const replySubject = email.subject.startsWith('Re:')
      ? email.subject
      : `Re: ${email.subject}`;

    const sendResult = await zohoEmailEngine.sendMessage(email.from_email, {
      text: response.trim(),
      subject: replySubject,
      html: this.buildSimpleHtml(response.trim()),
    });

    if (sendResult.success) {
      await this.db.collection(COL_OUTREACH).updateOne(
        { buyer_email: record.buyer_email, replied_at: { $exists: true } },
        {
          $set: {
            reply_auto_responded: true,
            reply_auto_response_at: new Date(),
            updated_at: new Date(),
          },
        }
      );

      await this.db.collection(COL_CONV).insertOne({
        buyerId: record.buyer_db_id,
        buyerName: record.buyer_name,
        channel: 'email',
        type: 'ai-reply',
        message: response.trim(),
        subject: replySubject,
        createdAt: new Date(),
      });

      // Update memory with AI notes
      const aiNote = `Replied to ${classification} email on ${new Date().toDateString()}. Subject: ${email.subject}`;
      await this.db.collection(COL_MEMORY).updateOne(
        { buyer_db_id: record.buyer_db_id },
        {
          $set: { updated_at: new Date() },
          $push: { topics_discussed: email.subject } as any,
          $append: { ai_notes: `\n${aiNote}` } as any,
        },
        { upsert: false }
      );

      logger.info('Auto-reply sent', { buyer: record.buyer_name, to: email.from_email });
    }
  }

  private async classifyReply(text: string, subject?: string): Promise<OutreachStatus> {
    try {
      const systemPrompt = `Classify this email reply into exactly one word:
- "interested" — wants more info, asks for price, samples, catalog, meeting
- "not_interested" — explicitly declines, asks to stop emailing
- "question" — asks a specific question about products, pricing, logistics
- "replied" — generic/unclear reply

Respond with ONLY one word.`;

      const { response } = await chatWithFallback(
        'local',
        systemPrompt,
        [{ role: 'user', content: `Subject: ${subject}\n\n${text.substring(0, 1500)}` }]
      );

      const val = response.trim().toLowerCase().replace(/[^a-z_]/g, '');
      const valid: OutreachStatus[] = ['interested', 'not_interested', 'question', 'replied'];
      return valid.includes(val as OutreachStatus) ? (val as OutreachStatus) : 'replied';
    } catch {
      return 'replied';
    }
  }

  // ─── AI email generation ──────────────────────────────────────────────
  private async generateEmail(
    buyer: ShortlistBuyer,
    stage: FollowUpStage,
    prevRecord?: EmailOutreachRecord
  ): Promise<{ subject: string; body: string }> {
    const products = buyer.products.slice(0, 8).map((p) =>
      p.replace(/^RAW MATERIALS FOR[^:]+:/i, '').trim()
    );

    const icebreakers = buyer.filteredContactData?.icebreakerPoints
      ?.slice(0, 2)
      .map((p) => p.point)
      .join('; ') || '';

    const memory = await this.db.collection(COL_MEMORY).findOne({
      buyer_db_id: buyer._id,
    }) as BuyerMemory | null;

    const stageInstructions: Record<FollowUpStage, string> = {
      initial: `Write a highly personalized first-touch cold email. Reference their specific products (${products.slice(0, 4).join(', ')}). Mention their trade volume of $${buyer.totalAmount?.toLocaleString()} across ${buyer.transactionCount} shipments under HS ${buyer.hsCodes[0]}. Highlight Aaziko's verified Indian supplier network and 15-20% cost advantage. Close with ONE specific question about their current sourcing challenges.`,
      followup_1: `Write a brief follow-up (it's been 5 days with no reply). Reference the initial email. Add a new value point: mention Aaziko's real-time compliance data for their destination country or a market insight about HS ${buyer.hsCodes[0]}. Keep it short, 4-5 sentences. No pressure, just adding value.`,
      followup_2: `Write a second follow-up (10 days since first email). Take a different angle — mention a specific product opportunity or an Indian supplier that matches their sourcing needs exactly. Offer something concrete: a free sample quotation or a 15-minute discovery call. Be direct.`,
      followup_3: `Write a final "breakup" email (15 days since first email). Be gracious and brief. Say this is your last follow-up unless they are interested. Leave the door open. Wish them well. 3-4 sentences maximum.`,
    };

    const cleanProducts = products.map(p =>
      p.replace(/^[A-Z\s]+:\s*/i, '').replace(/ITEM CODE:.*/i, '').trim()
    ).filter(Boolean);

    const systemPrompt = `You are Arjun Sharma, Senior International Trade Consultant at Aaziko — India's leading B2B sourcing and trade intelligence platform. You have 12 years of experience in global trade, specializing in connecting international buyers with verified Indian manufacturers and exporters.

Your communication style:
- Professional but warm and human — never robotic or template-like
- Data-driven: reference actual trade figures, HS codes, specific products
- Consultative: you position yourself as a trusted advisor, not just a salesperson
- Direct: you get to the point and respect the reader's time
- You write in fluent international English (suitable for ${buyer.country})

BUYER PROFILE:
- Company: ${buyer.name}
- Country: ${buyer.country}
- HS Code: ${buyer.hsCodes?.slice(0,3).join(', ') || 'N/A'}
- Trade Volume: $${(buyer.totalAmount || 0).toLocaleString()} across ${buyer.transactionCount || 0} shipments
- Products imported: ${cleanProducts.slice(0, 5).join('; ')}
- Lead Priority: ${buyer.lead_priority || 'standard'} | Category: ${buyer.category || 'N/A'}
${memory?.ai_notes ? `\nPREVIOUS INTERACTIONS:\n${memory.ai_notes}` : ''}
${icebreakers ? `\nINSIGHTS TO REFERENCE:\n${icebreakers}` : ''}
${prevRecord ? `\nPREVIOUS EMAIL:\nSubject: ${prevRecord.email_subject}\n${prevRecord.email_body.substring(0, 250)}...` : ''}

TASK: ${stageInstructions[stage]}

STRICT RULES:
- Output ONLY the email body text — no subject line, no meta-commentary
- Open with "Hi [Contact Name / Team]," — use buyer's actual company name naturally
- Sign off as: "Arjun Sharma | Senior Trade Consultant | Aaziko | arjun@aaziko.com"
- Length: ${stage === 'followup_3' ? '60-90' : '160-240'} words
- Do NOT use placeholder text like [Your Name] or [Company]
- Sound like a real person wrote this, not a template`;

    const userPrompt = `Write the ${stage.replace('_', ' ')} email for ${buyer.name} from ${buyer.country} who imports ${cleanProducts[0] || buyer.hsCodes[0]} via HS code ${buyer.hsCodes[0]}.`;

    const { response } = await chatWithFallback(
      'premium',
      systemPrompt,
      [{ role: 'user', content: userPrompt }]
    );

    const cleanProduct = cleanProducts[0] || `HS ${buyer.hsCodes[0]}`;
    const subjects: Record<FollowUpStage, string> = {
      initial: `Verified Indian Suppliers for ${cleanProduct} — Aaziko Trade Intelligence`,
      followup_1: `Re: India sourcing opportunity for ${buyer.name}`,
      followup_2: `One more thing about your ${cleanProduct} sourcing — Arjun @ Aaziko`,
      followup_3: `Closing the loop — ${buyer.name} × Aaziko`,
    };

    return { subject: subjects[stage], body: response.trim() };
  }

  private getNextStage(current: FollowUpStage): FollowUpStage | null {
    const order: FollowUpStage[] = ['initial', 'followup_1', 'followup_2', 'followup_3'];
    const idx = order.indexOf(current);
    return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
  }

  // ─── Memory upsert ────────────────────────────────────────────────────
  private async upsertMemory(buyer: ShortlistBuyer, stage: FollowUpStage): Promise<void> {
    const note = `[${new Date().toDateString()}] ${stage} email sent to ${shortlistBuyerService.extractPrimaryEmail(buyer)}`;
    await this.db.collection(COL_MEMORY).updateOne(
      { buyer_db_id: buyer._id },
      {
        $set: {
          buyer_db_id: buyer._id,
          buyer_name: buyer.name,
          buyer_country: buyer.country,
          last_email_sent_at: new Date(),
          overall_status: 'sent',
          updated_at: new Date(),
        },
        $inc: { emails_sent: 1 } as any,
        $setOnInsert: {
          icebreakers_used: [],
          topics_discussed: [],
          ai_notes: note,
          created_at: new Date(),
        } as any,
      },
      { upsert: true }
    );
  }

  // ─── Query helpers ────────────────────────────────────────────────────
  async getOutreachList(filters: {
    status?: OutreachStatus | OutreachStatus[];
    stage?: FollowUpStage;
    limit?: number;
    skip?: number;
  } = {}): Promise<{ records: EmailOutreachRecord[]; total: number }> {
    const query: any = {};

    if (filters.status) {
      query.status = Array.isArray(filters.status)
        ? { $in: filters.status }
        : filters.status;
    }
    if (filters.stage) query.stage = filters.stage;

    const [records, total] = await Promise.all([
      this.db.collection(COL_OUTREACH)
        .find(query)
        .sort({ sent_at: -1 })
        .skip(filters.skip || 0)
        .limit(Math.min(filters.limit || 50, 200))
        .toArray(),
      this.db.collection(COL_OUTREACH).countDocuments(query),
    ]);

    return {
      records: records.map((r) => ({ ...r, _id: r._id?.toString() })) as EmailOutreachRecord[],
      total,
    };
  }

  async getOutreachSummary(): Promise<Record<string, number>> {
    const pipeline = [
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ];
    const results = await this.db.collection(COL_OUTREACH).aggregate(pipeline).toArray();
    const summary: Record<string, number> = {};
    for (const r of results) summary[r._id as string] = r.count;
    return summary;
  }

  async getBuyerConversation(buyerDbId: string): Promise<any[]> {
    return this.db.collection(COL_CONV)
      .find({ buyerId: buyerDbId })
      .sort({ createdAt: 1 })
      .toArray();
  }

  async getBuyerMemory(buyerDbId: string): Promise<BuyerMemory | null> {
    return this.db.collection(COL_MEMORY).findOne({
      buyer_db_id: buyerDbId,
    }) as unknown as BuyerMemory | null;
  }

  // ─── HTML builders ────────────────────────────────────────────────────
  private buildHtml(buyer: ShortlistBuyer, body: string): string {
    const tags = buyer.products
      .slice(0, 6)
      .map((p) => p.replace(/^RAW MATERIALS FOR[^:]+:/i, '').trim())
      .map((p) => `<span style="background:#e0e7ff;color:#3730a3;border-radius:4px;padding:3px 8px;font-size:11px;white-space:nowrap">${p}</span>`)
      .join(' ');

    const htmlBody = body
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n\n/g, '</p><p style="margin:0 0 14px">')
      .replace(/\n/g, '<br>');

    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:28px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
<tr><td style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:24px 32px">
<h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">Aaziko</h1>
<p style="margin:3px 0 0;color:#93c5fd;font-size:12px">India's B2B Trade Intelligence Platform</p>
</td></tr>
<tr><td style="padding:16px 32px 0">
<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px">
<div style="font-size:13px;font-weight:600;color:#1e40af">${buyer.name} · ${buyer.country}</div>
<div style="font-size:11px;color:#3b82f6;margin-top:2px">HS ${buyer.hsCodes[0]} · ${buyer.transactionCount} shipments · $${buyer.totalAmount?.toLocaleString()} · Lead: ${buyer.lead_score}/100</div>
</div>
</td></tr>
<tr><td style="padding:20px 32px 8px;color:#1f2937;font-size:14px;line-height:1.75">
<p style="margin:0 0 14px">${htmlBody}</p>
</td></tr>
<tr><td style="padding:0 32px 20px">
<div style="display:flex;flex-wrap:wrap;gap:6px">${tags}</div>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:16px 32px">
<p style="margin:0;font-size:12px;color:#6b7280">
<strong style="color:#374151">${env.ZOHO_FROM_NAME || 'Arjun'}</strong> · Senior Trade Consultant · Aaziko<br>
<a href="mailto:${env.ZOHO_EMAIL}" style="color:#2563eb">${env.ZOHO_EMAIL}</a> · <a href="https://aaziko.com" style="color:#2563eb">aaziko.com</a>
</p>
</td></tr>
</table></td></tr></table></body></html>`;
  }

  private buildSimpleHtml(body: string): string {
    const htmlBody = body
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n\n/g, '</p><p style="margin:0 0 14px">')
      .replace(/\n/g, '<br>');

    return `<!DOCTYPE html><html><body style="font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.75;padding:24px;max-width:600px">
<p>${htmlBody}</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
<p style="font-size:12px;color:#6b7280"><strong>${env.ZOHO_FROM_NAME || 'Arjun'}</strong> · Aaziko · <a href="https://aaziko.com">aaziko.com</a></p>
</body></html>`;
  }
}

export const emailOutreachService = new EmailOutreachService();
