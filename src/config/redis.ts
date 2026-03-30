import Redis from 'ioredis';
import { env } from './env';
import logger from '../utils/logger';

export function createRedisClient(name?: string): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 10) return null; // stop retrying after 10 attempts
      return Math.min(times * 500, 5000);
    },
    lazyConnect: false,
  });

  client.on('error', (err) => {
    logger.warn(`Redis connection error${name ? ` (${name})` : ''}`, {
      message: err.message,
    });
  });

  client.on('connect', () => {
    logger.info(`Redis connected${name ? ` (${name})` : ''}`);
  });

  return client;
}
