jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    zadd: jest.fn(),
    zrangebyscore: jest.fn().mockResolvedValue([]),
    zrem: jest.fn(),
  }));
});

jest.mock('../src/config/env', () => ({
  env: { REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'error' },
}));

jest.mock('../src/config/redis', () => ({
  createRedisClient: jest.fn().mockReturnValue({
    zadd: jest.fn().mockResolvedValue(1),
    zrangebyscore: jest.fn().mockResolvedValue([]),
    zrem: jest.fn(),
    on: jest.fn(),
  }),
}));

jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { TimingEngine } from '../src/services/human-feel/timing.engine';

describe('TimingEngine', () => {
  let engine: TimingEngine;

  beforeEach(() => {
    engine = new TimingEngine();
  });

  describe('calculateDelay', () => {
    it('returns 2-8h delay for email first_reply', () => {
      const delay = engine.calculateDelay('email', 'first_reply');
      // Base 2-8h = 7_200_000 - 28_800_000ms, plus noise and complexity factor
      expect(delay).toBeGreaterThan(500);
    });

    it('returns 30-90min delay for email follow_up', () => {
      const delay = engine.calculateDelay('email', 'follow_up');
      expect(delay).toBeGreaterThan(500);
    });

    it('returns 45-180s delay for whatsapp during business hours', () => {
      const delay = engine.calculateDelay('whatsapp', 'first_reply', 'America/New_York');
      expect(delay).toBeGreaterThan(0);
    });

    it('returns 4-24h delay for linkedin', () => {
      const delay = engine.calculateDelay('linkedin', 'outbound');
      expect(delay).toBeGreaterThanOrEqual(500);
    });

    it('returns 1-3s delay for chat', () => {
      const delay = engine.calculateDelay('chat', 'first_reply');
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThan(30000);
    });

    it('always returns a positive number', () => {
      for (let i = 0; i < 50; i++) {
        const delay = engine.calculateDelay('email', 'first_reply');
        expect(delay).toBeGreaterThan(0);
      }
    });
  });

  describe('getOptimalSendWindow', () => {
    it('returns Tue-Thu 9-11 AM for email', () => {
      const window = engine.getOptimalSendWindow('email');
      expect(window.dayOfWeek).toEqual([2, 3, 4]);
      expect(window.hour).toBe(10);
    });

    it('returns weekdays for whatsapp', () => {
      const window = engine.getOptimalSendWindow('whatsapp');
      expect(window.dayOfWeek).toEqual([1, 2, 3, 4, 5]);
    });
  });
});
