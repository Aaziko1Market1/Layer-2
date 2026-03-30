import { MongoClient, Db, ObjectId } from 'mongodb';
import Redis from 'ioredis';
import { env } from '../../config/env';
import { createRedisClient } from '../../config/redis';
import logger from '../../utils/logger';
import { chatWithFallback } from '../orchestrator/tier-router';
import {
  BuyerOutreach,
  BuyerResponseStatus,
  InboundEmailParsed,
} from '../../models/types';

export class BuyerTrackerService {
  private mongo!: Db;
  private mongoClient: MongoClient;
  private redis: Redis;

  constructor() {
    this.mongoClient = new MongoClient(env.MONGODB_URI);
    this.redis = createRedisClient('buyer-tracker');
  }

  async initialize(): Promise<void> {
    await this.mongoClient.connect();
    this.mongo = this.mongoClient.db(env.MONGODB_DB);
    logger.info('BuyerTrackerService initialized');
  }

  async processInboundEmail(email: InboundEmailParsed): Promise<void> {
    const outreach = await this.findOutreachByEmail(email.from_email);
    if (!outreach) {
      logger.info('Inbound email not matched to any outreach', { from: email.from_email });
      return;
    }

    const classification = await this.classifyResponse(email.text_body, email.subject);

    await this.updateOutreachResponse(outreach, email, classification);

    logger.info('Buyer response processed', {
      buyer: outreach.buyer_name,
      classification,
      email: email.from_email,
    });
  }

  async classifyResponse(text: string, subject?: string): Promise<BuyerResponseStatus> {
    try {
      const systemPrompt = `You are an email response classifier for a B2B trade platform.
Classify the buyer's email reply into exactly one category:

- "interested" — buyer shows interest, wants more info, asks for pricing, samples, catalogs, or meeting
- "not_interested" — buyer explicitly says no thanks, not interested, stop emailing, wrong contact
- "question" — buyer asks a specific question about products, logistics, compliance, company
- "replied" — generic reply that doesn't clearly fit above categories

Respond with ONLY the classification word, nothing else.`;

      const content = `Subject: ${subject || 'N/A'}\n\nBody:\n${text.substring(0, 2000)}`;
      const { response } = await chatWithFallback(
        'local',
        systemPrompt,
        [{ role: 'user', content }]
      );

      const classification = response.trim().toLowerCase().replace(/[^a-z_]/g, '');

      const validStatuses: BuyerResponseStatus[] = ['interested', 'not_interested', 'question', 'replied'];
      if (validStatuses.includes(classification as BuyerResponseStatus)) {
        return classification as BuyerResponseStatus;
      }
      return 'replied';
    } catch (error) {
      logger.error('Response classification failed', { error });
      return 'replied';
    }
  }

  private async updateOutreachResponse(
    outreach: BuyerOutreach,
    email: InboundEmailParsed,
    classification: BuyerResponseStatus
  ): Promise<void> {
    const outreachId = (outreach as any)._id;

    const lastEmailIdx = outreach.emails_sent.length - 1;
    const updateFields: any = {
      response_status: classification,
      last_response_at: new Date(),
      updated_at: new Date(),
      response_summary: email.text_body.substring(0, 500),
    };

    if (classification === 'not_interested' || classification === 'interested') {
      updateFields.next_followup_at = null;
    }

    if (classification === 'not_interested') {
      updateFields.$addToSet = { tags: 'not_interested' };
    }

    const update: any = { $set: updateFields };

    if (lastEmailIdx >= 0) {
      update.$set[`emails_sent.${lastEmailIdx}.replied_at`] = new Date();
      update.$set[`emails_sent.${lastEmailIdx}.reply_text`] = email.text_body.substring(0, 2000);
      update.$set[`emails_sent.${lastEmailIdx}.reply_classification`] = classification;
    }

    await this.mongo.collection('buyer_outreach').updateOne(
      { _id: new ObjectId(outreachId) },
      update
    );

    // Update campaign stats
    await this.incrementCampaignStat(outreach.campaign_id, classification);
  }

  private async incrementCampaignStat(
    campaignId: string,
    classification: BuyerResponseStatus
  ): Promise<void> {
    const statMap: Record<string, string> = {
      interested: 'stats.total_interested',
      not_interested: 'stats.total_not_interested',
      replied: 'stats.total_replied',
      question: 'stats.total_replied',
    };
    const statField = statMap[classification];

    if (statField) {
      await this.mongo.collection('automail_campaigns').updateOne(
        { _id: new ObjectId(campaignId) },
        { $inc: { [statField]: 1 } }
      );
    }
  }

  private async findOutreachByEmail(email: string): Promise<BuyerOutreach | null> {
    const doc = await this.mongo
      .collection('buyer_outreach')
      .findOne({
        buyer_email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        response_status: { $in: ['pending', 'delivered', 'opened'] },
      });
    return doc as unknown as BuyerOutreach | null;
  }

  async getUnresponsiveBuyers(campaignId: string, daysThreshold: number = 3): Promise<BuyerOutreach[]> {
    const cutoff = new Date(Date.now() - daysThreshold * 24 * 3600 * 1000);
    const docs = await this.mongo
      .collection('buyer_outreach')
      .find({
        campaign_id: campaignId,
        response_status: { $in: ['pending', 'delivered'] },
        last_email_sent_at: { $lte: cutoff },
      })
      .sort({ last_email_sent_at: 1 })
      .toArray();
    return docs as unknown as BuyerOutreach[];
  }

  async getInterestedBuyers(campaignId?: string): Promise<BuyerOutreach[]> {
    const query: any = { response_status: 'interested' };
    if (campaignId) query.campaign_id = campaignId;

    const docs = await this.mongo
      .collection('buyer_outreach')
      .find(query)
      .sort({ last_response_at: -1 })
      .toArray();
    return docs as unknown as BuyerOutreach[];
  }

  async getNotInterestedBuyers(campaignId?: string): Promise<BuyerOutreach[]> {
    const query: any = { response_status: 'not_interested' };
    if (campaignId) query.campaign_id = campaignId;

    const docs = await this.mongo
      .collection('buyer_outreach')
      .find(query)
      .sort({ last_response_at: -1 })
      .toArray();
    return docs as unknown as BuyerOutreach[];
  }

  async getBuyersWithQuestions(campaignId?: string): Promise<BuyerOutreach[]> {
    const query: any = { response_status: 'question' };
    if (campaignId) query.campaign_id = campaignId;

    const docs = await this.mongo
      .collection('buyer_outreach')
      .find(query)
      .sort({ last_response_at: -1 })
      .toArray();
    return docs as unknown as BuyerOutreach[];
  }

  async getOutreachSummary(campaignId?: string): Promise<{
    total: number;
    by_status: Record<string, number>;
    by_stage: Record<string, number>;
    response_rate: number;
    interest_rate: number;
  }> {
    const match: any = {};
    if (campaignId) match.campaign_id = campaignId;

    const [statusAgg, stageAgg] = await Promise.all([
      this.mongo.collection('buyer_outreach').aggregate([
        { $match: match },
        { $group: { _id: '$response_status', count: { $sum: 1 } } },
      ]).toArray(),
      this.mongo.collection('buyer_outreach').aggregate([
        { $match: match },
        { $group: { _id: '$current_stage', count: { $sum: 1 } } },
      ]).toArray(),
    ]);

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const r of statusAgg) {
      byStatus[r._id as string] = r.count;
      total += r.count;
    }

    const byStage: Record<string, number> = {};
    for (const r of stageAgg) {
      byStage[r._id as string] = r.count;
    }

    const responded = (byStatus.replied || 0) + (byStatus.interested || 0) +
      (byStatus.not_interested || 0) + (byStatus.question || 0);

    return {
      total,
      by_status: byStatus,
      by_stage: byStage,
      response_rate: total > 0 ? responded / total : 0,
      interest_rate: total > 0 ? (byStatus.interested || 0) / total : 0,
    };
  }

  async tagBuyer(outreachId: string, tag: string): Promise<void> {
    await this.mongo.collection('buyer_outreach').updateOne(
      { _id: new ObjectId(outreachId) },
      { $addToSet: { tags: tag }, $set: { updated_at: new Date() } }
    );
  }

  async updateBuyerStatus(outreachId: string, status: BuyerResponseStatus): Promise<void> {
    await this.mongo.collection('buyer_outreach').updateOne(
      { _id: new ObjectId(outreachId) },
      { $set: { response_status: status, updated_at: new Date() } }
    );
  }

  async close(): Promise<void> {
    this.redis.disconnect();
    await this.mongoClient.close();
  }
}

export const buyerTrackerService = new BuyerTrackerService();
