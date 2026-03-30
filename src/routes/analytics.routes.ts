import { Router, Request, Response } from 'express';
import { eventTrackerService } from '../services/analytics/event-tracker.service';
import { abTestService } from '../services/analytics/ab-test.service';
import { replyTrackerService } from '../services/analytics/reply-tracker.service';
import { promptOptimizerService } from '../services/analytics/prompt-optimizer.service';
import logger from '../utils/logger';

const router = Router();

router.get('/events', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const events = await eventTrackerService.getRecentEvents(limit);
    res.json(events);
  } catch (error) {
    logger.error('GET /analytics/events failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/events/counts/:period', async (req: Request, res: Response) => {
  try {
    const period = req.params.period as 'daily' | 'weekly' | 'monthly';
    const counts = await eventTrackerService.getEventCounts(period);
    res.json(counts);
  } catch (error) {
    logger.error('GET /analytics/events/counts failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/reply-rates', async (req: Request, res: Response) => {
  try {
    const { period, channel, buyerTier, modelTier } = req.query;
    const rates = await replyTrackerService.getReplyRates({
      period: (period as any) || 'weekly',
      channel: channel as string,
      buyerTier: buyerTier as string,
      modelTier: modelTier as string,
    });
    res.json(rates);
  } catch (error) {
    logger.error('GET /analytics/reply-rates failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/reply-rates/trend', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as any) || 'daily';
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
    const trend = await replyTrackerService.getMetricsTrend(period, days);
    res.json(trend);
  } catch (error) {
    logger.error('GET /analytics/reply-rates/trend failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/ab-tests', async (_req: Request, res: Response) => {
  try {
    const experiments = await abTestService.listExperiments();
    res.json(experiments);
  } catch (error) {
    logger.error('GET /analytics/ab-tests failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/ab-tests/:id/results', async (req: Request, res: Response) => {
  try {
    const results = await abTestService.getResults(req.params.id);
    res.json(results);
  } catch (error) {
    logger.error('GET /analytics/ab-tests/:id/results failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/ab-tests', async (req: Request, res: Response) => {
  try {
    const { name, description, variantADesc, variantBDesc } = req.body;
    const id = await abTestService.createExperiment(name, description, variantADesc, variantBDesc);
    res.json({ id });
  } catch (error) {
    logger.error('POST /analytics/ab-tests failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/top-patterns', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const patterns = await promptOptimizerService.getTopPatterns(limit);
    res.json(patterns);
  } catch (error) {
    logger.error('GET /analytics/top-patterns failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/alerts', async (_req: Request, res: Response) => {
  try {
    const alerts = await replyTrackerService.checkAlerts();
    res.json({ alerts });
  } catch (error) {
    logger.error('GET /analytics/alerts failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
