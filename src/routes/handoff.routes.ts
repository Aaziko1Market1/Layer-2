import { Router, Request, Response } from 'express';
import { handoffService } from '../services/orchestrator/handoff.service';
import logger from '../utils/logger';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, priority, limit, skip } = req.query;
    const items = await handoffService.getQueue({
      status: status as string,
      priority: priority as string,
      limit: limit ? parseInt(limit as string, 10) : 50,
      skip: skip ? parseInt(skip as string, 10) : 0,
    });
    res.json(items);
  } catch (error) {
    logger.error('GET /handoff-queue failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/accept', async (req: Request, res: Response) => {
  try {
    const { assignedTo } = req.body;
    await handoffService.accept(req.params.id, assignedTo || 'dashboard_user');
    res.json({ success: true });
  } catch (error) {
    logger.error('POST /handoff-queue/:id/accept failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/return', async (req: Request, res: Response) => {
  try {
    await handoffService.returnToAI(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('POST /handoff-queue/:id/return failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/reassign', async (req: Request, res: Response) => {
  try {
    const { assignedTo } = req.body;
    if (!assignedTo) {
      res.status(400).json({ error: 'assignedTo is required' });
      return;
    }
    await handoffService.reassign(req.params.id, assignedTo);
    res.json({ success: true });
  } catch (error) {
    logger.error('POST /handoff-queue/:id/reassign failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/thresholds', (_req: Request, res: Response) => {
  res.json(handoffService.getThresholds());
});

router.put('/thresholds', (req: Request, res: Response) => {
  try {
    handoffService.updateThresholds(req.body);
    res.json({ success: true, thresholds: handoffService.getThresholds() });
  } catch (error) {
    logger.error('PUT /handoff-queue/thresholds failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
