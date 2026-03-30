import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { env } from '../config/env';
import { createRedisClient } from '../config/redis';
import logger from '../utils/logger';

const redis = createRedisClient('rate-limiter');

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60000, // 1 minute
  maxRequests: 60,
  keyPrefix: 'rl',
};

export function rateLimiter(config: Partial<RateLimitConfig> = {}) {
  const { windowMs, maxRequests, keyPrefix } = { ...DEFAULT_CONFIG, ...config };
  const windowSec = Math.ceil(windowMs / 1000);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;

    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, windowSec);
      }

      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current).toString());

      if (current > maxRequests) {
        const ttl = await redis.ttl(key);
        res.setHeader('Retry-After', ttl.toString());
        logger.warn('Rate limit exceeded', { ip, key, current, maxRequests });
        res.status(429).json({ error: 'Too many requests', retryAfter: ttl });
        return;
      }

      next();
    } catch (error) {
      // If Redis is down, allow the request through
      logger.warn('Rate limiter Redis error, allowing request', { error });
      next();
    }
  };
}

export function apiRateLimiter() {
  return rateLimiter({ windowMs: 60000, maxRequests: 100, keyPrefix: 'rl:api' });
}

export function webhookRateLimiter() {
  return rateLimiter({ windowMs: 60000, maxRequests: 200, keyPrefix: 'rl:webhook' });
}

export function communicateRateLimiter() {
  return rateLimiter({ windowMs: 60000, maxRequests: 30, keyPrefix: 'rl:comm' });
}
