import { MongoClient, Db } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env';
import logger from '../../utils/logger';
import { IChannelEngine } from './channel.interface';
import {
  ChannelMessage, IncomingMessage, DeliveryResult, DeliveryStatus,
  LinkedInOutboxItem, BuyerProfile,
} from '../../models/types';

const CONNECTION_REQUEST_MAX = 300;

export class LinkedInEngine implements IChannelEngine {
  private mongo!: Db;
  private mongoClient: MongoClient;

  constructor() {
    this.mongoClient = new MongoClient(env.MONGODB_URI);
  }

  async initialize(): Promise<void> {
    await this.mongoClient.connect();
    this.mongo = this.mongoClient.db(env.MONGODB_DB);
    logger.info('LinkedInEngine initialized (queue mode)');
  }

  async sendMessage(recipient: string, message: ChannelMessage): Promise<DeliveryResult> {
    const messageId = uuidv4();
    const now = new Date();

    // LinkedIn operates in queue mode — store for human to send
    await this.mongo.collection('linkedin_outbox').insertOne({
      _id: messageId,
      buyerId: recipient,
      buyerName: recipient,
      linkedinUrl: '',
      messageType: 'message',
      generatedMessage: message.text,
      sequenceStep: 1,
      status: 'pending',
      generated_at: now,
    } as any);

    logger.info('LinkedIn message queued', { recipient, messageId });
    return { success: true, messageId, channel: 'linkedin', timestamp: now };
  }

  async receiveWebhook(payload: any): Promise<IncomingMessage> {
    // LinkedIn doesn't have real-time webhooks for messages
    // This is a placeholder for manual status updates from dashboard
    return {
      id: uuidv4(),
      channel: 'linkedin',
      senderName: payload.buyerName || '',
      text: payload.response || '',
      timestamp: new Date(),
      metadata: { source: 'manual_entry' },
    };
  }

  async getDeliveryStatus(messageId: string): Promise<DeliveryStatus> {
    const item = await this.mongo.collection('linkedin_outbox').findOne({ _id: messageId as any });
    return {
      messageId,
      status: item?.status === 'sent' ? 'delivered' : 'sent',
      timestamp: item?.sent_at || new Date(),
    };
  }

  formatForChannel(rawMessage: string): ChannelMessage {
    // LinkedIn messages should be concise, no markdown
    const cleaned = rawMessage
      .replace(/<[^>]*>/g, '')
      .replace(/\*\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .trim();
    return { text: cleaned };
  }

  async generateSequence(buyerProfile: BuyerProfile, linkedinUrl: string): Promise<LinkedInOutboxItem[]> {
    const now = new Date();
    const items: LinkedInOutboxItem[] = [];

    // Step 1: Connection request (300 char max)
    items.push({
      buyerId: buyerProfile.normalized_name,
      buyerName: buyerProfile.buyer_name,
      linkedinUrl,
      messageType: 'connection_request',
      generatedMessage: '', // Will be filled by AI
      sequenceStep: 1,
      status: 'pending',
      generated_at: now,
    });

    // Step 2: First message (insight, not a pitch)
    items.push({
      buyerId: buyerProfile.normalized_name,
      buyerName: buyerProfile.buyer_name,
      linkedinUrl,
      messageType: 'message',
      generatedMessage: '',
      sequenceStep: 2,
      status: 'pending',
      generated_at: now,
    });

    // Step 3: Follow-up (offer help, suggest call)
    items.push({
      buyerId: buyerProfile.normalized_name,
      buyerName: buyerProfile.buyer_name,
      linkedinUrl,
      messageType: 'follow_up',
      generatedMessage: '',
      sequenceStep: 3,
      status: 'pending',
      generated_at: now,
    });

    // Insert all into outbox
    if (items.length > 0) {
      await this.mongo.collection('linkedin_outbox').insertMany(items as any[]);
      logger.info('LinkedIn sequence generated', {
        buyer: buyerProfile.buyer_name,
        steps: items.length,
      });
    }

    return items;
  }

  async getOutbox(filters?: {
    status?: string;
    limit?: number;
    skip?: number;
  }): Promise<LinkedInOutboxItem[]> {
    const query: any = {};
    if (filters?.status) query.status = filters.status;

    const items = await this.mongo
      .collection('linkedin_outbox')
      .find(query)
      .sort({ generated_at: -1 })
      .limit(filters?.limit || 50)
      .skip(filters?.skip || 0)
      .toArray();

    return items as unknown as LinkedInOutboxItem[];
  }

  async markAsSent(messageId: string): Promise<void> {
    await this.mongo.collection('linkedin_outbox').updateOne(
      { _id: messageId as any },
      { $set: { status: 'sent', sent_at: new Date() } }
    );
    logger.info('LinkedIn message marked as sent', { messageId });
  }

  async markAsSkipped(messageId: string): Promise<void> {
    await this.mongo.collection('linkedin_outbox').updateOne(
      { _id: messageId as any },
      { $set: { status: 'skipped' } }
    );
  }

  async markAsResponded(messageId: string): Promise<void> {
    await this.mongo.collection('linkedin_outbox').updateOne(
      { _id: messageId as any },
      { $set: { status: 'responded' } }
    );
  }

  async close(): Promise<void> {
    await this.mongoClient.close();
  }
}

export const linkedinEngine = new LinkedInEngine();
