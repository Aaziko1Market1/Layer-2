import { Router, Request, Response } from 'express';
import { conversationService } from '../services/orchestrator/conversation.service';
import { linkedinEngine } from '../services/channels/linkedin.engine';
import { retrievalService } from '../services/rag/retrieval.service';
import { eventTrackerService } from '../services/analytics/event-tracker.service';
import { replyTrackerService } from '../services/analytics/reply-tracker.service';
import { promptOptimizerService } from '../services/analytics/prompt-optimizer.service';
import { chatEngine } from '../services/channels/chat.engine';
import logger from '../utils/logger';

const router = Router();

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [health, dailyCounts, replyRates] = await Promise.all([
      retrievalService.healthCheck(),
      eventTrackerService.getEventCounts('daily'),
      replyTrackerService.getReplyRates({ period: 'weekly' }),
    ]);

    res.json({
      infrastructure: health,
      today: dailyCounts,
      weeklyReplyRates: replyRates,
      activeChatSessions: chatEngine.getActiveSessionCount(),
    });
  } catch (error) {
    logger.error('GET /dashboard/stats failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const { tier, channel, status, limit, skip } = req.query;
    const conversations = await conversationService.listConversations({
      tier: tier as string,
      channel: channel as string,
      status: status as string,
      limit: limit ? parseInt(limit as string, 10) : 50,
      skip: skip ? parseInt(skip as string, 10) : 0,
    });
    res.json(conversations);
  } catch (error) {
    logger.error('GET /dashboard/conversations failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const conversation = await conversationService.getConversationById(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.json(conversation);
  } catch (error) {
    logger.error('GET /dashboard/conversations/:id failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/conversations/:buyerId/takeover', async (req: Request, res: Response) => {
  try {
    const { buyerId } = req.params;
    const { assignedTo } = req.body;
    await conversationService.takeover(decodeURIComponent(buyerId), assignedTo || 'dashboard_user');
    res.json({ success: true });
  } catch (error) {
    logger.error('POST /dashboard/takeover failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/conversations/:buyerId/release', async (req: Request, res: Response) => {
  try {
    const { buyerId } = req.params;
    await conversationService.release(decodeURIComponent(buyerId));
    res.json({ success: true });
  } catch (error) {
    logger.error('POST /dashboard/release failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/linkedin/outbox', async (req: Request, res: Response) => {
  try {
    const { status, limit, skip } = req.query;
    const items = await linkedinEngine.getOutbox({
      status: status as string,
      limit: limit ? parseInt(limit as string, 10) : 50,
      skip: skip ? parseInt(skip as string, 10) : 0,
    });
    res.json(items);
  } catch (error) {
    logger.error('GET /dashboard/linkedin/outbox failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/linkedin/outbox/:id/sent', async (req: Request, res: Response) => {
  try {
    await linkedinEngine.markAsSent(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('POST /dashboard/linkedin/sent failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/linkedin/outbox/:id/skip', async (req: Request, res: Response) => {
  try {
    await linkedinEngine.markAsSkipped(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('POST /dashboard/linkedin/skip failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/report', async (_req: Request, res: Response) => {
  try {
    const report = await promptOptimizerService.getLatestReport();
    if (!report) {
      res.status(404).json({ error: 'No report available yet' });
      return;
    }
    res.json(report);
  } catch (error) {
    logger.error('GET /dashboard/report failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/report/generate', async (_req: Request, res: Response) => {
  try {
    const report = await promptOptimizerService.generateWeeklyReport();
    res.json(report);
  } catch (error) {
    logger.error('POST /dashboard/report/generate failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
