import logger from '../../utils/logger';
import { emailEngine } from './email.engine';
import { zohoEmailEngine } from './zoho-email.engine';
import { whatsappEngine } from './whatsapp.engine';
import { linkedinEngine } from './linkedin.engine';
import { chatEngine } from './chat.engine';
import { IChannelEngine } from './channel.interface';
import { orchestratorService } from '../orchestrator/orchestrator.service';
import {
  Channel, IncomingMessage, OutgoingMessage, ChannelMessage, DeliveryResult, BuyerProfile,
} from '../../models/types';
import Redis from 'ioredis';
import { env } from '../../config/env';
import { createRedisClient } from '../../config/redis';

const DEDUP_TTL = 300; // 5 minutes

export class ChannelRouter {
  private redis: Redis;
  private engines: Record<Channel, IChannelEngine>;

  constructor() {
    this.redis = createRedisClient('channel-router');
    const useZoho = !!env.ZOHO_EMAIL;
    this.engines = {
      email: useZoho ? zohoEmailEngine : emailEngine,
      whatsapp: whatsappEngine,
      linkedin: linkedinEngine,
      chat: chatEngine,
    };
  }

  getEngine(channel: Channel): IChannelEngine {
    return this.engines[channel];
  }

  async routeIncoming(channel: Channel, webhookPayload: any): Promise<OutgoingMessage | null> {
    const engine = this.getEngine(channel);
    const incoming = await engine.receiveWebhook(webhookPayload);

    // Deduplication
    const dedupKey = `dedup:${channel}:${incoming.senderName}:${incoming.text.substring(0, 50)}`;
    const isDuplicate = await this.redis.get(dedupKey);
    if (isDuplicate) {
      logger.warn('Duplicate message detected, skipping', { channel, sender: incoming.senderName });
      return null;
    }
    await this.redis.setex(dedupKey, DEDUP_TTL, '1');

    // Process through orchestrator
    const response = await orchestratorService.processIncoming(incoming);

    // Route response to correct channel
    await this.routeOutgoing(channel, incoming.senderEmail || incoming.senderPhone || incoming.senderName, response);

    return response;
  }

  async routeOutgoing(
    channel: Channel,
    recipient: string,
    response: OutgoingMessage
  ): Promise<DeliveryResult> {
    const engine = this.getEngine(channel);
    const formatted = engine.formatForChannel(response.text);

    if (response.subject) {
      formatted.subject = response.subject;
    }

    const result = await engine.sendMessage(recipient, formatted);

    logger.info('Message routed', {
      channel,
      recipient,
      messageId: result.messageId,
      success: result.success,
    });

    return result;
  }

  selectOptimalChannel(buyerProfile: BuyerProfile): Channel {
    // Email for first touch
    if (!buyerProfile.email && !buyerProfile.phone && buyerProfile.linkedin_url) {
      return 'linkedin';
    }

    if (buyerProfile.preferred_channel) {
      return buyerProfile.preferred_channel;
    }

    // Default strategy: email first-touch, WhatsApp for follow-up
    if (buyerProfile.trade_count === 0) {
      return buyerProfile.email ? 'email' : buyerProfile.phone ? 'whatsapp' : 'linkedin';
    }

    // Active buyers: WhatsApp if available for faster responses
    if (buyerProfile.phone) return 'whatsapp';
    if (buyerProfile.email) return 'email';
    return 'linkedin';
  }

  async sendOutbound(
    buyerProfile: BuyerProfile,
    message: string,
    channel?: Channel
  ): Promise<DeliveryResult> {
    const selectedChannel = channel || this.selectOptimalChannel(buyerProfile);
    const engine = this.getEngine(selectedChannel);
    const formatted = engine.formatForChannel(message);

    const recipient = selectedChannel === 'email'
      ? buyerProfile.email || ''
      : selectedChannel === 'whatsapp'
        ? buyerProfile.phone || ''
        : buyerProfile.linkedin_url || buyerProfile.buyer_name;

    if (!recipient) {
      logger.warn('No contact info for channel', { channel: selectedChannel, buyer: buyerProfile.buyer_name });
      return {
        success: false,
        messageId: '',
        channel: selectedChannel,
        timestamp: new Date(),
        error: `No ${selectedChannel} contact info for buyer`,
      };
    }

    return engine.sendMessage(recipient, formatted);
  }
}

export const channelRouter = new ChannelRouter();
