import axios from 'axios';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env';
import { createRedisClient } from '../../config/redis';
import logger from '../../utils/logger';
import { IChannelEngine } from './channel.interface';
import { ChannelMessage, IncomingMessage, DeliveryResult, DeliveryStatus } from '../../models/types';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';
const MAX_MESSAGE_LINES = 3;

export class WhatsAppEngine implements IChannelEngine {
  private redis: Redis;

  constructor() {
    this.redis = createRedisClient('whatsapp');
  }

  async sendMessage(recipient: string, message: ChannelMessage): Promise<DeliveryResult> {
    const messageId = uuidv4();
    const now = new Date();

    if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      logger.warn('WhatsApp not configured, message stored only');
      return { success: false, messageId, channel: 'whatsapp', timestamp: now, error: 'WhatsApp not configured' };
    }

    try {
      // Check if within 24h reply window
      const windowKey = `wa:window:${recipient}`;
      const hasWindow = await this.redis.get(windowKey);

      if (!hasWindow) {
        // Must use template for first outreach
        return this.sendTemplate(recipient, message, messageId);
      }

      // Split long messages
      const parts = this.splitMessage(message.text);

      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          // 2-5 second delay between split messages
          const delay = 2000 + Math.random() * 3000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        await axios.post(
          `${WHATSAPP_API_URL}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipient,
            type: 'text',
            text: { body: parts[i] },
          },
          {
            headers: {
              Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      logger.info('WhatsApp message sent', { recipient, messageId, parts: parts.length });
      return { success: true, messageId, channel: 'whatsapp', timestamp: now };
    } catch (error) {
      logger.error('WhatsApp send failed', { recipient, error: (error as Error).message });
      return { success: false, messageId, channel: 'whatsapp', timestamp: now, error: (error as Error).message };
    }
  }

  private async sendTemplate(recipient: string, message: ChannelMessage, messageId: string): Promise<DeliveryResult> {
    const now = new Date();
    try {
      await axios.post(
        `${WHATSAPP_API_URL}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'template',
          template: {
            name: 'aaziko_first_contact',
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: message.text.substring(0, 200) }],
              },
            ],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info('WhatsApp template sent', { recipient, messageId });
      return { success: true, messageId, channel: 'whatsapp', timestamp: now };
    } catch (error) {
      logger.error('WhatsApp template send failed', { recipient, error: (error as Error).message });
      return { success: false, messageId, channel: 'whatsapp', timestamp: now, error: (error as Error).message };
    }
  }

  async receiveWebhook(payload: any): Promise<IncomingMessage> {
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const msg = value?.messages?.[0];
    const contact = value?.contacts?.[0];

    const senderPhone = msg?.from || '';
    const senderName = contact?.profile?.name || senderPhone;
    const text = msg?.text?.body || '';

    // Set 24h reply window
    if (senderPhone) {
      await this.redis.setex(`wa:window:${senderPhone}`, 86400, '1');
    }

    return {
      id: msg?.id || uuidv4(),
      channel: 'whatsapp',
      senderName,
      senderPhone,
      text,
      timestamp: new Date(parseInt(msg?.timestamp || '0', 10) * 1000),
      metadata: {
        waMessageId: msg?.id,
        phoneNumberId: value?.metadata?.phone_number_id,
        type: msg?.type,
      },
    };
  }

  async getDeliveryStatus(messageId: string): Promise<DeliveryStatus> {
    const statusKey = `wa:status:${messageId}`;
    const status = await this.redis.get(statusKey);
    return {
      messageId,
      status: (status as any) || 'sent',
      timestamp: new Date(),
    };
  }

  formatForChannel(rawMessage: string): ChannelMessage {
    // Strip HTML, limit to plain text, max 3 lines
    const cleaned = rawMessage
      .replace(/<[^>]*>/g, '')
      .replace(/\*\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .trim();

    const lines = cleaned.split('\n').filter((l) => l.trim());
    const limited = lines.slice(0, MAX_MESSAGE_LINES).join('\n');

    return { text: limited };
  }

  private splitMessage(text: string): string[] {
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length <= MAX_MESSAGE_LINES) {
      return [text];
    }

    // Split into chunks of MAX_MESSAGE_LINES
    const parts: string[] = [];
    for (let i = 0; i < lines.length; i += MAX_MESSAGE_LINES) {
      parts.push(lines.slice(i, i + MAX_MESSAGE_LINES).join('\n'));
    }
    return parts;
  }

  async handleStatusWebhook(payload: any): Promise<void> {
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const statuses = change?.value?.statuses;

    if (!statuses) return;

    for (const status of statuses) {
      const { id, status: statusType } = status;
      const statusMap: Record<string, string> = {
        sent: 'sent',
        delivered: 'delivered',
        read: 'read',
        failed: 'failed',
      };

      const mapped = statusMap[statusType] || statusType;
      await this.redis.setex(`wa:status:${id}`, 2592000, mapped);
      logger.info('WhatsApp status update', { messageId: id, status: mapped });
    }
  }

  async sendMedia(
    recipient: string,
    mediaUrl: string,
    mediaType: 'image' | 'document',
    caption?: string,
    filename?: string
  ): Promise<DeliveryResult> {
    const messageId = uuidv4();
    const now = new Date();

    try {
      const body: any = {
        messaging_product: 'whatsapp',
        to: recipient,
        type: mediaType,
      };

      if (mediaType === 'image') {
        body.image = { link: mediaUrl, caption: caption || '' };
      } else {
        body.document = { link: mediaUrl, caption: caption || '', filename: filename || 'document.pdf' };
      }

      await axios.post(
        `${WHATSAPP_API_URL}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        body,
        { headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
      );

      logger.info('WhatsApp media sent', { recipient, mediaType, messageId });
      return { success: true, messageId, channel: 'whatsapp', timestamp: now };
    } catch (error) {
      logger.error('WhatsApp media send failed', { error: (error as Error).message });
      return { success: false, messageId, channel: 'whatsapp', timestamp: now, error: (error as Error).message };
    }
  }
}

export const whatsappEngine = new WhatsAppEngine();
