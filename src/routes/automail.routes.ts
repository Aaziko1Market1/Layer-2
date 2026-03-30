import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { campaignService } from '../services/automail/campaign.service';
import { buyerTrackerService } from '../services/automail/buyer-tracker.service';
import { zohoEmailEngine } from '../services/channels/zoho-email.engine';
import logger from '../utils/logger';

const router = Router();

// ── Campaign CRUD ──

const createCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  persona: z.string().optional(),
  target_filters: z.object({
    countries: z.array(z.string()).optional(),
    buyer_tiers: z.array(z.enum(['platinum', 'gold', 'silver', 'bronze'])).optional(),
    hs_codes: z.array(z.string()).optional(),
    product_categories: z.array(z.string()).optional(),
    min_trade_volume: z.number().optional(),
    max_trade_volume: z.number().optional(),
    exclude_responded: z.boolean().optional(),
    exclude_not_interested: z.boolean().optional(),
  }),
  sequence: z.array(z.object({
    stage: z.enum(['initial_outreach', 'first_followup', 'second_followup', 'third_followup', 'final_followup']),
    delay_hours: z.number(),
    subject_template: z.string(),
    prompt_instruction: z.string(),
    enabled: z.boolean(),
  })).optional(),
});

router.post('/campaigns', async (req: Request, res: Response) => {
  try {
    const parsed = createCampaignSchema.parse(req.body);
    const campaign = await campaignService.createCampaign(parsed);
    res.status(201).json(campaign);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    logger.error('POST /automail/campaigns failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/campaigns', async (_req: Request, res: Response) => {
  try {
    const status = _req.query.status as string | undefined;
    const campaigns = await campaignService.listCampaigns(status as any);
    res.json(campaigns);
  } catch (error) {
    logger.error('GET /automail/campaigns failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/campaigns/:id', async (req: Request, res: Response) => {
  try {
    const campaign = await campaignService.getCampaign(req.params.id);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    res.json(campaign);
  } catch (error) {
    logger.error('GET /automail/campaigns/:id failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/campaigns/:id/activate', async (req: Request, res: Response) => {
  try {
    const result = await campaignService.activateCampaign(req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('POST /automail/campaigns/:id/activate failed', { error });
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/campaigns/:id/pause', async (req: Request, res: Response) => {
  try {
    await campaignService.pauseCampaign(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('POST /automail/campaigns/:id/pause failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/campaigns/:id/resume', async (req: Request, res: Response) => {
  try {
    await campaignService.resumeCampaign(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('POST /automail/campaigns/:id/resume failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/campaigns/:id/stats', async (req: Request, res: Response) => {
  try {
    const stats = await campaignService.getCampaignStats(req.params.id);
    res.json(stats);
  } catch (error) {
    logger.error('GET /automail/campaigns/:id/stats failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Outreach / Buyer Tracking ──

router.get('/campaigns/:id/outreach', async (req: Request, res: Response) => {
  try {
    const { status, limit, skip } = req.query;
    const outreach = await campaignService.getCampaignOutreach(req.params.id, {
      status: status as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      skip: skip ? parseInt(skip as string, 10) : undefined,
    });
    res.json(outreach);
  } catch (error) {
    logger.error('GET /automail/campaigns/:id/outreach failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/buyers/interested', async (req: Request, res: Response) => {
  try {
    const campaignId = req.query.campaign_id as string | undefined;
    const buyers = await buyerTrackerService.getInterestedBuyers(campaignId);
    res.json(buyers);
  } catch (error) {
    logger.error('GET /automail/buyers/interested failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/buyers/not-interested', async (req: Request, res: Response) => {
  try {
    const campaignId = req.query.campaign_id as string | undefined;
    const buyers = await buyerTrackerService.getNotInterestedBuyers(campaignId);
    res.json(buyers);
  } catch (error) {
    logger.error('GET /automail/buyers/not-interested failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/buyers/questions', async (req: Request, res: Response) => {
  try {
    const campaignId = req.query.campaign_id as string | undefined;
    const buyers = await buyerTrackerService.getBuyersWithQuestions(campaignId);
    res.json(buyers);
  } catch (error) {
    logger.error('GET /automail/buyers/questions failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/buyers/unresponsive', async (req: Request, res: Response) => {
  try {
    const campaignId = req.query.campaign_id as string;
    const days = parseInt(req.query.days as string || '3', 10);
    if (!campaignId) {
      res.status(400).json({ error: 'campaign_id is required' });
      return;
    }
    const buyers = await buyerTrackerService.getUnresponsiveBuyers(campaignId, days);
    res.json(buyers);
  } catch (error) {
    logger.error('GET /automail/buyers/unresponsive failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const campaignId = req.query.campaign_id as string | undefined;
    const summary = await buyerTrackerService.getOutreachSummary(campaignId);
    res.json(summary);
  } catch (error) {
    logger.error('GET /automail/summary failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/buyers/:id/tag', async (req: Request, res: Response) => {
  try {
    const { tag } = req.body;
    if (!tag) {
      res.status(400).json({ error: 'tag is required' });
      return;
    }
    await buyerTrackerService.tagBuyer(req.params.id, tag);
    res.json({ success: true });
  } catch (error) {
    logger.error('POST /automail/buyers/:id/tag failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/buyers/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'delivered', 'opened', 'replied', 'interested', 'not_interested', 'question', 'bounced', 'unsubscribed'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      return;
    }
    await buyerTrackerService.updateBuyerStatus(req.params.id, status);
    res.json({ success: true });
  } catch (error) {
    logger.error('PATCH /automail/buyers/:id/status failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Email Stats ──

router.get('/email-stats', async (_req: Request, res: Response) => {
  try {
    const stats = await zohoEmailEngine.getDailyStats();
    res.json(stats);
  } catch (error) {
    logger.error('GET /automail/email-stats failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Manual trigger for campaign processing (for testing) ──

router.post('/process', async (_req: Request, res: Response) => {
  try {
    const result = await campaignService.processCampaigns();
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('POST /automail/process failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
