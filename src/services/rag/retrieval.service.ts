import { QdrantClient } from '@qdrant/js-client-rest';
import { MongoClient, Db } from 'mongodb';
import Redis from 'ioredis';
import { env } from '../../config/env';
import { createRedisClient } from '../../config/redis';
import logger from '../../utils/logger';
import {
  BuyerProfile,
  Product,
  ComplianceInfo,
  RAGSearchResult,
} from '../../models/types';

export class RetrievalService {
  private qdrant: QdrantClient;
  private mongo!: Db;
  private redis: Redis;
  private mongoClient: MongoClient;

  constructor() {
    this.qdrant = new QdrantClient({ url: env.QDRANT_URL });
    this.mongoClient = new MongoClient(env.MONGODB_URI);
    this.redis = createRedisClient('retrieval');
  }

  async initialize(): Promise<void> {
    await this.mongoClient.connect();
    this.mongo = this.mongoClient.db(env.MONGODB_DB);
    logger.info('RetrievalService initialized');
  }

  async getBuyerIntelligence(
    query: string,
    filters?: {
      country?: string;
      hsCode?: string;
      minVolume?: number;
      buyerTier?: string;
      limit?: number;
    }
  ): Promise<RAGSearchResult<BuyerProfile>> {
    const startTime = Date.now();
    const limit = filters?.limit || 10;

    const must: any[] = [];
    if (filters?.country) {
      must.push({ key: 'country', match: { value: filters.country } });
    }
    if (filters?.hsCode) {
      must.push({ key: 'hs_codes', match: { any: [filters.hsCode] } });
    }
    if (filters?.buyerTier) {
      must.push({ key: 'buyer_tier', match: { value: filters.buyerTier } });
    }
    if (filters?.minVolume) {
      must.push({ key: 'total_trade_volume_usd', range: { gte: filters.minVolume } });
    }

    try {
      const searchResult = await this.qdrant.search('buyers', {
        vector: await this.getQueryVector(query),
        limit,
        filter: must.length > 0 ? { must } : undefined,
        with_payload: true,
      });

      const mongoIds = searchResult
        .map((r) => r.payload?.['mongo_id'] as string)
        .filter(Boolean);

      let profiles: BuyerProfile[] = [];
      if (mongoIds.length > 0) {
        const { ObjectId } = await import('mongodb');
        const objectIds = mongoIds.map((id) => {
          try { return new ObjectId(id); } catch { return null; }
        }).filter((id): id is InstanceType<typeof ObjectId> => id !== null);

        const docs = await this.mongo
          .collection('buyer_profiles')
          .find({ _id: { $in: objectIds } })
          .toArray();
        profiles = docs as unknown as BuyerProfile[];
      }

      if (profiles.length === 0) {
        profiles = searchResult.map((r) => r.payload as unknown as BuyerProfile);
      }

      const scores = searchResult.map((r) => r.score);
      const queryTime = Date.now() - startTime;
      logger.info('getBuyerIntelligence', { query, results: profiles.length, queryTime });

      return { results: profiles, scores, totalFound: profiles.length, queryTime };
    } catch (error) {
      logger.error('getBuyerIntelligence failed', { error });
      return { results: [], scores: [], totalFound: 0, queryTime: Date.now() - startTime };
    }
  }

  async getMatchingProducts(
    query: string,
    filters?: {
      hsCode?: string;
      category?: string;
      sellerLocation?: string;
      limit?: number;
    }
  ): Promise<RAGSearchResult<Product>> {
    const startTime = Date.now();
    const limit = filters?.limit || 10;

    const must: any[] = [];
    if (filters?.hsCode) {
      must.push({ key: 'hs_code', match: { value: filters.hsCode } });
    }
    if (filters?.category) {
      must.push({ key: 'category', match: { value: filters.category } });
    }
    if (filters?.sellerLocation) {
      must.push({ key: 'seller_location', match: { value: filters.sellerLocation } });
    }

    try {
      const searchResult = await this.qdrant.search('products', {
        vector: await this.getQueryVector(query),
        limit,
        filter: must.length > 0 ? { must } : undefined,
        with_payload: true,
      });

      const mongoIds = searchResult
        .map((r) => r.payload?.['mongo_id'] as string)
        .filter(Boolean);

      let products: Product[] = [];
      if (mongoIds.length > 0) {
        const { ObjectId } = await import('mongodb');
        const objectIds = mongoIds.map((id) => {
          try { return new ObjectId(id); } catch { return null; }
        }).filter((id): id is InstanceType<typeof ObjectId> => id !== null);

        const docs = await this.mongo
          .collection('product_catalog')
          .find({ _id: { $in: objectIds } })
          .toArray();
        products = docs as unknown as Product[];
      }

      if (products.length === 0) {
        products = searchResult.map((r) => r.payload as unknown as Product);
      }

      const scores = searchResult.map((r) => r.score);
      const queryTime = Date.now() - startTime;
      logger.info('getMatchingProducts', { query, results: products.length, queryTime });

      return { results: products, scores, totalFound: products.length, queryTime };
    } catch (error) {
      logger.error('getMatchingProducts failed', { error });
      return { results: [], scores: [], totalFound: 0, queryTime: Date.now() - startTime };
    }
  }

  async getComplianceData(hsCode: string, country: string): Promise<ComplianceInfo | null> {
    const startTime = Date.now();
    const cacheKey = `compliance:${hsCode}:${country}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.info('getComplianceData cache HIT', { hsCode, country });
        return JSON.parse(cached);
      }

      const exactMatch = await this.mongo
        .collection('customs_intelligence')
        .findOne({ hs_code: hsCode, country });

      if (exactMatch) {
        const result = exactMatch as unknown as ComplianceInfo;
        await this.redis.setex(cacheKey, 86400, JSON.stringify(result));
        logger.info('getComplianceData exact match', {
          hsCode, country, queryTime: Date.now() - startTime,
        });
        return result;
      }

      const query = `Importing HS ${hsCode} into ${country}`;
      const searchResult = await this.qdrant.search('customs', {
        vector: await this.getQueryVector(query),
        limit: 1,
        filter: {
          should: [
            { key: 'hs_code', match: { value: hsCode } },
            { key: 'country', match: { value: country } },
          ],
        },
        with_payload: true,
      });

      if (searchResult.length > 0 && searchResult[0].score > 0.7) {
        const mongoId = searchResult[0].payload?.['mongo_id'] as string;
        if (mongoId) {
          const { ObjectId } = await import('mongodb');
          const doc = await this.mongo
            .collection('customs_intelligence')
            .findOne({ _id: new ObjectId(mongoId) });
          if (doc) {
            const result = doc as unknown as ComplianceInfo;
            result.data_confidence_score = Math.min(
              result.data_confidence_score,
              searchResult[0].score
            );
            await this.redis.setex(cacheKey, 86400, JSON.stringify(result));
            logger.info('getComplianceData fuzzy match', {
              hsCode, country, score: searchResult[0].score,
              queryTime: Date.now() - startTime,
            });
            return result;
          }
        }
      }

      logger.warn('getComplianceData no match', { hsCode, country });
      return null;
    } catch (error) {
      logger.error('getComplianceData failed', { hsCode, country, error });
      return null;
    }
  }

  async getBuyerProfile(buyerName: string, country: string): Promise<BuyerProfile | null> {
    const startTime = Date.now();
    const cacheKey = `buyer:${buyerName}:${country}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.info('getBuyerProfile cache HIT', { buyerName, country });
        return JSON.parse(cached);
      }

      const normalizedName = buyerName.toLowerCase()
        .replace(/\b(ltd|llc|inc|gmbh|pvt|private|limited|co|corp)\b/gi, '')
        .replace(/[.,\-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const exactMatch = await this.mongo
        .collection('buyer_profiles')
        .findOne({ normalized_name: normalizedName, country });

      if (exactMatch) {
        const result = exactMatch as unknown as BuyerProfile;
        await this.redis.setex(cacheKey, 3600, JSON.stringify(result));
        logger.info('getBuyerProfile exact match', {
          buyerName, country, queryTime: Date.now() - startTime,
        });
        return result;
      }

      const query = `${buyerName} in ${country}`;
      const searchResult = await this.qdrant.search('buyers', {
        vector: await this.getQueryVector(query),
        limit: 1,
        filter: { must: [{ key: 'country', match: { value: country } }] },
        with_payload: true,
      });

      if (searchResult.length > 0 && searchResult[0].score > 0.8) {
        const mongoId = searchResult[0].payload?.['mongo_id'] as string;
        if (mongoId) {
          const { ObjectId } = await import('mongodb');
          const doc = await this.mongo
            .collection('buyer_profiles')
            .findOne({ _id: new ObjectId(mongoId) });
          if (doc) {
            const result = doc as unknown as BuyerProfile;
            await this.redis.setex(cacheKey, 3600, JSON.stringify(result));
            logger.info('getBuyerProfile fuzzy match', {
              buyerName, country, score: searchResult[0].score,
              queryTime: Date.now() - startTime,
            });
            return result;
          }
        }
      }

      logger.info('getBuyerProfile not found', { buyerName, country });
      return null;
    } catch (error) {
      logger.error('getBuyerProfile failed', { buyerName, country, error });
      return null;
    }
  }

  async healthCheck(): Promise<{ qdrant: boolean; redis: boolean; mongo: boolean }> {
    let qdrantOk = false;
    let redisOk = false;
    let mongoOk = false;

    try {
      await this.qdrant.getCollections();
      qdrantOk = true;
    } catch { /* */ }

    try {
      await this.redis.ping();
      redisOk = true;
    } catch { /* */ }

    try {
      await this.mongo.command({ ping: 1 });
      mongoOk = true;
    } catch { /* */ }

    return { qdrant: qdrantOk, redis: redisOk, mongo: mongoOk };
  }

  private async getQueryVector(query: string): Promise<number[]> {
    // In production, this would call BGE-M3 via a local HTTP endpoint
    // or sentence-transformers server. For now, return a placeholder
    // that gets replaced when the embedding service is running.
    // TODO: Integrate with local embedding service endpoint
    const hash = Array.from(query).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const vector = Array.from({ length: 1024 }, (_, i) =>
      Math.sin(hash * (i + 1) * 0.001) * 0.1
    );
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map((v) => v / (norm || 1));
  }

  async close(): Promise<void> {
    await this.mongoClient.close();
    this.redis.disconnect();
  }
}

export const retrievalService = new RetrievalService();
