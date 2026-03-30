import { MongoClient, Db, ObjectId } from 'mongodb';
import { env } from '../../config/env';
import logger from '../../utils/logger';
import { HandoffItem, BuyerProfile, ConversationMessage, EmotionState } from '../../models/types';
import { conversationService } from './conversation.service';
import { eventTrackerService } from '../analytics/event-tracker.service';

interface HandoffThresholds {
  orderValueUsd: number;
  conversationTurnsMax: number;
  consecutiveNegativeSentiment: number;
  complianceConfidenceMin: number;
}

const DEFAULT_THRESHOLDS: HandoffThresholds = {
  orderValueUsd: 50000,
  conversationTurnsMax: 10,
  consecutiveNegativeSentiment: 3,
  complianceConfidenceMin: 0.60,
};

export class HandoffService {
  private mongo!: Db;
  private mongoClient: MongoClient;
  private thresholds: HandoffThresholds = DEFAULT_THRESHOLDS;

  constructor() {
    this.mongoClient = new MongoClient(env.MONGODB_URI);
  }

  async initialize(): Promise<void> {
    await this.mongoClient.connect();
    this.mongo = this.mongoClient.db(env.MONGODB_DB);
    await this.mongo.collection('handoff_queue').createIndex({ status: 1, priority: -1 });
    await this.mongo.collection('handoff_queue').createIndex({ created_at: -1 });
    logger.info('HandoffService initialized');
  }

  shouldHandoff(params: {
    estimatedOrderValue?: number;
    buyerRequestedHuman?: boolean;
    complianceConfidence?: number;
    conversationTurns?: number;
    recentEmotions?: EmotionState[];
    buyerRequestedFactoryVisit?: boolean;
    buyerRequestedVideoCall?: boolean;
  }): { shouldHandoff: boolean; reason: string } {
    if (params.buyerRequestedHuman) {
      return { shouldHandoff: true, reason: 'Buyer explicitly asked to speak with a person' };
    }

    if (params.buyerRequestedFactoryVisit) {
      return { shouldHandoff: true, reason: 'Buyer requests factory visit' };
    }

    if (params.buyerRequestedVideoCall) {
      return { shouldHandoff: true, reason: 'Buyer requests video call' };
    }

    if (params.estimatedOrderValue && params.estimatedOrderValue > this.thresholds.orderValueUsd) {
      return { shouldHandoff: true, reason: `Order discussion estimated > $${this.thresholds.orderValueUsd.toLocaleString()}` };
    }

    if (params.complianceConfidence !== undefined && params.complianceConfidence < this.thresholds.complianceConfidenceMin) {
      return { shouldHandoff: true, reason: `Compliance confidence ${(params.complianceConfidence * 100).toFixed(0)}% below ${this.thresholds.complianceConfidenceMin * 100}% threshold` };
    }

    if (params.conversationTurns && params.conversationTurns > this.thresholds.conversationTurnsMax) {
      return { shouldHandoff: true, reason: `Conversation > ${this.thresholds.conversationTurnsMax} turns without progress` };
    }

    if (params.recentEmotions && params.recentEmotions.length >= this.thresholds.consecutiveNegativeSentiment) {
      const recent = params.recentEmotions.slice(-this.thresholds.consecutiveNegativeSentiment);
      const negativeStates: EmotionState[] = ['frustrated', 'skeptical'];
      if (recent.every((e) => negativeStates.includes(e))) {
        return { shouldHandoff: true, reason: `Negative sentiment for ${this.thresholds.consecutiveNegativeSentiment}+ consecutive messages` };
      }
    }

    return { shouldHandoff: false, reason: '' };
  }

  async createHandoff(
    buyerProfile: BuyerProfile,
    conversationId: string,
    reason: string,
    contextSummary: string
  ): Promise<string> {
    const priority = this.getPriority(buyerProfile, reason);

    const result = await this.mongo.collection('handoff_queue').insertOne({
      buyerId: buyerProfile.normalized_name,
      buyerName: buyerProfile.buyer_name,
      country: buyerProfile.country,
      conversationId,
      reason,
      priority,
      contextSummary,
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date(),
    });

    await conversationService.setStatus(buyerProfile.normalized_name, 'human_takeover', reason);

    await eventTrackerService.trackHandoff(
      buyerProfile.normalized_name,
      reason,
      conversationId
    );

    logger.info('Handoff created', {
      buyerId: buyerProfile.normalized_name,
      reason,
      priority,
    });

    return result.insertedId.toString();
  }

  async getQueue(filters?: {
    status?: string;
    priority?: string;
    limit?: number;
    skip?: number;
  }): Promise<HandoffItem[]> {
    const query: any = {};
    if (filters?.status) query.status = filters.status;
    if (filters?.priority) query.priority = filters.priority;

    const items = await this.mongo
      .collection('handoff_queue')
      .find(query)
      .sort({ priority: -1, created_at: 1 })
      .limit(filters?.limit || 50)
      .skip(filters?.skip || 0)
      .toArray();

    return items as unknown as HandoffItem[];
  }

  async accept(handoffId: string, assignedTo: string): Promise<void> {
    await this.mongo.collection('handoff_queue').updateOne(
      { _id: new ObjectId(handoffId) },
      {
        $set: {
          status: 'accepted',
          assignedTo,
          updated_at: new Date(),
        },
      }
    );
    logger.info('Handoff accepted', { handoffId, assignedTo });
  }

  async returnToAI(handoffId: string): Promise<void> {
    const item = await this.mongo.collection('handoff_queue').findOne(
      { _id: new ObjectId(handoffId) }
    );

    if (item) {
      await this.mongo.collection('handoff_queue').updateOne(
        { _id: new ObjectId(handoffId) },
        { $set: { status: 'returned', updated_at: new Date() } }
      );
      await conversationService.release(item.buyerId);
    }

    logger.info('Handoff returned to AI', { handoffId });
  }

  async reassign(handoffId: string, newAssignee: string): Promise<void> {
    await this.mongo.collection('handoff_queue').updateOne(
      { _id: new ObjectId(handoffId) },
      {
        $set: {
          assignedTo: newAssignee,
          updated_at: new Date(),
        },
      }
    );
    logger.info('Handoff reassigned', { handoffId, newAssignee });
  }

  updateThresholds(newThresholds: Partial<HandoffThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    logger.info('Handoff thresholds updated', { thresholds: this.thresholds });
  }

  getThresholds(): HandoffThresholds {
    return { ...this.thresholds };
  }

  private getPriority(buyer: BuyerProfile, reason: string): 'high' | 'medium' | 'low' {
    if (buyer.buyer_tier === 'platinum' || buyer.buyer_tier === 'gold') return 'high';
    if (reason.includes('factory visit') || reason.includes('video call')) return 'high';
    if (buyer.buyer_tier === 'silver') return 'medium';
    return 'low';
  }

  async close(): Promise<void> {
    await this.mongoClient.close();
  }
}

export const handoffService = new HandoffService();
