import sgMail from '@sendgrid/mail';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env';
import { createRedisClient } from '../../config/redis';
import logger from '../../utils/logger';
import { IChannelEngine } from './channel.interface';
import { ChannelMessage, IncomingMessage, DeliveryResult, DeliveryStatus } from '../../models/types';

const WARMUP_INITIAL_DAILY = 20;
const WARMUP_INCREMENT = 20;
const WARMUP_DAYS = 28;
const BOUNCE_THRESHOLD = 0.05;

export class EmailEngine implements IChannelEngine {
  private redis: Redis;

  constructor() {
    if (env.SENDGRID_API_KEY) {
      sgMail.setApiKey(env.SENDGRID_API_KEY);
    }
    this.redis = createRedisClient('email');
  }

  async sendMessage(recipient: string, message: ChannelMessage): Promise<DeliveryResult> {
    const messageId = uuidv4();
    const now = new Date();

    try {
      // Check warm-up limit
      const canSend = await this.checkWarmupLimit();
      if (!canSend) {
        logger.warn('Email warm-up limit reached, message queued', { recipient });
        return {
          success: false,
          messageId,
          channel: 'email',
          timestamp: now,
          error: 'Daily send limit reached (warm-up)',
        };
      }

      // Check bounce rate
      const bounceRate = await this.getBounceRate();
      if (bounceRate > BOUNCE_THRESHOLD) {
        logger.error('Bounce rate too high, pausing sends', { bounceRate });
        return {
          success: false,
          messageId,
          channel: 'email',
          timestamp: now,
          error: `Bounce rate ${(bounceRate * 100).toFixed(1)}% exceeds 5% threshold`,
        };
      }

      const msg = {
        to: recipient,
        from: { email: 'arjun@aaziko.com', name: 'Arjun' },
        subject: message.subject || 'From Arjun at Aaziko',
        text: message.text,
        html: message.html || message.text.replace(/\n/g, '<br>'),
        trackingSettings: {
          clickTracking: { enable: true },
          openTracking: { enable: true },
        },
        customArgs: { messageId },
      };

      await sgMail.send(msg as any);

      // Increment daily counter
      const dateKey = `email:sent:${now.toISOString().split('T')[0]}`;
      await this.redis.incr(dateKey);
      await this.redis.expire(dateKey, 172800); // 48h TTL

      logger.info('Email sent', { recipient, messageId, subject: message.subject });

      return {
        success: true,
        messageId,
        channel: 'email',
        timestamp: now,
      };
    } catch (error) {
      logger.error('Email send failed', { recipient, error: (error as Error).message });
      return {
        success: false,
        messageId,
        channel: 'email',
        timestamp: now,
        error: (error as Error).message,
      };
    }
  }

  async receiveWebhook(payload: any): Promise<IncomingMessage> {
    const envelope = payload.envelope ? JSON.parse(payload.envelope) : {};
    return {
      id: uuidv4(),
      channel: 'email',
      senderName: payload.from || envelope.from || '',
      senderEmail: payload.from || envelope.from || '',
      text: payload.text || payload['stripped-text'] || '',
      subject: payload.subject || '',
      timestamp: new Date(),
      metadata: {
        to: payload.to,
        spf: payload.SPF,
        dkim: payload.dkim,
      },
    };
  }

  async getDeliveryStatus(messageId: string): Promise<DeliveryStatus> {
    const statusKey = `email:status:${messageId}`;
    const status = await this.redis.get(statusKey);
    return {
      messageId,
      status: (status as any) || 'sent',
      timestamp: new Date(),
    };
  }

  formatForChannel(rawMessage: string): ChannelMessage {
    const lines = rawMessage.split('\n');
    let subject = '';
    let body = rawMessage;

    // Extract subject if first line looks like one
    if (lines[0] && lines[0].startsWith('Subject:')) {
      subject = lines[0].replace('Subject:', '').trim();
      body = lines.slice(1).join('\n').trim();
    }

    return {
      text: body,
      subject,
      html: body.replace(/\n/g, '<br>'),
    };
  }

  async scheduleFollowUp(
    recipient: string,
    delayHours: number,
    instruction: string
  ): Promise<void> {
    const sendAt = Date.now() + delayHours * 3600 * 1000;
    const followUpData = JSON.stringify({
      recipient,
      instruction,
      scheduledAt: new Date().toISOString(),
      type: delayHours <= 96 ? 'first_followup' : delayHours <= 192 ? 'second_followup' : 'third_followup',
    });

    await this.redis.zadd('email:followup:queue', sendAt, followUpData);
    logger.info('Follow-up scheduled', { recipient, delayHours, sendAt: new Date(sendAt) });
  }

  async processFollowUpQueue(): Promise<number> {
    const now = Date.now();
    const due = await this.redis.zrangebyscore('email:followup:queue', 0, now);
    let processed = 0;

    for (const item of due) {
      try {
        const data = JSON.parse(item);
        logger.info('Processing follow-up', { recipient: data.recipient, type: data.type });
        await this.redis.zrem('email:followup:queue', item);
        processed++;
      } catch (error) {
        logger.error('Follow-up processing failed', { error });
      }
    }

    return processed;
  }

  private async checkWarmupLimit(): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];
    const dateKey = `email:sent:${today}`;
    const sent = parseInt(await this.redis.get(dateKey) || '0', 10);

    const startDateKey = 'email:warmup:start';
    let startDate = await this.redis.get(startDateKey);
    if (!startDate) {
      await this.redis.set(startDateKey, today);
      startDate = today;
    }

    const daysSinceStart = Math.floor(
      (Date.now() - new Date(startDate).getTime()) / (24 * 3600 * 1000)
    );
    const maxDaily = Math.min(
      WARMUP_INITIAL_DAILY + Math.floor(daysSinceStart / 1) * WARMUP_INCREMENT,
      1000 // Max cap
    );

    if (sent >= maxDaily) {
      logger.warn('Warm-up limit', { sent, maxDaily, daysSinceStart });
      return false;
    }

    return true;
  }

  private async getBounceRate(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const sent = parseInt(await this.redis.get(`email:sent:${today}`) || '1', 10);
    const bounced = parseInt(await this.redis.get(`email:bounced:${today}`) || '0', 10);
    return bounced / Math.max(sent, 1);
  }

  async handleEvent(event: any): Promise<void> {
    const { event: eventType, sg_message_id } = event;
    const messageId = sg_message_id?.split('.')[0] || '';

    switch (eventType) {
      case 'delivered':
      case 'open':
      case 'click':
        await this.redis.setex(`email:status:${messageId}`, 2592000, eventType === 'open' ? 'read' : 'delivered');
        break;
      case 'bounce':
      case 'dropped':
        await this.redis.setex(`email:status:${messageId}`, 2592000, 'bounced');
        const today = new Date().toISOString().split('T')[0];
        await this.redis.incr(`email:bounced:${today}`);
        break;
    }

    logger.info('Email event processed', { eventType, messageId });
  }
}

export const emailEngine = new EmailEngine();
