import sgMail from '@sendgrid/mail';
import { MongoClient, Db } from 'mongodb';
import { env } from '../../config/env';
import logger from '../../utils/logger';
import { eventTrackerService } from './event-tracker.service';
import { replyTrackerService } from './reply-tracker.service';
import { abTestService } from './ab-test.service';
import { promptOptimizerService } from './prompt-optimizer.service';

export class WeeklyDigestService {
  private mongo!: Db;
  private mongoClient: MongoClient;

  constructor() {
    this.mongoClient = new MongoClient(env.MONGODB_URI);
  }

  async initialize(): Promise<void> {
    await this.mongoClient.connect();
    this.mongo = this.mongoClient.db(env.MONGODB_DB);
    if (env.SENDGRID_API_KEY) {
      sgMail.setApiKey(env.SENDGRID_API_KEY);
    }
    logger.info('WeeklyDigestService initialized');
  }

  async generateAndSend(): Promise<void> {
    if (!env.WEEKLY_DIGEST_ENABLED) {
      logger.info('Weekly digest is disabled');
      return;
    }

    const adminEmails = env.ADMIN_EMAILS.split(',').map((e) => e.trim()).filter(Boolean);
    if (adminEmails.length === 0) {
      logger.warn('No admin emails configured for weekly digest');
      return;
    }

    try {
      const [weeklyCounts, replyRates, experiments, report] = await Promise.all([
        eventTrackerService.getEventCounts('weekly'),
        replyTrackerService.getReplyRates({ period: 'weekly' }),
        abTestService.listExperiments(),
        promptOptimizerService.getLatestReport(),
      ]);

      // Model tier breakdown
      const tierBreakdown = await this.getModelTierBreakdown();

      const html = this.buildDigestHtml({
        weeklyCounts,
        replyRates,
        experiments: experiments.filter((e) => e.status === 'active'),
        report,
        tierBreakdown,
      });

      if (!env.SENDGRID_API_KEY) {
        logger.warn('SendGrid API key not set, storing digest locally only');
        await this.storeDigest(html, weeklyCounts);
        return;
      }

      await sgMail.send({
        to: adminEmails,
        from: { email: 'arjun@aaziko.com', name: 'Aaziko AI Communicator' },
        subject: `Weekly AI Communicator Digest — ${new Date().toLocaleDateString('en-IN')}`,
        html,
      });

      await this.storeDigest(html, weeklyCounts);
      logger.info('Weekly digest sent', { recipients: adminEmails.length });
    } catch (error) {
      logger.error('Weekly digest generation/send failed', { error });
    }
  }

  private async getModelTierBreakdown(): Promise<Record<string, number>> {
    const pipeline = [
      {
        $match: {
          eventType: 'message_sent',
          timestamp: { $gte: new Date(Date.now() - 7 * 24 * 3600000) },
        },
      },
      { $group: { _id: '$model_tier_used', count: { $sum: 1 } } },
    ];

    const results = await this.mongo.collection('events').aggregate(pipeline).toArray();
    const breakdown: Record<string, number> = {};
    for (const r of results) {
      breakdown[r._id as string || 'unknown'] = r.count;
    }
    return breakdown;
  }

  private buildDigestHtml(data: {
    weeklyCounts: Record<string, number>;
    replyRates: Record<string, number>;
    experiments: any[];
    report: any;
    tierBreakdown: Record<string, number>;
  }): string {
    const { weeklyCounts, replyRates, experiments, report, tierBreakdown } = data;

    const sent = weeklyCounts['message_sent'] || 0;
    const replied = weeklyCounts['message_replied'] || 0;
    const meetings = weeklyCounts['meeting_booked'] || 0;
    const handoffs = weeklyCounts['handoff_triggered'] || 0;
    const flags = weeklyCounts['compliance_flagged'] || 0;
    const overallReplyRate = sent > 0 ? ((replied / sent) * 100).toFixed(1) : '0';

    const replyRateRows = Object.entries(replyRates)
      .map(([channel, rate]) => `<tr><td style="padding:6px 12px;text-transform:capitalize">${channel}</td><td style="padding:6px 12px;font-weight:bold">${rate}%</td></tr>`)
      .join('');

    const tierRows = Object.entries(tierBreakdown)
      .map(([tier, count]) => `<tr><td style="padding:6px 12px;text-transform:capitalize">${tier}</td><td style="padding:6px 12px">${count}</td></tr>`)
      .join('');

    const abSection = experiments.length > 0
      ? experiments.map((e) => `<li><strong>${e.name}</strong> — ${e.status}</li>`).join('')
      : '<li>No active experiments</li>';

    const topPatterns = report?.topPatterns
      ? report.topPatterns.slice(0, 3).map((p: any) => `<li>${p.pattern} — ${p.replyRate}% reply rate</li>`).join('')
      : '<li>No pattern data yet</li>';

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:20px">
  <h1 style="color:#4f46e5;font-size:22px;margin-bottom:4px">Aaziko AI Communicator</h1>
  <p style="color:#6b7280;font-size:14px;margin-top:0">Weekly Digest — ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">

  <h2 style="font-size:16px;color:#1f2937">Summary</h2>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <tr><td style="padding:6px 12px">Messages Sent</td><td style="padding:6px 12px;font-weight:bold">${sent}</td></tr>
    <tr><td style="padding:6px 12px">Replies Received</td><td style="padding:6px 12px;font-weight:bold">${replied}</td></tr>
    <tr><td style="padding:6px 12px">Overall Reply Rate</td><td style="padding:6px 12px;font-weight:bold">${overallReplyRate}%</td></tr>
    <tr><td style="padding:6px 12px">Meetings Booked</td><td style="padding:6px 12px;font-weight:bold">${meetings}</td></tr>
    <tr><td style="padding:6px 12px">Handoffs Triggered</td><td style="padding:6px 12px;font-weight:bold">${handoffs}</td></tr>
    <tr><td style="padding:6px 12px">Compliance Flags</td><td style="padding:6px 12px;font-weight:bold">${flags}</td></tr>
  </table>

  <h2 style="font-size:16px;color:#1f2937;margin-top:20px">Reply Rates by Channel</h2>
  <table style="border-collapse:collapse;width:100%;font-size:14px">${replyRateRows || '<tr><td style="padding:6px 12px;color:#9ca3af">No data</td></tr>'}</table>

  <h2 style="font-size:16px;color:#1f2937;margin-top:20px">Messages by Model Tier</h2>
  <table style="border-collapse:collapse;width:100%;font-size:14px">${tierRows || '<tr><td style="padding:6px 12px;color:#9ca3af">No data</td></tr>'}</table>

  <h2 style="font-size:16px;color:#1f2937;margin-top:20px">Active A/B Experiments</h2>
  <ul style="font-size:14px">${abSection}</ul>

  <h2 style="font-size:16px;color:#1f2937;margin-top:20px">Top Performing Patterns</h2>
  <ul style="font-size:14px">${topPatterns}</ul>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
  <p style="color:#9ca3af;font-size:12px">Aaziko AI Communicator — Open-Source B2B Trade Communication System</p>
</body>
</html>`;
  }

  private async storeDigest(html: string, counts: Record<string, number>): Promise<void> {
    await this.mongo.collection('weekly_digests').insertOne({
      html,
      counts,
      generated_at: new Date(),
    });
  }

  async close(): Promise<void> {
    await this.mongoClient.close();
  }
}

export const weeklyDigestService = new WeeklyDigestService();
