import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { retrievalService } from '../services/rag/retrieval.service';
import logger from '../utils/logger';

const router = Router();

const buyerIntelSchema = z.object({
  query: z.string().min(1),
  filters: z.object({
    country: z.string().optional(),
    hsCode: z.string().optional(),
    minVolume: z.number().optional(),
    buyerTier: z.string().optional(),
    limit: z.number().max(50).optional(),
  }).optional(),
});

const productSchema = z.object({
  query: z.string().min(1),
  filters: z.object({
    hsCode: z.string().optional(),
    category: z.string().optional(),
    sellerLocation: z.string().optional(),
    limit: z.number().max(50).optional(),
  }).optional(),
});

const complianceSchema = z.object({
  hsCode: z.string().min(1),
  country: z.string().min(1),
});

router.post('/buyer-intel', async (req: Request, res: Response) => {
  try {
    const parsed = buyerIntelSchema.parse(req.body);
    const result = await retrievalService.getBuyerIntelligence(parsed.query, parsed.filters);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
    } else {
      logger.error('POST /rag/buyer-intel failed', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.post('/products', async (req: Request, res: Response) => {
  try {
    const parsed = productSchema.parse(req.body);
    const result = await retrievalService.getMatchingProducts(parsed.query, parsed.filters);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
    } else {
      logger.error('POST /rag/products failed', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.post('/compliance', async (req: Request, res: Response) => {
  try {
    const parsed = complianceSchema.parse(req.body);
    const result = await retrievalService.getComplianceData(parsed.hsCode, parsed.country);
    if (!result) {
      res.status(404).json({ error: 'No compliance data found' });
      return;
    }
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
    } else {
      logger.error('POST /rag/compliance failed', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.get('/buyer/:name/:country', async (req: Request, res: Response) => {
  try {
    const { name, country } = req.params;
    const result = await retrievalService.getBuyerProfile(
      decodeURIComponent(name),
      decodeURIComponent(country)
    );
    if (!result) {
      res.status(404).json({ error: 'Buyer not found' });
      return;
    }
    res.json(result);
  } catch (error) {
    logger.error('GET /rag/buyer failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await retrievalService.healthCheck();
    const allHealthy = health.qdrant && health.redis && health.mongo;
    res.status(allHealthy ? 200 : 503).json(health);
  } catch (error) {
    res.status(503).json({ qdrant: false, redis: false, mongo: false });
  }
});

export default router;
