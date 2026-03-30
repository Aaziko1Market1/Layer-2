import Redis from 'ioredis';
import { MongoClient, Db } from 'mongodb';
import { env } from '../../config/env';
import { createRedisClient } from '../../config/redis';
import logger from '../../utils/logger';
import {
  Conversation,
  ConversationMessage,
  Channel,
  CommunicationModelTier,
  ComplianceFlag,
} from '../../models/types';

export class ConversationService {
  private redis: Redis;
  private mongo!: Db;
  private mongoClient: MongoClient;

  constructor() {
    this.redis = createRedisClient('conversation');
    this.mongoClient = new MongoClient(env.MONGODB_URI);
  }

  async initialize(): Promise<void> {
    await this.mongoClient.connect();
    this.mongo = this.mongoClient.db(env.MONGODB_DB);
    logger.info('ConversationService initialized');
  }

  async addMessage(
    buyerId: string,
    message: ConversationMessage,
    channel: Channel,
    modelTier: CommunicationModelTier,
    complianceFlags: ComplianceFlag[] = []
  ): Promise<void> {
    const redisKey = `conv:${buyerId}`;

    try {
      // Store in Redis (last 10 turns, TTL 30 days)
      await this.redis.lpush(redisKey, JSON.stringify(message));
      await this.redis.ltrim(redisKey, 0, 9);
      await this.redis.expire(redisKey, 30 * 24 * 60 * 60); // 30 days

      // Store in MongoDB
      await this.mongo.collection('conversations').updateOne(
        { buyerId, channel, status: { $ne: 'closed' } },
        {
          $push: { messages: message as any },
          $set: {
            model_tier_used: modelTier,
            updated_at: new Date(),
            buyerName: message.role === 'buyer' ? buyerId : undefined,
          },
          $addToSet: complianceFlags.length > 0
            ? { compliance_flags: { $each: complianceFlags } }
            : {},
          $setOnInsert: {
            buyerId,
            channel,
            status: 'active',
            created_at: new Date(),
          },
        },
        { upsert: true }
      );

      logger.info('addMessage', { buyerId, role: message.role, channel });
    } catch (error) {
      logger.error('addMessage failed', { buyerId, error });
      throw error;
    }
  }

  async getRecentMessages(buyerId: string): Promise<ConversationMessage[]> {
    const redisKey = `conv:${buyerId}`;
    try {
      const messages = await this.redis.lrange(redisKey, 0, 9);
      return messages.map((m) => JSON.parse(m)).reverse();
    } catch (error) {
      logger.warn('Redis getRecentMessages failed, falling back to MongoDB', { buyerId });
      return this.getFromMongo(buyerId, 10);
    }
  }

  async getConversation(buyerId: string): Promise<Conversation | null> {
    try {
      const conv = await this.mongo.collection('conversations').findOne(
        { buyerId, status: { $ne: 'closed' } },
        { sort: { updated_at: -1 } }
      );
      return conv as unknown as Conversation | null;
    } catch (error) {
      logger.error('getConversation failed', { buyerId, error });
      return null;
    }
  }

  async getConversationById(conversationId: string): Promise<Conversation | null> {
    try {
      const { ObjectId } = await import('mongodb');
      const conv = await this.mongo.collection('conversations').findOne(
        { _id: new ObjectId(conversationId) }
      );
      return conv as unknown as Conversation | null;
    } catch (error) {
      logger.error('getConversationById failed', { conversationId, error });
      return null;
    }
  }

  async listConversations(filters?: {
    tier?: string;
    channel?: string;
    status?: string;
    limit?: number;
    skip?: number;
  }): Promise<Conversation[]> {
    const query: any = {};
    if (filters?.tier) query.model_tier_used = filters.tier;
    if (filters?.channel) query.channel = filters.channel;
    if (filters?.status) query.status = filters.status;

    try {
      const convs = await this.mongo
        .collection('conversations')
        .find(query)
        .sort({ updated_at: -1 })
        .limit(filters?.limit || 50)
        .skip(filters?.skip || 0)
        .toArray();
      return convs as unknown as Conversation[];
    } catch (error) {
      logger.error('listConversations failed', { error });
      return [];
    }
  }

  async setStatus(
    buyerId: string,
    status: 'active' | 'paused' | 'human_takeover' | 'closed',
    reason?: string
  ): Promise<void> {
    try {
      await this.mongo.collection('conversations').updateOne(
        { buyerId, status: { $ne: 'closed' } },
        {
          $set: {
            status,
            handoff_reason: reason,
            updated_at: new Date(),
          },
        }
      );
      logger.info('setStatus', { buyerId, status, reason });
    } catch (error) {
      logger.error('setStatus failed', { buyerId, error });
    }
  }

  async takeover(buyerId: string, assignedTo: string): Promise<void> {
    await this.setStatus(buyerId, 'human_takeover', 'Manual takeover');
    await this.mongo.collection('conversations').updateOne(
      { buyerId, status: 'human_takeover' },
      { $set: { assigned_to: assignedTo, updated_at: new Date() } }
    );
  }

  async release(buyerId: string): Promise<void> {
    await this.setStatus(buyerId, 'active', undefined);
    await this.mongo.collection('conversations').updateOne(
      { buyerId, status: 'active' },
      { $unset: { assigned_to: '' }, $set: { updated_at: new Date() } }
    );
  }

  private async getFromMongo(buyerId: string, limit: number): Promise<ConversationMessage[]> {
    const conv = await this.mongo.collection('conversations').findOne(
      { buyerId, status: { $ne: 'closed' } },
      { sort: { updated_at: -1 } }
    );
    if (!conv?.messages) return [];
    return (conv.messages as ConversationMessage[]).slice(-limit);
  }

  async close(): Promise<void> {
    this.redis.disconnect();
    await this.mongoClient.close();
  }
}

export const conversationService = new ConversationService();
