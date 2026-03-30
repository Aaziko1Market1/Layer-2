import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env';
import { createRedisClient } from '../../config/redis';
import logger from '../../utils/logger';
import { IChannelEngine } from './channel.interface';
import {
  ChannelMessage,
  IncomingMessage,
  DeliveryResult,
  DeliveryStatus,
  InboundEmailParsed,
} from '../../models/types';

const WARMUP_INITIAL_DAILY = 20;
const WARMUP_INCREMENT = 15;
const BOUNCE_THRESHOLD = 0.05;

export class ZohoEmailEngine implements IChannelEngine {
  private redis: Redis;
  private transporter: nodemailer.Transporter | null = null;
  private imapClient: ImapFlow | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private inboundHandlers: Array<(email: InboundEmailParsed) => Promise<void>> = [];

  constructor() {
    this.redis = createRedisClient('zoho-email');
  }

  async initialize(): Promise<void> {
    if (!env.ZOHO_EMAIL) {
      logger.warn('Zoho Mail credentials not configured — email engine disabled');
      return;
    }

    // App password takes priority over plain password
    const authPassword = env.ZOHO_APP_PASSWORD || env.ZOHO_PASSWORD;
    const port = env.ZOHO_PORT;

    this.transporter = nodemailer.createTransport({
      host: env.ZOHO_HOST,
      port,
      secure: port === 465,       // true for SSL/465, false for STARTTLS/587
      requireTLS: port === 587,   // force STARTTLS on port 587
      auth: {
        user: env.ZOHO_EMAIL,
        pass: authPassword,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      rateLimit: env.AUTOMAIL_MAX_PER_HOUR,
      tls: {
        rejectUnauthorized: true,
      },
    });

    try {
      await this.transporter.verify();
      logger.info('Zoho SMTP connection verified', { email: env.ZOHO_EMAIL, port });
    } catch (error) {
      logger.error('Zoho SMTP verification failed', {
        error: (error as Error).message,
        email: env.ZOHO_EMAIL,
        host: env.ZOHO_HOST,
        port,
      });
    }

    logger.info('ZohoEmailEngine initialized');
  }

  onInboundEmail(handler: (email: InboundEmailParsed) => Promise<void>): void {
    this.inboundHandlers.push(handler);
  }

  async startInboxPolling(): Promise<void> {
    if (!env.ZOHO_EMAIL || !(env.ZOHO_APP_PASSWORD || env.ZOHO_PASSWORD)) return;

    const pollInterval = env.AUTOMAIL_INBOX_POLL_SECONDS * 1000;
    logger.info('Starting Zoho IMAP inbox polling', { intervalMs: pollInterval });

    await this.pollInbox();

    this.pollTimer = setInterval(async () => {
      try {
        await this.pollInbox();
      } catch (error) {
        logger.error('Inbox poll cycle failed', { error: (error as Error).message });
      }
    }, pollInterval);
  }

  stopInboxPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async getImapClient(): Promise<ImapFlow> {
    if (this.imapClient) {
      try {
        if (this.imapClient.usable) return this.imapClient;
      } catch { /* reconnect */ }
    }

    const authPassword = env.ZOHO_APP_PASSWORD || env.ZOHO_PASSWORD;

    this.imapClient = new ImapFlow({
      host: env.ZOHO_IMAP_HOST,
      port: env.ZOHO_IMAP_PORT,
      secure: true,
      auth: {
        user: env.ZOHO_EMAIL,
        pass: authPassword,
      },
      logger: false,
    });

    await this.imapClient.connect();
    return this.imapClient;
  }

  private async pollInbox(): Promise<void> {
    let client: ImapFlow | null = null;
    try {
      client = await this.getImapClient();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const lastPollKey = 'zoho:last_poll_uid';
        const lastUid = parseInt(await this.redis.get(lastPollKey) || '0', 10);

        const searchCriteria: any = lastUid > 0
          ? { uid: `${lastUid + 1}:*` }
          : { seen: false };

        let maxUid = lastUid;

        for await (const message of client.fetch(searchCriteria, {
          envelope: true,
          source: true,
          uid: true,
          headers: ['in-reply-to', 'references', 'message-id'],
        })) {
          if (message.uid <= lastUid) continue;

          const parsed = this.parseImapMessage(message);
          if (parsed) {
            const dedupKey = `zoho:dedup:${parsed.message_id}`;
            const seen = await this.redis.get(dedupKey);
            if (!seen) {
              await this.redis.setex(dedupKey, 86400 * 7, '1');
              for (const handler of this.inboundHandlers) {
                try {
                  await handler(parsed);
                } catch (err) {
                  logger.error('Inbound handler failed', { error: (err as Error).message });
                }
              }
            }
          }

          if (message.uid > maxUid) maxUid = message.uid;
        }

        if (maxUid > lastUid) {
          await this.redis.set(lastPollKey, maxUid.toString());
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      logger.error('IMAP poll failed', { error: (error as Error).message });
      if (this.imapClient) {
        try { await this.imapClient.logout(); } catch { /* ignore */ }
        this.imapClient = null;
      }
    }
  }

  private parseImapMessage(message: any): InboundEmailParsed | null {
    try {
      const envelope = message.envelope;
      if (!envelope) return null;

      const fromAddr = envelope.from?.[0];
      const fromEmail = fromAddr
        ? `${fromAddr.mailbox}@${fromAddr.host}`
        : '';
      const fromName = fromAddr?.name || fromEmail;

      const toAddr = envelope.to?.[0];
      const toEmail = toAddr
        ? `${toAddr.mailbox}@${toAddr.host}`
        : env.ZOHO_EMAIL;

      const source = message.source?.toString('utf-8') || '';
      const textBody = this.extractTextFromSource(source);

      const headers: Record<string, string> = {};
      if (message.headers) {
        for (const [key, value] of message.headers) {
          headers[key] = Array.isArray(value) ? value.join(', ') : value;
        }
      }

      return {
        from_email: fromEmail,
        from_name: fromName,
        to_email: toEmail,
        subject: envelope.subject || '',
        text_body: textBody,
        html_body: this.extractHtmlFromSource(source),
        in_reply_to: envelope.inReplyTo || headers['in-reply-to'] || undefined,
        message_id: envelope.messageId || uuidv4(),
        date: envelope.date ? new Date(envelope.date) : new Date(),
        headers,
      };
    } catch (error) {
      logger.error('Failed to parse IMAP message', { error });
      return null;
    }
  }

  private extractTextFromSource(source: string): string {
    const textMatch = source.match(/Content-Type:\s*text\/plain[^]*?\r?\n\r?\n([^]*?)(?=\r?\n--|\r?\n\.\r?\n|$)/i);
    if (textMatch) return textMatch[1].trim();

    return source
      .replace(/<[^>]+>/g, '')
      .replace(/\r\n/g, '\n')
      .split('\n\n')
      .slice(1)
      .join('\n\n')
      .trim()
      .substring(0, 10000);
  }

  private extractHtmlFromSource(source: string): string | undefined {
    const htmlMatch = source.match(/Content-Type:\s*text\/html[^]*?\r?\n\r?\n([^]*?)(?=\r?\n--|\r?\n\.\r?\n|$)/i);
    return htmlMatch ? htmlMatch[1].trim() : undefined;
  }

  async sendMessage(recipient: string, message: ChannelMessage): Promise<DeliveryResult> {
    const messageId = uuidv4();
    const now = new Date();

    if (!this.transporter) {
      return {
        success: false,
        messageId,
        channel: 'email',
        timestamp: now,
        error: 'Zoho email not configured',
      };
    }

    try {
      const canSend = await this.checkRateLimit();
      if (!canSend) {
        logger.warn('Rate limit reached, message queued', { recipient });
        return {
          success: false,
          messageId,
          channel: 'email',
          timestamp: now,
          error: 'Rate limit reached — message queued',
        };
      }

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

      const info = await this.transporter.sendMail({
        from: `"${env.ZOHO_FROM_NAME}" <${env.ZOHO_EMAIL}>`,
        replyTo: env.ZOHO_REPLY_TO || env.ZOHO_EMAIL,
        to: recipient,
        subject: message.subject || `Message from ${env.ZOHO_FROM_NAME} at Aaziko`,
        text: message.text,
        html: message.html || message.text.replace(/\n/g, '<br>'),
        headers: {
          'X-Aaziko-MessageId': messageId,
          'X-Aaziko-Campaign': 'auto-outreach',
        },
        messageId: `<${messageId}@aaziko.com>`,
      });

      const dateKey = `zoho:sent:${now.toISOString().split('T')[0]}`;
      const hourKey = `zoho:sent:hour:${now.toISOString().split(':')[0]}`;
      await this.redis.incr(dateKey);
      await this.redis.expire(dateKey, 172800);
      await this.redis.incr(hourKey);
      await this.redis.expire(hourKey, 7200);

      await this.redis.setex(`zoho:status:${messageId}`, 2592000, 'sent');

      logger.info('Zoho email sent', {
        recipient,
        messageId,
        subject: message.subject,
        zohoMsgId: info.messageId,
      });

      return {
        success: true,
        messageId,
        channel: 'email',
        timestamp: now,
      };
    } catch (error) {
      logger.error('Zoho email send failed', { recipient, error: (error as Error).message });

      if ((error as any).responseCode === 550) {
        const today = now.toISOString().split('T')[0];
        await this.redis.incr(`zoho:bounced:${today}`);
      }

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
    return {
      id: uuidv4(),
      channel: 'email',
      senderName: payload.from_name || payload.from_email || '',
      senderEmail: payload.from_email || '',
      text: payload.text_body || payload.text || '',
      subject: payload.subject || '',
      timestamp: payload.date ? new Date(payload.date) : new Date(),
      metadata: {
        in_reply_to: payload.in_reply_to,
        message_id: payload.message_id,
        headers: payload.headers,
      },
    };
  }

  async getDeliveryStatus(messageId: string): Promise<DeliveryStatus> {
    const statusKey = `zoho:status:${messageId}`;
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

    if (lines[0] && lines[0].startsWith('Subject:')) {
      subject = lines[0].replace('Subject:', '').trim();
      body = lines.slice(1).join('\n').trim();
    }

    return {
      text: body,
      subject,
      html: this.textToHtml(body),
    };
  }

  private textToHtml(text: string): string {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const withLinks = escaped.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" style="color:#2563eb">$1</a>'
    );

    return `
      <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.6;max-width:600px">
        ${withLinks.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px">
        <p style="font-size:12px;color:#6b7280">
          Sent by Aaziko AI Trade Platform<br>
          <a href="https://aaziko.com" style="color:#2563eb">aaziko.com</a>
        </p>
      </div>
    `.trim();
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
      sendAt,
      type: delayHours <= 48
        ? 'first_followup'
        : delayHours <= 96
          ? 'second_followup'
          : delayHours <= 168
            ? 'third_followup'
            : 'final_followup',
    });

    await this.redis.zadd('zoho:followup:queue', sendAt, followUpData);
    logger.info('Follow-up scheduled', { recipient, delayHours, sendAt: new Date(sendAt) });
  }

  async processFollowUpQueue(): Promise<number> {
    const now = Date.now();
    const due = await this.redis.zrangebyscore('zoho:followup:queue', 0, now);
    let processed = 0;

    for (const item of due) {
      try {
        const data = JSON.parse(item);
        logger.info('Processing follow-up', { recipient: data.recipient, type: data.type });
        await this.redis.zrem('zoho:followup:queue', item);
        processed++;
      } catch (error) {
        logger.error('Follow-up processing failed', { error });
      }
    }

    return processed;
  }

  async updateDeliveryStatus(messageId: string, status: string): Promise<void> {
    await this.redis.setex(`zoho:status:${messageId}`, 2592000, status);
    if (status === 'bounced') {
      const today = new Date().toISOString().split('T')[0];
      await this.redis.incr(`zoho:bounced:${today}`);
    }
  }

  private async checkRateLimit(): Promise<boolean> {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const hour = now.toISOString().split(':')[0];

    const dailySent = parseInt(await this.redis.get(`zoho:sent:${today}`) || '0', 10);
    if (dailySent >= env.AUTOMAIL_MAX_PER_DAY) {
      logger.warn('Daily send limit reached', { dailySent, max: env.AUTOMAIL_MAX_PER_DAY });
      return false;
    }

    const hourlySent = parseInt(await this.redis.get(`zoho:sent:hour:${hour}`) || '0', 10);
    if (hourlySent >= env.AUTOMAIL_MAX_PER_HOUR) {
      logger.warn('Hourly send limit reached', { hourlySent, max: env.AUTOMAIL_MAX_PER_HOUR });
      return false;
    }

    if (!this.isWithinWorkingHours()) {
      logger.info('Outside working hours, deferring send');
      return false;
    }

    return true;
  }

  private isWithinWorkingHours(): boolean {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: env.AUTOMAIL_TIMEZONE,
      hour: 'numeric',
      hour12: false,
    });
    const hour = parseInt(formatter.format(now), 10);

    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: env.AUTOMAIL_TIMEZONE,
      weekday: 'short',
    });
    const day = dayFormatter.format(now);
    const workingDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    if (!workingDays.includes(day)) return false;

    return hour >= env.AUTOMAIL_WORKING_HOURS_START && hour < env.AUTOMAIL_WORKING_HOURS_END;
  }

  private async getBounceRate(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const sent = parseInt(await this.redis.get(`zoho:sent:${today}`) || '1', 10);
    const bounced = parseInt(await this.redis.get(`zoho:bounced:${today}`) || '0', 10);
    return bounced / Math.max(sent, 1);
  }

  async getDailyStats(): Promise<{
    sent: number;
    bounced: number;
    remaining: number;
    bounceRate: number;
  }> {
    const today = new Date().toISOString().split('T')[0];
    const sent = parseInt(await this.redis.get(`zoho:sent:${today}`) || '0', 10);
    const bounced = parseInt(await this.redis.get(`zoho:bounced:${today}`) || '0', 10);
    return {
      sent,
      bounced,
      remaining: Math.max(0, env.AUTOMAIL_MAX_PER_DAY - sent),
      bounceRate: bounced / Math.max(sent, 1),
    };
  }

  async close(): Promise<void> {
    this.stopInboxPolling();
    if (this.imapClient) {
      try { await this.imapClient.logout(); } catch { /* ignore */ }
    }
    if (this.transporter) {
      this.transporter.close();
    }
    this.redis.disconnect();
  }
}

export const zohoEmailEngine = new ZohoEmailEngine();
