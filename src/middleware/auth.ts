import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  // In development, skip auth
  if (process.env.NODE_ENV === 'development') {
    next();
    return;
  }

  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const expectedKey = process.env.API_SECRET_KEY;

  if (!expectedKey) {
    // No API key configured, allow all requests
    next();
    return;
  }

  if (!apiKey || apiKey !== expectedKey) {
    logger.warn('Unauthorized API request', {
      ip: req.ip,
      path: req.path,
    });
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

export function webhookAuth(req: Request, res: Response, next: NextFunction): void {
  // Webhook signature verification
  // SendGrid and WhatsApp have their own verification mechanisms
  // This is a placeholder for HMAC verification
  const signature = req.headers['x-webhook-signature'] as string;

  if (process.env.WEBHOOK_SECRET && signature) {
    const crypto = require('crypto');
    const expectedSig = crypto
      .createHmac('sha256', process.env.WEBHOOK_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (signature !== expectedSig) {
      logger.warn('Invalid webhook signature', { path: req.path });
      res.status(403).json({ error: 'Invalid signature' });
      return;
    }
  }

  next();
}

export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')?.substring(0, 80),
    contentLength: req.get('Content-Length'),
  });
  next();
}
