jest.mock('mongodb', () => {
  const mockCollection = {
    insertOne: jest.fn().mockResolvedValue({ insertedId: 'test-id' }),
    find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }) }),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  return {
    MongoClient: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      db: jest.fn().mockReturnValue({ collection: jest.fn().mockReturnValue(mockCollection) }),
      close: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

jest.mock('../src/config/env', () => ({
  env: { MONGODB_URI: 'mongodb://localhost:27017', LOG_LEVEL: 'error' },
}));

jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { ABTestService } from '../src/services/analytics/ab-test.service';

describe('ABTestService', () => {
  let service: ABTestService;

  beforeEach(() => {
    service = new ABTestService();
  });

  describe('assignBuyerToVariant', () => {
    it('returns consistent assignment for same buyer + experiment', () => {
      const v1 = service.assignBuyerToVariant('exp-1', 'buyer-100');
      const v2 = service.assignBuyerToVariant('exp-1', 'buyer-100');
      expect(v1).toBe(v2);
    });

    it('returns A or B only', () => {
      for (let i = 0; i < 100; i++) {
        const variant = service.assignBuyerToVariant('exp-1', `buyer-${i}`);
        expect(['A', 'B']).toContain(variant);
      }
    });

    it('distributes roughly evenly', () => {
      let aCount = 0;
      let bCount = 0;
      for (let i = 0; i < 1000; i++) {
        const variant = service.assignBuyerToVariant('exp-balance', `buyer-${i}`);
        if (variant === 'A') aCount++;
        else bCount++;
      }
      expect(aCount).toBeGreaterThan(350);
      expect(bCount).toBeGreaterThan(350);
    });

    it('different experiments give different assignments for same buyer', () => {
      let diffCount = 0;
      for (let i = 0; i < 100; i++) {
        const v1 = service.assignBuyerToVariant('exp-A', `buyer-${i}`);
        const v2 = service.assignBuyerToVariant('exp-B', `buyer-${i}`);
        if (v1 !== v2) diffCount++;
      }
      expect(diffCount).toBeGreaterThan(10);
    });
  });

  describe('chiSquaredTest (via private access)', () => {
    it('returns 0 confidence for empty data', () => {
      const result = (service as any).chiSquaredTest(0, 0, 0, 0);
      expect(result).toBe(0);
    });

    it('returns high confidence for large difference', () => {
      const result = (service as any).chiSquaredTest(80, 20, 20, 80);
      expect(result).toBeGreaterThanOrEqual(0.95);
    });

    it('returns low confidence for small difference', () => {
      const result = (service as any).chiSquaredTest(51, 49, 49, 51);
      expect(result).toBeLessThan(0.95);
    });

    it('returns 0 when one expected value is 0', () => {
      const result = (service as any).chiSquaredTest(10, 0, 10, 0);
      expect(result).toBe(0);
    });
  });
});
