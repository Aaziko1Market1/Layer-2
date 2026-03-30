import { MongoClient, Db, ObjectId } from 'mongodb';
import Redis from 'ioredis';
import { env } from '../../config/env';
import { createRedisClient } from '../../config/redis';
import logger from '../../utils/logger';
import { zohoEmailEngine } from '../channels/zoho-email.engine';
import { chatWithFallback, getModelTier } from '../orchestrator/tier-router';
import {
  AutoMailCampaign,
  BuyerOutreach,
  BuyerProfile,
  OutreachEmail,
  CampaignStatus,
  FollowUpStage,
  EmailSequenceStep,
  CampaignStats,
} from '../../models/types';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_SEQUENCE: EmailSequenceStep[] = [
  {
    stage: 'initial_outreach',
    delay_hours: 0,
    subject_template: 'Partnership opportunity — {product_category} from India',
    prompt_instruction: 'Write a personalized first-touch email to this buyer. Reference their specific trade data. Be concise, professional, and show clear value. End with a specific question about their current sourcing needs.',
    enabled: true,
  },
  {
    stage: 'first_followup',
    delay_hours: 48,
    subject_template: 'Re: Partnership opportunity — {product_category}',
    prompt_instruction: 'Write a brief follow-up. Reference the initial email. Share a quick market insight or competitive advantage relevant to their products. Keep it short (3-4 sentences).',
    enabled: true,
  },
  {
    stage: 'second_followup',
    delay_hours: 96,
    subject_template: 'Quick question about {product_category} sourcing',
    prompt_instruction: 'Write a value-add follow-up. Share a specific data point about their market or product category. Ask if timing is better now. Mention you respect their time.',
    enabled: true,
  },
  {
    stage: 'third_followup',
    delay_hours: 168,
    subject_template: 'Last note — {buyer_name}',
    prompt_instruction: 'Write a final polite follow-up. Mention this is the last email unless they are interested. Be gracious and leave the door open for future contact.',
    enabled: true,
  },
];

export class CampaignService {
  private mongo!: Db;
  private mongoClient: MongoClient;
  private redis: Redis;
  private processingLock = false;

  constructor() {
    this.mongoClient = new MongoClient(env.MONGODB_URI);
    this.redis = createRedisClient('campaign');
  }

  async initialize(): Promise<void> {
    await this.mongoClient.connect();
    this.mongo = this.mongoClient.db(env.MONGODB_DB);

    await this.mongo.collection('automail_campaigns').createIndex({ status: 1 });
    await this.mongo.collection('buyer_outreach').createIndex({ campaign_id: 1, buyer_email: 1 }, { unique: true });
    await this.mongo.collection('buyer_outreach').createIndex({ response_status: 1 });
    await this.mongo.collection('buyer_outreach').createIndex({ next_followup_at: 1 });

    logger.info('CampaignService initialized');
  }

  async createCampaign(params: {
    name: string;
    description?: string;
    persona?: string;
    target_filters: AutoMailCampaign['target_filters'];
    sequence?: EmailSequenceStep[];
  }): Promise<AutoMailCampaign> {
    const campaign: AutoMailCampaign = {
      campaign_name: params.name,
      description: params.description,
      persona: params.persona || 'arjun',
      status: 'draft',
      target_filters: params.target_filters,
      email_sequence: params.sequence || DEFAULT_SEQUENCE,
      stats: {
        total_targeted: 0,
        total_sent: 0,
        total_delivered: 0,
        total_opened: 0,
        total_replied: 0,
        total_interested: 0,
        total_not_interested: 0,
        total_bounced: 0,
      },
      created_at: new Date(),
      updated_at: new Date(),
    };

    const { _id, ...campaignDoc } = campaign;
    const result = await this.mongo.collection('automail_campaigns').insertOne(campaignDoc);
    campaign._id = result.insertedId.toHexString();

    logger.info('Campaign created', { id: campaign._id, name: campaign.campaign_name });
    return campaign;
  }

  async activateCampaign(campaignId: string): Promise<{ targeted: number }> {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status === 'active') throw new Error('Campaign already active');

    const buyers = await this.findTargetBuyers(campaign);
    let created = 0;

    for (const buyer of buyers) {
      if (!buyer.email) continue;

      try {
        await this.mongo.collection('buyer_outreach').insertOne({
          campaign_id: campaignId,
          buyer_id: buyer._id?.toString() || buyer.normalized_name,
          buyer_name: buyer.buyer_name,
          buyer_email: buyer.email,
          buyer_country: buyer.country,
          buyer_tier: buyer.buyer_tier,
          current_stage: 'initial_outreach',
          response_status: 'pending',
          emails_sent: [],
          tags: [],
          created_at: new Date(),
          updated_at: new Date(),
        });
        created++;
      } catch (error: any) {
        if (error.code !== 11000) { // skip duplicates
          logger.error('Failed to create outreach record', { buyer: buyer.buyer_name, error });
        }
      }
    }

    await this.mongo.collection('automail_campaigns').updateOne(
      { _id: new ObjectId(campaignId) },
      {
        $set: {
          status: 'active',
          'stats.total_targeted': created,
          updated_at: new Date(),
        },
      }
    );

    logger.info('Campaign activated', { campaignId, targeted: created });
    return { targeted: created };
  }

  async processCampaigns(): Promise<{ sent: number; followups: number }> {
    if (this.processingLock) return { sent: 0, followups: 0 };
    this.processingLock = true;

    let totalSent = 0;
    let totalFollowups = 0;

    try {
      const activeCampaigns = await this.mongo
        .collection('automail_campaigns')
        .find({ status: 'active' })
        .toArray() as unknown as AutoMailCampaign[];

      for (const campaign of activeCampaigns) {
        const { sent, followups } = await this.processSingleCampaign(campaign);
        totalSent += sent;
        totalFollowups += followups;
      }
    } catch (error) {
      logger.error('Campaign processing failed', { error });
    } finally {
      this.processingLock = false;
    }

    if (totalSent > 0 || totalFollowups > 0) {
      logger.info('Campaign cycle complete', { sent: totalSent, followups: totalFollowups });
    }

    return { sent: totalSent, followups: totalFollowups };
  }

  private async processSingleCampaign(
    campaign: AutoMailCampaign
  ): Promise<{ sent: number; followups: number }> {
    let sent = 0;
    let followups = 0;
    const campaignId = (campaign as any)._id?.toString();

    // 1. Send initial outreach emails to pending buyers
    const pendingOutreach = await this.mongo
      .collection('buyer_outreach')
      .find({
        campaign_id: campaignId,
        response_status: 'pending',
        current_stage: 'initial_outreach',
        'emails_sent.0': { $exists: false },
      })
      .limit(10)
      .toArray() as unknown as BuyerOutreach[];

    for (const outreach of pendingOutreach) {
      try {
        const success = await this.sendCampaignEmail(campaign, outreach, 'initial_outreach');
        if (success) sent++;
      } catch (error) {
        logger.error('Initial outreach send failed', { buyer: outreach.buyer_name, error });
      }
    }

    // 2. Process follow-ups for non-responders
    const now = new Date();
    const dueFollowups = await this.mongo
      .collection('buyer_outreach')
      .find({
        campaign_id: campaignId,
        response_status: { $in: ['pending', 'delivered', 'opened'] },
        next_followup_at: { $lte: now },
      })
      .limit(10)
      .toArray() as unknown as BuyerOutreach[];

    for (const outreach of dueFollowups) {
      try {
        const nextStage = this.getNextStage(outreach.current_stage);
        if (!nextStage) continue;

        const stepConfig = campaign.email_sequence.find((s) => s.stage === nextStage);
        if (!stepConfig?.enabled) continue;

        const success = await this.sendCampaignEmail(campaign, outreach, nextStage);
        if (success) followups++;
      } catch (error) {
        logger.error('Follow-up send failed', { buyer: outreach.buyer_name, error });
      }
    }

    return { sent, followups };
  }

  private async sendCampaignEmail(
    campaign: AutoMailCampaign,
    outreach: BuyerOutreach,
    stage: FollowUpStage
  ): Promise<boolean> {
    const stepConfig = campaign.email_sequence.find((s) => s.stage === stage);
    if (!stepConfig) return false;

    const buyerProfile = await this.mongo
      .collection('buyer_profiles')
      .findOne({ email: outreach.buyer_email }) as unknown as BuyerProfile | null;

    const { subject, body } = await this.generateEmail(
      campaign,
      outreach,
      stepConfig,
      buyerProfile
    );

    const result = await zohoEmailEngine.sendMessage(outreach.buyer_email, {
      text: body,
      subject,
      html: undefined,
    });

    if (result.success) {
      const emailRecord: OutreachEmail = {
        message_id: result.messageId,
        stage,
        subject,
        body_text: body,
        sent_at: new Date(),
      };

      const nextStage = this.getNextStage(stage);
      const nextStep = nextStage
        ? campaign.email_sequence.find((s) => s.stage === nextStage)
        : null;

      const nextFollowupAt = nextStep?.enabled
        ? new Date(Date.now() + nextStep.delay_hours * 3600 * 1000)
        : undefined;

      await this.mongo.collection('buyer_outreach').updateOne(
        { _id: new ObjectId((outreach as any)._id) },
        {
          $push: { emails_sent: emailRecord as any },
          $set: {
            current_stage: stage,
            last_email_sent_at: new Date(),
            next_followup_at: nextFollowupAt,
            updated_at: new Date(),
          },
        }
      );

      await this.mongo.collection('automail_campaigns').updateOne(
        { _id: new ObjectId((campaign as any)._id) },
        { $inc: { 'stats.total_sent': 1 } }
      );

      logger.info('Campaign email sent', {
        buyer: outreach.buyer_name,
        stage,
        messageId: result.messageId,
      });
      return true;
    }

    return false;
  }

  private async generateEmail(
    campaign: AutoMailCampaign,
    outreach: BuyerOutreach,
    step: EmailSequenceStep,
    buyerProfile: BuyerProfile | null
  ): Promise<{ subject: string; body: string }> {
    const subject = step.subject_template
      .replace('{buyer_name}', outreach.buyer_name)
      .replace('{product_category}', buyerProfile?.product_categories?.[0] || 'trade products')
      .replace('{country}', outreach.buyer_country);

    const previousEmails = outreach.emails_sent
      .map((e) => `[${e.stage}] ${e.subject}\n${e.body_text.substring(0, 200)}...`)
      .join('\n---\n');

    const buyerContext = buyerProfile
      ? `
Buyer: ${buyerProfile.buyer_name}
Company: ${buyerProfile.company || 'N/A'}
Country: ${buyerProfile.country}
Tier: ${buyerProfile.buyer_tier}
Products: ${buyerProfile.product_categories.join(', ')}
HS Codes: ${buyerProfile.hs_codes.join(', ')}
Trade Volume: $${buyerProfile.total_trade_volume_usd.toLocaleString()}
Trade Count: ${buyerProfile.trade_count}
Top Supplier: ${buyerProfile.top_supplier}
Ports: ${buyerProfile.ports_used.join(', ')}
`.trim()
      : `Buyer: ${outreach.buyer_name}\nCountry: ${outreach.buyer_country}`;

    const systemPrompt = `You are ${campaign.persona || 'Arjun'}, a senior trade consultant at Aaziko — India's premier B2B trade platform connecting global buyers with verified Indian manufacturers and suppliers.

Write a personalized email for the following buyer. Your tone is professional, warm, and data-driven.

BUYER PROFILE:
${buyerContext}

${previousEmails ? `PREVIOUS EMAILS IN THIS SEQUENCE:\n${previousEmails}\n` : ''}
CURRENT STAGE: ${step.stage}
INSTRUCTION: ${step.prompt_instruction}

Rules:
- Do NOT include "Subject:" line — subject is handled separately
- Do NOT use placeholder brackets like [Name]
- Reference specific buyer data naturally
- Keep email concise (150-250 words max)
- End with a clear call-to-action or question
- Sign off as ${campaign.persona || 'Arjun'} from Aaziko`;

    const tier = getModelTier(buyerProfile);
    const { response } = await chatWithFallback(
      tier,
      systemPrompt,
      [{ role: 'user', content: `Generate the email body for stage: ${step.stage}` }]
    );

    return { subject, body: response.trim() };
  }

  private getNextStage(current: FollowUpStage): FollowUpStage | null {
    const stages: FollowUpStage[] = [
      'initial_outreach',
      'first_followup',
      'second_followup',
      'third_followup',
      'final_followup',
    ];
    const idx = stages.indexOf(current);
    return idx >= 0 && idx < stages.length - 1 ? stages[idx + 1] : null;
  }

  private async findTargetBuyers(campaign: AutoMailCampaign): Promise<BuyerProfile[]> {
    const query: any = { email: { $exists: true, $ne: '' } };
    const filters = campaign.target_filters;

    if (filters.countries?.length) {
      query.country = { $in: filters.countries };
    }
    if (filters.buyer_tiers?.length) {
      query.buyer_tier = { $in: filters.buyer_tiers };
    }
    if (filters.hs_codes?.length) {
      query.hs_codes = { $in: filters.hs_codes };
    }
    if (filters.product_categories?.length) {
      query.product_categories = { $in: filters.product_categories };
    }
    if (filters.min_trade_volume) {
      query.total_trade_volume_usd = query.total_trade_volume_usd || {};
      query.total_trade_volume_usd.$gte = filters.min_trade_volume;
    }
    if (filters.max_trade_volume) {
      query.total_trade_volume_usd = query.total_trade_volume_usd || {};
      query.total_trade_volume_usd.$lte = filters.max_trade_volume;
    }

    if (filters.exclude_not_interested) {
      const notInterested = await this.mongo
        .collection('buyer_outreach')
        .distinct('buyer_email', { response_status: 'not_interested' });
      if (notInterested.length) {
        query.email = { ...query.email, $nin: notInterested };
      }
    }

    const buyers = await this.mongo
      .collection('buyer_profiles')
      .find(query)
      .limit(500)
      .toArray();

    return buyers as unknown as BuyerProfile[];
  }

  async getCampaign(campaignId: string): Promise<AutoMailCampaign | null> {
    const doc = await this.mongo
      .collection('automail_campaigns')
      .findOne({ _id: new ObjectId(campaignId) });
    return doc as unknown as AutoMailCampaign | null;
  }

  async listCampaigns(status?: CampaignStatus): Promise<AutoMailCampaign[]> {
    const query = status ? { status } : {};
    const docs = await this.mongo
      .collection('automail_campaigns')
      .find(query)
      .sort({ updated_at: -1 })
      .toArray();
    return docs as unknown as AutoMailCampaign[];
  }

  async pauseCampaign(campaignId: string): Promise<void> {
    await this.mongo.collection('automail_campaigns').updateOne(
      { _id: new ObjectId(campaignId) },
      { $set: { status: 'paused', updated_at: new Date() } }
    );
  }

  async resumeCampaign(campaignId: string): Promise<void> {
    await this.mongo.collection('automail_campaigns').updateOne(
      { _id: new ObjectId(campaignId) },
      { $set: { status: 'active', updated_at: new Date() } }
    );
  }

  async getCampaignOutreach(
    campaignId: string,
    filters?: { status?: string; limit?: number; skip?: number }
  ): Promise<BuyerOutreach[]> {
    const query: any = { campaign_id: campaignId };
    if (filters?.status) query.response_status = filters.status;

    const docs = await this.mongo
      .collection('buyer_outreach')
      .find(query)
      .sort({ updated_at: -1 })
      .limit(filters?.limit || 50)
      .skip(filters?.skip || 0)
      .toArray();

    return docs as unknown as BuyerOutreach[];
  }

  async getCampaignStats(campaignId: string): Promise<CampaignStats & { by_status: Record<string, number> }> {
    const pipeline = [
      { $match: { campaign_id: campaignId } },
      { $group: { _id: '$response_status', count: { $sum: 1 } } },
    ];

    const results = await this.mongo
      .collection('buyer_outreach')
      .aggregate(pipeline)
      .toArray();

    const byStatus: Record<string, number> = {};
    for (const r of results) {
      byStatus[r._id as string] = r.count;
    }

    return {
      total_targeted: Object.values(byStatus).reduce((a, b) => a + b, 0),
      total_sent: (byStatus.delivered || 0) + (byStatus.opened || 0) + (byStatus.replied || 0) +
        (byStatus.interested || 0) + (byStatus.not_interested || 0) + (byStatus.question || 0) +
        (byStatus.pending || 0),
      total_delivered: byStatus.delivered || 0,
      total_opened: byStatus.opened || 0,
      total_replied: (byStatus.replied || 0) + (byStatus.interested || 0) +
        (byStatus.not_interested || 0) + (byStatus.question || 0),
      total_interested: byStatus.interested || 0,
      total_not_interested: byStatus.not_interested || 0,
      total_bounced: byStatus.bounced || 0,
      by_status: byStatus,
    };
  }

  async close(): Promise<void> {
    this.redis.disconnect();
    await this.mongoClient.close();
  }
}

export const campaignService = new CampaignService();
