import Redis from 'ioredis';
import { env } from '../../config/env';
import { createRedisClient } from '../../config/redis';
import logger from '../../utils/logger';
import { Channel } from '../../models/types';

export class TimingEngine {
  private redis: Redis;

  constructor() {
    this.redis = createRedisClient('timing');
  }

  calculateDelay(
    channel: Channel,
    messageType: 'first_reply' | 'follow_up' | 'outbound',
    buyerTimezone?: string
  ): number {
    let baseDelay: number;

    switch (channel) {
      case 'email':
        baseDelay = messageType === 'first_reply'
          ? this.randomRange(2 * 3600000, 8 * 3600000)   // 2-8 hours
          : this.randomRange(30 * 60000, 90 * 60000);     // 30-90 min
        break;
      case 'whatsapp':
        if (this.isBusinessHours(buyerTimezone)) {
          baseDelay = this.randomRange(45000, 180000);     // 45-180 seconds
        } else {
          baseDelay = this.randomRange(2 * 3600000, 4 * 3600000); // 2-4 hours
        }
        break;
      case 'linkedin':
        baseDelay = this.randomRange(4 * 3600000, 24 * 3600000); // 4-24 hours
        break;
      case 'chat':
        baseDelay = this.randomRange(1000, 3000);          // 1-3 seconds
        break;
      default:
        baseDelay = 5000;
    }

    // Add Gaussian noise (Box-Muller transform)
    const noise = this.gaussianRandom(0, baseDelay * 0.3);
    let finalDelay = Math.max(baseDelay + noise, channel === 'chat' ? 500 : 10000);

    // Add complexity factor: 500ms per sentence in typical response
    const avgSentences = channel === 'email' ? 4 : channel === 'whatsapp' ? 2 : 3;
    finalDelay += avgSentences * 500;

    // Never send at 3 AM buyer local time
    const sendTime = this.adjustForTimezone(Date.now() + finalDelay, buyerTimezone);
    if (sendTime !== Date.now() + finalDelay) {
      finalDelay = sendTime - Date.now();
    }

    return Math.round(finalDelay);
  }

  async scheduleMessage(
    messageId: string,
    sendAtMs: number,
    payload: string
  ): Promise<void> {
    await this.redis.zadd('scheduled:messages', sendAtMs, `${messageId}:${payload}`);
    logger.info('Message scheduled', { messageId, sendAt: new Date(sendAtMs) });
  }

  async getScheduledMessages(): Promise<Array<{ id: string; payload: string }>> {
    const now = Date.now();
    const due = await this.redis.zrangebyscore('scheduled:messages', 0, now);
    const results: Array<{ id: string; payload: string }> = [];

    for (const item of due) {
      const colonIdx = item.indexOf(':');
      results.push({
        id: item.substring(0, colonIdx),
        payload: item.substring(colonIdx + 1),
      });
      await this.redis.zrem('scheduled:messages', item);
    }

    return results;
  }

  getOptimalSendWindow(channel: Channel, buyerTimezone?: string): { hour: number; dayOfWeek: number[] } {
    switch (channel) {
      case 'email':
        // Tue-Thu 9-11 AM buyer TZ for cold outreach
        return { hour: 10, dayOfWeek: [2, 3, 4] };
      case 'whatsapp':
        return { hour: 10, dayOfWeek: [1, 2, 3, 4, 5] };
      case 'linkedin':
        return { hour: 9, dayOfWeek: [2, 3, 4] };
      default:
        return { hour: 10, dayOfWeek: [1, 2, 3, 4, 5] };
    }
  }

  private isBusinessHours(timezone?: string): boolean {
    const now = new Date();
    let hours = now.getUTCHours();

    if (timezone) {
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          hour: 'numeric',
          hour12: false,
        });
        hours = parseInt(formatter.format(now), 10);
      } catch {
        // Fall back to UTC
      }
    }

    return hours >= 9 && hours <= 18;
  }

  private adjustForTimezone(sendTimeMs: number, timezone?: string): number {
    if (!timezone) return sendTimeMs;

    const sendDate = new Date(sendTimeMs);
    let hours: number;

    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false,
      });
      hours = parseInt(formatter.format(sendDate), 10);
    } catch {
      return sendTimeMs;
    }

    // If sending between 11 PM and 7 AM buyer time, shift to next morning 8-9 AM
    if (hours >= 23 || hours < 7) {
      const hoursToAdd = hours >= 23 ? (24 - hours + 8) : (8 - hours);
      const adjusted = sendTimeMs + hoursToAdd * 3600000;
      // Add some jitter (0-60 min)
      return adjusted + Math.random() * 3600000;
    }

    return sendTimeMs;
  }

  private gaussianRandom(mean: number, stddev: number): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stddev + mean;
  }

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}

export const timingEngine = new TimingEngine();
