jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    lpush: jest.fn(),
    ltrim: jest.fn(),
    expire: jest.fn(),
    lrange: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    setex: jest.fn(),
    incr: jest.fn(),
    zadd: jest.fn(),
    publish: jest.fn(),
    disconnect: jest.fn(),
  }));
});

jest.mock('../src/config/env', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379',
    MONGODB_URI: 'mongodb://localhost:27017',
    QDRANT_URL: 'http://localhost:6333',
    COMM_PREMIUM_BASE_URL: 'http://localhost:11434/v1',
    COMM_PREMIUM_MODEL: 'test-model',
    COMM_PREMIUM_API_KEY: 'test-key',
    COMM_MID_BASE_URL: 'http://localhost:11434/v1',
    COMM_MID_MODEL: 'test-model',
    COMM_MID_API_KEY: 'test-key',
    COMM_LOCAL_BASE_URL: 'http://localhost:11434/v1',
    COMM_LOCAL_MODEL: 'test-model',
    RESEARCH_BASE_URL: 'http://localhost:11434/v1',
    RESEARCH_MODEL: 'test-model',
    RESEARCH_API_KEY: 'test-key',
    INTENT_BASE_URL: 'http://localhost:11434/v1',
    INTENT_MODEL: 'test-model',
    LOG_LEVEL: 'error',
    PORT: 3000,
    NODE_ENV: 'test',
  },
}));

jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { OrchestratorService } from '../src/services/orchestrator/orchestrator.service';
import { IncomingMessage } from '../src/models/types';

// Mock the dependent services
jest.mock('../src/services/rag/retrieval.service', () => ({
  retrievalService: {
    getBuyerProfile: jest.fn().mockResolvedValue({
      normalized_name: 'test buyer',
      buyer_name: 'Test Buyer',
      country: 'United States',
      hs_codes: ['8471'],
      product_categories: ['electronics'],
      total_trade_volume_usd: 500000,
      total_quantity: 10000,
      avg_unit_price_usd: 50,
      trade_count: 20,
      first_trade_date: new Date('2020-01-01'),
      last_trade_date: new Date('2024-01-01'),
      trade_frequency_per_month: 2,
      ports_used: ['USLAX'],
      indian_suppliers: ['ABC Exports'],
      top_supplier: 'ABC Exports',
      buyer_addresses: ['123 Main St'],
      buyer_tier: 'gold',
      communication_model_tier: 'premium',
      last_updated: new Date(),
    }),
    getMatchingProducts: jest.fn().mockResolvedValue({
      results: [{
        product_name: 'Test Product',
        category: 'electronics',
        hs_code: '8471',
        seller_name: 'Test Seller',
        seller_location: 'Mumbai',
        seller_verified: true,
        price_range_usd: { min: 10, max: 50 },
        moq: 100,
        certifications: ['ISO'],
        description: 'Test product',
      }],
      scores: [0.95],
      totalFound: 1,
      queryTime: 50,
    }),
    getComplianceData: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../src/services/orchestrator/conversation.service', () => ({
  conversationService: {
    getRecentMessages: jest.fn().mockResolvedValue([]),
    addMessage: jest.fn().mockResolvedValue(undefined),
    initialize: jest.fn(),
  },
}));

jest.mock('../src/services/orchestrator/tier-router', () => ({
  getModelTier: jest.fn().mockReturnValue('premium'),
  chatWithFallback: jest.fn().mockResolvedValue({
    response: 'Hello! I would be happy to help you with electronics. We have great options.',
    tierUsed: 'premium',
  }),
  getIntentClient: jest.fn().mockReturnValue({
    chat: jest.fn().mockResolvedValue(JSON.stringify({
      intent: 'product_inquiry',
      confidence: 0.92,
      entities: { product: 'electronics', hsCode: '8471' },
    })),
  }),
}));

jest.mock('../src/services/orchestrator/prompt-builder/prompt-builder', () => ({
  buildPrompt: jest.fn().mockReturnValue('Test system prompt'),
}));

jest.mock('../src/services/compliance/validator.service', () => ({
  validateResponse: jest.fn().mockReturnValue({
    editedResponse: null,
    flaggedClaims: [],
    humanReviewNeeded: false,
  }),
}));

describe('OrchestratorService', () => {
  let orchestrator: OrchestratorService;

  beforeEach(() => {
    orchestrator = new OrchestratorService();
    jest.clearAllMocks();
  });

  describe('processIncoming', () => {
    const mockMessage: IncomingMessage = {
      id: 'test-msg-1',
      channel: 'email',
      senderName: 'Test Buyer',
      senderEmail: 'buyer@example.com',
      senderCountry: 'United States',
      text: 'I am looking for electronic components, specifically PCB assemblies.',
      timestamp: new Date(),
    };

    it('returns a valid OutgoingMessage', async () => {
      const result = await orchestrator.processIncoming(mockMessage);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.channel).toBe('email');
      expect(result.recipientId).toBe('Test Buyer');
      expect(result.text).toContain('Hello');
      expect(result.modelTierUsed).toBe('premium');
      expect(result.complianceFlags).toEqual([]);
    });

    it('includes metadata with intent and entities', async () => {
      const result = await orchestrator.processIncoming(mockMessage);

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.intent).toBe('product_inquiry');
      expect(result.metadata?.entities).toBeDefined();
      expect(result.metadata?.timings).toBeDefined();
    });

    it('calls retrieval service for buyer profile and products in parallel', async () => {
      const { retrievalService } = require('../src/services/rag/retrieval.service');

      await orchestrator.processIncoming(mockMessage);

      expect(retrievalService.getBuyerProfile).toHaveBeenCalledWith('Test Buyer', 'United States');
      expect(retrievalService.getMatchingProducts).toHaveBeenCalled();
    });

    it('calls chatWithFallback with correct tier', async () => {
      const { chatWithFallback } = require('../src/services/orchestrator/tier-router');

      await orchestrator.processIncoming(mockMessage);

      expect(chatWithFallback).toHaveBeenCalledWith(
        'premium',
        expect.any(String),
        expect.any(Array)
      );
    });

    it('validates response through compliance service', async () => {
      const { validateResponse } = require('../src/services/compliance/validator.service');

      await orchestrator.processIncoming(mockMessage);

      expect(validateResponse).toHaveBeenCalled();
    });

    it('stores conversation turn asynchronously', async () => {
      const { conversationService } = require('../src/services/orchestrator/conversation.service');

      await orchestrator.processIncoming(mockMessage);

      // Give fire-and-forget a tick to execute
      await new Promise((r) => setTimeout(r, 50));

      expect(conversationService.addMessage).toHaveBeenCalledTimes(2); // buyer + agent
    });
  });
});
