import crypto from 'crypto';
import { MongoClient, Db } from 'mongodb';
import { env } from '../../config/env';
import logger from '../../utils/logger';
import { BuyerProfile, Channel } from '../../models/types';

export class ABVariantEngine {
  private mongo!: Db;
  private mongoClient: MongoClient;

  constructor() {
    this.mongoClient = new MongoClient(env.MONGODB_URI);
  }

  async initialize(): Promise<void> {
    await this.mongoClient.connect();
    this.mongo = this.mongoClient.db(env.MONGODB_DB);
  }

  generateVariants(
    buyerProfile: BuyerProfile,
    channel: Channel
  ): { promptModA: string; promptModB: string } {
    const promptModA = `VARIANT A INSTRUCTION: Open with a specific trade data point about this buyer's market. Lead with numbers — import volume, price trends, duty rates, or market size. Data first, then insight.`;

    const promptModB = `VARIANT B INSTRUCTION: Open with a market trend observation or industry insight relevant to this buyer's sector. Lead with a trend or pattern you've noticed, then connect it to their business.`;

    return { promptModA, promptModB };
  }

  assignVariant(buyerId: string, experimentId: string): 'A' | 'B' {
    const hash = crypto
      .createHash('md5')
      .update(`${buyerId}${experimentId}`)
      .digest('hex');

    const lastByte = parseInt(hash.substring(hash.length - 2), 16);
    const variant = lastByte % 2 === 0 ? 'A' : 'B';

    logger.info('A/B variant assigned', { buyerId, experimentId, variant });
    return variant;
  }

  async recordAssignment(
    experimentId: string,
    buyerId: string,
    variant: 'A' | 'B'
  ): Promise<void> {
    if (!this.mongo) return;

    await this.mongo.collection('ab_assignments').updateOne(
      { experimentId, buyerId },
      {
        $set: { variant, updated_at: new Date() },
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true }
    );
  }

  async getAssignment(experimentId: string, buyerId: string): Promise<'A' | 'B' | null> {
    if (!this.mongo) return null;

    const doc = await this.mongo.collection('ab_assignments').findOne({
      experimentId,
      buyerId,
    });

    return doc?.variant || null;
  }

  async close(): Promise<void> {
    await this.mongoClient.close();
  }
}

export const abVariantEngine = new ABVariantEngine();
