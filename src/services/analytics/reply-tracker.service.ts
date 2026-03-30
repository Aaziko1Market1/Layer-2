import { MongoClient, Db } from 'mongodb';
import { env } from '../../config/env';
import logger from '../../utils/logger';

export class ReplyTrackerService {
  private mongo!: Db;
  private mongoClient: MongoClient;

  constructor() {
    this.mongoClient = new MongoClient(env.MONGODB_URI);
  }

  async initialize(): Promise<void> {
    await this.mongoClient.connect();
    this.mongo = this.mongoClient.db(env.MONGODB_DB);
    logger.info('ReplyTrackerService initialized');
  }

  async getReplyRates(filters: {
    period?: 'daily' | 'weekly' | 'monthly';
    channel?: string;
    buyerTier?: string;
    modelTier?: string;
  }): Promise<Record<string, number>> {
    const now = new Date();
    let since: Date;
    switch (filters.period || 'weekly') {
      case 'daily': since = new Date(now.getTime() - 24 * 3600000); break;
      case 'weekly': since = new Date(now.getTime() - 7 * 24 * 3600000); break;
      case 'monthly': since = new Date(now.getTime() - 30 * 24 * 3600000); break;
      default: since = new Date(now.getTime() - 7 * 24 * 3600000);
    }

    const matchStage: any = { timestamp: { $gte: since } };
    if (filters.channel) matchStage.channel = filters.channel;
    if (filters.modelTier) matchStage.model_tier_used = filters.modelTier;

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$channel',
          sent: { $sum: { $cond: [{ $eq: ['$eventType', 'message_sent'] }, 1, 0] } },
          replied: { $sum: { $cond: [{ $eq: ['$eventType', 'message_replied'] }, 1, 0] } },
        },
      },
    ];

    const results = await this.mongo.collection('events').aggregate(pipeline).toArray();
    const rates: Record<string, number> = {};
    for (const r of results) {
      const channel = r._id as string;
      rates[channel] = r.sent > 0 ? Math.round((r.replied / r.sent) * 100) : 0;
    }
    return rates;
  }

  async aggregateMetrics(period: 'daily' | 'weekly' | 'monthly'): Promise<void> {
    const now = new Date();
    const rates = await this.getReplyRates({ period });

    await this.mongo.collection('metrics').insertOne({
      period,
      rates,
      aggregated_at: now,
      date_key: now.toISOString().split('T')[0],
    });

    logger.info('Metrics aggregated', { period, rates });
  }

  async getMetricsTrend(
    period: 'daily' | 'weekly' | 'monthly',
    days: number = 30
  ): Promise<any[]> {
    const since = new Date(Date.now() - days * 24 * 3600000);
    return this.mongo
      .collection('metrics')
      .find({ period, aggregated_at: { $gte: since } })
      .sort({ aggregated_at: 1 })
      .toArray();
  }

  async checkAlerts(): Promise<string[]> {
    const alerts: string[] = [];
    const rates = await this.getReplyRates({ period: 'weekly' });

    for (const [channel, rate] of Object.entries(rates)) {
      if (rate < 5) {
        alerts.push(`Reply rate for ${channel} is critically low: ${rate}%`);
      }
    }

    if (alerts.length > 0) {
      logger.warn('Reply rate alerts', { alerts });
    }

    return alerts;
  }

  async close(): Promise<void> {
    await this.mongoClient.close();
  }
}

export const replyTrackerService = new ReplyTrackerService();
