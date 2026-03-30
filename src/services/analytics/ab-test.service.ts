import crypto from 'crypto';
import { MongoClient, Db } from 'mongodb';
import { env } from '../../config/env';
import logger from '../../utils/logger';
import { ABExperiment } from '../../models/types';

export interface ABResults {
  variantA: { sent: number; replied: number; replyRate: number; meetingsBooked: number };
  variantB: { sent: number; replied: number; replyRate: number; meetingsBooked: number };
  winner: 'A' | 'B' | 'inconclusive';
  confidence: number;
  model_tier_breakdown: Record<string, { A: number; B: number }>;
}

export class ABTestService {
  private mongo!: Db;
  private mongoClient: MongoClient;

  constructor() {
    this.mongoClient = new MongoClient(env.MONGODB_URI);
  }

  async initialize(): Promise<void> {
    await this.mongoClient.connect();
    this.mongo = this.mongoClient.db(env.MONGODB_DB);
    logger.info('ABTestService initialized');
  }

  async createExperiment(
    name: string,
    description: string,
    variantADesc: string,
    variantBDesc: string
  ): Promise<string> {
    const result = await this.mongo.collection('experiments').insertOne({
      name,
      description,
      variantADesc,
      variantBDesc,
      status: 'active',
      created_at: new Date(),
    });
    logger.info('Experiment created', { name, id: result.insertedId });
    return result.insertedId.toString();
  }

  assignBuyerToVariant(experimentId: string, buyerId: string): 'A' | 'B' {
    const hash = crypto.createHash('md5').update(`${buyerId}${experimentId}`).digest('hex');
    return parseInt(hash.substring(hash.length - 2), 16) % 2 === 0 ? 'A' : 'B';
  }

  async recordOutcome(
    experimentId: string,
    buyerId: string,
    outcome: 'reply' | 'meeting' | 'no_response'
  ): Promise<void> {
    const variant = this.assignBuyerToVariant(experimentId, buyerId);
    await this.mongo.collection('ab_outcomes').insertOne({
      experimentId,
      buyerId,
      variant,
      outcome,
      timestamp: new Date(),
    });
    logger.info('A/B outcome recorded', { experimentId, buyerId, variant, outcome });
  }

  async getResults(experimentId: string): Promise<ABResults> {
    const outcomes = await this.mongo
      .collection('ab_outcomes')
      .find({ experimentId })
      .toArray();

    const variantA = { sent: 0, replied: 0, replyRate: 0, meetingsBooked: 0 };
    const variantB = { sent: 0, replied: 0, replyRate: 0, meetingsBooked: 0 };

    for (const o of outcomes) {
      const v = o.variant === 'A' ? variantA : variantB;
      v.sent++;
      if (o.outcome === 'reply') v.replied++;
      if (o.outcome === 'meeting') { v.replied++; v.meetingsBooked++; }
    }

    variantA.replyRate = variantA.sent > 0 ? variantA.replied / variantA.sent : 0;
    variantB.replyRate = variantB.sent > 0 ? variantB.replied / variantB.sent : 0;

    // Chi-squared test for significance
    const confidence = this.chiSquaredTest(
      variantA.replied, variantA.sent - variantA.replied,
      variantB.replied, variantB.sent - variantB.replied
    );

    let winner: 'A' | 'B' | 'inconclusive' = 'inconclusive';
    if (confidence >= 0.95) {
      winner = variantA.replyRate > variantB.replyRate ? 'A' : 'B';
    }

    // Auto-promote winner if experiment concludes
    if (winner !== 'inconclusive') {
      await this.mongo.collection('experiments').updateOne(
        { _id: experimentId as any },
        {
          $set: {
            status: 'concluded',
            winner,
            confidence,
            concluded_at: new Date(),
          },
        }
      );
    }

    return {
      variantA,
      variantB,
      winner,
      confidence,
      model_tier_breakdown: {},
    };
  }

  async listExperiments(): Promise<ABExperiment[]> {
    const exps = await this.mongo
      .collection('experiments')
      .find()
      .sort({ created_at: -1 })
      .toArray();
    return exps as unknown as ABExperiment[];
  }

  private chiSquaredTest(a1: number, a2: number, b1: number, b2: number): number {
    const n = a1 + a2 + b1 + b2;
    if (n === 0) return 0;

    const rowA = a1 + a2;
    const rowB = b1 + b2;
    const col1 = a1 + b1;
    const col2 = a2 + b2;

    const e11 = (rowA * col1) / n;
    const e12 = (rowA * col2) / n;
    const e21 = (rowB * col1) / n;
    const e22 = (rowB * col2) / n;

    if (e11 === 0 || e12 === 0 || e21 === 0 || e22 === 0) return 0;

    const chiSq =
      Math.pow(a1 - e11, 2) / e11 +
      Math.pow(a2 - e12, 2) / e12 +
      Math.pow(b1 - e21, 2) / e21 +
      Math.pow(b2 - e22, 2) / e22;

    // Approximate p-value from chi-squared with 1 df
    // chi^2 > 3.841 => p < 0.05, > 6.635 => p < 0.01, > 10.828 => p < 0.001
    if (chiSq >= 10.828) return 0.999;
    if (chiSq >= 6.635) return 0.99;
    if (chiSq >= 3.841) return 0.95;
    if (chiSq >= 2.706) return 0.90;
    if (chiSq >= 1.642) return 0.80;
    return chiSq / 3.841 * 0.80;
  }

  async close(): Promise<void> {
    await this.mongoClient.close();
  }
}

export const abTestService = new ABTestService();
