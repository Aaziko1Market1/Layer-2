jest.mock('../src/config/env', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379',
    COMM_PREMIUM_BASE_URL: 'http://localhost:11434/v1',
    COMM_PREMIUM_MODEL: 'test',
    COMM_PREMIUM_API_KEY: 'test',
    COMM_MID_BASE_URL: 'http://localhost:11434/v1',
    COMM_MID_MODEL: 'test',
    COMM_MID_API_KEY: 'test',
    COMM_LOCAL_BASE_URL: 'http://localhost:11434/v1',
    COMM_LOCAL_MODEL: 'test',
    RESEARCH_BASE_URL: 'http://localhost:11434/v1',
    RESEARCH_MODEL: 'test',
    RESEARCH_API_KEY: 'test',
    INTENT_BASE_URL: 'http://localhost:11434/v1',
    INTENT_MODEL: 'test',
    LOG_LEVEL: 'error',
  },
}));

jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getModelTier } from '../src/services/orchestrator/tier-router';
import { BuyerProfile } from '../src/models/types';

function makeBuyer(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
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
    ...overrides,
  };
}

describe('Tier Router', () => {
  describe('getModelTier', () => {
    it('returns premium for platinum buyers', () => {
      const buyer = makeBuyer({ buyer_tier: 'platinum', communication_model_tier: 'premium' });
      expect(getModelTier(buyer)).toBe('premium');
    });

    it('returns premium for gold buyers', () => {
      const buyer = makeBuyer({ buyer_tier: 'gold', communication_model_tier: 'premium' });
      expect(getModelTier(buyer)).toBe('premium');
    });

    it('returns mid for silver buyers', () => {
      const buyer = makeBuyer({ buyer_tier: 'silver', communication_model_tier: 'mid' });
      expect(getModelTier(buyer)).toBe('mid');
    });

    it('returns local for bronze buyers', () => {
      const buyer = makeBuyer({ buyer_tier: 'bronze', communication_model_tier: 'local' });
      expect(getModelTier(buyer)).toBe('local');
    });

    it('returns mid when buyer profile is null', () => {
      expect(getModelTier(null)).toBe('mid');
    });

    it('returns mid for unknown tier values', () => {
      const buyer = makeBuyer({ communication_model_tier: 'unknown' as any });
      expect(getModelTier(buyer)).toBe('mid');
    });
  });
});
