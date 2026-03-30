import { MongoClient, Db } from 'mongodb';
import Redis from 'ioredis';
import { env } from '../../config/env';
import { createRedisClient } from '../../config/redis';
import logger from '../../utils/logger';
import { AnalyticsEvent, Channel, CommunicationModelTier } from '../../models/types';

export class EventTrackerService {
  private mongo!: Db;
  private mongoClient: MongoClient;
  private redis: Redis;

  constructor() {
    this.mongoClient = new MongoClient(env.MONGODB_URI);
    this.redis = createRedisClient('event-tracker');
  }

  async initialize(): Promise<void> {
    await this.mongoClient.connect();
    this.mongo = this.mongoClient.db(env.MONGODB_DB);

    // Create TTL index (90 days)
    await this.mongo.collection('events').createIndex(
      { timestamp: 1 },
      { expireAfterSeconds: 90 * 24 * 3600 }
    );
    logger.info('EventTrackerService initialized');
  }

  async track(event: AnalyticsEvent): Promise<void> {
    try {
      await this.mongo.collection('events').insertOne({
        ...event,
        timestamp: event.timestamp || new Date(),
      });

      // Publish for real-time dashboard updates
      await this.redis.publish('events', JSON.stringify(event));

      logger.debug('Event tracked', { type: event.eventType, buyer: event.buyerId });
    } catch (error) {
      logger.error('Event tracking failed', { event: event.eventType, error });
    }
  }

  async trackMessageSent(
    buyerId: string,
    channel: Channel,
    messageId: string,
    modelTier: CommunicationModelTier,
    conversationId?: string
  ): Promise<void> {
    await this.track({
      eventType: 'message_sent',
      buyerId,
      conversationId,
      channel,
      messageId,
      model_tier_used: modelTier,
      timestamp: new Date(),
    });
  }

  async trackReply(
    buyerId: string,
    channel: Channel,
    messageId: string,
    conversationId?: string
  ): Promise<void> {
    await this.track({
      eventType: 'message_replied',
      buyerId,
      conversationId,
      channel,
      messageId,
      timestamp: new Date(),
    });
  }

  async trackHandoff(
    buyerId: string,
    reason: string,
    conversationId?: string
  ): Promise<void> {
    await this.track({
      eventType: 'handoff_triggered',
      buyerId,
      conversationId,
      channel: 'chat',
      timestamp: new Date(),
      metadata: { reason },
    });
  }

  async trackComplianceFlag(
    buyerId: string,
    claim: string,
    confidence: number,
    conversationId?: string
  ): Promise<void> {
    await this.track({
      eventType: 'compliance_flagged',
      buyerId,
      conversationId,
      channel: 'chat',
      timestamp: new Date(),
      metadata: { claim, confidence },
    });
  }

  async getRecentEvents(limit: number = 20): Promise<AnalyticsEvent[]> {
    const events = await this.mongo
      .collection('events')
      .find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    return events as unknown as AnalyticsEvent[];
  }

  async getEventCounts(period: 'daily' | 'weekly' | 'monthly'): Promise<Record<string, number>> {
    const now = new Date();
    let since: Date;

    switch (period) {
      case 'daily': since = new Date(now.getTime() - 24 * 3600000); break;
      case 'weekly': since = new Date(now.getTime() - 7 * 24 * 3600000); break;
      case 'monthly': since = new Date(now.getTime() - 30 * 24 * 3600000); break;
    }

    const pipeline = [
      { $match: { timestamp: { $gte: since } } },
      { $group: { _id: '$eventType', count: { $sum: 1 } } },
    ];

    const results = await this.mongo.collection('events').aggregate(pipeline).toArray();
    const counts: Record<string, number> = {};
    for (const r of results) {
      counts[r._id as string] = r.count;
    }
    return counts;
  }

  async close(): Promise<void> {
    this.redis.disconnect();
    await this.mongoClient.close();
  }
}

export const eventTrackerService = new EventTrackerService();
