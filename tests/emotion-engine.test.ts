jest.mock('../src/config/env', () => ({
  env: { REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'error' },
}));

jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { EmotionEngine } from '../src/services/human-feel/emotion.engine';

describe('EmotionEngine', () => {
  let engine: EmotionEngine;

  beforeEach(() => {
    engine = new EmotionEngine();
  });

  describe('analyzeEmotion', () => {
    it('detects frustrated emotion', () => {
      expect(engine.analyzeEmotion('This is a real problem and I am disappointed')).toBe('frustrated');
      expect(engine.analyzeEmotion('I have been waiting for weeks, still delayed')).toBe('frustrated');
    });

    it('detects excited emotion', () => {
      expect(engine.analyzeEmotion('That sounds great! I am very interested!')).toBe('excited');
      expect(engine.analyzeEmotion('Perfect, this is amazing news')).toBe('excited');
    });

    it('detects urgent emotion', () => {
      expect(engine.analyzeEmotion('We need this ASAP, very urgent')).toBe('urgent');
      expect(engine.analyzeEmotion('Deadline is today, need it immediately')).toBe('urgent');
    });

    it('detects skeptical emotion', () => {
      expect(engine.analyzeEmotion('Are you sure about that? What guarantee do I have?')).toBe('skeptical');
      expect(engine.analyzeEmotion('Can you provide proof of that claim?')).toBe('skeptical');
    });

    it('detects confused emotion', () => {
      expect(engine.analyzeEmotion("I don't understand, what do you mean?")).toBe('confused');
      expect(engine.analyzeEmotion("I'm not sure how this works, can you clarify?")).toBe('confused');
    });

    it('returns neutral for normal messages', () => {
      expect(engine.analyzeEmotion('I would like to inquire about your products')).toBe('neutral');
      expect(engine.analyzeEmotion('Please send me the catalog')).toBe('neutral');
    });
  });

  describe('getEmotionDirective', () => {
    it('returns directive for frustrated state', () => {
      const directive = engine.getEmotionDirective('frustrated');
      expect(directive).toContain('frustrated');
      expect(directive.length).toBeGreaterThan(20);
    });

    it('returns directive for excited state', () => {
      const directive = engine.getEmotionDirective('excited');
      expect(directive).toContain('excited');
    });

    it('returns directive for urgent state', () => {
      const directive = engine.getEmotionDirective('urgent');
      expect(directive).toContain('time pressure');
    });

    it('returns empty string for neutral', () => {
      const directive = engine.getEmotionDirective('neutral');
      expect(directive).toBe('');
    });
  });
});
