import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { orchestratorService } from '../services/orchestrator/orchestrator.service';
import { conversationService } from '../services/orchestrator/conversation.service';
import { channelRouter } from '../services/channels/channel-router';
import logger from '../utils/logger';
import { IncomingMessage, Channel } from '../models/types';

const router = Router();

const incomingSchema = z.object({
  channel: z.enum(['email', 'whatsapp', 'linkedin', 'chat']),
  senderName: z.string().min(1),
  senderEmail: z.string().optional(),
  senderPhone: z.string().optional(),
  senderCountry: z.string().optional(),
  text: z.string().min(1),
  subject: z.string().optional(),
});

const outboundSchema = z.object({
  buyerName: z.string().min(1),
  country: z.string().min(1),
  channel: z.enum(['email', 'whatsapp', 'linkedin', 'chat']).optional(),
  message: z.string().optional(),
});

router.post('/incoming', async (req: Request, res: Response) => {
  try {
    const parsed = incomingSchema.parse(req.body);
    const incoming: IncomingMessage = {
      id: uuidv4(),
      channel: parsed.channel as Channel,
      senderName: parsed.senderName,
      senderEmail: parsed.senderEmail,
      senderPhone: parsed.senderPhone,
      senderCountry: parsed.senderCountry,
      text: parsed.text,
      subject: parsed.subject,
      timestamp: new Date(),
    };

    const response = await orchestratorService.processIncoming(incoming);
    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    logger.error('POST /communicate/incoming failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/outbound', async (req: Request, res: Response) => {
  try {
    const parsed = outboundSchema.parse(req.body);
    const { retrievalService } = await import('../services/rag/retrieval.service');
    const buyerProfile = await retrievalService.getBuyerProfile(parsed.buyerName, parsed.country);

    if (!buyerProfile) {
      res.status(404).json({ error: 'Buyer not found' });
      return;
    }

    const channel = parsed.channel as Channel || channelRouter.selectOptimalChannel(buyerProfile);
    const message = parsed.message || '';

    const result = await channelRouter.sendOutbound(buyerProfile, message, channel);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    logger.error('POST /communicate/outbound failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/conversation/:buyerId', async (req: Request, res: Response) => {
  try {
    const { buyerId } = req.params;
    const conversation = await conversationService.getConversation(decodeURIComponent(buyerId));
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.json(conversation);
  } catch (error) {
    logger.error('GET /communicate/conversation failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
