import { MongoClient, Db } from 'mongodb';
import { env } from '../../config/env';
import logger from '../../utils/logger';

export class PromptOptimizerService {
  private mongo!: Db;
  private mongoClient: MongoClient;

  constructor() {
    this.mongoClient = new MongoClient(env.MONGODB_URI);
  }

  async initialize(): Promise<void> {
    await this.mongoClient.connect();
    this.mongo = this.mongoClient.db(env.MONGODB_DB);
    logger.info('PromptOptimizerService initialized');
  }

  async generateWeeklyReport(): Promise<any> {
    const since = new Date(Date.now() - 7 * 24 * 3600000);

    // Top 5 highest reply rate patterns
    const topPatterns = await this.mongo.collection('events').aggregate([
      { $match: { timestamp: { $gte: since }, eventType: { $in: ['message_sent', 'message_replied'] } } },
      { $group: { _id: '$metadata.intent', sent: { $sum: { $cond: [{ $eq: ['$eventType', 'message_sent'] }, 1, 0] } }, replied: { $sum: { $cond: [{ $eq: ['$eventType', 'message_replied'] }, 1, 0] } } } },
      { $addFields: { replyRate: { $cond: [{ $gt: ['$sent', 0] }, { $divide: ['$replied', '$sent'] }, 0] } } },
      { $sort: { replyRate: -1 } },
      { $limit: 5 },
    ]).toArray();

    // Bottom 5 lowest performing
    const bottomPatterns = await this.mongo.collection('events').aggregate([
      { $match: { timestamp: { $gte: since }, eventType: { $in: ['message_sent', 'message_replied'] } } },
      { $group: { _id: '$metadata.intent', sent: { $sum: { $cond: [{ $eq: ['$eventType', 'message_sent'] }, 1, 0] } }, replied: { $sum: { $cond: [{ $eq: ['$eventType', 'message_replied'] }, 1, 0] } } } },
      { $match: { sent: { $gte: 5 } } },
      { $addFields: { replyRate: { $cond: [{ $gt: ['$sent', 0] }, { $divide: ['$replied', '$sent'] }, 0] } } },
      { $sort: { replyRate: 1 } },
      { $limit: 5 },
    ]).toArray();

    // Model tier comparison
    const tierComparison = await this.mongo.collection('events').aggregate([
      { $match: { timestamp: { $gte: since }, eventType: { $in: ['message_sent', 'message_replied'] } } },
      { $group: { _id: '$model_tier_used', sent: { $sum: { $cond: [{ $eq: ['$eventType', 'message_sent'] }, 1, 0] } }, replied: { $sum: { $cond: [{ $eq: ['$eventType', 'message_replied'] }, 1, 0] } } } },
      { $addFields: { replyRate: { $cond: [{ $gt: ['$sent', 0] }, { $divide: ['$replied', '$sent'] }, 0] } } },
    ]).toArray();

    // A/B test results
    const abResults = await this.mongo.collection('experiments')
      .find({ status: 'active' })
      .toArray();

    const report = {
      period: { from: since, to: new Date() },
      topPatterns,
      bottomPatterns,
      tierComparison,
      activeExperiments: abResults.length,
      suggestions: this.generateSuggestions(topPatterns, bottomPatterns, tierComparison),
      generated_at: new Date(),
    };

    await this.mongo.collection('reports').insertOne(report);
    logger.info('Weekly optimization report generated', {
      topPatterns: topPatterns.length,
      bottomPatterns: bottomPatterns.length,
    });

    return report;
  }

  async getLatestReport(): Promise<any> {
    return this.mongo.collection('reports')
      .findOne({}, { sort: { generated_at: -1 } });
  }

  async getTopPatterns(limit: number = 10): Promise<any[]> {
    const since = new Date(Date.now() - 30 * 24 * 3600000);
    return this.mongo.collection('events').aggregate([
      { $match: { timestamp: { $gte: since }, eventType: 'message_sent' } },
      { $group: { _id: { channel: '$channel', intent: '$metadata.intent' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]).toArray();
  }

  private generateSuggestions(top: any[], bottom: any[], tiers: any[]): string[] {
    const suggestions: string[] = [];

    if (bottom.length > 0 && bottom[0].replyRate < 0.05) {
      suggestions.push(`Pattern "${bottom[0]._id}" has very low reply rate (${(bottom[0].replyRate * 100).toFixed(1)}%). Consider revising the prompt approach for this intent.`);
    }

    for (const tier of tiers) {
      if (tier._id === 'local' && tier.replyRate < 0.1) {
        suggestions.push('Local model (Qwen 3.5 9B) is significantly underperforming. Consider upgrading bronze buyers to mid tier or fine-tuning the local model.');
      }
    }

    if (top.length > 0) {
      suggestions.push(`Top performing pattern "${top[0]._id}" has ${(top[0].replyRate * 100).toFixed(1)}% reply rate. Consider using this approach more broadly.`);
    }

    return suggestions;
  }

  async close(): Promise<void> {
    await this.mongoClient.close();
  }
}

export const promptOptimizerService = new PromptOptimizerService();
